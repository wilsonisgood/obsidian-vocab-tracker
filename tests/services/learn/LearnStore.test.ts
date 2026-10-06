import { afterEach, describe, expect, it, vi } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { TriviaItem } from "../../../src/core/model/trivia";
import { LEARN_SHARD, LearnStore } from "../../../src/services/learn/LearnStore";
import type { LearnShard } from "../../../src/services/learn/learnMerge";
import { MemoryStorage } from "../ai/fakes";

function fam(id: string, extra: Partial<Family> = {}): Family {
  return { id, topic: id, label: id, source: "ai", groups: [], ...extra };
}

function setup() {
  const storage = new MemoryStorage();
  let clock = Date.parse("2026-10-04T08:00:00Z");
  const learn = new LearnStore({ storage, clock: () => new Date((clock += 1000)) });
  return { storage, learn };
}

const saved = (storage: MemoryStorage) => storage.shards.get(LEARN_SHARD) as LearnShard;

describe("LearnStore", () => {
  afterEach(() => vi.useRealTimers());

  it("loads lazily and only once", async () => {
    const { storage, learn } = setup();
    storage.shards.set(LEARN_SHARD, { families: [fam("f1", { updatedAt: "2026-10-01T00:00:00Z" })], trivia: [] });
    expect(learn.families()).toEqual([]);
    await Promise.all([learn.ensureLoaded(), learn.ensureLoaded()]);
    expect(learn.families().map((f) => f.id)).toEqual(["f1"]);
    expect(learn.loaded).toBe(true);
  });

  it("stamps records, emits upserts and debounces the write", async () => {
    vi.useFakeTimers();
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    const events: string[] = [];
    learn.events.on("family:upsert", (f) => events.push(`family:${f.id}`));
    learn.events.on("trivia:upsert", (t) => events.push(`trivia:${t.id}`));

    const f = learn.putFamily(fam("f1"));
    learn.putTrivia({ id: "t1", entryId: "e1", mentions: [], title: "x", body: "y" });
    expect(f).toMatchObject({ rev: 1, createdAt: f.updatedAt });
    expect(events).toEqual(["family:f1", "trivia:t1"]);
    expect(storage.writes).toBe(0);

    await vi.advanceTimersByTimeAsync(500);
    await learn.flush();
    expect(storage.writes).toBe(1);
    expect(saved(storage).families[0].id).toBe("f1");
    expect(saved(storage).trivia[0].id).toBe("t1");

    learn.putFamily({ ...f, label: "edited" });
    expect(learn.family("f1")).toMatchObject({ label: "edited", rev: 2 });
  });

  it("deletes as tombstones", async () => {
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("f1"));
    learn.putTrivia({ id: "t1", entryId: "e1", mentions: [], title: "x", body: "y" });
    learn.deleteFamily("f1");
    learn.deleteTrivia("t1");
    expect(learn.families()).toEqual([]);
    expect(learn.trivia()).toEqual([]);
    await learn.flush();
    expect(saved(storage).families[0].deletedAt).toBeTruthy();
    expect(saved(storage).trivia[0].deletedAt).toBeTruthy();
  });

  it("merges another device's records on save instead of overwriting them", async () => {
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    // Synced in after we loaded.
    storage.shards.set(LEARN_SHARD, {
      families: [fam("phone", { updatedAt: "2026-10-03T00:00:00Z" })],
      trivia: [{ id: "pt", entryId: "e2", mentions: [], title: "phone", body: "", updatedAt: "2026-10-03T00:00:00Z" } as TriviaItem],
    });
    learn.putFamily(fam("mac"));
    await learn.flush();
    expect(saved(storage).families.map((f) => f.id)).toEqual(["mac", "phone"]);
    expect(saved(storage).trivia.map((t) => t.id)).toEqual(["pt"]);
  });

  it("reload unions the disk copy and announces it", async () => {
    const { storage, learn } = setup();
    let reloaded = 0;
    learn.events.on("learn:reloaded", () => reloaded++);
    await learn.reload();
    expect(reloaded).toBe(0); // nothing opened yet

    await learn.ensureLoaded();
    storage.shards.set(LEARN_SHARD, { families: [fam("synced", { updatedAt: "2026-10-03T00:00:00Z" })], trivia: [] });
    await learn.reload();
    expect(reloaded).toBe(1);
    expect(learn.family("synced")).toBeDefined();
  });

  it("reload writes the union back when the synced copy lacks this device's records (§4.3)", async () => {
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("mine"));
    await learn.flush();
    // The other device's learn.json overwrote ours: it has its own family
    // but not "mine".
    storage.shards.set(LEARN_SHARD, { families: [fam("theirs", { updatedAt: "2026-10-03T00:00:00Z", rev: 1 })], trivia: [] });
    const before = storage.writes;
    await learn.reload();
    await learn.flush();
    expect(storage.writes).toBe(before + 1);
    expect(saved(storage).families.map((f) => f.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("reload doesn't write when the synced copy already has everything, whatever its order", async () => {
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("a"));
    learn.putFamily(fam("b"));
    await learn.flush();
    // The same records, in another order (the other device's merge).
    const disk = saved(storage);
    storage.shards.set(LEARN_SHARD, { families: [...disk.families].reverse(), trivia: [] });
    const before = storage.writes;
    await learn.reload();
    await learn.flush();
    expect(storage.writes).toBe(before);
  });

  it("purges tombstones older than 30 days on write", async () => {
    const { storage, learn } = setup();
    storage.shards.set(LEARN_SHARD, {
      families: [fam("gone", { updatedAt: "2026-08-01T00:00:00Z", deletedAt: "2026-08-01T00:00:00Z" })],
      trivia: [],
    });
    await learn.ensureLoaded();
    learn.putFamily(fam("new"));
    await learn.flush();
    expect(saved(storage).families.map((f) => f.id)).toEqual(["new"]);
  });

  it("survives a storage read failure", async () => {
    const storage = new MemoryStorage();
    storage.readShard = async () => {
      throw new Error("disk");
    };
    const learn = new LearnStore({ storage });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await learn.ensureLoaded();
    expect(learn.families()).toEqual([]);
    spy.mockRestore();
  });

  // Word DNA (規劃書 09 §2 決定 1).
  it("stamps, emits and writes morphemes", async () => {
    vi.useFakeTimers();
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    const events: string[] = [];
    learn.events.on("morpheme:upsert", (m) => events.push(m.id));

    const m = learn.putMorpheme({
      id: "m1",
      form: "un",
      variants: [],
      type: "prefix",
      meaningZh: "不",
      origin: "dna:m1",
      timeline: [],
      suggested: [],
      source: "ai",
    });
    expect(m).toMatchObject({ rev: 1, createdAt: m.updatedAt });
    expect(events).toEqual(["m1"]);
    expect(learn.morpheme("m1")).toMatchObject({ form: "un" });
    expect(learn.morphemes().map((x) => x.id)).toEqual(["m1"]);

    await vi.advanceTimersByTimeAsync(500);
    await learn.flush();
    expect(saved(storage).morphemes?.[0].id).toBe("m1");

    learn.deleteMorpheme("m1");
    expect(learn.morpheme("m1")).toBeUndefined();
    expect(learn.morphemes()).toEqual([]);
    await learn.flush();
    expect(saved(storage).morphemes?.[0].deletedAt).toBeTruthy();
  });

  it("stamps, emits and writes wordMeta, keyed by entryId", async () => {
    vi.useFakeTimers();
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    const events: string[] = [];
    learn.events.on("wordMeta:upsert", (w) => events.push(w.id));

    const w = learn.putWordMeta({ id: "e1", emoji: "🦊", emojiSource: "user" });
    expect(w).toMatchObject({ rev: 1, createdAt: w.updatedAt });
    expect(events).toEqual(["e1"]);
    expect(learn.wordMeta("e1")).toMatchObject({ emoji: "🦊" });
    expect(learn.allWordMeta().map((x) => x.id)).toEqual(["e1"]);

    await vi.advanceTimersByTimeAsync(500);
    await learn.flush();
    expect(saved(storage).wordMeta?.[0].id).toBe("e1");

    learn.deleteWordMeta("e1");
    expect(learn.wordMeta("e1")).toBeUndefined();
    expect(learn.allWordMeta()).toEqual([]);
    await learn.flush();
    expect(saved(storage).wordMeta?.[0].deletedAt).toBeTruthy();
  });

  it("write() keeps morphemes and wordMeta instead of dropping them (§4.3 read-merge-write)", async () => {
    const { storage, learn } = setup();
    await learn.ensureLoaded();
    learn.putFamily(fam("f1"));
    learn.putMorpheme({
      id: "m1",
      form: "un",
      variants: [],
      type: "prefix",
      meaningZh: "不",
      origin: "dna:m1",
      timeline: [],
      suggested: [],
      source: "ai",
    });
    learn.putWordMeta({ id: "e1", emoji: "🦊" });
    await learn.flush();
    const disk = saved(storage);
    expect(disk.families.map((f) => f.id)).toEqual(["f1"]);
    expect(disk.morphemes?.map((m) => m.id)).toEqual(["m1"]);
    expect(disk.wordMeta?.map((w) => w.id)).toEqual(["e1"]);
  });

  it("loads an old learn.json with no morphemes/wordMeta arrays at all", async () => {
    const { storage, learn } = setup();
    storage.shards.set(LEARN_SHARD, { families: [], trivia: [] });
    await learn.ensureLoaded();
    expect(learn.morphemes()).toEqual([]);
    expect(learn.allWordMeta()).toEqual([]);
  });
});

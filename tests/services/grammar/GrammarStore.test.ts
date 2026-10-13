import { afterEach, describe, expect, it, vi } from "vitest";
import type { GrammarAttempt, GrammarQuestion, GrammarShard } from "../../../src/core/model/grammar";
import { GRAMMAR_SHARD, GrammarStore } from "../../../src/services/grammar/GrammarStore";
import { MemoryStorage } from "../ai/fakes";

function q(id: string, extra: Partial<GrammarQuestion> = {}): GrammarQuestion {
  return { id, topicId: "t1", objectiveId: "a", type: "choice", stem: id, answer: "x", explanation: "", errorTag: "article", ...extra };
}
function at(id: string, when: string, extra: Partial<GrammarAttempt> = {}): GrammarAttempt {
  return { id, questionId: "q1", topicId: "t1", objectiveId: "a", at: when, correct: true, given: "x", ...extra };
}

function setup() {
  const storage = new MemoryStorage();
  let clock = Date.parse("2026-10-13T08:00:00Z");
  const store = new GrammarStore({ storage, clock: () => new Date((clock += 1000)) });
  return { storage, store };
}
const saved = (s: MemoryStorage) => s.shards.get(GRAMMAR_SHARD) as GrammarShard;

describe("GrammarStore", () => {
  afterEach(() => vi.useRealTimers());

  it("loads lazily and only once, tolerating a missing file", async () => {
    const { storage, store } = setup();
    expect(store.loaded).toBe(false);
    await store.ensureLoaded();
    expect(store.questions()).toEqual([]);
    const s2 = setup();
    s2.storage.shards.set(GRAMMAR_SHARD, { questions: [q("q1")] });
    await Promise.all([s2.store.ensureLoaded(), s2.store.ensureLoaded()]);
    expect(s2.store.questions().map((x) => x.id)).toEqual(["q1"]);
    expect(storage.writes).toBe(0);
  });

  it("stamps, emits and debounces one write", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    await store.ensureLoaded();
    const events: string[] = [];
    store.events.on("question:upsert", (x) => events.push(`q:${x.id}`));
    store.events.on("attempt:add", (x) => events.push(`a:${x.id}`));
    store.events.on("progress:upsert", (x) => events.push(`p:${x.id}`));

    const saved1 = store.upsertQuestion(q("q1"));
    store.addAttempt(at("a1", "2026-10-13T08:00:00Z"));
    store.upsertProgress({ id: "t1", lastPracticedAt: "2026-10-13T08:00:00Z" });
    expect(saved1).toMatchObject({ rev: 1, createdAt: saved1.updatedAt });
    expect(events).toEqual(["q:q1", "a:a1", "p:t1"]);
    expect(storage.writes).toBe(0);

    await vi.advanceTimersByTimeAsync(500);
    await store.flush();
    expect(storage.writes).toBe(1);
    expect(saved(storage).questions[0].id).toBe("q1");
    expect(saved(storage).attempts).toHaveLength(1);
    expect(saved(storage).progress[0].id).toBe("t1");

    store.upsertQuestion({ ...saved1, stem: "edited" });
    expect(store.question("q1")).toMatchObject({ stem: "edited", rev: 2 });
  });

  it("filters by topic and hides retired questions from activeQuestions", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    store.upsertQuestion(q("q1"));
    store.upsertQuestion(q("q2", { retiredAt: "2026-10-01T00:00:00Z" }));
    store.upsertQuestion(q("q3", { topicId: "t2" }));
    expect(store.questions("t1").map((x) => x.id)).toEqual(["q1", "q2"]);
    expect(store.activeQuestions("t1").map((x) => x.id)).toEqual(["q1"]);
    expect(store.questions().length).toBe(3);
  });

  it("keeps attempts in time order, ignores duplicate ids, filters by topic", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    store.addAttempt(at("a2", "2026-10-02T00:00:00Z"));
    store.addAttempt(at("a1", "2026-10-01T00:00:00Z"));
    store.addAttempt(at("a1", "2026-10-09T00:00:00Z", { correct: false }));
    store.addAttempt(at("a3", "2026-10-03T00:00:00Z", { topicId: "t2" }));
    expect(store.attempts().map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(store.attempts("t1").map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(store.attempts("t1")[0].correct).toBe(true);
  });

  it("returns progress by topic id", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    expect(store.progress("t1")).toBeUndefined();
    store.upsertProgress({ id: "t1" });
    expect(store.progress("t1")?.id).toBe("t1");
    expect(store.allProgress()).toHaveLength(1);
  });

  it("read-merge-writes so a synced copy isn't overwritten", async () => {
    const { storage, store } = setup();
    await store.ensureLoaded();
    store.upsertQuestion(q("mine"));
    storage.shards.set(GRAMMAR_SHARD, { questions: [q("theirs")], attempts: [at("a9", "2026-10-05T00:00:00Z")], progress: [] });
    await store.flush();
    expect(saved(storage).questions.map((x) => x.id).sort()).toEqual(["mine", "theirs"]);
    expect(saved(storage).attempts.map((x) => x.id)).toEqual(["a9"]);
  });

  it("reload() merges a synced copy, emits, and writes back when the disk lacks rows", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    await store.reload(); // no-op before load
    storage.shards.set(GRAMMAR_SHARD, { questions: [q("q1", { updatedAt: "2026-10-01T00:00:00Z" })], attempts: [], progress: [] });
    await store.ensureLoaded();
    store.upsertQuestion(q("local"));
    await vi.advanceTimersByTimeAsync(500);
    await store.flush();
    const reloaded = vi.fn();
    store.events.on("grammar:reloaded", reloaded);

    // The other device's file replaces ours and lacks "local".
    storage.shards.set(GRAMMAR_SHARD, { questions: [q("q1", { updatedAt: "2026-10-01T00:00:00Z" })], attempts: [at("a5", "2026-10-06T00:00:00Z")], progress: [] });
    const writesBefore = storage.writes;
    await store.reload();
    expect(reloaded).toHaveBeenCalledTimes(1);
    expect(store.questions().map((x) => x.id).sort()).toEqual(["local", "q1"]);
    expect(store.attempts().map((a) => a.id)).toEqual(["a5"]);
    await vi.advanceTimersByTimeAsync(500);
    await store.flush();
    expect(storage.writes).toBe(writesBefore + 1);
    expect(saved(storage).questions.map((x) => x.id).sort()).toEqual(["local", "q1"]);
  });

  it("starts empty when the shard is unreadable", async () => {
    const { storage, store } = setup();
    storage.readShard = async () => {
      throw new Error("boom");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await store.ensureLoaded();
    expect(store.questions()).toEqual([]);
    err.mockRestore();
  });
});

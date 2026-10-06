import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SrsService, REVIEWS_SHARD } from "../../../src/services/srs/SrsService";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { RATINGS, Rating, type ReviewLog } from "../../../src/core/model/srs";
import type { VocabData } from "../../../src/core/model/entry";
import { MemoryStorage, makeEntry, reviewCard } from "./fixtures";

function setup(entries = [makeEntry({ id: "e1", word: "leotard" })], settings?: VocabData["settings"]) {
  let now = new Date(2026, 9, 4, 12, 0, 0);
  let seq = 0;
  const data: VocabData = { schemaVersion: 2, settings, entries };
  const store = new VocabStore(data, vi.fn().mockResolvedValue(undefined));
  const storage = new MemoryStorage();
  const srs = new SrsService({
    store,
    storage,
    clock: () => now,
    newId: () => `log-${++seq}`,
  });
  return {
    srs,
    store,
    storage,
    data,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
  };
}

describe("SrsService", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("preview() predicts exactly what rate() schedules, for every rating", async () => {
    for (const rating of RATINGS) {
      const { srs, data, now } = setup();
      const entry = data.entries[0];
      const preview = srs.preview(entry);
      await srs.rate(entry, rating, "en-zh");
      expect(entry.srs?.due).toBe(preview[rating].due);
      expect(new Date(entry.srs!.due).getTime() - now().getTime()).toBe(preview[rating].intervalMs);
    }
  });

  it("preview intervals grow with the rating and stay consistent after a review", async () => {
    const { srs, data, advance, now } = setup();
    const entry = data.entries[0];
    await srs.rate(entry, Rating.Good, "en-zh");
    // Come back exactly when it's due.
    advance(new Date(entry.srs!.due).getTime() - now().getTime());

    const p = srs.preview(entry);
    expect(p[1].intervalMs).toBeLessThanOrEqual(p[2].intervalMs);
    expect(p[2].intervalMs).toBeLessThanOrEqual(p[3].intervalMs);
    expect(p[3].intervalMs).toBeLessThan(p[4].intervalMs);

    await srs.rate(entry, Rating.Easy, "cloze");
    expect(entry.srs?.due).toBe(p[4].due);
  });

  it("rate() syncs the legacy fields, stamps the entry and appends a log", async () => {
    const { srs, store, data } = setup();
    const entry = data.entries[0];
    const onChanged = vi.fn();
    store.events.on("data:changed", onChanged);

    const log = await srs.rate(entry, Rating.Again, "listen", 4321.6);

    expect(entry.reviews).toBe(1);
    expect(entry.lastReviewed).toBe("2026-10-04 12:00:00");
    expect(entry.rev).toBe(1);
    expect(entry.srs?.reps).toBe(1);
    expect(entry.srs?.state).not.toBe(0);
    expect(onChanged).toHaveBeenCalled();
    expect(log).toEqual<ReviewLog>({
      id: "log-1",
      entryId: "e1",
      at: new Date(2026, 9, 4, 12).toISOString(),
      rating: 1,
      mode: "listen",
      elapsedMs: 4322,
      prevState: 0,
    });
    expect(srs.reviewLogs()).toEqual([log]);
  });

  it("rated new cards count against today's new-card allowance", async () => {
    const entries = ["a", "b", "c"].map((id) => makeEntry({ id }));
    const { srs } = setup(entries, { schemaVersion: 2, srs: { dailyNew: 2 } });
    expect(srs.queue().map((e) => e.id)).toEqual(["a", "b"]);

    // "a" rated Good goes into learning (due in minutes): no longer new,
    // and it used one of today's two slots.
    await srs.rate(entries[0], Rating.Good, "en-zh");
    expect(srs.queue().map((e) => e.id)).toEqual(["b"]);
  });

  it("writes logs to the reviews shard (debounced), merging what's on disk", async () => {
    const { srs, data, storage } = setup();
    const remote: ReviewLog = {
      id: "remote-1",
      entryId: "other",
      at: new Date(2026, 9, 4, 8).toISOString(),
      rating: 3,
      mode: "en-zh",
      elapsedMs: 0,
    };
    storage.shards.set(REVIEWS_SHARD, { logs: [remote] });

    await srs.rate(data.entries[0], Rating.Good, "en-zh");
    expect(storage.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    await srs.flush();

    const shard = storage.shards.get(REVIEWS_SHARD) as { logs: ReviewLog[] };
    expect(shard.logs.map((l) => l.id)).toEqual(["remote-1", "log-1"]);
    expect(srs.reviewLogs().map((l) => l.id)).toEqual(["remote-1", "log-1"]);
  });

  it("flush() lands a pending write immediately", async () => {
    const { srs, data, storage } = setup();
    await srs.rate(data.entries[0], Rating.Hard, "zh-en");
    await srs.flush();
    expect(storage.writes).toHaveLength(1);
  });

  it("reloadLogs() writes the union back when the synced copy lacks this device's reviews (§4.3)", async () => {
    const { srs, data, storage } = setup();
    await srs.rate(data.entries[0], Rating.Good, "en-zh");
    await srs.flush();
    // The other device's reviews.json overwrote ours: its review, not ours.
    const remote: ReviewLog = { id: "remote-1", entryId: "other", at: new Date(2026, 9, 4, 8).toISOString(), rating: 3, mode: "en-zh", elapsedMs: 0 };
    storage.shards.set(REVIEWS_SHARD, { logs: [remote] });
    const before = storage.writes.length;
    await srs.reloadLogs();
    await srs.flush();
    expect(storage.writes).toHaveLength(before + 1);
    const shard = storage.shards.get(REVIEWS_SHARD) as { logs: ReviewLog[] };
    expect(shard.logs.map((l) => l.id)).toEqual(["remote-1", "log-1"]);
  });

  it("reloadLogs() doesn't write when the synced copy already has every review, whatever its order", async () => {
    const { srs, data, storage } = setup();
    await srs.rate(data.entries[0], Rating.Good, "en-zh");
    await srs.rate(data.entries[0], Rating.Easy, "cloze");
    await srs.flush();
    const shard = storage.shards.get(REVIEWS_SHARD) as { logs: ReviewLog[] };
    storage.shards.set(REVIEWS_SHARD, { logs: [...shard.logs].reverse() });
    const before = storage.writes.length;
    await srs.reloadLogs();
    await srs.flush();
    expect(storage.writes).toHaveLength(before);
  });

  it("ensureLoaded() reads the shard once and prunes logs past 90 days", async () => {
    const { srs, storage } = setup();
    const old: ReviewLog = { id: "old", entryId: "e1", at: "2026-01-01T00:00:00.000Z", rating: 3, mode: "en-zh", elapsedMs: 0 };
    const recent: ReviewLog = { ...old, id: "recent", at: new Date(2026, 9, 3).toISOString() };
    storage.shards.set(REVIEWS_SHARD, { logs: [old, recent] });
    const read = vi.spyOn(storage, "readShard");

    await srs.ensureLoaded();
    await srs.ensureLoaded();
    expect(read).toHaveBeenCalledTimes(1);
    expect(srs.reviewLogs().map((l) => l.id)).toEqual(["recent"]);
  });

  it("uses the configured retention (higher retention → shorter intervals)", () => {
    const low = setup(undefined, { schemaVersion: 2, srs: { retention: 0.8 } });
    const high = setup(undefined, { schemaVersion: 2, srs: { retention: 0.97 } });
    const card = (s: ReturnType<typeof setup>) => {
      const e = s.data.entries[0];
      e.srs = {
        due: s.now().toISOString(), stability: 10, difficulty: 5, elapsedDays: 10,
        scheduledDays: 10, learningSteps: 0, reps: 5, lapses: 0, state: 2,
        lastReview: new Date(s.now().getTime() - 10 * 86_400_000).toISOString(),
      };
      return s.srs.preview(e)[Rating.Good].intervalMs;
    };
    expect(card(high)).toBeLessThan(card(low));
  });

  it("nextDue() is null for never-scheduled cards", async () => {
    const { srs, data } = setup();
    const entry = data.entries[0];
    expect(srs.nextDue(entry)).toBeNull();
    await srs.rate(entry, Rating.Easy, "en-zh");
    expect(srs.nextDue(entry)?.toISOString()).toBe(entry.srs?.due);
  });

  it("timing() tells a one-word review whether the card is new, due or early", async () => {
    const { srs, data, advance, now } = setup();
    const entry = data.entries[0];
    expect(srs.timing(entry)).toEqual({ kind: "new" });
    await srs.rate(entry, Rating.Easy, "en-zh");
    const due = new Date(entry.srs!.due);
    expect(srs.timing(entry)).toEqual({ kind: "early", due });
    advance(due.getTime() - now().getTime());
    expect(srs.timing(entry)).toEqual({ kind: "due", due });
  });

  describe("reviewing a word before it's due (「複習這個字」)", () => {
    // Review card: last reviewed 5 days before `due`, stability 5.
    const due = new Date(2026, 9, 10, 12, 0, 0);
    const early = new Date(2026, 9, 7, 12, 0, 0); // 3 days early

    function scheduled(at: Date) {
      const s = setup([makeEntry({ id: "e1", word: "leotard", srs: reviewCard(due) })]);
      s.advance(at.getTime() - s.now().getTime());
      return { ...s, entry: s.data.entries[0] };
    }

    it("is allowed, logged and rescheduled from now", async () => {
      const { srs, entry, now } = scheduled(early);
      expect(srs.timing(entry)).toEqual({ kind: "early", due });
      const p = srs.preview(entry);
      const log = await srs.rate(entry, Rating.Good, "zh-en");
      expect(log).toMatchObject({ entryId: "e1", rating: Rating.Good, mode: "zh-en", prevState: 2 });
      expect(entry.srs!.due).toBe(p[Rating.Good].due);
      expect(entry.srs!.lastReview).toBe(now().toISOString());
      expect(entry.srs!.reps).toBe(4);
      expect(new Date(entry.srs!.due).getTime()).toBeGreaterThan(due.getTime());
    });

    it("grows the interval less than the same answer on the due date", async () => {
      const a = scheduled(early);
      const b = scheduled(due);
      await a.srs.rate(a.entry, Rating.Good, "en-zh");
      await b.srs.rate(b.entry, Rating.Good, "en-zh");
      expect(a.entry.srs!.stability).toBeLessThan(b.entry.srs!.stability);
      expect(a.entry.srs!.scheduledDays).toBeLessThan(b.entry.srs!.scheduledDays);
    });

    it("Again still counts as a lapse", async () => {
      const { srs, entry } = scheduled(early);
      await srs.rate(entry, Rating.Again, "en-zh");
      expect(entry.srs!.lapses).toBe(1);
      expect(entry.srs!.state).toBe(3); // Relearning
    });
  });

  it("queue()/dueTomorrow() only count liked words (1006report.md #24)", async () => {
    const entries = [
      makeEntry({ id: "liked", liked: true, createdAt: "2026-09-01T00:00:00.000Z" }),
      makeEntry({ id: "unliked", liked: false, createdAt: "2026-09-01T00:00:00.000Z" }),
      makeEntry({ id: "unset", liked: undefined, createdAt: "2026-09-01T00:00:00.000Z" }),
    ];
    const { srs } = setup(entries);
    expect(srs.queue().map((e) => e.id)).toEqual(["liked"]);

    const tomorrow = new Date(2026, 9, 5, 9);
    entries[0].srs = reviewCard(tomorrow);
    entries[1].srs = reviewCard(tomorrow);
    expect(srs.dueTomorrow()).toBe(1);
  });

  it("emits srs:rated after rate() so AutoLike can like a reviewed word (1006report.md #15)", async () => {
    const { srs, data } = setup();
    const rated = vi.fn();
    srs.events.on("srs:rated", rated);
    await srs.rate(data.entries[0], Rating.Good, "en-zh");
    expect(rated).toHaveBeenCalledWith({ entryId: "e1" });
  });

  it("reviewsToday() counts today's logs for words matching the source filter", async () => {
    const entries = [
      makeEntry({ id: "a", source: { path: "eng/a.md", line: 0 } }),
      makeEntry({ id: "b", source: { path: "misc/b.md", line: 0 } }),
    ];
    const { srs, storage } = setup(entries);
    storage.shards.set(REVIEWS_SHARD, {
      logs: [{ id: "y", entryId: "a", at: new Date(2026, 9, 3, 20).toISOString(), rating: 3, mode: "en-zh", elapsedMs: 0 }],
    });
    await srs.ensureLoaded();
    await srs.rate(entries[0], Rating.Again, "en-zh");
    await srs.rate(entries[0], Rating.Good, "en-zh");
    await srs.rate(entries[1], Rating.Good, "en-zh");
    expect(srs.reviewsToday()).toBe(3);
    expect(srs.reviewsToday({ source: "eng/" })).toBe(2);
  });

  // 整合 D2（主 session 決定）: unlike queue()/dueTomorrow(), this is a log
  // of reviews that already happened — a word rated today still counts
  // even if it's unliked again since (e.g. the user unliked it right
  // after reviewing).
  it("reviewsToday() counts a review today even for a word that's since been unliked", async () => {
    const entries = [makeEntry({ id: "a", liked: true })];
    const { srs } = setup(entries);
    await srs.rate(entries[0], Rating.Good, "en-zh");
    entries[0].liked = false;
    expect(srs.reviewsToday()).toBe(1);
  });
});

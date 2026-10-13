import { afterEach, describe, expect, it, vi } from "vitest";
import type { GrammarAttempt, GrammarQuestion } from "../../../src/core/model/grammar";
import type { LearnEvent, LearnerShard } from "../../../src/core/model/learner";
import type { PracticeQuestion } from "../../../src/core/model/practice";
import { addToPool, removeFromPool } from "../../../src/core/practice/pool";
import { recordWrong } from "../../../src/core/practice/mistakes";
import { LEARNER_SHARD, LearnerStore } from "../../../src/services/learner/LearnerStore";
import { MemoryStorage } from "../ai/fakes";

const F = { kind: "word" as const, id: "w" };
const ev = (id: string, at = "2026-10-12T00:00:00Z"): LearnEvent => ({ id, at, track: "vocab", focus: F, result: "wrong" });
const saved = (s: MemoryStorage) => s.shards.get(LEARNER_SHARD) as LearnerShard;
const NOW = new Date("2026-10-13T08:00:00Z");

function setup() {
  const storage = new MemoryStorage();
  let clock = NOW.getTime();
  const store = new LearnerStore({ storage, clock: () => new Date((clock += 1000)) });
  return { storage, store };
}
function q(id: string): GrammarQuestion {
  return { id, topicId: "t1", objectiveId: "a", type: "choice", stem: id, answer: "x", explanation: "", errorTag: "article", createdAt: "2026-09-01T00:00:00Z" };
}
const att = (id: string, questionId: string, correct: boolean): GrammarAttempt => ({
  id, questionId, topicId: "t1", objectiveId: "a", at: "2026-10-01T00:00:00Z", correct, given: "y",
});

describe("LearnerStore", () => {
  afterEach(() => vi.useRealTimers());

  it("loads lazily, once, tolerating a missing file", async () => {
    const { storage, store } = setup();
    expect(store.loaded).toBe(false);
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    expect(store.learnEvents()).toEqual([]);
    expect(store.filter("grammar")).toBeUndefined();
    expect(storage.writes).toBe(0);
  });

  it("emits and debounces one write for several changes", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    await store.ensureLoaded();
    const seen: string[] = [];
    store.events.on("event:add", (e) => seen.push(`e:${e.id}`));
    store.events.on("pool:change", (t) => seen.push(`p:${t}`));
    store.events.on("filter:change", (t) => seen.push(`f:${t}`));
    store.addEvent(ev("a"));
    store.addEvent(ev("a"));
    store.upsertPool(addToPool([], "grammar", [{ questionId: "q1" }, { questionId: "q2" }], NOW));
    store.setFilter("vocab", { level: 1 });
    await vi.advanceTimersByTimeAsync(600);
    await store.flush();
    expect(seen).toEqual(["e:a", "p:grammar", "f:vocab"]);
    expect(storage.writes).toBe(1);
    expect(saved(storage).events).toHaveLength(1);
    expect(saved(storage).pool).toHaveLength(2);
    expect(store.filter("vocab")).toEqual({ level: 1 });
    expect(store.pool("grammar")).toHaveLength(2);
  });

  it("filters events and tracks mistakes through resolve and reopen", async () => {
    const { store } = setup();
    await store.ensureLoaded();
    store.addEvent(ev("a"));
    store.addEvent({ ...ev("b"), track: "grammar", focus: { kind: "sense", id: "s" } });
    expect(store.learnEvents({ track: "grammar" }).map((e) => e.id)).toEqual(["b"]);
    expect(store.learnEvents({ focusId: "w" }).map((e) => e.id)).toEqual(["a"]);
    const m = recordWrong(undefined, "grammar", "q1", F, NOW);
    store.upsertMistake(m);
    expect(store.mistakes()).toHaveLength(1);
    store.upsertMistake({ ...m, resolvedAt: NOW.toISOString() });
    expect(store.mistakes()).toHaveLength(0);
    expect(store.mistake("grammar:q1")?.resolvedAt).toBeDefined();
  });

  it("merges two devices' shards and keeps both events after reload", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    storage.shards.set(LEARNER_SHARD, { events: [ev("disk")], pool: [], mistakes: [], filters: [], questions: [], meta: {} });
    await store.ensureLoaded();
    store.addEvent(ev("mine", "2026-10-12T01:00:00Z"));
    await store.flush();
    expect(saved(storage).events.map((e) => e.id).sort()).toEqual(["disk", "mine"]);
    // another device's file lands
    storage.shards.set(LEARNER_SHARD, { events: [ev("other", "2026-10-12T02:00:00Z")], pool: [], mistakes: [], filters: [], questions: [], meta: {} });
    await store.reload();
    expect(store.learnEvents().map((e) => e.id).sort()).toEqual(["disk", "mine", "other"]);
    await vi.advanceTimersByTimeAsync(600);
    await store.flush();
    expect(saved(storage).events).toHaveLength(3);
  });

  it("an older disk copy does not bring a removed pool item back", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    const [item] = addToPool([], "grammar", [{ questionId: "q1" }], new Date("2026-10-01T00:00:00Z"));
    storage.shards.set(LEARNER_SHARD, { events: [], pool: [item], mistakes: [], filters: [], questions: [], meta: {} });
    await store.ensureLoaded();
    store.upsertPool([removeFromPool(item, "answered", NOW)]);
    await store.flush();
    storage.shards.set(LEARNER_SHARD, { events: [], pool: [item], mistakes: [], filters: [], questions: [], meta: {} });
    await store.reload();
    expect(store.pool("grammar")).toEqual([]);
    expect(addToPool(store.allPool(), "grammar", [{ questionId: "q1" }], NOW)).toEqual([]);
  });

  it("migrates grammar once", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    expect(store.migrateFromGrammar([], [])).toBe(false); // not loaded yet
    await store.ensureLoaded();
    const qs = [q("q1"), q("q2")];
    const as = [att("a1", "q1", false)];
    expect(store.migrateFromGrammar(qs, as)).toBe(true);
    const snapshot = JSON.stringify([store.learnEvents(), store.pool("grammar"), store.mistakes()]);
    expect(store.migrateFromGrammar(qs, as)).toBe(false);
    expect(JSON.stringify([store.learnEvents(), store.pool("grammar"), store.mistakes()])).toBe(snapshot);
    expect(store.learnEvents().map((e) => e.id)).toEqual(["g:a1"]);
    expect(store.mistakes().map((m) => m.id)).toEqual(["grammar:q1"]);
    expect(store.pool("grammar").map((p) => p.questionId)).toEqual(["q2"]);
    await store.flush();
    expect(saved(storage).meta.grammarMigratedAt).toBeDefined();
    // a fresh store on the same disk does not migrate again
    const again = new LearnerStore({ storage });
    await again.ensureLoaded();
    expect(again.migrateFromGrammar(qs, as)).toBe(false);
  });

  it("stores practice questions, queries by track, survives a flush and an old file", async () => {
    vi.useFakeTimers();
    const { storage, store } = setup();
    storage.shards.set(LEARNER_SHARD, { events: [], pool: [], mistakes: [], filters: [], meta: {} });
    await store.ensureLoaded();
    expect(store.practiceQuestions()).toEqual([]);
    const pq = (id: string, track: "poly" | "vocab"): PracticeQuestion => ({
      id, track, scenario: { id: "s", scene: "x", seq: 1 }, kind: "which-sense", text: "[[a]]",
      options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], answerId: "a", explanation: "e",
      focus: { kind: "word", id: "w" }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    });
    const seen: string[] = [];
    store.events.on("question:upsert", (l) => seen.push(...l.map((x) => x.id)));
    store.upsertPracticeQuestions([pq("a", "poly"), pq("b", "vocab")]);
    store.upsertPracticeQuestions([{ ...pq("a", "poly"), explanation: "new" }]);
    expect(store.practiceQuestions("poly").map((x) => x.explanation)).toEqual(["new"]);
    expect(store.practiceQuestions()).toHaveLength(2);
    expect(store.practiceQuestion("b")?.track).toBe("vocab");
    expect(seen).toEqual(["a", "b", "a"]);
    await store.flush();
    expect(saved(storage).questions.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
});

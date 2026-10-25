import { describe, expect, it } from "vitest";
import { asksFromThreads, truncateAsk } from "../../../src/core/learner/asks";
import type { AskEvent, LearnerShard, WordTouch } from "../../../src/core/model/learner";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { LearnerModel } from "../../../src/services/learner/LearnerModel";
import { LEARNER_SHARD, LearnerStore } from "../../../src/services/learner/LearnerStore";
import { emptyLearnerShard, learnerFingerprint, mergeLearner, normalizeLearnerShard, pruneLearner } from "../../../src/services/learner/learnerMerge";
import { MemoryStorage } from "../ai/fakes";

const T0 = "2026-10-12T08:00:00.000Z";
const ask = (id: string, over: Partial<AskEvent> = {}): AskEvent => ({ id, at: T0, surface: "word", taskId: "word.usage", custom: false, ok: true, ...over });
const touch = (day: string, word: string, over: Partial<WordTouch> = {}): WordTouch => ({
  id: `${day}|${word}`, day, word, lookup: 1, pronounce: 0, saved: false, updatedAt: T0, ...over,
});
const shard = (over: Partial<LearnerShard>): LearnerShard => ({ ...emptyLearnerShard(), ...over });

describe("normalize asks / wordTouches", () => {
  it("drops broken rows, repairs the lowercase id", () => {
    const s = normalizeLearnerShard({
      asks: [ask("a"), { id: "", at: T0, taskId: "x" }, { id: "b", at: "nope", taskId: "x" }, { id: "c", at: T0 }, ask("d", { surface: "zzz" as never })],
      wordTouches: [touch("2026-10-12", "Hello"), { word: "x", day: "bad", lookup: 1 }, touch("2026-10-12", "none", { lookup: 0 }), { day: "2026-10-12", lookup: 1 }],
      meta: { asksMigratedAt: T0 },
    });
    expect(s.asks?.map((a) => a.id)).toEqual(["a", "d"]);
    expect(s.asks?.[1].surface).toBe("other");
    expect(s.wordTouches).toEqual([touch("2026-10-12", "hello")]);
    expect(s.meta.asksMigratedAt).toBe(T0);
  });
});

describe("merge / fingerprint / prune", () => {
  it("unions asks by id and takes the larger counts for touches", () => {
    const a = shard({ asks: [ask("1"), ask("2")], wordTouches: [touch("2026-10-12", "x", { lookup: 3, pronounce: 0 })] });
    const b = shard({
      asks: [ask("2"), ask("3")],
      wordTouches: [touch("2026-10-12", "x", { lookup: 1, pronounce: 2, saved: true, updatedAt: "2026-10-12T09:00:00.000Z" })],
      meta: { asksMigratedAt: T0 },
    });
    const m = mergeLearner(a, b);
    expect(m.asks?.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(m.wordTouches).toEqual([touch("2026-10-12", "x", { lookup: 3, pronounce: 2, saved: true, updatedAt: "2026-10-12T09:00:00.000Z" })]);
    expect(m.meta.asksMigratedAt).toBe(T0);
  });

  it("fingerprint changes with asks and touches", () => {
    const base = shard({});
    const f0 = learnerFingerprint(base);
    expect(learnerFingerprint(shard({ asks: [ask("1")] }))).not.toBe(f0);
    const w1 = learnerFingerprint(shard({ wordTouches: [touch("2026-10-12", "x")] }));
    expect(w1).not.toBe(f0);
    expect(learnerFingerprint(shard({ wordTouches: [touch("2026-10-12", "x", { pronounce: 1 })] }))).not.toBe(w1);
  });

  it("prunes at 365 days", () => {
    const now = Date.parse("2026-10-13T08:00:00Z");
    const s = pruneLearner(
      shard({
        asks: [ask("old", { at: "2025-10-01T00:00:00Z" }), ask("new", { at: "2025-10-20T00:00:00Z" })],
        wordTouches: [touch("2025-10-01", "old"), touch("2025-10-20", "new")],
      }),
      now
    );
    expect(s.asks?.map((a) => a.id)).toEqual(["new"]);
    expect(s.wordTouches?.map((w) => w.word)).toEqual(["new"]);
  });
});

function turn(id: string, role: Turn["role"], over: Partial<Turn> = {}): Turn {
  return { id, role, content: "c", at: T0, status: "done", ...over };
}

describe("asksFromThreads", () => {
  const threads: Thread[] = [
    {
      id: "word:e1", anchor: { kind: "word", entryId: "e1" }, rev: 0, createdAt: T0,
      turns: [
        turn("u1", "user", { taskId: "word.usage", selection: "x".repeat(200) }),
        turn("a1", "assistant", { taskId: "word.usage" }),
        // tombstoned round, failed answer
        turn("u2", "user", { taskId: "word.custom", question: "why?", deletedAt: T0 }),
        turn("a2", "assistant", { status: "error", deletedAt: T0 }),
        turn("u3", "user", { taskId: "word.compare" }),
      ],
    },
    {
      id: "paragraph:p", anchor: { kind: "paragraph", path: "n.md", hash: "h", snapshot: "" }, rev: 0, createdAt: T0, deletedAt: T0,
      turns: [turn("u4", "user", { taskId: "paragraph.translate", subjectEntryId: "e9" }), turn("a4", "assistant")],
    },
    { id: "m", anchor: { kind: "morpheme", morphemeId: "x" }, rev: 0, createdAt: T0, turns: [turn("u5", "user", { taskId: "dna.followup" }), turn("a5", "assistant")] },
  ];

  it("includes tombstones, ok from the following answer, shapes fields", () => {
    const r = asksFromThreads(threads);
    expect(r.map((a) => [a.id, a.ok])).toEqual([["u1", true], ["u2", false], ["u3", false], ["u4", true], ["u5", true]]);
    const [u1, u2, , u4, u5] = r;
    expect(u1).toMatchObject({ surface: "word", entryId: "e1", custom: false });
    expect(u1.selection).toHaveLength(80);
    expect(u2).toMatchObject({ custom: true, question: "why?" });
    expect(u4).toMatchObject({ surface: "paragraph", path: "n.md", entryId: "e9" });
    expect(u5).toMatchObject({ surface: "morpheme", custom: true });
  });

  it("truncateAsk trims and cuts", () => {
    expect(truncateAsk("  ")).toBeUndefined();
    expect(truncateAsk("ab")).toBe("ab");
  });
});

describe("LearnerStore asks / touches", () => {
  function setup() {
    const storage = new MemoryStorage();
    let now = new Date(2026, 9, 13, 10, 0, 0).getTime();
    const store = new LearnerStore({ storage, clock: () => new Date(now) });
    return { storage, store, setNow: (d: Date) => (now = d.getTime()) };
  }

  it("accumulates same-day touches and splits days", async () => {
    const { store, setNow } = setup();
    await store.ensureLoaded();
    store.recordWordTouch({ word: " Foo ", kind: "lookup", saved: true });
    store.recordWordTouch({ word: "foo", kind: "lookup", saved: false });
    store.recordWordTouch({ word: "FOO", kind: "pronounce", saved: false });
    setNow(new Date(2026, 9, 14, 10, 0, 0));
    store.recordWordTouch({ word: "foo", kind: "lookup", saved: false });
    const w = store.wordTouches();
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ day: "2026-10-13", word: "foo", lookup: 2, pronounce: 1, saved: true });
    expect(w[1]).toMatchObject({ day: "2026-10-14", lookup: 1, saved: false });
  });

  it("recordAsk ignores a repeated id", async () => {
    const { store, storage } = setup();
    await store.ensureLoaded();
    store.recordAsk(ask("1"));
    store.recordAsk(ask("1", { ok: false }));
    expect(store.asks()).toHaveLength(1);
    expect(store.asks()[0].ok).toBe(true);
    await store.flush();
    expect((storage.shards.get(LEARNER_SHARD) as LearnerShard).asks).toHaveLength(1);
  });

  it("migrates asks from threads once", async () => {
    const { store } = setup();
    const th: Thread = {
      id: "word:e1", anchor: { kind: "word", entryId: "e1" }, rev: 0, createdAt: T0,
      turns: [turn("u1", "user", { taskId: "word.usage", deletedAt: T0 }), turn("a1", "assistant", { deletedAt: T0 })],
    };
    expect(store.migrateAsksFromThreads([th])).toBe(false); // not loaded
    await store.ensureLoaded();
    expect(store.migrateAsksFromThreads([th])).toBe(true);
    expect(store.asks().map((a) => a.id)).toEqual(["u1"]);
    expect(store.migrateAsksFromThreads([th])).toBe(false);
    await store.flush();
    const again = new LearnerStore({ storage: (store as unknown as { deps: { storage: MemoryStorage } }).deps.storage });
    await again.ensureLoaded();
    expect(again.migrateAsksFromThreads([th])).toBe(false);
  });
});

describe("LearnerModel.activity", () => {
  it("filters every list to the period, oldest first", () => {
    const d = (day: number, h = 12) => new Date(2026, 9, day, h).toISOString();
    const m = new LearnerModel({
      vocab: () => [],
      grammar: { questions: () => [], attempts: () => [], progress: () => undefined },
      learner: {
        learnEvents: () => [
          { id: "e2", at: d(12), track: "vocab", focus: { kind: "word", id: "w" }, result: "correct" },
          { id: "e1", at: d(11), track: "vocab", focus: { kind: "word", id: "w" }, result: "correct" },
          { id: "e0", at: d(9), track: "vocab", focus: { kind: "word", id: "w" }, result: "correct" },
        ],
        asks: () => [ask("a2", { at: d(12) }), ask("a1", { at: d(10, 1) }), ask("a0", { at: d(13) })],
        wordTouches: () => [touch("2026-10-12", "b"), touch("2026-10-10", "a"), touch("2026-10-14", "c")],
        readingBetween: (f, t) => [{ id: `${f}${t}`, day: f, at: T0, updatedAt: T0, path: "p", title: "t", kinds: ["word"] }],
      },
      reviews: () => [
        { id: "r2", entryId: "x", at: d(12), rating: 3, mode: "manual", elapsedMs: 0 },
        { id: "r1", entryId: "x", at: d(10), rating: 3, mode: "manual", elapsedMs: 0 },
        { id: "r0", entryId: "x", at: d(8), rating: 3, mode: "manual", elapsedMs: 0 },
      ],
      level: () => "",
    });
    const a = m.activity("2026-10-10", "2026-10-12");
    expect(a.asks.map((x) => x.id)).toEqual(["a1", "a2"]);
    expect(a.wordTouches.map((x) => x.word)).toEqual(["a", "b"]);
    expect(a.events.map((x) => x.id)).toEqual(["e1", "e2"]);
    expect(a.reviews.map((x) => x.id)).toEqual(["r1", "r2"]);
    expect(a.reading).toHaveLength(1);
  });
});

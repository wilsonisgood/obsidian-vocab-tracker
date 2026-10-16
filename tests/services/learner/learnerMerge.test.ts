import { describe, expect, it } from "vitest";
import type { LearnerShard } from "../../../src/core/model/learner";
import { emptyLearnerShard, learnerFingerprint, mergeLearner, normalizeLearnerShard, pruneLearner } from "../../../src/services/learner/learnerMerge";

const F = { kind: "word" as const, id: "w" };
const ev = (id: string, at = "2026-10-01T00:00:00Z") => ({ id, at, track: "vocab" as const, focus: F, result: "wrong" as const });
const shard = (p: Partial<LearnerShard>): LearnerShard => ({ ...emptyLearnerShard(), ...p });
const pool = (updatedAt: string, removedAt?: string) => ({
  id: "grammar:q1", track: "grammar" as const, questionId: "q1", seq: 1, addedAt: "2026-10-01T00:00:00Z", updatedAt,
  ...(removedAt ? { removedAt, removeReason: "answered" as const } : {}),
});

describe("learnerMerge", () => {
  it("unions events from both sides", () => {
    const m = mergeLearner(shard({ events: [ev("a")] }), shard({ events: [ev("b", "2026-10-02T00:00:00Z"), ev("a")] }));
    expect(m.events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("a newer tombstone is not overwritten by an older live copy", () => {
    const live = shard({ pool: [pool("2026-10-01T00:00:00Z")] });
    const gone = shard({ pool: [pool("2026-10-05T00:00:00Z", "2026-10-05T00:00:00Z")] });
    expect(mergeLearner(live, gone).pool[0].removedAt).toBeDefined();
    expect(mergeLearner(gone, live).pool[0].removedAt).toBeDefined();
  });

  it("keeps the earliest migration stamp", () => {
    const m = mergeLearner(shard({ meta: { grammarMigratedAt: "2026-10-03T00:00:00Z" } }), shard({ meta: { grammarMigratedAt: "2026-10-02T00:00:00Z" } }));
    expect(m.meta.grammarMigratedAt).toBe("2026-10-02T00:00:00Z");
    expect(mergeLearner(emptyLearnerShard(), shard({ meta: { grammarMigratedAt: "2026-10-02T00:00:00Z" } })).meta.grammarMigratedAt).toBeDefined();
  });

  it("prunes per the retention rules", () => {
    const now = Date.parse("2026-10-13T00:00:00Z");
    const s = shard({
      events: [ev("old", "2025-01-01T00:00:00Z"), ev("new")],
      pool: [pool("2026-10-13T00:00:00Z", "2026-08-01T00:00:00Z"), { ...pool("2026-10-13T00:00:00Z"), id: "grammar:q2" }, { ...pool("x", "2026-10-10T00:00:00Z"), id: "grammar:q3" }],
      mistakes: [
        { id: "m1", track: "grammar", questionId: "q", focus: F, addedAt: "a", lastWrongAt: "a", updatedAt: "a", resolvedAt: "2026-06-01T00:00:00Z" },
        { id: "m2", track: "grammar", questionId: "q", focus: F, addedAt: "a", lastWrongAt: "a", updatedAt: "a", resolvedAt: "2026-09-20T00:00:00Z" },
      ],
    });
    const p = pruneLearner(s, now);
    expect(p.events.map((e) => e.id)).toEqual(["new"]);
    expect(p.pool.map((x) => x.id)).toEqual(["grammar:q2", "grammar:q3"]);
    expect(p.mistakes.map((x) => x.id)).toEqual(["m2"]);
  });

  it("normalize drops junk and tolerates garbage", () => {
    expect(normalizeLearnerShard(null)).toEqual(emptyLearnerShard());
    const n = normalizeLearnerShard({ events: [ev("a"), { id: "bad" }, 3], pool: [{ id: 1 }], mistakes: "x", filters: [{ id: "grammar", value: { a: 1 } }, { id: "nope" }] });
    expect(n.events).toHaveLength(1);
    expect(n.pool).toEqual([]);
    expect(n.filters).toEqual([{ id: "grammar", value: { a: 1 }, updatedAt: "" }]);
  });
});

describe("learnerMerge: scenario questions (第十七波 S)", () => {
  const q = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    track: "poly" as const,
    scenario: { id: "sc1", scene: "x", seq: 1 },
    kind: "which-sense" as const,
    text: "A [[get]] B",
    options: [{ id: "a", text: "甲" }, { id: "b", text: "乙" }],
    answerId: "a",
    explanation: "e",
    focus: { kind: "sense" as const, id: "get.arrive" },
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
    ...extra,
  });

  it("an old learner.json without questions reads as an empty list", () => {
    const n = normalizeLearnerShard({ events: [ev("a")], pool: [], mistakes: [], filters: [], meta: {} });
    expect(n.questions).toEqual([]);
    expect(n.events).toHaveLength(1);
  });

  it("normalize keeps good questions and drops broken ones", () => {
    const n = normalizeLearnerShard({
      questions: [q("ok", { optionNotes: { b: "n", c: 3 }, retiredAt: "2026-10-13T00:00:00Z" }), q("noAnswer", { answerId: "zz" }), q("badTrack", { track: "grammar" }), q("badKind", { kind: "blank" }), { id: "x" }, 5],
    });
    expect(n.questions.map((x) => x.id)).toEqual(["ok"]);
    expect(n.questions[0].optionNotes).toEqual({ b: "n" });
    expect(n.questions[0].retiredAt).toBeDefined();
  });

  it("merge: newer updatedAt wins, others are unioned", () => {
    const a = shard({ questions: [q("1", { explanation: "old" }), q("2")] });
    const b = shard({ questions: [q("1", { explanation: "new", updatedAt: "2026-10-13T00:00:00Z" }), q("3")] });
    const m = mergeLearner(a, b);
    expect(m.questions.map((x) => x.id).sort()).toEqual(["1", "2", "3"]);
    expect(m.questions.find((x) => x.id === "1")!.explanation).toBe("new");
    expect(mergeLearner(b, a).questions.find((x) => x.id === "1")!.explanation).toBe("new");
  });

  it("fingerprint changes when a question changes", () => {
    const a = shard({ questions: [q("1")] });
    expect(learnerFingerprint(a)).not.toBe(learnerFingerprint(shard({ questions: [q("1", { updatedAt: "2026-10-13T00:00:00Z" })] })));
  });

  it("prune: old questions go unless a live pool item or open mistake points at them", () => {
    const now = Date.parse("2026-10-13T00:00:00Z");
    const old = "2026-08-01T00:00:00Z";
    const s = shard({
      questions: [
        q("fresh", { createdAt: "2026-10-01T00:00:00Z" }),
        q("old", { createdAt: old }),
        q("oldPooled", { createdAt: old }),
        q("oldRemoved", { createdAt: old }),
        q("oldMistake", { createdAt: old }),
        q("oldResolved", { createdAt: old }),
      ],
      pool: [
        { ...pool("2026-10-13T00:00:00Z"), id: "poly:oldPooled", track: "poly", questionId: "oldPooled" },
        { ...pool("2026-10-13T00:00:00Z", "2026-10-12T00:00:00Z"), id: "poly:oldRemoved", track: "poly", questionId: "oldRemoved" },
      ],
      mistakes: [
        { id: "poly:oldMistake", track: "poly", questionId: "oldMistake", focus: F, addedAt: "a", lastWrongAt: "a", updatedAt: "a" },
        { id: "poly:oldResolved", track: "poly", questionId: "oldResolved", focus: F, addedAt: "a", lastWrongAt: "a", updatedAt: "a", resolvedAt: "2026-10-12T00:00:00Z" },
      ],
    });
    expect(pruneLearner(s, now).questions.map((x) => x.id).sort()).toEqual(["fresh", "oldMistake", "oldPooled"]);
  });
});

describe("reading log merge / prune", () => {
  const vis = (id: string, day: string, kinds: ("word" | "add")[], updatedAt = "2026-10-16T00:00:00Z") => ({
    id, day, at: "2026-10-16T00:00:00Z", updatedAt, path: "a.md", title: "T", kinds,
  });
  it("unions reading and diaryPicks, fingerprint sees them", () => {
    const a = shard({ reading: [vis("1", "2026-10-16", ["word"])], diaryPicks: [{ id: "quote|x", kind: "quote", key: "x", day: "2026-10-16", at: "2026-10-16T00:00:00Z" }] });
    const b = shard({ reading: [vis("1", "2026-10-16", ["add"], "2026-10-16T05:00:00Z"), vis("2", "2026-10-15", ["word"])] });
    const m = mergeLearner(a, b);
    expect(m.reading).toHaveLength(2);
    expect(m.reading!.find((r) => r.id === "1")!.kinds).toEqual(["word", "add"]);
    expect(m.diaryPicks).toHaveLength(1);
    expect(learnerFingerprint(m)).not.toBe(learnerFingerprint(b));
  });
  it("prunes reading older than 90 days but keeps diaryPicks", () => {
    const now = new Date(2026, 9, 16, 12).getTime();
    const s = shard({
      reading: [vis("old", "2026-07-17", ["word"]), vis("edge", "2026-07-18", ["word"])],
      diaryPicks: [{ id: "place|p", kind: "place", key: "p", day: "2025-01-01", at: "2025-01-01T00:00:00Z" }],
    });
    const p = pruneLearner(s, now);
    expect(p.reading!.map((r) => r.id)).toEqual(["edge"]);
    expect(p.diaryPicks).toHaveLength(1);
  });
  it("normalize keeps valid rows only", () => {
    const n = normalizeLearnerShard({ reading: [vis("1", "2026-10-16", ["word"]), { id: "bad" }], diaryPicks: [{ id: "bad" }] });
    expect(n.reading).toHaveLength(1);
    expect(n.diaryPicks).toEqual([]);
  });
});

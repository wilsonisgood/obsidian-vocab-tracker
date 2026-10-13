import { describe, expect, it } from "vitest";
import type { LearnerShard } from "../../../src/core/model/learner";
import { emptyLearnerShard, mergeLearner, normalizeLearnerShard, pruneLearner } from "../../../src/services/learner/learnerMerge";

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

import { describe, expect, it } from "vitest";
import type { PoolItem } from "../../../src/core/model/learner";
import { POOL_SIZE, REFILL_AT, addToPool, livePool, needsRefill, poolRoom, removeFromPool } from "../../../src/core/practice/pool";

const NOW = new Date("2026-10-13T08:00:00Z");
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ questionId: `q${from + i}` }));

describe("pool", () => {
  it("adds up to the room, in order, with growing seq", () => {
    const added = addToPool([], "grammar", ids(15), NOW);
    expect(added).toHaveLength(POOL_SIZE);
    expect(added[0]).toMatchObject({ id: "grammar:q0", seq: 1, track: "grammar" });
    expect(added[9].seq).toBe(10);
  });

  it("skips questions already in the pool, removed ones included", () => {
    const first = addToPool([], "grammar", ids(3), NOW);
    const items = [first[0], removeFromPool(first[1], "answered", NOW), first[2]];
    const more = addToPool(items, "grammar", [{ questionId: "q0" }, { questionId: "q1" }, { questionId: "q9", scenarioId: "s" }], NOW);
    expect(more.map((m) => m.questionId)).toEqual(["q9"]);
    expect(more[0]).toMatchObject({ seq: 4, scenarioId: "s" });
  });

  it("counts room and refill per track", () => {
    const g = addToPool([], "grammar", ids(10), NOW);
    expect(poolRoom(g, "grammar")).toBe(0);
    expect(poolRoom(g, "poly")).toBe(POOL_SIZE);
    expect(needsRefill(g, "grammar")).toBe(false);
    const left: PoolItem[] = g.map((x, i) => (i < 10 - REFILL_AT - 1 ? removeFromPool(x, "skipped", NOW) : x));
    expect(livePool(left, "grammar")).toHaveLength(REFILL_AT + 1);
    expect(needsRefill(left, "grammar")).toBe(false);
    const left2 = left.map((x, i) => (i === 5 ? removeFromPool(x, "filtered", NOW) : x));
    expect(needsRefill(left2, "grammar")).toBe(true);
    expect(needsRefill([], "poly")).toBe(true);
  });

  it("removal is a tombstone with reason and bumped updatedAt", () => {
    const [a] = addToPool([], "vocab", ids(1), new Date("2026-10-01T00:00:00Z"));
    const r = removeFromPool(a, "retired", NOW);
    expect(r).toMatchObject({ removeReason: "retired", removedAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect(livePool([r], "vocab")).toEqual([]);
  });

  it("livePool sorts by seq", () => {
    const g = addToPool([], "mix", ids(3), NOW);
    expect(livePool([g[2], g[0], g[1]], "mix").map((x) => x.seq)).toEqual([1, 2, 3]);
  });
});

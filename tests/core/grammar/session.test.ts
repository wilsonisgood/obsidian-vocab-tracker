import { describe, expect, it } from "vitest";
import { buildSession, spreadObjectives } from "../../../src/core/grammar/session";
import type { GrammarAttempt, GrammarQuestion } from "../../../src/core/model/grammar";

let n = 0;
function q(id: string, objectiveId = "a", extra: Partial<GrammarQuestion> = {}): GrammarQuestion {
  return { id, topicId: "t", objectiveId, type: "choice", stem: id, options: ["x", "y", "z"], answer: "x", explanation: "e", errorTag: "article", createdAt: `2026-10-01T00:00:${String(n++ % 60).padStart(2, "0")}Z`, ...extra };
}
function att(questionId: string, correct: boolean, at: string, extra: Partial<GrammarAttempt> = {}): GrammarAttempt {
  return { id: `${questionId}-${at}`, questionId, topicId: "t", objectiveId: "a", at, correct, given: "x", ...extra };
}
const ids = (qs: GrammarQuestion[]) => qs.map((x) => x.id);

describe("buildSession — learn", () => {
  it("asks never-seen questions first, then recent misses, then the stalest", () => {
    n = 0;
    const pool = [q("old-ok", "a"), q("missed", "b"), q("fresh1", "c"), q("recent-ok", "d"), q("fresh2", "e")];
    const attempts = [
      att("old-ok", true, "2026-10-05T08:00:00Z"),
      att("missed", false, "2026-10-09T08:00:00Z"),
      att("recent-ok", true, "2026-10-12T08:00:00Z"),
    ];
    expect(ids(buildSession(pool, attempts, { mode: "learn" }))).toEqual(["fresh1", "fresh2", "missed", "old-ok", "recent-ok"]);
  });

  it("uses the latest attempt of a question", () => {
    n = 0;
    const pool = [q("q1", "a"), q("q2", "b")];
    const attempts = [att("q1", false, "2026-10-01T00:00:00Z"), att("q1", true, "2026-10-02T00:00:00Z"), att("q2", true, "2026-10-01T00:00:00Z"), att("q2", false, "2026-10-03T00:00:00Z")];
    // q2's latest is a miss -> before q1 (right now, older)
    expect(ids(buildSession(pool, attempts, { mode: "learn" }))).toEqual(["q2", "q1"]);
  });

  it("returns fewer than size when the pool is short, and honours size", () => {
    n = 0;
    const pool = Array.from({ length: 12 }, (_, i) => q(`q${i}`, `o${i % 4}`));
    expect(buildSession(pool, [], { mode: "learn" })).toHaveLength(8);
    expect(buildSession(pool, [], { mode: "learn", size: 5 })).toHaveLength(5);
    expect(buildSession(pool.slice(0, 3), [], { mode: "learn" })).toHaveLength(3);
    expect(buildSession([], [], { mode: "learn" })).toEqual([]);
  });

  it("never asks retired, deleted or open-ended questions", () => {
    n = 0;
    const pool = [q("ok"), q("gone", "a", { retiredAt: "2026-10-02T00:00:00Z" }), q("del", "a", { deletedAt: "2026-10-02T00:00:00Z" }), q("open", "a", { type: "rewrite" })];
    expect(ids(buildSession(pool, [], { mode: "learn" }))).toEqual(["ok"]);
  });

  it("can stick to one objective", () => {
    n = 0;
    const pool = [q("q1", "a"), q("q2", "b"), q("q3", "b")];
    expect(ids(buildSession(pool, [], { mode: "learn", objectiveId: "b" }))).toEqual(["q2", "q3"]);
  });

  it("doesn't put the same objective three times in a row", () => {
    n = 0;
    const pool = [q("a1", "a"), q("a2", "a"), q("a3", "a"), q("a4", "a"), q("b1", "b"), q("b2", "b")];
    const out = buildSession(pool, [], { mode: "learn", size: 6 });
    expect(ids(out)).toEqual(["a1", "a2", "b1", "a3", "a4", "b2"]);
    const run = out.some((x, i) => i >= 2 && x.objectiveId === out[i - 1].objectiveId && x.objectiveId === out[i - 2].objectiveId);
    expect(run).toBe(false);
  });

  it("a single-objective pool can't be spread, but still fills the round", () => {
    n = 0;
    const pool = Array.from({ length: 5 }, (_, i) => q(`q${i}`, "a"));
    expect(buildSession(pool, [], { mode: "learn", size: 4 })).toHaveLength(4);
  });
});

describe("spreadObjectives", () => {
  it("keeps priority order when there's nothing to fix", () => {
    n = 0;
    const list = [q("1", "a"), q("2", "b"), q("3", "a")];
    expect(ids(spreadObjectives(list, 3))).toEqual(["1", "2", "3"]);
  });
});

describe("buildSession — mistakes", () => {
  it("is the questions whose latest answer was wrong, biggest error-tag group first", () => {
    n = 0;
    const pool = [
      q("art1", "a", { errorTag: "article" }),
      q("prep1", "b", { errorTag: "preposition" }),
      q("prep2", "c", { errorTag: "preposition" }),
      q("fixed", "d", { errorTag: "article" }),
      q("never", "e", { errorTag: "article" }),
    ];
    const attempts = [
      att("art1", false, "2026-10-10T00:00:00Z"),
      att("prep1", false, "2026-10-09T00:00:00Z"),
      att("prep2", false, "2026-10-11T00:00:00Z"),
      att("fixed", false, "2026-10-08T00:00:00Z"),
      att("fixed", true, "2026-10-12T00:00:00Z"),
    ];
    expect(ids(buildSession(pool, attempts, { mode: "mistakes" }))).toEqual(["prep2", "prep1", "art1"]);
  });

  it("can be limited to one error tag", () => {
    n = 0;
    const pool = [q("a", "a", { errorTag: "article" }), q("p", "b", { errorTag: "preposition" })];
    const attempts = [att("a", false, "2026-10-10T00:00:00Z"), att("p", false, "2026-10-10T00:00:00Z")];
    expect(ids(buildSession(pool, attempts, { mode: "mistakes", errorTag: "article" }))).toEqual(["a"]);
    expect(buildSession(pool, attempts, { mode: "mistakes", errorTag: "voice" })).toEqual([]);
  });

  it("skips retired questions and is empty without mistakes", () => {
    n = 0;
    const pool = [q("a", "a", { retiredAt: "2026-10-11T00:00:00Z" })];
    expect(buildSession(pool, [att("a", false, "2026-10-10T00:00:00Z")], { mode: "mistakes" })).toEqual([]);
    expect(buildSession([q("b")], [], { mode: "mistakes" })).toEqual([]);
  });
});

describe("buildSession — cross-topic mistakes", () => {
  it("takes a pool that spans topics and filters by tag only", () => {
    n = 0;
    const pool = [
      q("a1", "o1", { topicId: "t1", errorTag: "article" }),
      q("b1", "o2", { topicId: "t2", errorTag: "article" }),
      q("c1", "o3", { topicId: "t2", errorTag: "voice" }),
    ];
    const attempts = [
      att("a1", false, "2026-10-10T00:00:00Z", { topicId: "t1" }),
      att("b1", false, "2026-10-11T00:00:00Z", { topicId: "t2" }),
      att("c1", false, "2026-10-12T00:00:00Z", { topicId: "t2" }),
    ];
    expect(ids(buildSession(pool, attempts, { mode: "mistakes", errorTag: "article" }))).toEqual(["b1", "a1"]);
  });
});

describe("buildSession — review", () => {
  it("puts last-time misses first, then the stalest answered, then never-asked", () => {
    n = 0;
    const pool = [q("fresh", "a"), q("old-ok", "b"), q("recent-ok", "c"), q("missed", "d"), q("older-miss", "e")];
    const attempts = [
      att("old-ok", true, "2026-09-01T00:00:00Z"),
      att("recent-ok", true, "2026-10-10T00:00:00Z"),
      att("missed", false, "2026-10-05T00:00:00Z"),
      att("older-miss", false, "2026-09-20T00:00:00Z"),
    ];
    expect(ids(buildSession(pool, attempts, { mode: "review" }))).toEqual(["older-miss", "missed", "old-ok", "recent-ok", "fresh"]);
  });

  it("uses the latest attempt, defaults to 6 and honours size", () => {
    n = 0;
    const pool = Array.from({ length: 10 }, (_, i) => q(`q${i}`, `o${i % 5}`));
    expect(buildSession(pool, [], { mode: "review" })).toHaveLength(6);
    expect(buildSession(pool, [], { mode: "review", size: 3 })).toHaveLength(3);
    const attempts = [att("q0", false, "2026-10-01T00:00:00Z"), att("q0", true, "2026-10-02T00:00:00Z"), att("q1", true, "2026-10-01T00:00:00Z"), att("q1", false, "2026-10-03T00:00:00Z")];
    // q1's latest is a miss (first); q0's latest is a pass, answered after the miss
    expect(ids(buildSession(pool, attempts, { mode: "review", size: 3 }))).toEqual(["q1", "q0", "q2"]);
  });

  it("skips retired questions and is empty for an empty bank", () => {
    n = 0;
    expect(ids(buildSession([q("a", "x", { retiredAt: "2026-10-01T00:00:00Z" }), q("b", "x")], [], { mode: "review" }))).toEqual(["b"]);
    expect(buildSession([], [], { mode: "review" })).toEqual([]);
  });
});

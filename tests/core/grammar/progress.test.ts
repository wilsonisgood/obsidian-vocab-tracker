import { describe, expect, it } from "vitest";
import {
  dueTopics,
  knownTopicIds,
  mistakeGroups,
  objectiveStats,
  recommendNext,
  startDifficulty,
  topicStatus,
  topicStatuses,
} from "../../../src/core/grammar/progress";
import type { GrammarAttempt, GrammarProgress, GrammarQuestion, GrammarTopic, GrammarTopicStatus } from "../../../src/core/model/grammar";
import type { SrsCard } from "../../../src/core/model/srs";

const NOW = new Date("2026-10-13T12:00:00Z");

function topic(id: string, extra: Partial<GrammarTopic> = {}): GrammarTopic {
  return {
    id,
    stage: 1,
    order: 10,
    difficulty: 1,
    title: id,
    pattern: id,
    summary: id,
    objectives: [{ id: "a", text: "a" }, { id: "b", text: "b" }],
    prerequisites: [],
    related: [],
    ...extra,
  };
}

let n = 0;
function att(topicId: string, objectiveId: string, correct: boolean, min = ++n, questionId = `q${min}`): GrammarAttempt {
  return {
    id: `at${++n}`,
    questionId,
    topicId,
    objectiveId,
    at: new Date(Date.UTC(2026, 9, 1, 0, min)).toISOString(),
    correct,
    given: "x",
  };
}

function many(topicId: string, objectiveId: string, results: boolean[], start = 0): GrammarAttempt[] {
  return results.map((c, i) => att(topicId, objectiveId, c, start + i));
}

function srs(due: string): SrsCard {
  return { due, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2 };
}

describe("startDifficulty", () => {
  it("maps CEFR to a starting difficulty", () => {
    expect(["A1", "A2", "B1", "B2", "C1", "C2", ""].map((l) => startDifficulty(l as never))).toEqual([1, 1, 4, 5, 7, 8, 1]);
  });
});

describe("objectiveStats", () => {
  it("counts answers and looks at the latest 5", () => {
    const t = topic("t");
    const attempts = [
      ...many("t", "a", [false, false, true, true, true, true, false], 0), // 7 answers, last 5: t t t t f -> 4
      att("t", "b", true, 100),
      att("other", "a", true, 101),
    ];
    const [a, b] = objectiveStats(t, attempts);
    expect(a).toEqual({ objectiveId: "a", answered: 7, correct: 4, recentCorrect: 4, recentCount: 5 });
    expect(b).toEqual({ objectiveId: "b", answered: 1, correct: 1, recentCorrect: 1, recentCount: 1 });
  });

  it("orders by time, not array order", () => {
    const t = topic("t");
    const late = att("t", "a", false, 50);
    const early = many("t", "a", [true, true, true, true, true], 0);
    expect(objectiveStats(t, [late, ...early])[0].recentCorrect).toBe(4);
  });
});

describe("topicStatus", () => {
  const t = topic("t");
  const mastered = [...many("t", "a", [true, true, true, true]), ...many("t", "b", [true, true, true, true], 10)];

  it("is new without attempts", () => {
    expect(topicStatus(t, [att("other", "a", true)], undefined, NOW)).toBe("new");
  });
  it("is learning until every objective is solid", () => {
    expect(topicStatus(t, many("t", "a", [true, false]), undefined, NOW)).toBe("learning");
    expect(topicStatus(t, many("t", "a", [true, true, true, true]), undefined, NOW)).toBe("learning");
  });
  it("is mastered at 4 of the last 5 and 3+ answers per objective", () => {
    expect(topicStatus(t, mastered, undefined, NOW)).toBe("mastered");
    const slipped = [...mastered, ...many("t", "a", [false, false], 30)];
    expect(topicStatus(t, slipped, undefined, NOW)).toBe("learning");
  });
  it("lets due win once srs.due has passed", () => {
    const due: GrammarProgress = { id: "t", srs: srs("2026-10-13T11:59:00Z") };
    const later: GrammarProgress = { id: "t", srs: srs("2026-10-14T00:00:00Z") };
    expect(topicStatus(t, mastered, due, NOW)).toBe("due");
    expect(topicStatus(t, mastered, later, NOW)).toBe("mastered");
    expect(topicStatus(t, [], { id: "t" }, NOW)).toBe("new");
  });
  it("computes a whole list", () => {
    const m = topicStatuses([t, topic("u")], mastered, () => undefined, NOW);
    expect([...m.entries()]).toEqual([["t", "mastered"], ["u", "new"]]);
  });
});

describe("recommendNext", () => {
  const topics = [
    topic("a", { order: 10 }),
    topic("b", { order: 20, prerequisites: ["a"] }),
    topic("c", { order: 30, prerequisites: ["b"] }),
    topic("m", { stage: 2, difficulty: 4, order: 10, prerequisites: ["c"] }),
    topic("n", { stage: 2, difficulty: 5, order: 20 }),
  ];
  const status = (map: Record<string, GrammarTopicStatus>) => (id: string) => map[id] ?? "new";

  it("starts at the first topic", () => {
    expect(recommendNext(topics, status({}), "")?.id).toBe("a");
  });
  it("skips mastered and respects prerequisites", () => {
    expect(recommendNext(topics, status({ a: "mastered" }), "")?.id).toBe("b");
    // b is blocked behind an untouched prerequisite, so c (no learning prereq) is also blocked.
    expect(recommendNext(topics, status({ a: "new", b: "new" }), "")?.id).toBe("a");
    expect(recommendNext(topics, status({ a: "learning" }), "")?.id).toBe("a");
  });
  it("starts at the level's difficulty and treats lower prerequisites as known", () => {
    expect(recommendNext(topics, status({}), "B1")?.id).toBe("m");
    expect(recommendNext(topics, status({}), "B2")?.id).toBe("n");
  });
  it("falls back to a learning topic, then undefined", () => {
    const all = status({ a: "mastered", b: "mastered", c: "mastered", m: "mastered", n: "mastered" });
    expect(recommendNext(topics, all, "")).toBeUndefined();
    // Everything at/above the start is mastered except a learning one below it.
    const s = status({ a: "learning", m: "mastered", n: "mastered", b: "mastered", c: "mastered" });
    expect(recommendNext(topics, s, "B1")?.id).toBe("a");
  });
  it("recommends a due topic like any non-mastered one", () => {
    expect(recommendNext(topics, status({ a: "due" }), "")?.id).toBe("a");
  });
});

describe("dueTopics", () => {
  it("lists due topics, earliest first", () => {
    const topics = [topic("a"), topic("b"), topic("c"), topic("d")];
    const progress: Record<string, GrammarProgress> = {
      a: { id: "a", srs: srs("2026-10-12T00:00:00Z") },
      b: { id: "b", srs: srs("2026-10-10T00:00:00Z") },
      c: { id: "c", srs: srs("2026-10-20T00:00:00Z") },
      d: { id: "d" },
    };
    expect(dueTopics(topics, (id) => progress[id], NOW).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("mistakeGroups", () => {
  const q = (id: string, errorTag: GrammarQuestion["errorTag"], extra: Partial<GrammarQuestion> = {}): GrammarQuestion => ({
    id,
    topicId: "t",
    objectiveId: "a",
    type: "choice",
    stem: id,
    answer: "x",
    explanation: "",
    errorTag,
    ...extra,
  });

  it("keeps questions whose latest attempt was wrong, grouped by tag, newest first", () => {
    const questions = [
      q("q1", "article"),
      q("q2", "article"),
      q("q3", "preposition"),
      q("q4", "article"), // fixed later
      q("q5", "article", { retiredAt: "2026-10-01T00:00:00Z" }),
      q("q6", "article"), // never answered
    ];
    const attempts = [
      att("t", "a", false, 1, "q1"),
      att("t", "a", false, 5, "q2"),
      att("t", "a", false, 2, "q3"),
      att("t", "a", false, 3, "q4"),
      att("t", "a", true, 4, "q4"),
      att("t", "a", false, 6, "q5"),
    ];
    const groups = mistakeGroups(questions, attempts);
    expect(groups.map((g) => [g.errorTag, g.items.map((i) => i.question.id)])).toEqual([
      ["article", ["q2", "q1"]],
      ["preposition", ["q3"]],
    ]);
  });

  it("only counts the latest attempt even when an older wrong one comes later in the array", () => {
    const questions = [q("q1", "tense-choice")];
    const attempts = [att("t", "a", true, 9, "q1"), att("t", "a", false, 3, "q1")];
    expect(mistakeGroups(questions, attempts)).toEqual([]);
  });
});

describe("knownTopicIds", () => {
  it("returns every topic that is not new", () => {
    const topics = [topic("a"), topic("b"), topic("c"), topic("d")];
    const s: Record<string, GrammarTopicStatus> = { a: "mastered", b: "learning", c: "new", d: "due" };
    expect(knownTopicIds(topics, (id) => s[id])).toEqual(["a", "b", "d"]);
  });
});

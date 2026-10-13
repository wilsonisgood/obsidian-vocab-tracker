import { describe, expect, it } from "vitest";
import type { GrammarAttempt, GrammarQuestion } from "../../../src/core/model/grammar";
import { migrateGrammar } from "../../../src/core/learner/migrateGrammar";

const NOW = new Date("2026-10-13T08:00:00Z");
function q(id: string, extra: Partial<GrammarQuestion> = {}): GrammarQuestion {
  return { id, topicId: "t1", objectiveId: "a", type: "choice", stem: id, answer: "x", explanation: "", errorTag: "article", createdAt: "2026-09-01T00:00:00Z", ...extra };
}
function at(id: string, questionId: string, when: string, correct: boolean): GrammarAttempt {
  return { id, questionId, topicId: "t1", objectiveId: "a", at: when, correct, given: correct ? "x" : "y" };
}

describe("migrateGrammar", () => {
  it("turns attempts into events with deterministic ids", () => {
    const m = migrateGrammar([q("q1")], [at("a1", "q1", "2026-10-01T00:00:00Z", false), at("a2", "q1", "2026-10-02T00:00:00Z", true)], NOW);
    expect(m.events).toEqual([
      { id: "g:a1", at: "2026-10-01T00:00:00Z", track: "grammar", focus: { kind: "grammar-objective", id: "t1/a" }, result: "wrong", given: "y", questionId: "q1", errorTag: "article" },
      { id: "g:a2", at: "2026-10-02T00:00:00Z", track: "grammar", focus: { kind: "grammar-objective", id: "t1/a" }, result: "correct", given: "x", questionId: "q1" },
    ]);
  });

  it("mistakes: only when the latest attempt is wrong and the question is alive", () => {
    const qs = [q("q1"), q("q2"), q("q3", { retiredAt: "2026-10-01T00:00:00Z" }), q("q4", { deletedAt: "2026-10-01T00:00:00Z" })];
    const as = [
      at("a1", "q1", "2026-10-01T00:00:00Z", false),
      at("a2", "q1", "2026-10-03T00:00:00Z", false),
      at("a3", "q1", "2026-10-02T00:00:00Z", true),
      at("b1", "q2", "2026-10-01T00:00:00Z", false),
      at("b2", "q2", "2026-10-02T00:00:00Z", true),
      at("c1", "q3", "2026-10-01T00:00:00Z", false),
      at("d1", "q4", "2026-10-01T00:00:00Z", false),
    ];
    const m = migrateGrammar(qs, as, NOW);
    expect(m.mistakes).toHaveLength(1);
    expect(m.mistakes[0]).toMatchObject({ id: "grammar:q1", addedAt: "2026-10-01T00:00:00Z", lastWrongAt: "2026-10-03T00:00:00Z" });
    expect(m.events).toHaveLength(7);
  });

  it("pool: the 10 oldest never-answered live questions", () => {
    const qs = Array.from({ length: 13 }, (_, i) => q(`n${i}`, { createdAt: `2026-09-${String(20 - i).padStart(2, "0")}T00:00:00Z` }));
    qs.push(q("answered"), q("old", { retiredAt: "x" }));
    const m = migrateGrammar(qs, [at("a", "answered", "2026-10-01T00:00:00Z", true)], NOW);
    expect(m.pool).toHaveLength(10);
    expect(m.pool[0].questionId).toBe("n12");
    expect(m.pool.map((p) => p.questionId)).not.toContain("answered");
    expect(m.pool.map((p) => p.questionId)).not.toContain("old");
    expect(m.pool[0].scenarioId).toBeUndefined();
  });
});

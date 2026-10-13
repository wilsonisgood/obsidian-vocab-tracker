import { describe, expect, it } from "vitest";
import type { GrammarAttempt, GrammarProgress, GrammarQuestion, GrammarShard } from "../../../src/core/model/grammar";
import { emptyGrammarShard, grammarFingerprint, mergeGrammar, normalizeGrammarShard, pruneGrammar } from "../../../src/services/grammar/grammarMerge";

function q(id: string, extra: Partial<GrammarQuestion> = {}): GrammarQuestion {
  return { id, topicId: "t", objectiveId: "a", type: "choice", stem: id, answer: "x", explanation: "", errorTag: "article", ...extra };
}
function at(id: string, when: string, correct = true): GrammarAttempt {
  return { id, questionId: "q1", topicId: "t", objectiveId: "a", at: when, correct, given: "x" };
}
const shard = (p: Partial<GrammarShard>): GrammarShard => ({ ...emptyGrammarShard(), ...p });

describe("mergeGrammar", () => {
  it("unions two devices", () => {
    const a = shard({ questions: [q("q1", { updatedAt: "2026-10-01T00:00:00Z" })], attempts: [at("a1", "2026-10-01T00:00:00Z")], progress: [{ id: "t" }] });
    const b = shard({ questions: [q("q2")], attempts: [at("a2", "2026-10-02T00:00:00Z")], progress: [{ id: "u" }] });
    const m = mergeGrammar(a, b);
    expect(m.questions.map((x) => x.id)).toEqual(["q1", "q2"]);
    expect(m.attempts.map((x) => x.id)).toEqual(["a1", "a2"]);
    expect(m.progress.map((x) => x.id)).toEqual(["t", "u"]);
  });

  it("sorts attempts by time and de-duplicates by id", () => {
    const a = shard({ attempts: [at("a2", "2026-10-02T00:00:00Z"), at("a1", "2026-10-01T00:00:00Z")] });
    const b = shard({ attempts: [at("a1", "2026-10-01T00:00:00Z", false), at("a0", "2026-09-30T00:00:00Z")] });
    const m = mergeGrammar(a, b);
    expect(m.attempts.map((x) => x.id)).toEqual(["a0", "a1", "a2"]);
    expect(m.attempts[1].correct).toBe(true); // local copy stands
  });

  it("lets the newer question win, so a retire propagates", () => {
    const old = q("q1", { updatedAt: "2026-10-01T00:00:00Z", rev: 1 });
    const retired = q("q1", { updatedAt: "2026-10-02T00:00:00Z", rev: 2, retiredAt: "2026-10-02T00:00:00Z" });
    expect(mergeGrammar(shard({ questions: [old] }), shard({ questions: [retired] })).questions[0].retiredAt).toBeDefined();
    expect(mergeGrammar(shard({ questions: [retired] }), shard({ questions: [old] })).questions[0].retiredAt).toBeDefined();
  });

  it("lets the newer progress win", () => {
    const p1: GrammarProgress = { id: "t", updatedAt: "2026-10-01T00:00:00Z", lastPracticedAt: "a" };
    const p2: GrammarProgress = { id: "t", updatedAt: "2026-10-03T00:00:00Z", lastPracticedAt: "b" };
    expect(mergeGrammar(shard({ progress: [p2] }), shard({ progress: [p1] })).progress[0].lastPracticedAt).toBe("b");
  });

  it("fingerprints differ only when versions differ", () => {
    const a = shard({ questions: [q("q1", { updatedAt: "x", rev: 1 })] });
    expect(grammarFingerprint(a)).toBe(grammarFingerprint(structuredClone(a)));
    expect(grammarFingerprint(a)).not.toBe(grammarFingerprint(shard({})));
  });

  it("prunes old tombstones but never attempts", () => {
    const now = Date.parse("2026-12-01T00:00:00Z");
    const m = pruneGrammar(
      shard({
        questions: [q("old", { deletedAt: "2026-09-01T00:00:00Z" }), q("fresh", { deletedAt: "2026-11-30T00:00:00Z" }), q("live")],
        attempts: [at("a1", "2026-01-01T00:00:00Z")],
      }),
      now
    );
    expect(m.questions.map((x) => x.id)).toEqual(["fresh", "live"]);
    expect(m.attempts).toHaveLength(1);
  });
});

describe("normalizeGrammarShard", () => {
  it("survives null, non-objects and missing arrays", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { questions: "no", attempts: 3, progress: {} }]) {
      expect(normalizeGrammarShard(raw)).toEqual(emptyGrammarShard());
    }
  });

  it("drops unusable rows and repairs soft fields", () => {
    const s = normalizeGrammarShard({
      questions: [
        null,
        { id: "bad" },
        { id: "q0", topicId: "t", objectiveId: "a", type: "essay", stem: "s", answer: "a" },
        { id: "q1", topicId: "t", objectiveId: "a", type: "blank", stem: "s", answer: "a", errorTag: "made-up", options: ["a", 3], distractors: 5 },
      ],
      attempts: [
        { id: "a1", questionId: "q1", topicId: "t", objectiveId: "a", at: "2026-10-01T00:00:00Z", correct: "yes", given: 5 },
        { id: "a2", questionId: "q1", topicId: "t", objectiveId: "a", at: "garbage", correct: true, given: "" },
        "junk",
      ],
      progress: [{ id: "t", srs: "bad" }, { nope: 1 }],
    });
    expect(s.questions).toHaveLength(1);
    expect(s.questions[0]).toMatchObject({ id: "q1", errorTag: "other", explanation: "", options: ["a"] });
    expect(s.questions[0].distractors).toBeUndefined();
    expect(s.attempts).toEqual([{ id: "a1", questionId: "q1", topicId: "t", objectiveId: "a", at: "2026-10-01T00:00:00Z", correct: false, given: "" }]);
    expect(s.progress).toEqual([{ id: "t" }]);
  });
});

describe("normalizeGrammarShard — scenario fields (第十六波 G)", () => {
  const norm = (extra: Record<string, unknown>) =>
    normalizeGrammarShard({ questions: [{ ...q("q1"), ...extra }] }).questions[0];

  it("keeps a good scenario and sentenceZh", () => {
    const scenario = { id: "sc1", scene: "在咖啡店", seq: 2, speaker: "Amy", lead: [{ speaker: "Ben", text: "Hi." }, { text: "Hello." }] };
    expect(norm({ scenario, sentenceZh: " 我弄丟了。 " })).toMatchObject({ scenario, sentenceZh: "我弄丟了。" });
  });

  it("drops bad values instead of the question", () => {
    for (const scenario of [null, "x", { id: "s", scene: "a" }, { id: "s", scene: "a", seq: -1 }, { id: "", scene: "a", seq: 1 }, { id: "s", scene: "", seq: 1 }]) {
      const out = norm({ scenario, sentenceZh: 5 });
      expect(out).toBeDefined();
      expect("scenario" in out).toBe(false);
      expect("sentenceZh" in out).toBe(false);
    }
  });

  it("cleans a half-broken lead list", () => {
    const out = norm({ scenario: { id: "s", scene: "a", seq: 0, speaker: 3, lead: [{ text: "" }, "x", { speaker: "A", text: "ok" }] } });
    expect(out.scenario).toEqual({ id: "s", scene: "a", seq: 0, lead: [{ speaker: "A", text: "ok" }] });
  });
});

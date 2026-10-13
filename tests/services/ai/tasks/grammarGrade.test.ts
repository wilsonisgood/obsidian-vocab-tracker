import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import type { AiRequest, AiResult } from "../../../../src/services/ai/providers/types";
import {
  grammarGrade,
  GRAMMAR_GRADE_SCHEMA,
  MAX_FEEDBACK_CHARS,
  parseGrammarGrade,
  type GrammarGradeInput,
} from "../../../../src/services/ai/tasks/grammarGrade";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";

const B2: LearnerProfile = { level: "B2", goal: "general", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };
const ctx = (profile: LearnerProfile = defaultLearnerProfile()) => ({ profile, history: [] });

function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  const out = req.output ? [`output=${req.output.name}`] : [];
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...out, ...sys, ...msgs].join("\n\n");
}

function aiResult(extra: Partial<AiResult>): AiResult {
  return { text: "", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: "m", stop: "end", transport: "fetch", ...extra };
}

const INPUT: GrammarGradeInput = {
  question: {
    topicId: "negative-inversion",
    objectiveId: "trigger-words",
    type: "rewrite",
    stem: "用 Not until 開頭改寫：He didn't leave until she arrived.",
    answer: "Not until she arrived did he leave.",
    accepted: ["Not until she had arrived did he leave."],
  },
  given: "Not until she arrived he left.",
};

describe("grammar.grade request", () => {
  it("builds the full request (snapshot)", () => {
    expect(render(grammarGrade.build(INPUT, ctx(B2)))).toMatchSnapshot();
  });

  it("is a fast structured task on the grammar surface, registered", () => {
    const req = grammarGrade.build(INPUT, ctx());
    expect(grammarGrade).toMatchObject({ id: "grammar.grade", surface: "grammar", tier: "fast", maxTokens: 1024 });
    expect(req.output).toEqual({ name: "grammar_grade", schema: GRAMMAR_GRADE_SCHEMA });
    expect(req.tier).toBe("fast");
    expect(defaultTaskRegistry().get("grammar.grade")).toBe(grammarGrade);
  });

  it("sends the question and the learner's text only, and leaves out empty 'other answers'", () => {
    const text = render(grammarGrade.build({ ...INPUT, question: { ...INPUT.question, accepted: [] } }, ctx()));
    expect(text).toContain("Not until she arrived he left.");
    expect(text).not.toContain("其他正確寫法");
  });

  it("clips a very long answer", () => {
    const text = render(grammarGrade.build({ ...INPUT, given: "x".repeat(5000) }, ctx()));
    expect(text).toContain("x".repeat(1000));
    expect(text).not.toContain("x".repeat(1001));
  });

  it("still builds for a topic id it doesn't know", () => {
    const req = grammarGrade.build({ ...INPUT, question: { ...INPUT.question, topicId: "gone" } }, ctx());
    expect(req.system.some((b) => b.text.startsWith("〔文法主題〕"))).toBe(false);
  });
});

describe("parseGrammarGrade", () => {
  it("reads a verdict", () => {
    expect(parseGrammarGrade({ correct: false, feedback: "倒裝要把 did 放在主詞前。", corrected: "Not until she arrived did he leave." })).toEqual({
      correct: false,
      feedback: "倒裝要把 did 放在主詞前。",
      corrected: "Not until she arrived did he leave.",
    });
  });
  it("drops 'corrected' on a right answer or when empty", () => {
    expect(parseGrammarGrade({ correct: true, feedback: "對", corrected: "Something" })).toEqual({ correct: true, feedback: "對" });
    expect(parseGrammarGrade({ correct: false, feedback: "錯", corrected: "  " })).toEqual({ correct: false, feedback: "錯" });
  });
  it("clips an overlong feedback", () => {
    const out = parseGrammarGrade({ correct: true, feedback: "好".repeat(MAX_FEEDBACK_CHARS + 50), corrected: "" });
    expect(out.feedback).toHaveLength(MAX_FEEDBACK_CHARS);
    expect(out.feedback.endsWith("…")).toBe(true);
  });
  it("throws bad_output for anything unreadable", () => {
    for (const bad of [null, "text", [], {}, { correct: "yes", feedback: "x" }, { correct: true }, { correct: true, feedback: "  " }]) {
      expect(() => parseGrammarGrade(bad)).toThrowError(expect.objectContaining({ code: "bad_output" }));
    }
  });
  it("task.parse reads json, or JSON inside text", () => {
    expect(grammarGrade.parse!(aiResult({ json: { correct: true, feedback: "對", corrected: "" } }))).toEqual({ correct: true, feedback: "對" });
    expect(grammarGrade.parse!(aiResult({ text: '{"correct":false,"feedback":"錯","corrected":"Fix."}' }))).toEqual({
      correct: false,
      feedback: "錯",
      corrected: "Fix.",
    });
    expect(() => grammarGrade.parse!(aiResult({ text: "no json" }))).toThrowError(expect.objectContaining({ code: "bad_output" }));
  });
});

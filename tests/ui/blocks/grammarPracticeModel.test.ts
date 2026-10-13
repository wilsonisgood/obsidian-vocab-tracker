import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import type { GrammarQuestion } from "../../../src/core/model/grammar";
import {
  currentQuestion,
  feedbackFor,
  finishGrading,
  findErrorPieces,
  gradingFailed,
  keyAction,
  lastResult,
  needsMoreQuestions,
  nextQuestion,
  nextReviewText,
  parseGrammarPracticeParams,
  progressLabel,
  resolveMode,
  resolveSize,
  retireCurrent,
  scheduledResults,
  schedulesTopic,
  selfAssess,
  sourceName,
  startRound,
  stemPieces,
  submitAnswer,
  submitOpen,
  summarize,
} from "../../../src/ui/blocks/grammarPracticeModel";

function q(id: string, objectiveId = "a", extra: Partial<GrammarQuestion> = {}): GrammarQuestion {
  return { id, topicId: "t", objectiveId, type: "choice", stem: `${id} ___`, options: ["x", "y", "z"], answer: "x", explanation: "because", errorTag: "article", ...extra };
}

describe("parseGrammarPracticeParams", () => {
  it("leaves mode and size unset when the block doesn't write them", () => {
    expect(parseGrammarPracticeParams("")).toEqual({});
    expect(parseGrammarPracticeParams("topic: be-verb")).toEqual({ topic: "be-verb" });
  });
  it("reads review and learn explicitly", () => {
    expect(parseGrammarPracticeParams("mode: review")).toEqual({ mode: "review" });
    expect(parseGrammarPracticeParams("mode: 複習")).toEqual({ mode: "review" });
    expect(parseGrammarPracticeParams("mode: learn")).toEqual({ mode: "learn" });
  });
  it("reads topic, mode, tag and size", () => {
    expect(parseGrammarPracticeParams("topic: past-perfect\nmode: mistakes\ntag: article\nsize: 5")).toEqual({
      topic: "past-perfect",
      mode: "mistakes",
      tag: "article",
      size: 5,
    });
    expect(parseGrammarPracticeParams("mode: 錯題")).toMatchObject({ mode: "mistakes" });
    expect(parseGrammarPracticeParams('topic: "be-verb"')).toMatchObject({ topic: "be-verb" });
  });
  it("ignores nonsense and caps the size", () => {
    expect(parseGrammarPracticeParams("mode: whatever\ntag: tense-error\nsize: lots")).toEqual({});
    expect(parseGrammarPracticeParams("size: 0")).toEqual({});
    expect(parseGrammarPracticeParams("size: 500")).toMatchObject({ size: 20 });
    expect(parseGrammarPracticeParams("tag: ARTICLE")).toMatchObject({ tag: "article" });
  });
});

describe("round state machine", () => {
  it("answering → feedback → next → … → summary", () => {
    let s = startRound([q("1"), q("2")]);
    expect(s).toMatchObject({ phase: "answering", index: 0 });
    expect(currentQuestion(s)?.id).toBe("1");
    expect(progressLabel(s)).toEqual({ position: 1, total: 2 });
    expect(lastResult(s)).toBeUndefined();

    s = submitAnswer(s, "y", false);
    expect(s.phase).toBe("feedback");
    expect(lastResult(s)).toMatchObject({ given: "y", correct: false });
    expect(currentQuestion(s)?.id).toBe("1");

    s = nextQuestion(s);
    expect(s).toMatchObject({ phase: "answering", index: 1 });
    expect(progressLabel(s)).toEqual({ position: 2, total: 2 });

    s = nextQuestion(submitAnswer(s, "x", true));
    expect(s.phase).toBe("summary");
    expect(currentQuestion(s)).toBeUndefined();
    expect(progressLabel(s)).toEqual({ position: 2, total: 2 });
    expect(s.results.map((r) => r.correct)).toEqual([false, true]);
  });

  it("ignores out-of-phase events (a double click can't answer twice)", () => {
    const s0 = startRound([q("1"), q("2")]);
    expect(nextQuestion(s0)).toBe(s0); // not answered yet
    const s1 = submitAnswer(s0, "x", true);
    expect(submitAnswer(s1, "y", false)).toBe(s1);
    expect(s1.results).toHaveLength(1);
    const done = nextQuestion(nextQuestion(submitAnswer(nextQuestion(s1), "x", true)));
    expect(done.phase).toBe("summary");
    expect(submitAnswer(done, "x", true)).toBe(done);
    expect(nextQuestion(done)).toBe(done);
    expect(retireCurrent(done)).toBe(done);
  });

  it("an empty round is a summary at once", () => {
    const s = startRound([]);
    expect(s.phase).toBe("summary");
    expect(summarize(s)).toMatchObject({ answered: 0, correct: 0, wrong: 0 });
  });

  it("retire after the answer jumps ahead and leaves the question out of the summary", () => {
    let s = startRound([q("1"), q("2")]);
    s = submitAnswer(s, "y", false);
    s = retireCurrent(s);
    expect(s).toMatchObject({ phase: "answering", index: 1 });
    expect(s.results[0].retired).toBe(true);
    s = nextQuestion(submitAnswer(s, "x", true));
    expect(summarize(s)).toMatchObject({ answered: 1, correct: 1, wrong: 0, retired: 1 });
  });

  it("retire before answering skips with no result", () => {
    let s = startRound([q("1"), q("2")]);
    s = retireCurrent(s);
    expect(s).toMatchObject({ phase: "answering", index: 1 });
    expect(s.results).toEqual([]);
    s = retireCurrent(s);
    expect(s.phase).toBe("summary");
  });

  it("summarises per objective", () => {
    let s = startRound([q("1", "a"), q("2", "b"), q("3", "a")]);
    for (const ok of [true, false, false]) s = nextQuestion(submitAnswer(s, "x", ok));
    expect(summarize(s)).toEqual({
      answered: 3,
      correct: 1,
      wrong: 2,
      retired: 0,
      byObjective: [
        { objectiveId: "a", answered: 2, correct: 1 },
        { objectiveId: "b", answered: 1, correct: 0 },
      ],
    });
  });

  it("needsMoreQuestions when the bank can't fill a round", () => {
    expect(needsMoreQuestions(0, 8)).toBe(true);
    expect(needsMoreQuestions(7, 8)).toBe(true);
    expect(needsMoreQuestions(8, 8)).toBe(false);
  });
});

describe("stem pieces", () => {
  it("cuts a stem at its gap", () => {
    expect(stemPieces("I ___ my keys.")).toEqual([{ kind: "text", text: "I " }, { kind: "blank" }, { kind: "text", text: " my keys." }]);
    expect(stemPieces("___ is here")).toEqual([{ kind: "blank" }, { kind: "text", text: " is here" }]);
    expect(stemPieces("No gap")).toEqual([{ kind: "text", text: "No gap" }]);
  });

  it("marks find-error options where they sit in the sentence", () => {
    const stem = "We have visited Kyoto last year.";
    expect(findErrorPieces(stem, ["have visited", "Kyoto", "last year"])).toEqual([
      { kind: "text", text: "We " },
      { kind: "option", text: "have visited", index: 0 },
      { kind: "text", text: " " },
      { kind: "option", text: "Kyoto", index: 1 },
      { kind: "text", text: " " },
      { kind: "option", text: "last year", index: 2 },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps option numbers when they're out of order, and skips overlaps and strangers", () => {
    const pieces = findErrorPieces("She go to school every day", ["every day", "go", "go to", "Mars"]);
    expect(pieces.filter((p) => p.kind === "option").map((p) => (p as { index: number }).index)).toEqual([1, 0]);
    expect(pieces.map((p) => (p.kind === "blank" ? "" : p.text)).join("")).toBe("She go to school every day");
  });

  it("a repeated fragment takes its next free occurrence", () => {
    const pieces = findErrorPieces("the cat and the dog", ["the", "the"]);
    const opts = pieces.filter((p) => p.kind === "option");
    expect(opts).toHaveLength(2);
    expect(pieces.map((p) => (p.kind === "blank" ? "" : p.text)).join("")).toBe("the cat and the dog");
  });
});

describe("feedbackFor", () => {
  const choice = q("1", "a", { answer: "have lost", options: ["lost", "have lost", "had lost"], distractors: { lost: "沒連到現在" } });
  it("names the reason a wrong pick is wrong", () => {
    expect(feedbackFor(choice, "lost", false)).toMatchObject({ correct: false, answer: "have lost", explanation: "because", whyWrong: "沒連到現在" });
    expect(feedbackFor(choice, "had lost", false).whyWrong).toBeUndefined();
    expect(feedbackFor(choice, "have lost", true).whyWrong).toBeUndefined();
  });
  it("matches the distractor ignoring case and spacing (typed blanks)", () => {
    const b = q("2", "a", { type: "blank", answer: "has", distractors: { did: "no" } });
    expect(feedbackFor(b, " Did ", false).whyWrong).toBe("no");
  });
  it("find-error shows the corrected wording", () => {
    const f = q("3", "a", { type: "find-error", stem: "We have visited Kyoto last year.", options: ["have visited", "Kyoto", "last year"], answer: "have visited", accepted: ["visited"] });
    expect(feedbackFor(f, "Kyoto", false).corrected).toBe("visited");
    expect(feedbackFor(choice, "lost", false).corrected).toBeUndefined();
  });
});

describe("keyAction", () => {
  const base = { phase: "answering" as const, optionCount: 4, inInput: false, onButton: false };
  it("1–4 pick an option that exists", () => {
    expect(keyAction("1", base)).toEqual({ type: "choose", index: 0 });
    expect(keyAction("4", base)).toEqual({ type: "choose", index: 3 });
    expect(keyAction("4", { ...base, optionCount: 3 })).toBeNull();
    expect(keyAction("5", base)).toBeNull();
    expect(keyAction("a", base)).toBeNull();
    expect(keyAction("Enter", base)).toBeNull();
  });
  it("Enter goes on after the answer; digits do nothing then", () => {
    expect(keyAction("Enter", { ...base, phase: "feedback" })).toEqual({ type: "next" });
    expect(keyAction("1", { ...base, phase: "feedback" })).toBeNull();
  });
  it("the text box keeps its digits; Enter submits", () => {
    const typing = { ...base, optionCount: 0, inInput: true };
    expect(keyAction("1", typing)).toBeNull();
    expect(keyAction(" ", typing)).toBeNull();
    expect(keyAction("Enter", typing)).toEqual({ type: "submit" });
    expect(keyAction("Enter", { ...typing, phase: "feedback" })).toBeNull();
  });
  it("a focused button keeps Enter / Space for itself", () => {
    expect(keyAction("Enter", { ...base, phase: "feedback", onButton: true })).toBeNull();
    expect(keyAction(" ", { ...base, onButton: true })).toBeNull();
    expect(keyAction("2", { ...base, onButton: true })).toEqual({ type: "choose", index: 1 });
  });
  it("nothing in the summary", () => {
    expect(keyAction("Enter", { ...base, phase: "summary" })).toBeNull();
    expect(keyAction("1", { ...base, phase: "summary" })).toBeNull();
  });
});

describe("review mode and scheduling", () => {
  beforeEach(() => setLocale("zh-TW"));

  it("a due topic defaults to review, an explicit mode wins", () => {
    expect(resolveMode({ topic: "t" }, true)).toBe("review");
    expect(resolveMode({ topic: "t" }, false)).toBe("learn");
    expect(resolveMode({ topic: "t", mode: "learn" }, true)).toBe("learn");
    expect(resolveMode({ topic: "t", mode: "mistakes" }, true)).toBe("mistakes");
    expect(resolveMode({ mode: "review" }, false)).toBe("review");
    // no topic, nothing to be due
    expect(resolveMode({}, true)).toBe("learn");
  });

  it("review rounds default to 6, others to 8, and size: wins", () => {
    expect(resolveSize({}, "review")).toBe(6);
    expect(resolveSize({}, "learn")).toBe(8);
    expect(resolveSize({}, "mistakes")).toBe(8);
    expect(resolveSize({ size: 4 }, "review")).toBe(4);
  });

  const played = () => {
    let s = startRound([q("1"), q("2"), q("3")]);
    s = nextQuestion(submitAnswer(s, "x", true));
    s = nextQuestion(submitAnswer(s, "y", false));
    return retireCurrent(s);
  };

  it("schedules from the answers that stayed in the round", () => {
    const s = played();
    expect(s.phase).toBe("summary");
    expect(scheduledResults(s)).toEqual([{ correct: true }, { correct: false }]);
    expect(schedulesTopic("learn", s)).toBe(true);
    expect(schedulesTopic("review", s)).toBe(true);
    expect(schedulesTopic("mistakes", s)).toBe(false);
  });

  it("a round with nothing answered, or only 👎 answers, isn't scheduled", () => {
    expect(schedulesTopic("learn", startRound([]))).toBe(false);
    let s = startRound([q("1")]);
    s = retireCurrent(s);
    expect(schedulesTopic("learn", s)).toBe(false);
    s = startRound([q("1")]);
    s = retireCurrent(submitAnswer(s, "x", true));
    expect(scheduledResults(s)).toEqual([]);
    expect(schedulesTopic("learn", s)).toBe(false);
  });

  it("names the next review day like a word row does", () => {
    const now = new Date(2026, 9, 13, 9, 0);
    expect(nextReviewText(new Date(2026, 9, 13, 20, 0), now)).toBe("下次複習：今天");
    expect(nextReviewText(new Date(2026, 9, 20, 9, 0).toISOString(), now)).toBe("下次複習：10/20");
    expect(nextReviewText(new Date(2027, 0, 5, 9, 0), now)).toBe("下次複習：2027/01/05");
  });
});

describe("open questions (rewrite / translate, R2)", () => {
  const open = (id: string, extra: Partial<GrammarQuestion> = {}) =>
    q(id, "a", { type: "rewrite", stem: "改寫：He left.", options: undefined, answer: "He has left.", ...extra });
  const start = () => startRound([open("r1"), q("c2")]);

  it("submit with AI goes to grading, without AI to self-check, keeping the answer pending", () => {
    const ai = submitOpen(start(), "He has left.", true);
    expect(ai).toMatchObject({ phase: "grading", pending: "He has left.", index: 0, results: [] });
    const self = submitOpen(start(), "He has left.", false);
    expect(self).toMatchObject({ phase: "selfcheck", pending: "He has left." });
    expect(currentQuestion(ai)?.id).toBe("r1");
  });

  it("ignores an empty answer and a second submit", () => {
    const s = start();
    expect(submitOpen(s, "   ", true)).toBe(s);
    const sent = submitOpen(s, "x", true);
    expect(submitOpen(sent, "y", true)).toBe(sent);
  });

  it("the AI's verdict ends in feedback with the result recorded", () => {
    const s = finishGrading(submitOpen(start(), "He left already.", true), false, { feedback: "時態不對", corrected: "He has already left." });
    expect(s.phase).toBe("feedback");
    expect(s.pending).toBeUndefined();
    expect(lastResult(s)).toMatchObject({ given: "He left already.", correct: false, ai: { feedback: "時態不對", corrected: "He has already left." } });
    expect(lastResult(s)?.selfAssessed).toBeUndefined();
  });

  it("a late verdict is ignored once the learner is no longer grading", () => {
    const grading = submitOpen(start(), "x", true);
    const moved = retireCurrent(grading);
    expect(moved).toMatchObject({ phase: "answering", index: 1 });
    expect(moved.pending).toBeUndefined();
    expect(finishGrading(moved, true, { feedback: "ok" })).toBe(moved);
    expect(finishGrading(start(), true, { feedback: "ok" }).phase).toBe("answering");
  });

  it("a failed or stopped grading falls back to self-check, answer kept", () => {
    const s = gradingFailed(submitOpen(start(), "mine", true));
    expect(s).toMatchObject({ phase: "selfcheck", pending: "mine" });
    expect(gradingFailed(start()).phase).toBe("answering");
  });

  it("self-assessment records the mark and flags it", () => {
    for (const correct of [true, false]) {
      const s = selfAssess(submitOpen(start(), "mine", false), correct);
      expect(s.phase).toBe("feedback");
      expect(lastResult(s)).toMatchObject({ given: "mine", correct, selfAssessed: true });
      expect(lastResult(s)?.ai).toBeUndefined();
    }
    expect(selfAssess(submitOpen(start(), "mine", true), true).phase).toBe("grading");
  });

  it("goes on to the next question and the summary counts the result", () => {
    let s = selfAssess(submitOpen(start(), "mine", false), true);
    s = nextQuestion(s);
    expect(s).toMatchObject({ phase: "answering", index: 1 });
    expect(s.pending).toBeUndefined();
    s = nextQuestion(submitAnswer(s, "x", false));
    expect(s.phase).toBe("summary");
    expect(summarize(s)).toMatchObject({ answered: 2, correct: 1, wrong: 1 });
    expect(scheduledResults(s)).toEqual([{ correct: true }, { correct: false }]);
  });

  it("👎 while marking yourself moves on without a result", () => {
    const s = retireCurrent(submitOpen(start(), "mine", false));
    expect(s).toMatchObject({ phase: "answering", index: 1, results: [] });
  });

  it("feedbackFor shows the sample, the AI's words and the AI's correction (only when wrong)", () => {
    const r = open("r1");
    expect(feedbackFor(r, "x", false, { ai: { feedback: "缺 has", corrected: "He has left." } })).toMatchObject({
      answer: "He has left.",
      aiFeedback: "缺 has",
      corrected: "He has left.",
    });
    expect(feedbackFor(r, "x", true, { ai: { feedback: "好", corrected: "ignored" } }).corrected).toBeUndefined();
    expect(feedbackFor(r, "x", true, { selfAssessed: true }).selfAssessed).toBe(true);
    expect(feedbackFor(r, "x", false).whyWrong).toBeUndefined();
  });

  it("keys: no 1–4 / Enter shortcuts while grading or self-checking, and Enter in the multi-line box is a newline", () => {
    for (const phase of ["grading", "selfcheck"] as const) {
      expect(keyAction("1", { phase, optionCount: 0, inInput: false, onButton: false })).toBeNull();
      expect(keyAction("Enter", { phase, optionCount: 0, inInput: false, onButton: false })).toBeNull();
    }
    expect(keyAction("Enter", { phase: "answering", optionCount: 0, inInput: true, multiline: true, onButton: false })).toBeNull();
    expect(keyAction("Enter", { phase: "answering", optionCount: 0, inInput: true, onButton: false })).toEqual({ type: "submit" });
  });

  it("sourceName is the note's name", () => {
    expect(sourceName("Books/Dune.md")).toBe("Dune");
    expect(sourceName("Plain")).toBe("Plain");
    expect(sourceName("a/b/My note.v2.md")).toBe("My note.v2");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../../src/core/i18n";
import type { PracticeQuestion } from "../../../../src/core/model/practice";
import { POLY_WORDS } from "../../../../src/core/poly/catalog";
import { toPlayerQuestion } from "../../../../src/ui/blocks/practice/scenarioQuestionView";

beforeEach(() => setLocale("zh-TW"));

const w = POLY_WORDS.find((x) => x.senses.length >= 3)!;
const [s1, s2, s3] = w.senses;

const base = (over: Partial<PracticeQuestion>): PracticeQuestion => ({
  id: "q1",
  track: "poly",
  scenario: { id: "sc1", scene: "At the station", seq: 1, speaker: "Ann", lead: [{ speaker: "Bob", text: "Hi." }] },
  kind: "which-sense",
  text: `I [[${w.word}]] there.`,
  options: [s1, s2, s3].map((s) => ({ id: s.id, text: s.zh })),
  answerId: s1.id,
  explanation: "because",
  optionNotes: { [s2.id]: "no" },
  focus: { kind: "sense", id: s1.id },
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("toPlayerQuestion", () => {
  it("copies the shape and tags a sense question", () => {
    const p = toPlayerQuestion(base({}), {});
    expect(p).toMatchObject({
      id: "q1",
      scenarioId: "sc1",
      scene: "At the station",
      speaker: "Ann",
      kind: "which-sense",
      answerId: s1.id,
      optionNotes: { [s2.id]: "no" },
      tag: `常用字 · ${w.word}`,
    });
    expect(p.lead).toEqual([{ speaker: "Bob", text: "Hi." }]);
  });
  it("hints only for poly which-sense, wrong options only", () => {
    const p = toPlayerQuestion(base({}), {});
    expect(p.hints).toEqual({ [s2.id]: s2.cue, [s3.id]: s3.cue });
    expect(toPlayerQuestion(base({ kind: "pick-word", text: "a ____ b" }), {}).hints).toBeUndefined();
    expect(toPlayerQuestion(base({ kind: "same-sense" }), {}).hints).toBeUndefined();
    expect(toPlayerQuestion(base({ track: "vocab", focus: { kind: "word", id: "v1" } }), {}).hints).toBeUndefined();
  });
  it("word and grammar tags", () => {
    const wq = base({
      track: "vocab",
      focus: { kind: "word", id: "v1" },
      text: "He was [[reluctant]] to go.",
      options: [{ id: "a", text: "不情願" }],
      answerId: "a",
    });
    expect(toPlayerQuestion(wq, {}).tag).toBe("單字 · reluctant");
    const pw = base({
      track: "vocab",
      kind: "pick-word",
      focus: { kind: "word", id: "v1" },
      text: "He was ____ to go.",
      options: [{ id: "reluctant", text: "reluctant" }, { id: "eager", text: "eager" }],
      answerId: "reluctant",
    });
    expect(toPlayerQuestion(pw, {}).tag).toBe("單字 · reluctant");
    const gq = base({ track: "mix", kind: "choice", focus: { kind: "grammar-objective", id: "present-perfect/o1" } });
    expect(toPlayerQuestion(gq, { topicTitle: (id) => (id === "present-perfect" ? "現在完成式" : "") }).tag).toBe(
      "文法 · 現在完成式"
    );
    expect(toPlayerQuestion(gq, {}).tag).toBe("文法");
  });
});

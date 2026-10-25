import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import type { ParagraphRef } from "../../../../src/core/practice/paraphrase";
import { isAiError } from "../../../../src/services/ai/errors";
import {
  parseParaphrase,
  practiceParaphrase,
  practiceParaphraseFor,
} from "../../../../src/services/ai/tasks/paraphrase";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";

const P: ParagraphRef = {
  threadId: "t1",
  path: "eng/News.md",
  title: "News",
  sentences: [
    "The committee hardly ever approves a budget increase.",
    "Because costs rose sharply last year, it made an exception.",
    "Members said the decision would be reviewed in spring.",
  ],
  discussed: ["「hardly ever」｜是什麼意思？"],
};

const ask = (n: number, over: Record<string, unknown> = {}) => ({
  sourceIndex: n,
  options: [
    { id: "a", text: `The committee seldom agrees to spend more money, case ${n}.` },
    { id: "b", text: `The committee often agrees to spend more money, case ${n}.` },
    { id: "c", text: `The committee never discusses spending more money, case ${n}.` },
    { id: "d", text: `The members rarely ask for more money themselves, case ${n}.` },
  ],
  answerId: "a",
  explanation: "hardly ever＝seldom",
  optionNotes: [{ id: "b", note: "頻率弄反" }],
  sentenceZh: "委員會幾乎不曾批准增加預算。",
  errorTag: "para-scope",
  ...over,
});

const system = (input: Parameters<typeof practiceParaphrase.build>[0]) =>
  practiceParaphrase
    .build(input, { profile: defaultLearnerProfile(), history: [] })
    .system.map((b) => b.text)
    .join("\n\n");

describe("practice.paraphrase build", () => {
  it("numbers the sentences and sends what was discussed, the weak spots and the sentences asked", () => {
    const text = system({ paragraph: P, weakness: "para-negation｜最近 30 天錯 2 次", asked: [2, 9] });
    expect(text).toContain("〔段落句子〕\n1. The committee hardly ever approves a budget increase.\n2. Because");
    expect(text).toContain("〔討論過的地方〕（學習者在這段的討論裡選取或問過的）\n- 「hardly ever」｜是什麼意思？");
    expect(text).toContain("〔學習弱點〕\npara-negation");
    expect(text).toContain("〔已出過的句子〕第 2 句已經出過題");
  });

  it("leaves out empty blocks and asks for no more questions than sentences", () => {
    const req = practiceParaphrase.build({ paragraph: { ...P, discussed: [] }, count: 6 }, { profile: defaultLearnerProfile(), history: [] });
    const text = req.system.map((b) => b.text).join("\n");
    expect(text).not.toContain("〔討論過的地方〕（");
    expect(text).not.toContain("〔學習弱點〕\n");
    expect(text).not.toContain("〔已出過的句子〕第");
    expect(String(req.messages.at(-1)?.content)).toContain("出 3 題");
    expect(req.output?.name).toBe("practice_paraphrase");
  });

  it("is registered without a button", () => {
    const t = defaultTaskRegistry().get("practice.paraphrase");
    expect(t?.label).toBeUndefined();
  });
});

describe("parseParaphrase", () => {
  it("uses the paragraph's own sentence, in paragraph order, with the sentences between as lead", () => {
    const d = parseParaphrase({ questions: [ask(3), ask(1)] }, P);
    expect(d.scene).toBe("〈News〉");
    expect(d.questions.map((q) => q.text)).toEqual([P.sentences[0], P.sentences[2]]);
    expect(d.questions[0].lead).toBeUndefined();
    expect(d.questions[1].lead).toEqual([{ text: P.sentences[1] }]);
    const q = d.questions[0];
    expect(q).toMatchObject({ kind: "paraphrase", focus: { kind: "paragraph", id: "t1" }, answerId: "a", errorTag: "para-scope" });
    expect(q.optionNotes).toEqual({ b: "頻率弄反" });
    expect(q.options.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("orders the options by their text, not by where the model put the answer", () => {
    const a = parseParaphrase({ questions: [ask(1)] }, P).questions[0].options.map((o) => o.text);
    const reversed = ask(1);
    reversed.options = [...reversed.options].reverse();
    const b = parseParaphrase({ questions: [reversed] }, P).questions[0].options.map((o) => o.text);
    expect(b).toEqual(a);
  });

  it("drops questions that point outside the paragraph, copy the sentence or aren't English sentences", () => {
    const copy = ask(2);
    copy.options[1] = { id: "b", text: "Because costs rose sharply last year, it made an exception" };
    const zh = ask(3);
    zh.options[2] = { id: "c", text: "委員會很少同意花更多錢。" };
    expect(parseParaphrase({ questions: [ask(1), copy] }, P).questions).toHaveLength(1);
    const d = parseParaphrase({ questions: [ask(1), ask(2, { errorTag: "bogus" }), copy, ask(7)] }, P);
    expect(d.questions.map((q) => q.text)).toEqual([P.sentences[0], P.sentences[1]]);
    expect(d.questions[1].errorTag).toBeUndefined();
    expect(() => parseParaphrase({ questions: [ask(0), zh, ask(1, { answerId: "x" })] }, P)).toThrow();
  });

  it("is bad_output when fewer than half the questions are usable", () => {
    try {
      parseParaphrase({ questions: [ask(1), ask(9), ask(10)] }, P);
      expect.unreachable();
    } catch (e) {
      expect(isAiError(e) && e.code).toBe("bad_output");
    }
  });

  it("binds the parser to the paragraph", () => {
    const task = practiceParaphraseFor(P);
    const out = task.parse!({ text: "", json: { questions: [ask(1)] } } as never);
    expect(out.questions[0].text).toBe(P.sentences[0]);
  });
});

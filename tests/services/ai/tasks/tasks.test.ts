import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import { templateSlots } from "../../../../src/core/text/template";
import { buildParagraphContext, type ParagraphInput } from "../../../../src/services/ai/context/paragraphContext";
import { buildWordContext, type WordInput } from "../../../../src/services/ai/context/wordContext";
import type { AiRequest, ChatMessage } from "../../../../src/services/ai/providers/types";
import { trimHistory } from "../../../../src/services/ai/tasks/compose";
import {
  PARAGRAPH_BASE_PROMPT,
  PARAGRAPH_TASKS,
  PARAGRAPH_TEMPLATES,
  paragraphCustom,
  paragraphGrammar,
  paragraphTranslate,
  paragraphVocab,
} from "../../../../src/services/ai/tasks/paragraph";
import { defaultTaskRegistry } from "../../../../src/services/ai/tasks/registry";
import {
  WORD_BASE_PROMPT,
  WORD_TASKS,
  WORD_TEMPLATES,
  wordCompare,
  wordCustom,
  wordMnemonic,
} from "../../../../src/services/ai/tasks/word";

// Snapshot tests of the exact requests sent to the model (規劃書 06 §11):
// any prompt change shows up as a reviewable diff in
// __snapshots__/tasks.test.ts.snap.

const ARTICLE: ParagraphInput["article"] = {
  title: "Taylor Swift NYU Commencement Speech",
  paragraphs: [
    "Hi. Hello. Hi.",
    "Last time I was in a stadium this size, I was dancing in heels and wearing a glittery leotard. This ensemble is much more my speed.",
    "To the honorees and everyone who came today — I am elated to be here.",
  ],
};

const A1_TOEFL: LearnerProfile = { level: "A1", goal: "toefl", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };

const GLITTERY: WordInput = {
  entry: {
    word: "glittery",
    phonetic: "/ˈɡlɪt.ər.i/",
    partOfSpeech: "adjective",
    definitionZh: "閃亮的；帶亮片的",
    grammar: "形容詞，常放在名詞前",
  },
  sourceParagraph: ARTICLE.paragraphs[1],
  sourceTitle: "Taylor Swift NYU Commencement Speech",
};

const ctx = (profile: LearnerProfile = defaultLearnerProfile(), history: ChatMessage[] = []) => ({ profile, history });

function render(req: AiRequest): string {
  // Human-readable dump so the snapshot reads like the actual prompt.
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...sys, ...msgs].join("\n\n");
}

describe("composed AiRequest snapshots", () => {
  it("paragraph.custom — vague question, no selection, A1/TOEFL profile", () => {
    const req = paragraphCustom.build({ article: ARTICLE, paragraphIndex: 1, question: "我看不懂這句" }, ctx(A1_TOEFL));
    expect(render(req)).toMatchSnapshot();
  });

  it("paragraph.custom — quoted fragment plus selection, with history", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "這段在講什麼？" },
      { role: "assistant", content: "你問的是：整段（¶2）\n\n她在開玩笑說…" },
    ];
    const req = paragraphCustom.build(
      { article: ARTICLE, paragraphIndex: 1, selection: "much more my speed", question: "「more my speed」是什麼意思" },
      ctx(defaultLearnerProfile(), history)
    );
    expect(render(req)).toMatchSnapshot();
  });

  it("paragraph.grammar — with selection", () => {
    expect(render(paragraphGrammar.build({ article: ARTICLE, paragraphIndex: 1, selection: "glittery leotard" }, ctx()))).toMatchSnapshot();
  });

  it("paragraph.translate — whole paragraph", () => {
    expect(render(paragraphTranslate.build({ article: ARTICLE, paragraphIndex: 2 }, ctx()))).toMatchSnapshot();
  });

  it("paragraph.vocab — skips known words", () => {
    const req = paragraphVocab.build({ article: ARTICLE, paragraphIndex: 2, knownWords: ["elated", "honorees"] }, ctx());
    expect(req.messages.at(-1)?.content).toMatchSnapshot();
  });

  it("word.custom — vague question, A1/TOEFL profile", () => {
    expect(render(wordCustom.build({ ...GLITTERY, question: "這句裡它是什麼意思？" }, ctx(A1_TOEFL)))).toMatchSnapshot();
  });

  it("word.compare — with and without a target word", () => {
    expect(wordCompare.build({ ...GLITTERY, compareWith: "sparkly" }, ctx()).messages.at(-1)?.content).toMatchSnapshot();
    expect(wordCompare.build(GLITTERY, ctx()).messages.at(-1)?.content).toMatchSnapshot();
  });

  it("word.mnemonic — no source paragraph", () => {
    expect(render(wordMnemonic.build({ entry: { word: "toil" } }, ctx()))).toMatchSnapshot();
  });
});

describe("prompt structure invariants", () => {
  const input: ParagraphInput = { article: ARTICLE, paragraphIndex: 1, selection: "glittery", question: "?" };

  it("every paragraph task shares the same cached prefix (base + article)", () => {
    const prefixes = PARAGRAPH_TASKS.map((t) =>
      JSON.stringify(t.build(input, ctx()).system.filter((b) => b.cache))
    );
    expect(new Set(prefixes).size).toBe(1);
    const first = PARAGRAPH_TASKS[0].build(input, ctx()).system;
    expect(first[0]).toEqual({ text: PARAGRAPH_BASE_PROMPT, cache: true });
    expect(first[1].cache).toBe(true);
  });

  it("every word task starts with the same cached base prompt", () => {
    for (const t of WORD_TASKS) expect(t.build(GLITTERY, ctx()).system[0]).toEqual({ text: WORD_BASE_PROMPT, cache: true });
  });

  it("the profile is the last system block, after every cache breakpoint", () => {
    for (const t of [...PARAGRAPH_TASKS.map((t) => t.build(input, ctx(A1_TOEFL))), ...WORD_TASKS.map((t) => t.build(GLITTERY, ctx(A1_TOEFL)))]) {
      const last = t.system.at(-1)!;
      expect(last.text.startsWith("〔學習者設定〕")).toBe(true);
      expect(last.cache).toBeFalsy();
      const lastCached = t.system.map((b) => !!b.cache).lastIndexOf(true);
      expect(lastCached).toBeLessThan(t.system.length - 1);
    }
  });

  it("changing the profile leaves the cached prefix byte-identical", () => {
    const a = paragraphGrammar.build(input, ctx(defaultLearnerProfile()));
    const b = paragraphGrammar.build(input, ctx(A1_TOEFL));
    expect(a.system.filter((x) => x.cache)).toEqual(b.system.filter((x) => x.cache));
    expect(a.system.at(-1)).not.toEqual(b.system.at(-1));
  });

  it("always sends the full focus paragraph and the selection", () => {
    for (const t of PARAGRAPH_TASKS) {
      const req = t.build(input, ctx());
      expect(req.system.some((b) => !b.cache && b.text.includes(ARTICLE.paragraphs[1]))).toBe(true);
      expect(req.messages.at(-1)?.content).toContain("〔選取的文字〕\nglittery");
    }
    for (const t of WORD_TASKS) {
      const req = t.build({ ...GLITTERY, selection: "glittery leotard" }, ctx());
      expect(req.system.some((b) => b.text.includes(ARTICLE.paragraphs[1]))).toBe(true);
      expect(req.messages.at(-1)?.content).toContain("〔選取的文字〕\nglittery leotard");
    }
  });

  it("asks the model to name the target sentence first, and not to make things up", () => {
    expect(PARAGRAPH_BASE_PROMPT).toContain("你問的是：「<那一句英文原文>」");
    expect(WORD_BASE_PROMPT).toContain("你問的是：「<那一句英文原文>」");
    for (const base of [PARAGRAPH_BASE_PROMPT, WORD_BASE_PROMPT]) {
      expect(base).toContain("繁體中文");
      expect(base).toContain("不確定就直接說「不確定」");
      expect(base).toContain("不要編造");
    }
  });

  it("templates only use slots their context builder provides", () => {
    const pSlots = Object.keys(buildParagraphContext(input).slots);
    for (const [id, tpl] of Object.entries(PARAGRAPH_TEMPLATES)) {
      expect({ id, missing: templateSlots(tpl).filter((s) => !pSlots.includes(s)) }).toEqual({ id, missing: [] });
    }
    const wSlots = Object.keys(buildWordContext(GLITTERY).slots);
    for (const [id, tpl] of Object.entries(WORD_TEMPLATES)) {
      expect({ id, missing: templateSlots(tpl).filter((s) => !wSlots.includes(s)) }).toEqual({ id, missing: [] });
    }
  });

  it("keeps the last 6 rounds of history and starts with a user turn", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: "orphan" }];
    for (let i = 1; i <= 8; i++) {
      history.push({ role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}` });
    }
    const trimmed = trimHistory(history);
    expect(trimmed).toHaveLength(12);
    expect(trimmed[0]).toEqual({ role: "user", content: "q3" });
    const req = paragraphCustom.build({ ...input, question: "now" }, ctx(defaultLearnerProfile(), history));
    expect(req.messages).toHaveLength(13);
    expect(req.messages.at(-1)?.role).toBe("user");
  });
});

describe("task registry", () => {
  it("registers every paragraph and word task with unique ids", () => {
    const reg = defaultTaskRegistry();
    expect(reg.forSurface("paragraph").map((t) => t.id)).toEqual([
      "paragraph.grammar",
      "paragraph.translate",
      "paragraph.vocab",
      "paragraph.paraphrase",
      "paragraph.custom",
    ]);
    expect(reg.forSurface("word").map((t) => t.id)).toEqual(["word.usage", "word.compare", "word.sentence", "word.mnemonic", "word.custom"]);
    expect(() => reg.register(paragraphGrammar)).toThrow(/already registered/);
  });

  it("gives quick-action tasks a label and leaves custom unlabeled", () => {
    for (const t of defaultTaskRegistry().all()) {
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(t.maxTokens).toBeGreaterThan(0);
      expect(!!t.label).toBe(!t.id.endsWith(".custom"));
    }
  });
});

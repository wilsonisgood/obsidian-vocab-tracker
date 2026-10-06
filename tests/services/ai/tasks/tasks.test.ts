import { describe, expect, it } from "vitest";
import { defaultLearnerProfile, type LearnerProfile } from "../../../../src/core/model/settings";
import { templateSlots } from "../../../../src/core/text/template";
import { buildParagraphContext, type ParagraphInput } from "../../../../src/services/ai/context/paragraphContext";
import { buildWordContext, type WordInput } from "../../../../src/services/ai/context/wordContext";
import type { AiRequest, ChatMessage } from "../../../../src/services/ai/providers/types";
import { trimHistory } from "../../../../src/services/ai/tasks/compose";
import { scaledChars } from "../../../../src/services/ai/tasks/length";
import {
  PARAGRAPH_BASE_PROMPT,
  PARAGRAPH_TASKS,
  PARAGRAPH_TEMPLATES,
  paragraphCustom,
  paragraphGrammar,
  paragraphParaphrase,
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
  wordSentence,
  wordUsage,
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

// The selection from the user's report: another paragraph, no "glittery".
const OFF_TOPIC =
  "Someone read stories to you and taught you to dream and offered up some moral code of right and wrong for you to try and live by.";

const ctx = (profile: LearnerProfile = defaultLearnerProfile(), history: ChatMessage[] = []) => ({ profile, history });

function render(req: AiRequest): string {
  // Human-readable dump so the snapshot reads like the actual prompt.
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role}${m.cache ? " (cache)" : ""} ──\n${m.content}`);
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

  it("word.usage — selection that doesn't contain the word (full request)", () => {
    expect(render(wordUsage.build({ ...GLITTERY, selection: OFF_TOPIC }, ctx()))).toMatchSnapshot();
  });

  it("word.usage — selection that contains the word (full request, same as v2)", () => {
    expect(render(wordUsage.build({ ...GLITTERY, selection: "wearing a glittery leotard" }, ctx()))).toMatchSnapshot();
  });

  it("word.custom — selection without the word, no source", () => {
    const req = wordCustom.build({ entry: { word: "toil" }, selection: "the cat sat", question: "這是什麼意思？" }, ctx());
    expect(req.messages.at(-1)?.content).toMatchSnapshot();
  });

  it("word.compare / sentence / mnemonic / custom — selection without the word", () => {
    const input: WordInput = { ...GLITTERY, selection: OFF_TOPIC, question: "這句裡它是什麼意思？" };
    for (const t of [wordCompare, wordSentence, wordMnemonic, wordCustom]) {
      expect(t.build(input, ctx()).messages.at(-1)?.content).toMatchSnapshot(t.id);
    }
  });

  it("word.usage — selection without the word, captured sentence only (〔出處句子〕)", () => {
    const req = wordUsage.build(
      { entry: { word: "glittery", example: "wearing a glittery leotard" }, selection: OFF_TOPIC },
      ctx()
    );
    expect(render(req)).toMatchSnapshot();
  });
});

describe("selection that doesn't contain the word (規劃書 06 §6.4)", () => {
  const user = (input: WordInput) => wordUsage.build(input, ctx()).messages.at(-1)?.content ?? "";
  const NOTICE = "〔注意〕";

  it("asks for a reminder on the first line, then the source paragraph as usual", () => {
    const msg = user({ ...GLITTERY, selection: OFF_TOPIC });
    expect(msg.startsWith(`〔選取的文字〕\n${OFF_TOPIC}\n\n${NOTICE}`)).toBe(true);
    expect(msg).toContain("回答的第一行固定寫：你選取的文字裡似乎沒有 glittery，以下以出處段落為準。");
    expect(msg).toContain("需要寫「你問的是：…」那一行時，放在這句提醒之後");
    expect(msg).toContain("就忽略這段注意，照一般規則以選取所在的句子為準");
    expect(msg).toContain("任務：用法（glittery）");
  });

  it("names the block that is actually there: 段落, 句子, or none", () => {
    const sentenceOnly = user({ entry: { word: "glittery", example: "a glittery leotard" }, selection: OFF_TOPIC });
    expect(sentenceOnly).toContain("你選取的文字裡似乎沒有 glittery，以下以出處句子為準。");
    expect(sentenceOnly).toContain("或〔出處句子〕中含有 glittery 的句子");
    // Only the notice is checked: the v2 task lines after it still say
    // 〔出處段落〕 for a sentence-only source (unchanged on purpose).
    const notice = (msg: string) => msg.slice(msg.indexOf(NOTICE), msg.indexOf("任務："));
    expect(notice(sentenceOnly)).not.toContain("出處段落");
    const none = user({ entry: { word: "glittery" }, selection: OFF_TOPIC });
    expect(none).toContain("你選取的文字裡似乎沒有 glittery，以下直接說明 glittery。");
    expect(notice(none)).not.toContain("出處");
  });

  it("renders exactly as before when the selection contains the word", () => {
    for (const selection of ["glittery leotard", "a GLITTERY dress", "Glittery!"]) {
      const msg = user({ ...GLITTERY, selection });
      expect(msg).not.toContain(NOTICE);
      expect(msg).toBe(`〔選取的文字〕\n${selection}\n\n${user(GLITTERY)}`);
    }
  });

  it("no selection: no selection block and no reminder", () => {
    const msg = user(GLITTERY);
    expect(msg).not.toContain("〔選取的文字〕");
    expect(msg).not.toContain(NOTICE);
    expect(msg.startsWith("任務：用法（glittery）")).toBe(true);
  });

  it("applies to every word task", () => {
    for (const t of WORD_TASKS) {
      expect(t.build({ ...GLITTERY, selection: OFF_TOPIC, question: "?" }, ctx()).messages.at(-1)?.content).toContain(NOTICE);
      expect(t.build({ ...GLITTERY, selection: "glittery", question: "?" }, ctx()).messages.at(-1)?.content).not.toContain(NOTICE);
    }
  });

  it("bumps the word tasks to version 3", () => {
    for (const t of WORD_TASKS) expect(t.version).toBe(3);
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

  it("keeps at most 6 rounds of history and starts with a user turn", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: "orphan" }];
    for (let i = 1; i <= 9; i++) {
      history.push({ role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}` });
    }
    const trimmed = trimHistory(history);
    expect(trimmed).toHaveLength(12);
    expect(trimmed[0]).toEqual({ role: "user", content: "q4" });
    const req = paragraphCustom.build({ ...input, question: "now" }, ctx(defaultLearnerProfile(), history));
    expect(req.messages).toHaveLength(13);
    expect(req.messages.at(-1)?.role).toBe("user");
  });
});

describe("conversation cache breakpoint (規劃書 06 §6.4.1 #5)", () => {
  const rounds = (n: number): ChatMessage[] =>
    Array.from({ length: n }, (_, i) => [
      { role: "user" as const, content: `q${i + 1}` },
      { role: "assistant" as const, content: `a${i + 1}` },
    ]).flat();

  it("marks the last history message, never the new question", () => {
    const history = rounds(2);
    const req = wordCustom.build({ ...GLITTERY, question: "now" }, ctx(defaultLearnerProfile(), history));
    expect(req.messages.map((m) => !!m.cache)).toEqual([false, false, false, true, false]);
    expect(req.messages.at(-2)).toEqual({ role: "assistant", content: "a2", cache: true });
    // The caller's history is left untouched.
    expect(history.some((m) => "cache" in m)).toBe(false);
  });

  it("adds no message breakpoint on the first question", () => {
    const req = wordCustom.build({ ...GLITTERY, question: "now" }, ctx());
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].cache).toBeUndefined();
  });

  it("ignores cache flags already on the history", () => {
    const history = rounds(2).map((m) => ({ ...m, cache: true }));
    const req = wordCustom.build(GLITTERY, ctx(defaultLearnerProfile(), history));
    expect(req.messages.filter((m) => m.cache)).toHaveLength(1);
  });

  it("drops old rounds 3 at a time so the first message stays put across follow-ups", () => {
    const firsts: string[] = [];
    for (let n = 0; n <= 15; n++) {
      const kept = trimHistory(rounds(n));
      expect(kept.length / 2).toBeLessThanOrEqual(6);
      if (n > 6) expect(kept.length / 2).toBeGreaterThanOrEqual(4);
      firsts.push(kept[0]?.content ?? "-");
    }
    expect(firsts).toEqual([
      "-", "q1", "q1", "q1", "q1", "q1", "q1", // up to 6 rounds: everything
      "q4", "q4", "q4", // 7–9 rounds: drop the first 3
      "q7", "q7", "q7", // 10–12: drop 6
      "q10", "q10", "q10",
    ]);
  });
});

describe("answer length per task (規劃書 06 §6.4.1 #2)", () => {
  const profileBlock = (req: AiRequest) => req.system.at(-1)?.text ?? "";
  const LONG = "word ".repeat(200).trim(); // 999 characters
  const longArticle = { title: "", paragraphs: ["Intro.", LONG] };

  it("translate and paraphrase grow with the source text", () => {
    expect(scaledChars(300, 999, 0.6)).toBe(900);
    expect(profileBlock(paragraphTranslate.build({ article: longArticle, paragraphIndex: 1 }, ctx()))).toContain("盡量在 900 字以內");
    expect(profileBlock(paragraphParaphrase.build({ article: longArticle, paragraphIndex: 1 }, ctx()))).toContain("盡量在 600 字以內");
  });

  it("measures the selection instead of the paragraph when there is one", () => {
    const req = paragraphTranslate.build({ article: longArticle, paragraphIndex: 1, selection: "word word" }, ctx());
    expect(profileBlock(req)).toContain("盡量在 350 字以內");
  });

  it("explanation tasks keep the learner's limit, and no limit stays unlimited", () => {
    expect(profileBlock(paragraphGrammar.build({ article: longArticle, paragraphIndex: 1 }, ctx()))).toContain("盡量在 300 字以內");
    const unlimited = { ...defaultLearnerProfile(), maxAnswerChars: 0 };
    expect(profileBlock(paragraphTranslate.build({ article: longArticle, paragraphIndex: 1 }, ctx(unlimited)))).not.toContain("字以內");
    expect(scaledChars(0, 999, 0.6)).toBe(0);
  });

  it("tells the model English quotes and examples don't count", () => {
    expect(profileBlock(paragraphGrammar.build({ article: ARTICLE, paragraphIndex: 1 }, ctx()))).toContain("英文原文與例句不計入字數");
  });
});

describe("follow-ups (規劃書 06 §6.4.1 #3)", () => {
  it("both base prompts tell the model not to repeat the scope line for the same sentence", () => {
    for (const base of [PARAGRAPH_BASE_PROMPT, WORD_BASE_PROMPT]) {
      expect(base).toContain("追問時（前面的對話已經寫過「你問的是」）");
      expect(base).toContain("就不要再寫這一行");
    }
    expect(PARAGRAPH_TEMPLATES.custom).toContain("決定第一行要不要寫出範圍");
    expect(WORD_TEMPLATES.custom).toContain("決定第一行要不要寫出那一句");
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

  it("gives quick-action tasks a label and leaves custom/background ones unlabeled", () => {
    // family.expand (09 §4/§5.1) and word.emoji (09 §4/§5.2) aren't
    // quick-action buttons: FamilyService/EmojiService call them directly.
    const unlabeled = new Set(["trivia.followup", "family.expand", "word.emoji"]);
    for (const t of defaultTaskRegistry().all()) {
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(t.maxTokens).toBeGreaterThan(0);
      expect(!!t.label).toBe(!(t.id.endsWith(".custom") || unlabeled.has(t.id)));
    }
  });
});

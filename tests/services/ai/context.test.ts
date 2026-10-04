import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import { buildParagraphContext } from "../../../src/services/ai/context/paragraphContext";
import { renderProfile } from "../../../src/services/ai/context/profile";
import { buildWordContext } from "../../../src/services/ai/context/wordContext";

const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} text.`);

describe("buildParagraphContext", () => {
  it("includes the whole article, numbered, plus the full focus paragraph", () => {
    const c = buildParagraphContext({ article: { title: "NYU Speech", paragraphs }, paragraphIndex: 4, selection: " heels " });
    expect(c.truncated).toBe(false);
    expect(c.articleBlock).toContain("〔文章〕《NYU Speech》");
    for (let i = 1; i <= 12; i++) expect(c.articleBlock).toContain(`¶${i} Paragraph ${i} text.`);
    expect(c.focusBlock).toBe("〔目前段落〕¶5\nParagraph 5 text.");
    expect(c.slots).toMatchObject({ paragraphNumber: 5, paragraph: "Paragraph 5 text.", selection: "heels" });
  });

  it("produces an article block that is identical for every focus paragraph (shared cache)", () => {
    const a = buildParagraphContext({ article: { paragraphs }, paragraphIndex: 0 });
    const b = buildParagraphContext({ article: { paragraphs }, paragraphIndex: 11, question: "?" });
    expect(a.articleBlock).toBe(b.articleBlock);
  });

  it("truncates a long article to ±3 paragraphs, keeping original numbering", () => {
    const c = buildParagraphContext({ article: { paragraphs }, paragraphIndex: 6 }, { maxArticleTokens: 20 });
    expect(c.truncated).toBe(true);
    expect(c.articleBlock).toContain("前後各 3 段");
    const numbers = [...c.articleBlock.matchAll(/¶(\d+) /g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([4, 5, 6, 7, 8, 9, 10]);
    // Focus paragraph is still sent in full.
    expect(c.focusBlock).toContain("Paragraph 7 text.");
  });

  it("clamps the window at the article edges", () => {
    const c = buildParagraphContext({ article: { paragraphs }, paragraphIndex: 1 }, { maxArticleTokens: 20 });
    const numbers = [...c.articleBlock.matchAll(/¶(\d+) /g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an out-of-range paragraph index", () => {
    expect(() => buildParagraphContext({ article: { paragraphs }, paragraphIndex: 12 })).toThrow(RangeError);
  });
});

describe("buildWordContext", () => {
  it("includes the word's fields and the full source paragraph", () => {
    const c = buildWordContext({
      entry: { word: "glittery", phonetic: "/ˈɡlɪt.ər.i/", partOfSpeech: "adjective", definitionZh: "閃亮的", example: "wearing a glittery leotard" },
      sourceParagraph: "Last time I was in a stadium this size, I was dancing in heels and wearing a glittery leotard.",
      sourceTitle: "Taylor Swift NYU",
      otherExamples: ["a glittery dress"],
    });
    expect(c.wordBlock).toMatchInlineSnapshot(`
      "〔單字〕glittery
      音標：/ˈɡlɪt.ər.i/
      詞性：adjective
      中文：閃亮的

      〔出處段落〕出自《Taylor Swift NYU》
      Last time I was in a stadium this size, I was dancing in heels and wearing a glittery leotard.

      〔其他筆記裡的例句〕
      - a glittery dress"
    `);
    expect(c.slots.hasSource).toBe("yes");
  });

  it("falls back to the captured sentence when no paragraph is available", () => {
    const c = buildWordContext({ entry: { word: "toil", example: "years of toil" } });
    expect(c.wordBlock).toBe("〔單字〕toil\n\n〔出處句子〕\nyears of toil");
  });
});

describe("renderProfile", () => {
  it("renders the default profile", () => {
    expect(renderProfile(defaultLearnerProfile())).toBe(
      "〔學習者設定〕\n我是一個以閱讀英文文章為主的英文學習者。請用繁體中文（台灣用語）回答，簡明扼要，盡量在 300 字以內完成說明（英文原文與例句不計入字數）。"
    );
  });

  it("renders level, goal, language, length and extra notes", () => {
    expect(
      renderProfile({ level: "A1", goal: "toefl", answerLanguage: "bilingual", maxAnswerChars: 0, extra: " 我是工程師。 " })
    ).toBe(
      "〔學習者設定〕\n我是一個 A1（入門）程度、正在準備托福（TOEFL）的英文學習者。請用中英對照（以繁體中文為主，關鍵處附英文）回答，簡明扼要。\n其他補充：我是工程師。"
    );
  });
});

import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import { buildParagraphContext } from "../../../src/services/ai/context/paragraphContext";
import { renderProfile } from "../../../src/services/ai/context/profile";
import { buildWordContext, selectionHasWord } from "../../../src/services/ai/context/wordContext";

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

  it("flags a selection that doesn't contain the word, and only then", () => {
    const entry = { word: "glittery" };
    expect(buildWordContext({ entry, selection: "a glittery leotard" }).slots.selectionMissesWord).toBe("");
    expect(buildWordContext({ entry, selection: "  Someone read stories to you.  " }).slots).toMatchObject({
      selection: "Someone read stories to you.",
      selectionMissesWord: "yes",
    });
    expect(buildWordContext({ entry }).slots.selectionMissesWord).toBe("");
    expect(buildWordContext({ entry, selection: "   " }).slots.selectionMissesWord).toBe("");
  });
});

describe("selectionHasWord", () => {
  const has = (word: string, selection: string) => selectionHasWord(selection, word);

  it("matches the word as written, ignoring case", () => {
    expect(has("glittery", "wearing a glittery leotard")).toBe(true);
    expect(has("glittery", "A GLITTERY leotard")).toBe(true);
    expect(has("Glittery", "glittery")).toBe(true);
    expect(has("leotard", "a glittery leotard.")).toBe(true);
  });

  it("tolerates inflected and closely derived forms, both ways", () => {
    expect(has("glitter", "the stage glittered")).toBe(true);
    expect(has("glittered", "all that glitters")).toBe(true);
    expect(has("glittery", "it glittered under the lights")).toBe(true);
    expect(has("run", "she was running late")).toBe(true);
    expect(has("running", "he runs every day")).toBe(true);
    expect(has("happy", "I've never been happier")).toBe(true);
    expect(has("big", "the biggest stadium")).toBe(true);
    expect(has("study", "she studied hard")).toBe(true);
    expect(has("make", "making a speech")).toBe(true);
    expect(has("lie", "lying in bed")).toBe(true);
    expect(has("box", "two boxes")).toBe(true);
    expect(has("easy", "easily done")).toBe(true);
    expect(has("Taylor", "Taylor’s speech")).toBe(true);
  });

  it("matches multi-word entries in order, allowing a few words in between", () => {
    expect(has("gloss over", "they glossed over the details")).toBe(true);
    expect(has("gloss over", "Don't GLOSS it over")).toBe(true);
    expect(has("gloss over", "glossing the whole problem over")).toBe(true);
    expect(has("give up", "she never gave up")).toBe(false); // irregular forms aren't handled
    expect(has("gloss over", "over the gloss")).toBe(false);
    expect(has("gloss over", "a glossy finish")).toBe(false);
    expect(has("gloss over", "gloss on the paint, and then far more words later over")).toBe(false);
    expect(has("well-known", "a well-known speech")).toBe(true);
  });

  it("counts a selection that is just part of the word", () => {
    expect(has("glittery", "glitter")).toBe(true);
    expect(has("glittery", "litt")).toBe(true);
  });

  it("reports the user's real case as missing", () => {
    const sel =
      "Someone read stories to you and taught you to dream and offered up some moral code of right and wrong for you to try and live by.";
    expect(has("glittery", sel)).toBe(false);
    expect(has("elated", sel)).toBe(false);
    expect(has("ensemble", "This is much more my speed.")).toBe(false);
  });

  it("never flags an empty selection or a word it can't tokenize", () => {
    expect(has("glittery", "")).toBe(false);
    expect(has("閃亮", "something else")).toBe(true);
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

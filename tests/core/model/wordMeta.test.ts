import { describe, expect, it } from "vitest";
import { defaultEmoji, emojiOf, type WordMeta } from "../../../src/core/model/wordMeta";

describe("defaultEmoji", () => {
  it("picks noun/verb/adjective emoji from free-text partOfSpeech", () => {
    expect(defaultEmoji("noun")).toBe("📘");
    expect(defaultEmoji("verb")).toBe("🏃");
    expect(defaultEmoji("adjective")).toBe("🎨");
  });

  it("falls back for anything else", () => {
    expect(defaultEmoji("adverb")).toBe("🔤");
    expect(defaultEmoji("")).toBe("🔤");
  });

  it("prefers noun over verb when partOfSpeech lists both (fixed priority order)", () => {
    expect(defaultEmoji("noun, verb")).toBe("📘");
  });
});

describe("emojiOf", () => {
  it("uses the stored emoji when wordMeta has one", () => {
    const meta: WordMeta = { id: "e1", emoji: "🦊" };
    expect(emojiOf(meta, { partOfSpeech: "noun" })).toBe("🦊");
  });

  it("falls back to defaultEmoji when there's no wordMeta or no emoji field", () => {
    expect(emojiOf(undefined, { partOfSpeech: "verb" })).toBe("🏃");
    expect(emojiOf({ id: "e1" }, { partOfSpeech: "adjective" })).toBe("🎨");
  });
});

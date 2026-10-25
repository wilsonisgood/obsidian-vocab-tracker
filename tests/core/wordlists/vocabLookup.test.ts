import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { segmentText } from "../../../src/core/wordlists/scan";
import { savedWords, vocabLookup } from "../../../src/core/wordlists/vocabLookup";

const entry = (word: string, extra: Partial<VocabEntry> = {}) => ({ word, ...extra }) as VocabEntry;

describe("savedWords", () => {
  it("keeps live single words, lowercased; drops deleted words and phrases", () => {
    const words = savedWords([
      entry("Analyze"),
      entry(" resilient "),
      entry("well-being"),
      entry("gone", { deletedAt: "2026-10-01T00:00:00.000Z" }),
      entry("look up"),
      entry("2FA"),
    ]);
    expect([...words].sort()).toEqual(["analyze", "resilient", "well-being"]);
  });
});

describe("vocabLookup", () => {
  const words = new Set(["analyze", "study"]);

  it("answers with the saved word, any case", () => {
    const lookup = vocabLookup(words, false);
    expect(lookup("Analyze")).toEqual(["analyze"]);
    expect(lookup("other")).toEqual([]);
  });

  it("matches inflected forms only when inflections are on", () => {
    expect(vocabLookup(words, true)("analyzed")).toEqual(["analyze"]);
    expect(vocabLookup(words, true)("studies")).toEqual(["study"]);
    expect(vocabLookup(words, false)("analyzed")).toEqual([]);
  });

  it("splits a sentence around the saved words", () => {
    const segs = segmentText("We analyzed the data.", vocabLookup(words, true));
    expect(segs).toEqual(["We ", { word: "analyzed", tags: ["analyze"] }, " the data."]);
  });
});

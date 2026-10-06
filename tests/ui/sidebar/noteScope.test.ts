import { describe, expect, it } from "vitest";
import { computeNoteScope } from "../../../src/ui/sidebar/noteScope";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { ScanHit } from "../../../src/core/wordlists/scan";

function entry(partial: Partial<VocabEntry> & { id: string; word: string }): VocabEntry {
  return {
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...partial,
  } as VocabEntry;
}

function hit(word: string): ScanHit {
  return { word, tags: ["exam/TOEFL"], line: 0, sentence: "" };
}

describe("computeNoteScope (1006report.md #6)", () => {
  it("includes a word found by the background scan, regardless of liked", () => {
    const e = entry({ id: "1", word: "analyze" });
    const ids = computeNoteScope([e], [hit("analyze")], null, true);
    expect(ids.has("1")).toBe(true);
  });

  it("excludes a deleted entry even if it's in the hits", () => {
    const e = entry({ id: "1", word: "analyze", deletedAt: "2026-01-01" });
    const ids = computeNoteScope([e], [hit("analyze")], null, true);
    expect(ids.has("1")).toBe(false);
  });

  it("a liked word not in any list still counts if the note text has it", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], "The lake had a faint glimmer.", true);
    expect(ids.has("1")).toBe(true);
  });

  it("a liked word absent from the note text is excluded", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], "Nothing here.", true);
    expect(ids.has("1")).toBe(false);
  });

  it("an un-liked word not in the hits is excluded even if the text has it", () => {
    const e = entry({ id: "1", word: "glimmer" });
    const ids = computeNoteScope([e], [], "There was a glimmer.", true);
    expect(ids.has("1")).toBe(false);
  });

  it("falls back to hits only when the note text isn't ready yet (null)", () => {
    const e = entry({ id: "1", word: "glimmer", liked: true });
    const ids = computeNoteScope([e], [], null, true);
    expect(ids.has("1")).toBe(false);
  });

  it("respects the inflections flag for liked words", () => {
    const e = entry({ id: "1", word: "analyze", liked: true });
    expect(computeNoteScope([e], [], "She analyzed it.", true).has("1")).toBe(true);
    expect(computeNoteScope([e], [], "She analyzed it.", false).has("1")).toBe(false);
  });
});

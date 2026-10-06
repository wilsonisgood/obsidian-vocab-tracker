import { describe, expect, it, vi } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { commitEntryField, levelTags, normalizeExpand } from "../../../src/ui/word/rowModel";

function entry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "glittery",
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
    ...overrides,
  };
}

describe("commitEntryField (1006-2 #12/#15 — one save path for a field edit)", () => {
  it("an edit on a word that isn't liked yet also likes it", async () => {
    const e = entry({ liked: false });
    const setLiked = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);
    await commitEntryField({ setLiked, touch }, e, "definition", "sparkly");
    expect(e.definition).toBe("sparkly");
    expect(setLiked).toHaveBeenCalledWith(e, true);
    expect(touch).not.toHaveBeenCalled();
  });

  it("an edit on an already-liked word just touches it", async () => {
    const e = entry({ liked: true });
    const setLiked = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);
    await commitEntryField({ setLiked, touch }, e, "synonyms", "sparkly, shiny");
    expect(e.synonyms).toBe("sparkly, shiny");
    expect(touch).toHaveBeenCalledWith(e);
    expect(setLiked).not.toHaveBeenCalled();
  });

  it("undefined liked (not backfilled yet) is treated as not-liked", async () => {
    const e = entry();
    delete e.liked;
    const setLiked = vi.fn(async () => undefined);
    const touch = vi.fn(async () => undefined);
    await commitEntryField({ setLiked, touch }, e, "level", "多益中級");
    expect(setLiked).toHaveBeenCalledWith(e, true);
    expect(touch).not.toHaveBeenCalled();
  });
});

describe("normalizeExpand (1006-2 #10 — no more way to reach full off a row)", () => {
  it("sheet (iPhone drawer, #14) keeps every state as given", () => {
    expect(normalizeExpand("collapsed", true)).toBe("collapsed");
    expect(normalizeExpand("half", true)).toBe("half");
    expect(normalizeExpand("full", true)).toBe("full");
  });

  it("a non-sheet row collapses stale 'full' (e.g. a persisted expandState) down to 'half'", () => {
    expect(normalizeExpand("full", false)).toBe("half");
  });

  it("a non-sheet row otherwise passes its state through unchanged", () => {
    expect(normalizeExpand("collapsed", false)).toBe("collapsed");
    expect(normalizeExpand("half", false)).toBe("half");
  });
});

describe("levelTags (1006-2 #12 — read-only chips on the row)", () => {
  it("splits on commas and trims each tag", () => {
    expect(levelTags("多益中級, 托福高級")).toEqual(["多益中級", "托福高級"]);
  });

  it("drops empty tags from stray commas/whitespace", () => {
    expect(levelTags("多益中級,, ,  ")).toEqual(["多益中級"]);
  });

  it("empty or undefined level is no tags", () => {
    expect(levelTags("")).toEqual([]);
    expect(levelTags(undefined)).toEqual([]);
  });
});

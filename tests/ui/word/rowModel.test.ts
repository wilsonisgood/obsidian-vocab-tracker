import { describe, expect, it, vi } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import { commitEntryField, levelTags, normalizeExpand, rowLayout, viewToggleSpec } from "../../../src/ui/word/rowModel";

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

describe("normalizeExpand (1009 #1 — nothing can reach full any more, sheet or not)", () => {
  it("collapses a stale 'full' (e.g. a persisted expandState from before 1009) down to 'half'", () => {
    expect(normalizeExpand("full")).toBe("half");
  });

  it("otherwise passes the state through unchanged", () => {
    expect(normalizeExpand("collapsed")).toBe("collapsed");
    expect(normalizeExpand("half")).toBe("half");
  });
});

describe("rowLayout (1009 #1 — a row's variant only changes these three flags)", () => {
  it("a plain row: collapsible, with a chevron and a header toggle", () => {
    expect(rowLayout("row")).toEqual({ alwaysOpen: false, chevron: true, headerToggle: true });
  });

  it("defaults to the plain-row layout when no variant is given", () => {
    expect(rowLayout()).toEqual({ alwaysOpen: false, chevron: true, headerToggle: true });
  });

  it("the sheet: always open, no chevron, no header toggle", () => {
    expect(rowLayout("sheet")).toEqual({ alwaysOpen: true, chevron: false, headerToggle: false });
  });
});

describe("viewToggleSpec (規劃書 11 §1 — the footer's Info/AI switch)", () => {
  it("on the Info screen with no questions yet: sparkles → AI, no badge", () => {
    expect(viewToggleSpec("data", 0)).toEqual({ icon: "sparkles", label: "word.tab.ai", count: null });
  });

  it("on the Info screen with questions: the same, plus the live count", () => {
    expect(viewToggleSpec("data", 3)).toEqual({ icon: "sparkles", label: "word.tab.ai", count: 3 });
  });

  it("on the AI screen: book-open → Info, never a badge (count is ignored)", () => {
    expect(viewToggleSpec("ai", 0)).toEqual({ icon: "book-open", label: "word.tab.data", count: null });
    expect(viewToggleSpec("ai", 5)).toEqual({ icon: "book-open", label: "word.tab.data", count: null });
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

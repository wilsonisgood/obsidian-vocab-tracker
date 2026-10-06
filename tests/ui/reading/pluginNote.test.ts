import { describe, expect, it } from "vitest";
import { chromeState, pluginNoteKind } from "../../../src/ui/reading/pluginNote";

// 1005 回饋 #4 / 1006 #3+#4: which notes get 「屬性」 hidden and a
// duplicated title hidden — only the plugin's own, plus vocab-list.md
// judged separately since it carries no frontmatter.

const h = (heading: string, line: number, level = 1) => ({ heading, level, position: { start: { line } } });

describe("pluginNoteKind", () => {
  it("knows the plugin's notes by their frontmatter", () => {
    expect(pluginNoteKind({ "vocab-tracker": "entry", "vocab-tracker-id": "families" })).toBe("entry");
    expect(pluginNoteKind({ "vocab-tracker": "word", "vocab-tracker-id": 1721900000000 })).toBe("word");
    expect(pluginNoteKind({ "vocab-tracker": "ai-note", "vocab-tracker-id": "eng/x.md" })).toBe("ai-note");
  });

  it("leaves every other note alone", () => {
    expect(pluginNoteKind({ "vocab-tracker": "entry" })).toBeNull();
    expect(pluginNoteKind({ "vocab-tracker": "entry", "vocab-tracker-id": "  " })).toBeNull();
    expect(pluginNoteKind({ "vocab-tracker": "something", "vocab-tracker-id": "x" })).toBeNull();
    expect(pluginNoteKind({ tags: ["vocab"], favorites: true })).toBeNull();
    expect(pluginNoteKind(undefined)).toBeNull();
    expect(pluginNoteKind(null)).toBeNull();
  });
});

describe("chromeState", () => {
  const entry = { "vocab-tracker": "entry", "vocab-tracker-id": "families" };
  const fmEnd = { end: { line: 3 } };

  it("hides 「屬性」 on plugin notes only", () => {
    expect(chromeState({ frontmatter: { title: "my note" } }, "my note")).toEqual({
      pluginNote: false,
      hideInlineTitle: false,
      hideFirstHeading: false,
    });
    expect(chromeState(null, "x").pluginNote).toBe(false);
    expect(chromeState({ frontmatter: entry, frontmatterPosition: fmEnd }, "字族樹")).toEqual({
      pluginNote: true,
      hideInlineTitle: false,
      hideFirstHeading: false,
    });
  });

  it("hides the inline title only on an older entry file starting with 「# 字族樹」", () => {
    const old = { frontmatter: entry, frontmatterPosition: fmEnd, headings: [h("字族樹", 4)] };
    expect(chromeState(old, "字族樹").hideInlineTitle).toBe(true);
    // Renamed by the user: the heading no longer repeats the title.
    expect(chromeState(old, "我的字族").hideInlineTitle).toBe(false);
    // A word page with an H1 the user wrote: not an entry file.
    const word = { frontmatter: { "vocab-tracker": "word", "vocab-tracker-id": "1" }, frontmatterPosition: fmEnd, headings: [h("glittery", 4)] };
    expect(chromeState(word, "glittery")).toEqual({ pluginNote: true, hideInlineTitle: false, hideFirstHeading: false });
  });

  it("hides a vocab-list.md-style note's own H1 instead, never 「屬性」 (no frontmatter)", () => {
    const note = { headings: [h("Vocabulary List", 0)] };
    expect(chromeState(note, "vocab-list", true)).toEqual({
      pluginNote: false,
      hideInlineTitle: false,
      hideFirstHeading: true,
    });
    // No vocab-dashboard block found (yet, or ever): leave it alone.
    expect(chromeState(note, "vocab-list", false).hideFirstHeading).toBe(false);
    // The block is further down the file, past its own heading: nothing
    // at line 0 is an H1 that "opens" the file, so it's left alone even
    // though the block is there somewhere.
    const notFirst = { headings: [h("Dashboard", 40)] };
    expect(chromeState(notFirst, "journal", true).hideFirstHeading).toBe(false);
    // Known imprecision (documented in the wave report): a note whose own
    // H1 happens to sit at the very top AND which also embeds a
    // vocab-dashboard block further down (e.g. someone's personal
    // dashboard note) still matches — opensWithH1 only looks at the first
    // heading, not whether it's the dashboard's own title.
    const ownTitleThenDashboard = { headings: [h("My Journal", 0), h("Dashboard", 40)] };
    expect(chromeState(ownTitleThenDashboard, "journal", true).hideFirstHeading).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { chromeState, CollapseMemory, MAX_KEYS, pluginNoteKind } from "../../../src/ui/reading/pluginNote";

// 1005 回饋 #4: which notes get 「屬性」 tucked away and the inline title
// hidden — only the plugin's own.

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

  it("tucks 「屬性」 away on plugin notes only", () => {
    expect(chromeState({ frontmatter: { title: "my note" } }, "my note")).toEqual({
      pluginNote: false,
      hideInlineTitle: false,
      collapseKey: null,
    });
    expect(chromeState(null, "x").pluginNote).toBe(false);
    expect(chromeState({ frontmatter: entry, frontmatterPosition: fmEnd }, "字族樹")).toEqual({
      pluginNote: true,
      hideInlineTitle: false,
      collapseKey: "entry:families",
    });
  });

  it("hides the inline title only on an older entry file starting with 「# 字族樹」", () => {
    const old = { frontmatter: entry, frontmatterPosition: fmEnd, headings: [h("字族樹", 4)] };
    expect(chromeState(old, "字族樹").hideInlineTitle).toBe(true);
    // Renamed by the user: the heading no longer repeats the title.
    expect(chromeState(old, "我的字族").hideInlineTitle).toBe(false);
    // A word page with an H1 the user wrote: not an entry file.
    const word = { frontmatter: { "vocab-tracker": "word", "vocab-tracker-id": "1" }, frontmatterPosition: fmEnd, headings: [h("glittery", 4)] };
    expect(chromeState(word, "glittery")).toEqual({ pluginNote: true, hideInlineTitle: false, collapseKey: "word:1" });
  });
});

describe("CollapseMemory", () => {
  it("remembers folded notes, ignoring junk from storage", () => {
    const m = new CollapseMemory(["entry:families", 3, null]);
    expect(m.has("entry:families")).toBe(true);
    expect(m.has("word:1")).toBe(false);
    expect(m.add("word:1")).toEqual(["entry:families", "word:1"]);
    expect(m.add("word:1")).toEqual(["entry:families", "word:1"]);
    expect(new CollapseMemory("oops").has("x")).toBe(false);
  });

  it("keeps the newest keys only", () => {
    const m = new CollapseMemory(Array.from({ length: MAX_KEYS }, (_, i) => `k${i}`));
    const saved = m.add("new");
    expect(saved).toHaveLength(MAX_KEYS);
    expect(saved[0]).toBe("k1");
    expect(m.has("k0")).toBe(false);
    expect(m.has("new")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { planReveal, SectionState, SECTIONS_STORAGE_KEY, type LocalStore } from "../../../src/ui/sidebar/sections";

class MemoryStore implements LocalStore {
  data = new Map<string, unknown>();
  loadLocalStorage(key: string): unknown {
    return this.data.get(key) ?? null;
  }
  saveLocalStorage(key: string, value: unknown): void {
    this.data.set(key, value);
  }
}

describe("SectionState (1005 回饋 2; Wave 6 W: 段落討論 / 文法 added)", () => {
  it("starts with every section open", () => {
    const s = new SectionState(new MemoryStore());
    expect(s.isCollapsed("words")).toBe(false);
    expect(s.isCollapsed("paragraphs")).toBe(false);
    expect(s.isCollapsed("ai")).toBe(false);
    expect(s.isCollapsed("grammar")).toBe(false);
  });

  it("remembers folded sections in device-local storage", () => {
    const store = new MemoryStore();
    const s = new SectionState(store);
    s.toggle("ai");
    expect(store.data.get(SECTIONS_STORAGE_KEY)).toEqual(["ai"]);
    // Another sidebar on the same device reads it back.
    expect(new SectionState(store).isCollapsed("ai")).toBe(true);
    s.set("ai", false);
    expect(new SectionState(store).isCollapsed("ai")).toBe(false);
  });

  it("folds and remembers the two new sections the same way", () => {
    const store = new MemoryStore();
    const s = new SectionState(store);
    s.toggle("paragraphs");
    s.toggle("grammar");
    expect(store.data.get(SECTIONS_STORAGE_KEY)).toEqual(["paragraphs", "grammar"]);
    const again = new SectionState(store);
    expect(again.isCollapsed("paragraphs")).toBe(true);
    expect(again.isCollapsed("grammar")).toBe(true);
    expect(again.isCollapsed("words")).toBe(false);
    expect(again.isCollapsed("ai")).toBe(false);
  });

  it("tolerates a value saved by an older build (only words/ai existed)", () => {
    const store = new MemoryStore();
    store.data.set(SECTIONS_STORAGE_KEY, ["words", "ai"]);
    const s = new SectionState(store);
    expect(s.isCollapsed("words")).toBe(true);
    expect(s.isCollapsed("ai")).toBe(true);
    // The sections that didn't exist yet back then start open.
    expect(s.isCollapsed("paragraphs")).toBe(false);
    expect(s.isCollapsed("grammar")).toBe(false);
  });

  it("ignores junk and missing storage", () => {
    const store = new MemoryStore();
    store.data.set(SECTIONS_STORAGE_KEY, ["ai", "nope", 3]);
    expect(new SectionState(store).isCollapsed("ai")).toBe(true);
    store.data.set(SECTIONS_STORAGE_KEY, "words");
    expect(new SectionState(store).isCollapsed("words")).toBe(false);
    const none = new SectionState(null);
    none.toggle("words");
    expect(none.isCollapsed("words")).toBe(true);
  });

  it("keeps working when storage throws (older Obsidian)", () => {
    const broken: LocalStore = {
      loadLocalStorage: () => {
        throw new Error("no");
      },
      saveLocalStorage: () => {
        throw new Error("no");
      },
    };
    const s = new SectionState(broken);
    expect(() => s.toggle("words")).not.toThrow();
    expect(s.isCollapsed("words")).toBe(true);
  });
});

describe("planReveal (1005 回饋 3)", () => {
  const fromA = { source: { path: "A.md", line: 0 } };

  it("stays on This note when the word is from the note in front", () => {
    expect(planReveal({ filterMode: "note", activePath: "A.md", entry: fromA })).toEqual({ filterMode: "note", openGroup: null });
    // The default tab is This note.
    expect(planReveal({ filterMode: undefined, activePath: "A.md", entry: fromA })).toEqual({ filterMode: "note", openGroup: null });
  });

  it("switches to All and opens the word's group when it's from elsewhere", () => {
    expect(planReveal({ filterMode: "note", activePath: "B.md", entry: fromA })).toEqual({ filterMode: "all", openGroup: "note:A.md" });
    expect(planReveal({ filterMode: "note", activePath: "B.md", entry: { source: null, origin: "family:f1" } })).toEqual({
      filterMode: "all",
      openGroup: "family:f1",
    });
  });

  it("All stays All, with the group opened", () => {
    expect(planReveal({ filterMode: "all", activePath: "A.md", entry: fromA })).toEqual({ filterMode: "all", openGroup: "note:A.md" });
  });

  it("with no note in front, This note lists every word: nothing to switch", () => {
    expect(planReveal({ filterMode: "note", activePath: null, entry: { source: null } })).toEqual({ filterMode: "note", openGroup: null });
  });
});

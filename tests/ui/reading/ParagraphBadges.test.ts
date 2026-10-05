import { describe, expect, it, vi } from "vitest";

// Just enough of Obsidian for the badge renderer: MarkdownRenderChild keeps
// its register() callbacks so a test can "unload" a section.
vi.mock("obsidian", () => {
  class MarkdownRenderChild {
    cleanups: (() => void)[] = [];
    constructor(public containerEl: unknown) {}
    register(fn: () => void) {
      this.cleanups.push(fn);
    }
    unload() {
      for (const fn of this.cleanups) fn();
    }
  }
  return { MarkdownRenderChild, setIcon: () => undefined };
});

import type { MarkdownPostProcessorContext } from "obsidian";
import { TypedEmitter } from "../../../src/core/events";
import type { ParagraphIndexEvents } from "../../../src/services/anchors/ParagraphIndex";
import type { SectionRef } from "../../../src/services/anchors/ParagraphAnchorService";
import { ParagraphBadges, SectionLines, badgeState, isAnchorableTag } from "../../../src/ui/reading/ParagraphBadges";

// Minimal stand-in for Obsidian's HTMLElement helpers.
class FakeEl {
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  text = "";
  children: FakeEl[] = [];
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public tagName = "DIV", public cls = "") {
    if (cls) this.classes.add(cls);
  }
  get firstElementChild(): FakeEl | undefined {
    return this.children[0];
  }
  addClass(c: string) {
    this.classes.add(c);
  }
  toggleClass(c: string, on: boolean) {
    if (on) this.classes.add(c);
    else this.classes.delete(c);
  }
  createSpan(o: { cls?: string } = {}) {
    const el = new FakeEl("SPAN", o.cls);
    this.children.push(el);
    return el;
  }
  setAttr(k: string, v: string) {
    this.attrs[k] = v;
  }
  setText(t: string) {
    this.text = t;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  querySelector(sel: string): FakeEl | null {
    const cls = sel.replace(/^\./, "");
    for (const c of this.children) {
      if (c.classes.has(cls)) return c;
      const hit = c.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
  badge(): FakeEl | null {
    return this.children.find((c) => c.classes.has("vt-pbadge")) ?? null;
  }
}

const NOTE = "# Title\n\nFirst paragraph.\n\nSecond paragraph. ^vt-aaaaaa\n\n```\ncode\n```";

function section(tag: string, lineStart: number, lineEnd: number) {
  const el = new FakeEl();
  el.children.push(new FakeEl(tag));
  const children: { unload(): void }[] = [];
  const ctx = {
    sourcePath: "a.md",
    getSectionInfo: () => ({ text: NOTE, lineStart, lineEnd }),
    addChild: (c: { unload(): void }) => children.push(c),
  } as unknown as MarkdownPostProcessorContext;
  return { el, ctx, unload: () => children.forEach((c) => c.unload()) };
}

function setup(counts: Record<string, number> = {}, showGhost = true) {
  const events = new TypedEmitter<ParagraphIndexEvents>();
  const index = { events, count: vi.fn((_path: string, text: string) => counts[text] ?? 0) };
  const opened: SectionRef[] = [];
  const badges = new ParagraphBadges({ index, onOpen: (r) => opened.push(r), showGhost: () => showGhost });
  badges.attach();
  return { badges, index, events, opened, counts };
}

describe("ParagraphBadges", () => {
  it("badges a discussed paragraph with its count, beside the text", () => {
    const { badges } = setup({ "Second paragraph. ^vt-aaaaaa": 2 });
    const s = section("P", 4, 4);
    badges.process(s.el as unknown as HTMLElement, s.ctx);
    const badge = s.el.badge();
    expect(badge?.classes.has("has-count")).toBe(true);
    expect(badge?.querySelector(".vt-pbadge-count")?.text).toBe("2");
    // Appended to the section element, not into the <p>.
    expect(s.el.children[0].tagName).toBe("P");
    expect(s.el.children[0].children).toEqual([]);
    expect(s.el.classes.has("vt-pbadge-host")).toBe(true);
  });

  it("gives other paragraphs a hover-only ghost, quiet when AI is off", () => {
    const on = setup({}, true);
    const a = section("UL", 2, 2);
    on.badges.process(a.el as unknown as HTMLElement, a.ctx);
    expect(a.el.badge()?.classes.has("is-ghost")).toBe(true);
    expect(a.el.badge()?.classes.has("is-quiet")).toBe(false);

    const off = setup({}, false);
    const b = section("BLOCKQUOTE", 2, 2);
    off.badges.process(b.el as unknown as HTMLElement, b.ctx);
    expect(b.el.badge()?.classes.has("is-quiet")).toBe(true);
  });

  it("skips headings, code, callouts and sections without info", () => {
    const { badges } = setup();
    for (const tag of ["H1", "PRE", "DIV", "TABLE"]) {
      const s = section(tag, 0, 0);
      badges.process(s.el as unknown as HTMLElement, s.ctx);
      expect(s.el.badge()).toBeNull();
    }
    const s = section("P", 2, 2);
    (s.ctx as unknown as { getSectionInfo: () => null }).getSectionInfo = () => null;
    badges.process(s.el as unknown as HTMLElement, s.ctx);
    expect(s.el.badge()).toBeNull();
  });

  it("opens the section it belongs to and keeps the click from reaching the page", () => {
    const { badges, opened } = setup();
    const s = section("P", 2, 2);
    badges.process(s.el as unknown as HTMLElement, s.ctx);
    const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    s.el.badge()?.listeners.click[0](e);
    expect(opened).toEqual([{ path: "a.md", lineStart: 2, lineEnd: 2, text: "First paragraph." }]);
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("updates live badges in place when the index changes, until unloaded", () => {
    const { badges, events, counts } = setup();
    const s = section("P", 2, 2);
    badges.process(s.el as unknown as HTMLElement, s.ctx);
    expect(s.el.badge()?.classes.has("is-ghost")).toBe(true);

    counts["First paragraph."] = 1;
    events.emit("paragraph-index:change", { paths: ["other.md"] });
    expect(s.el.badge()?.classes.has("is-ghost")).toBe(true);
    events.emit("paragraph-index:change", { paths: ["a.md"] });
    expect(s.el.badge()?.classes.has("has-count")).toBe(true);
    expect(s.el.children.filter((c) => c.classes.has("vt-pbadge"))).toHaveLength(1);

    s.unload();
    counts["First paragraph."] = 5;
    events.emit("paragraph-index:change", { paths: ["a.md"] });
    expect(s.el.badge()?.querySelector(".vt-pbadge-count")?.text).toBe("1");
  });
});

describe("helpers", () => {
  it("accepts paragraphs, lists and quotes only", () => {
    expect(["P", "ul", "OL", "BLOCKQUOTE"].every(isAnchorableTag)).toBe(true);
    expect(["H2", "PRE", "DIV", "TABLE", undefined].some(isAnchorableTag)).toBe(false);
  });

  it("slices a section's lines, splitting each note once", () => {
    const lines = new SectionLines();
    const split = vi.spyOn(String.prototype, "split");
    expect(lines.slice({ text: NOTE, lineStart: 2, lineEnd: 2 })).toBe("First paragraph.");
    expect(lines.slice({ text: NOTE, lineStart: 6, lineEnd: 8 })).toBe("```\ncode\n```");
    expect(split).toHaveBeenCalledTimes(1);
    split.mockRestore();
    expect(lines.slice({ text: "a\r\nb", lineStart: 1, lineEnd: 1 })).toBe("b");
  });

  it("picks count, ghost or quiet ghost", () => {
    expect(badgeState(3, false)).toEqual({ kind: "count", count: 3 });
    expect(badgeState(0, true)).toEqual({ kind: "ghost", quiet: false });
    expect(badgeState(0, false)).toEqual({ kind: "ghost", quiet: true });
  });
});

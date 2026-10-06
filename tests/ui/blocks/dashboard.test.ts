import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import type { Component } from "../../perf/support/obsidian";
import { isListed, type IsListedContext } from "../../../src/core/model/like";
import { resolveWordlistSettings, tagEnabled } from "../../../src/core/model/wordlists";
import type { VocabEntry } from "../../../src/core/model/entry";
import { buildStressFixture } from "../../fixtures/stress";
import type { FakeElement } from "../../perf/support/dom";
import { bootPlugin, type Booted } from "../../perf/support/harness";

// vocab-dashboard (1006report.md #26): same isListed filter as the
// sidebar (#7), plus a 「只看 Like」 switch, with the stats bar following
// whatever's filtered in.

const fx = buildStressFixture();
let b: Booted;

beforeAll(async () => {
  b = await bootPlugin(fx);
});
afterAll(async () => {
  await b?.unload();
});

function isListedCtx(): IsListedContext {
  const knownTags = b.plugin.wordlists.index.tags;
  return {
    knownTags,
    isTagOn: (tag) => tagEnabled(resolveWordlistSettings(b.plugin.store.settings.wordlists), tag),
  };
}

function listedEntries(): VocabEntry[] {
  const ctx = isListedCtx();
  return b.plugin.store.entries.filter((e) => isListed(e, ctx));
}

// Renders the vocab-dashboard code block the way reading view would, with
// a minimal MarkdownPostProcessorContext (same shape harness.ts's
// renderNote() builds for other blocks).
function render(): FakeElement {
  const el = (globalThis as unknown as { createDiv(): FakeElement }).createDiv();
  const children: Component[] = [];
  const ctx = {
    docId: "doc",
    sourcePath: "vocab-list.md",
    frontmatter: undefined,
    getSectionInfo: () => null,
    addChild: (child: Component) => {
      child.load();
      children.push(child);
    },
    children,
  };
  const render = b.host.codeBlocks.get("vocab-dashboard");
  if (!render) throw new Error("vocab-dashboard block isn't registered");
  render("", el as unknown as HTMLElement, ctx);
  return el;
}

describe("vocab-dashboard (1006report.md #26)", () => {
  it("lists only isListed entries (亮著的考試標籤，或 like 過)", () => {
    const expected = listedEntries();
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(b.plugin.store.entries.length);
    const el = render();
    const rows = el.querySelectorAll(".vt-row");
    expect(rows.length).toBe(expected.length);
    expect(new Set(rows.map((r) => r.getAttribute("data-entry-id")))).toEqual(new Set(expected.map((e) => e.id)));
  });

  it("the stats bar's word count follows the filtered set, not the raw library", () => {
    const expected = listedEntries();
    const el = render();
    const pill = el.querySelector(".vt-stat-pill")!;
    expect(pill.textContent).toContain(String(expected.length));
  });

  it("「只看 Like」 narrows the list to liked === true", () => {
    const likedIds = new Set(listedEntries().slice(0, 3).map((e) => e.id));
    for (const id of likedIds) b.plugin.store.entries.find((e) => e.id === id)!.liked = true;
    try {
      const el = render();
      expect(el.querySelector(".vt-dash-like-toggle")!.getAttribute("aria-pressed")).toBe("false");
      // drawStats() rebuilds the toggle on every click, so re-query rather
      // than reuse the (now detached) element clicked.
      el.querySelector(".vt-dash-like-toggle")!.click();
      expect(el.querySelector(".vt-dash-like-toggle")!.getAttribute("aria-pressed")).toBe("true");
      const rows = el.querySelectorAll(".vt-row");
      expect(rows.length).toBe(likedIds.size);
      expect(rows.every((r) => likedIds.has(r.getAttribute("data-entry-id")!))).toBe(true);
    } finally {
      for (const id of likedIds) b.plugin.store.entries.find((e) => e.id === id)!.liked = undefined;
    }
  });
});

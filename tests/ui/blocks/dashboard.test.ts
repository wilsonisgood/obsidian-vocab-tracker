import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import type { Component } from "../../perf/support/obsidian";
import { isListed, type IsListedContext } from "../../../src/core/model/like";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../../src/core/model/wordlists";
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
    likeOn: likeChipOn(resolveWordlistSettings(b.plugin.store.settings.wordlists)),
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

  // 1006-2 #6: the dashboard-local 「只看 Like」 switch is gone — the Like
  // chip (part of the same shared chip row the sidebar uses, #5) does its
  // job now, through the shared WordlistSettings.likeEnabled setting. This
  // only checks the wiring (click → setting → re-filtered render) — the
  // filter's own logic (liked-but-no-tag hidden, tag-driven words kept) is
  // isListed()'s job and is covered by tests/core/model/like.test.ts.
  it("the shared Like chip narrows the list via isListed's likeOn (replaces 1006 #26's 「只看 Like」)", () => {
    const likeEnabledBefore = b.plugin.store.settings.wordlists?.likeEnabled;
    try {
      const before = render();
      expect(before.querySelector(".vt-exam-chip-like")!.classList.contains("is-off")).toBe(false);
      before.querySelector(".vt-exam-chip-like")!.click();
      // Clicking writes WordlistSettings.likeEnabled synchronously (same
      // tick); in real Obsidian, the resulting rerenderReadingViews() is
      // what re-runs this code block — this harness has no workspace
      // leaves to rerender, so a fresh render() stands in for that.
      const after = render();
      expect(after.querySelector(".vt-exam-chip-like")!.classList.contains("is-off")).toBe(true);
      const expected = b.plugin.store.entries.filter((e) => isListed(e, isListedCtx()));
      expect(expected.length).toBeGreaterThan(0);
      expect(expected.length).toBeLessThan(b.plugin.store.entries.length);
      const rows = after.querySelectorAll(".vt-row");
      expect(new Set(rows.map((r) => r.getAttribute("data-entry-id")))).toEqual(new Set(expected.map((e) => e.id)));
    } finally {
      restoreLikeEnabled(likeEnabledBefore);
    }
  });
});

// Undoes the chip's setting write so later tests (in this file or any
// other sharing this plugin instance) see the same default they started
// with — updateWordlistSettings() is async overall, but the mutation
// itself lands synchronously (VocabStore.updateSettings mutates before
// its first await), so a bare call (not awaited) already restores it in
// time for the next synchronous `render()`.
function restoreLikeEnabled(likeEnabled: boolean | undefined): void {
  void b.plugin.updateWordlistSettings({ likeEnabled: likeEnabled ?? true });
}

import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ setTooltip: () => undefined }));

import type { VocabEntry } from "../../../src/core/model/entry";
import { VocabHighlighter } from "../../../src/ui/reading/vocabHighlight";

function setup() {
  const state = { entries: [{ word: "analyze" }] as VocabEntry[], enabled: true, inflections: true };
  const rerender = vi.fn();
  const h = new VocabHighlighter({
    entries: () => state.entries,
    enabled: () => state.enabled,
    inflections: () => state.inflections,
    rerender,
  });
  return { state, rerender, h };
}

describe("VocabHighlighter.refresh", () => {
  it("doesn't re-render on the first build", () => {
    const { h, rerender } = setup();
    h.refresh();
    expect(rerender).not.toHaveBeenCalled();
  });

  it("re-renders only when the highlighted words change", () => {
    const { h, rerender, state } = setup();
    h.refresh();
    // A review or a like: same words.
    state.entries = [{ word: "analyze", reviews: 3 } as VocabEntry];
    h.refresh();
    expect(rerender).not.toHaveBeenCalled();

    state.entries = [...state.entries, { word: "resilient" } as VocabEntry];
    h.refresh();
    expect(rerender).toHaveBeenCalledTimes(1);

    state.entries = [{ word: "analyze" }, { word: "resilient", deletedAt: "2026-10-25T00:00:00.000Z" }] as VocabEntry[];
    h.refresh();
    expect(rerender).toHaveBeenCalledTimes(2);
  });

  it("re-renders when the setting or inflection matching changes", () => {
    const { h, rerender, state } = setup();
    h.refresh();
    state.enabled = false;
    h.refresh();
    state.enabled = true;
    state.inflections = false;
    h.refresh();
    expect(rerender).toHaveBeenCalledTimes(2);
  });
});

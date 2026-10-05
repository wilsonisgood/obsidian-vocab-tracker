import { describe, expect, it, vi } from "vitest";
import type { FormFactor } from "../../../src/ui/mobile/formFactor";
import { LivePreviewHint, isLivePreviewText, type HintAction } from "../../../src/ui/mobile/livePreviewHint";

// A tap target described by which selectors its ancestors match.
const target = (...matches: string[]) => ({
  closest: (sel: string) => (matches.includes(sel) ? {} : null),
});
const LP_TEXT = ".markdown-source-view.is-live-preview .cm-content";

describe("isLivePreviewText", () => {
  it("is the editable text of a Live Preview editor", () => {
    expect(isLivePreviewText(target(LP_TEXT))).toBe(true);
  });

  it("not source mode / reading view", () => {
    expect(isLivePreviewText(target())).toBe(false);
  });

  it("not rendered blocks inside Live Preview (they already react to taps)", () => {
    expect(isLivePreviewText(target(LP_TEXT, ".markdown-rendered, .cm-embed-block, .cm-widgetBuffer, a, button, input, textarea"))).toBe(false);
  });
});

function setup(opts: { form?: FormFactor; enabled?: boolean } = {}) {
  const notes: { text: string; actions: HintAction[] }[] = [];
  const deps = {
    form: () => opts.form ?? "phone",
    enabled: () => opts.enabled ?? true,
    notify: (text: string, actions: HintAction[]) => notes.push({ text, actions }),
    switchToReading: vi.fn(),
    disable: vi.fn(),
  };
  return { hint: new LivePreviewHint(deps), deps, notes };
}

describe("LivePreviewHint", () => {
  it("shows once per session on mobile, when a word was tapped", () => {
    const { hint, notes } = setup();
    expect(hint.maybeShow(target(LP_TEXT), () => true)).toBe(true);
    expect(hint.maybeShow(target(LP_TEXT), () => true)).toBe(false);
    expect(notes).toHaveLength(1);
    expect(notes[0].actions).toHaveLength(2);
  });

  it("not for a tap that isn't on a word", () => {
    const { hint, notes } = setup();
    expect(hint.maybeShow(target(LP_TEXT), () => false)).toBe(false);
    expect(hint.maybeShow(target(LP_TEXT), () => true)).toBe(true);
    expect(notes).toHaveLength(1);
  });

  it("not on desktop, not when turned off, not outside Live Preview", () => {
    const hasWord = vi.fn(() => true);
    expect(setup({ form: "desktop" }).hint.maybeShow(target(LP_TEXT), hasWord)).toBe(false);
    expect(setup({ enabled: false }).hint.maybeShow(target(LP_TEXT), hasWord)).toBe(false);
    expect(setup().hint.maybeShow(target(), hasWord)).toBe(false);
    // The caret lookup is only done when everything else said yes.
    expect(hasWord).not.toHaveBeenCalled();
  });

  it("shows on iPad too", () => {
    expect(setup({ form: "tablet" }).hint.maybeShow(target(LP_TEXT), () => true)).toBe(true);
  });

  it("its buttons switch to reading view / turn the hint off", () => {
    const { hint, deps, notes } = setup();
    hint.maybeShow(target(LP_TEXT), () => true);
    notes[0].actions[0].run();
    expect(deps.switchToReading).toHaveBeenCalled();
    notes[0].actions[1].run();
    expect(deps.disable).toHaveBeenCalled();
  });
});

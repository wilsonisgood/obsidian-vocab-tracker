import { describe, expect, it } from "vitest";
import { likeChipOn, resolveWordlistSettings } from "../../../src/core/model/wordlists";

// Wave 8 S (1006-2 #4, #5): the Like chip's own setting — same default-on,
// explicit-false-to-turn-off semantics as a tag's `enabled`.
describe("resolveWordlistSettings — likeEnabled default (1006-2 #4)", () => {
  it("defaults to true when nothing was ever saved (undefined partial)", () => {
    expect(resolveWordlistSettings(undefined).likeEnabled).toBe(true);
  });

  it("defaults to true when the partial has no likeEnabled field", () => {
    expect(resolveWordlistSettings({ folder: "x" }).likeEnabled).toBe(true);
  });

  it("keeps an explicit false", () => {
    expect(resolveWordlistSettings({ likeEnabled: false }).likeEnabled).toBe(false);
  });

  it("keeps an explicit true", () => {
    expect(resolveWordlistSettings({ likeEnabled: true }).likeEnabled).toBe(true);
  });
});

describe("likeChipOn", () => {
  it("is on when likeEnabled is true", () => {
    expect(likeChipOn(resolveWordlistSettings({ likeEnabled: true }))).toBe(true);
  });

  it("is on by default (likeEnabled absent)", () => {
    expect(likeChipOn(resolveWordlistSettings(undefined))).toBe(true);
  });

  it("is off when likeEnabled is explicitly false", () => {
    expect(likeChipOn(resolveWordlistSettings({ likeEnabled: false }))).toBe(false);
  });
});

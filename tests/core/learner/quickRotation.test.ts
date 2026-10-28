import { describe, expect, it } from "vitest";
import { rotationPaused, rotationWindow } from "../../../src/core/learner/quickRotation";

const pool = ["grammar", "writing", "review", "level", "reading", "plan"];

describe("rotationWindow", () => {
  it("shows two at a time and cycles through the pool", () => {
    expect(rotationWindow(pool, 0)).toEqual(["grammar", "writing"]);
    expect(rotationWindow(pool, 1)).toEqual(["review", "level"]);
    expect(rotationWindow(pool, 2)).toEqual(["reading", "plan"]);
    expect(rotationWindow(pool, 3)).toEqual(["grammar", "writing"]);
  });
  it("wraps an odd pool and handles tiny pools", () => {
    expect(rotationWindow(["a", "b", "c"], 1)).toEqual(["c", "a"]);
    expect(rotationWindow(["a"], 5)).toEqual(["a"]);
    expect(rotationWindow([], 0)).toEqual([]);
  });
  it("pauses on hover or composer focus", () => {
    expect(rotationPaused({ hovering: false, composerFocused: false })).toBe(false);
    expect(rotationPaused({ hovering: true, composerFocused: false })).toBe(true);
    expect(rotationPaused({ hovering: false, composerFocused: true })).toBe(true);
  });
});

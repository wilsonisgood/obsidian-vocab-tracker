import { describe, expect, it } from "vitest";
import { foldsRevealing, hidesLine } from "../../../src/core/text/folds";

describe("folds (1030 #5 unfold before locating a word)", () => {
  it("a fold hides the lines under its heading, not the heading itself", () => {
    const f = { from: 4, to: 9 };
    expect(hidesLine(f, 4)).toBe(false);
    expect(hidesLine(f, 5)).toBe(true);
    expect(hidesLine(f, 9)).toBe(true);
    expect(hidesLine(f, 10)).toBe(false);
  });

  it("drops every fold covering the line (nested headings too) and keeps the rest", () => {
    const folds = [
      { from: 2, to: 20 },
      { from: 6, to: 12 },
      { from: 22, to: 30 },
    ];
    expect(foldsRevealing(folds, 8)).toEqual([{ from: 22, to: 30 }]);
  });

  it("returns null when nothing hides the line", () => {
    expect(foldsRevealing([{ from: 2, to: 5 }], 8)).toBeNull();
    expect(foldsRevealing([], 0)).toBeNull();
  });
});

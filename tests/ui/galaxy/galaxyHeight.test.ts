import { describe, expect, it } from "vitest";
import { galaxyFillHeight } from "../../../src/ui/galaxy/galaxyHeight";

describe("galaxyFillHeight", () => {
  it("fills from graph top to viewport bottom", () => {
    expect(galaxyFillHeight(900, 200)).toBe(700);
  });
  it("floors at 400", () => {
    expect(galaxyFillHeight(500, 200)).toBe(400);
    expect(galaxyFillHeight(600, 200)).toBe(400);
  });
  it("handles zero / negative / NaN", () => {
    expect(galaxyFillHeight(0, 0)).toBe(400);
    expect(galaxyFillHeight(-50, 100)).toBe(400);
    expect(galaxyFillHeight(500, -100)).toBe(600);
    expect(galaxyFillHeight(NaN, 10)).toBe(400);
  });
  it("custom min", () => {
    expect(galaxyFillHeight(300, 200, 150)).toBe(150);
  });
});

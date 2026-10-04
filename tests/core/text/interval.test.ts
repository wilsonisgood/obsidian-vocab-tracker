import { describe, expect, it } from "vitest";
import { splitInterval } from "../../../src/core/text/interval";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe("splitInterval", () => {
  it("picks the coarsest sensible unit", () => {
    expect(splitInterval(MIN)).toEqual({ value: 1, unit: "m" });
    expect(splitInterval(10 * MIN)).toEqual({ value: 10, unit: "m" });
    expect(splitInterval(3 * 60 * MIN)).toEqual({ value: 3, unit: "h" });
    expect(splitInterval(3 * DAY)).toEqual({ value: 3, unit: "d" });
    expect(splitInterval(60 * DAY)).toEqual({ value: 2, unit: "mo" });
    expect(splitInterval(730 * DAY)).toEqual({ value: 2, unit: "y" });
  });

  it("never shows zero", () => {
    expect(splitInterval(0)).toEqual({ value: 1, unit: "m" });
    expect(splitInterval(20_000)).toEqual({ value: 1, unit: "m" });
  });
});

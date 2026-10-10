import { describe, expect, it } from "vitest";
import { definitionClamp } from "../../../src/ui/word/definitionClamp";

describe("definitionClamp", () => {
  it("one line", () => {
    expect(definitionClamp(20, 20)).toEqual({ lines: 1, truncated: false });
  });
  it("exactly two lines", () => {
    expect(definitionClamp(40, 20)).toEqual({ lines: 2, truncated: false });
  });
  it("more than two lines is truncated", () => {
    expect(definitionClamp(61, 20)).toEqual({ lines: 2, truncated: true });
  });
  it("zero line height is safe", () => {
    expect(definitionClamp(100, 0)).toEqual({ lines: 1, truncated: false });
  });
});

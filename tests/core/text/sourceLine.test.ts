import { describe, expect, it } from "vitest";
import { findSourceLine } from "../../../src/core/text/sourceLine";

describe("findSourceLine", () => {
  it("returns -1 when the word isn't found", () => {
    expect(findSourceLine("no match here", "cat")).toBe(-1);
  });

  it("returns the only matching line when there's one candidate", () => {
    const content = ["line one", "a cat sat", "line three"].join("\n");
    expect(findSourceLine(content, "cat")).toBe(1);
  });

  it("does not match substrings of other words", () => {
    const content = ["concatenate", "a cat sat"].join("\n");
    expect(findSourceLine(content, "cat")).toBe(1);
  });

  it("picks the candidate line that best overlaps the clicked sentence", () => {
    const content = ["the cat sat on the mat", "a cat flew to the moon"].join("\n");
    expect(findSourceLine(content, "cat", "a cat flew to the moon")).toBe(1);
  });

  it("falls back to the first candidate when no sentence is given", () => {
    const content = ["the cat sat", "a cat flew"].join("\n");
    expect(findSourceLine(content, "cat")).toBe(0);
  });
});

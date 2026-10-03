import { describe, expect, it } from "vitest";
import { buildWordRe, escapeRe } from "../../../src/core/text/wordRe";

describe("escapeRe", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRe("a.b*c")).toBe("a\\.b\\*c");
  });
});

describe("buildWordRe", () => {
  it("matches the whole word, case-insensitively", () => {
    const re = buildWordRe("cat");
    expect("The Cat sat.".match(re)).toEqual(["Cat"]);
  });

  it("does not match inside a longer word", () => {
    const re = buildWordRe("cat");
    expect("concatenate".match(re)).toBeNull();
  });

  it("does not match a word already highlighted", () => {
    const re = buildWordRe("cat");
    expect("==cat==".match(re)).toBeNull();
  });

  it("matches multiple occurrences (global flag)", () => {
    const re = buildWordRe("cat");
    expect("cat and cat".match(re)).toEqual(["cat", "cat"]);
  });
});

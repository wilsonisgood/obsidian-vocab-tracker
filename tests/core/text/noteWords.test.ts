import { describe, expect, it } from "vitest";
import { noteHasWord } from "../../../src/core/text/noteWords";

describe("noteHasWord (1006report.md #6)", () => {
  it("finds the word as written", () => {
    expect(noteHasWord("The quick fox jumps.", "fox", true)).toBe(true);
    expect(noteHasWord("The quick fox jumps.", "dog", true)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(noteHasWord("ANALYZE this.", "analyze", true)).toBe(true);
  });

  it("matches an inflected form when inflections is on", () => {
    expect(noteHasWord("She analyzed the data.", "analyze", true)).toBe(true);
    expect(noteHasWord("He walked home.", "walk", true)).toBe(true);
  });

  it("requires an exact match when inflections is off", () => {
    expect(noteHasWord("She analyzed the data.", "analyze", false)).toBe(false);
    expect(noteHasWord("She will analyze the data.", "analyze", false)).toBe(true);
  });

  it("ignores frontmatter, code fences and link targets (same scope as proseLines)", () => {
    const md = [
      "---",
      "tag: analyze",
      "---",
      "```",
      "const analyze = 1;",
      "```",
      "See [[analyze|that word]] in prose.",
    ].join("\n");
    // The word only really appears as an alias ("that word"), never as
    // prose text — frontmatter/code must not count.
    expect(noteHasWord(md, "analyze", true)).toBe(false);
  });

  it("empty word never matches", () => {
    expect(noteHasWord("anything at all", "", true)).toBe(false);
  });
});

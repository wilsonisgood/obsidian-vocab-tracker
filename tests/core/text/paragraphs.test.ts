import { describe, expect, it } from "vitest";
import { paragraphAtLine, plainParagraph, splitParagraphSpans } from "../../../src/core/text/paragraphs";

const NOTE = [
  "---", // 0
  "tags: [eng]", // 1
  "---", // 2
  "# Title", // 3
  "", // 4
  "Last time I was in a stadium this size,", // 5
  "I was wearing a ==glittery== leotard. ^vt-abc123", // 6
  "", // 7
  "```", // 8
  "code", // 9
  "", // 10
  "more", // 11
  "```", // 12
  "", // 13
  "Final line.", // 14
].join("\n");

describe("splitParagraphSpans", () => {
  it("keeps original line numbers, skipping frontmatter and keeping fences whole", () => {
    expect(splitParagraphSpans(NOTE).map((p) => [p.lineStart, p.lineEnd])).toEqual([
      [3, 3],
      [5, 6],
      [8, 12],
      [14, 14],
    ]);
  });
});

describe("paragraphAtLine", () => {
  it("finds the paragraph and its 0-based index", () => {
    expect(paragraphAtLine(NOTE, 6)).toEqual({ index: 1, text: NOTE.split("\n").slice(5, 7).join("\n") });
    expect(paragraphAtLine(NOTE, 14)?.index).toBe(3);
  });

  it("returns null for blank lines, frontmatter and out-of-range lines", () => {
    expect(paragraphAtLine(NOTE, 4)).toBeNull();
    expect(paragraphAtLine(NOTE, 1)).toBeNull();
    expect(paragraphAtLine(NOTE, 99)).toBeNull();
  });
});

describe("plainParagraph", () => {
  it("drops highlight marks and a trailing block id", () => {
    expect(plainParagraph("I was wearing a ==glittery== leotard. ^vt-abc123")).toBe("I was wearing a glittery leotard.");
  });
});

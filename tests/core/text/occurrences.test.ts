import { describe, expect, it } from "vitest";
import {
  findOccurrences,
  nearestOccurrenceIndex,
  nextOccurrenceIndex,
  occurrenceIndexInLine,
} from "../../../src/core/text/occurrences";

describe("findOccurrences (1006-2 #7 #8 #9)", () => {
  it("finds the word as written, with line/ch/length", () => {
    const occ = findOccurrences("The quick fox jumps.", "fox", true);
    expect(occ).toEqual([{ line: 0, ch: 10, length: 3 }]);
  });

  it("is case-insensitive", () => {
    expect(findOccurrences("ANALYZE this.", "analyze", true)).toHaveLength(1);
  });

  it("matches inflected forms when inflections is on, recording the inflected length", () => {
    const occ = findOccurrences("She analyzed the data.", "analyze", true);
    expect(occ).toEqual([{ line: 0, ch: 4, length: 8 }]); // "analyzed".length === 8
  });

  it("requires an exact match when inflections is off", () => {
    expect(findOccurrences("She analyzed the data.", "analyze", false)).toHaveLength(0);
    expect(findOccurrences("She will analyze the data.", "analyze", false)).toHaveLength(1);
  });

  it("finds multiple occurrences on the same line, in order", () => {
    const occ = findOccurrences("fox and fox and fox", "fox", true);
    expect(occ.map((o) => o.ch)).toEqual([0, 8, 16]);
  });

  it("finds occurrences across multiple lines, keeping original line numbers", () => {
    const md = ["no match here", "a fox", "another fox here"].join("\n");
    const occ = findOccurrences(md, "fox", true);
    expect(occ.map((o) => o.line)).toEqual([1, 2]);
  });

  it("ignores frontmatter, code fences and link targets (same scope as proseLines)", () => {
    const md = ["---", "tag: analyze", "---", "```", "const analyze = 1;", "```", "See [[analyze|that word]] in prose."].join(
      "\n"
    );
    // The word only really appears as an alias ("that word"), never as prose.
    expect(findOccurrences(md, "analyze", true)).toHaveLength(0);
  });

  it("empty word never matches", () => {
    expect(findOccurrences("anything at all", "", true)).toHaveLength(0);
  });
});

describe("nextOccurrenceIndex (1006-2 #7 cycle)", () => {
  it("advances by one", () => {
    expect(nextOccurrenceIndex(0, 3)).toBe(1);
    expect(nextOccurrenceIndex(1, 3)).toBe(2);
  });

  it("wraps around to the start", () => {
    expect(nextOccurrenceIndex(2, 3)).toBe(0);
  });

  it("returns -1 when there's nothing to cycle through", () => {
    expect(nextOccurrenceIndex(0, 0)).toBe(-1);
  });
});

describe("nearestOccurrenceIndex (1006-2 #16)", () => {
  it("picks the occurrence whose line is closest", () => {
    const occ = [{ line: 1 }, { line: 10 }, { line: 20 }];
    expect(nearestOccurrenceIndex(occ, 12)).toBe(1);
    expect(nearestOccurrenceIndex(occ, 0)).toBe(0);
    expect(nearestOccurrenceIndex(occ, 25)).toBe(2);
  });

  it("breaks ties by picking the earlier occurrence", () => {
    const occ = [{ line: 5 }, { line: 15 }];
    expect(nearestOccurrenceIndex(occ, 10)).toBe(0);
  });

  it("returns -1 for an empty list", () => {
    expect(nearestOccurrenceIndex([], 5)).toBe(-1);
  });
});

describe("occurrenceIndexInLine (1006-2 #8 same-line DOM lookup)", () => {
  it("counts prior occurrences on the same line", () => {
    const occ = findOccurrences("fox and fox and fox", "fox", true);
    expect(occ.map((_, i) => occurrenceIndexInLine(occ, i))).toEqual([0, 1, 2]);
  });

  it("resets per line", () => {
    const md = ["fox fox", "fox"].join("\n");
    const occ = findOccurrences(md, "fox", true);
    expect(occ.map((_, i) => occurrenceIndexInLine(occ, i))).toEqual([0, 1, 0]);
  });
});

import { describe, expect, it } from "vitest";
import { headingContext, localDayOf, mergeReading, normalizePickKey, readingCutoffDay, readingId } from "../../../src/core/learner/reading";

const doc = ["---", "# not a heading", "---", "# Title", "intro", "## A", "a1", "### A.1", "a11", "```", "## fake", "```", "## B", "b1"].join("\n");

describe("headingContext", () => {
  it("uses the first H1 as title and ignores frontmatter / fences", () => {
    expect(headingContext(doc, 4)).toEqual({ title: "Title" });
    expect(headingContext(doc, 6)).toEqual({ title: "Title", heading: "A" });
    expect(headingContext(doc, 11)).toEqual({ title: "Title", heading: "A.1" });
    expect(headingContext(doc, 13)).toEqual({ title: "Title", heading: "B" });
  });
  it("falls back to the file name and handles null line", () => {
    expect(headingContext("## X\ntext", 1, "note")).toEqual({ title: "note", heading: "X" });
    expect(headingContext("## X\ntext", null, "note")).toEqual({ title: "note" });
  });
  it("picks the nearer of H2 and H3", () => {
    expect(headingContext("## A\n### B\nx\n## C\ny", 2).heading).toBe("B");
    expect(headingContext("### B\n## C\ny", 2).heading).toBe("C");
  });
});

describe("helpers", () => {
  it("ids, keys and dates", () => {
    expect(readingId("2026-10-16", "a.md", "H")).toBe("2026-10-16|a.md|H");
    expect(readingId("2026-10-16", "a.md")).toBe("2026-10-16|a.md|");
    expect(normalizePickKey("  Lincoln|Don't  Panic!! ")).toBe("lincoln|don t panic");
    expect(localDayOf(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(readingCutoffDay(new Date(2026, 9, 16, 12).getTime())).toBe("2026-07-18");
  });
  it("merges same-id visits", () => {
    const v = (at: string, updatedAt: string, kinds: ("word" | "add")[]) => ({ id: "i", day: "d", at, updatedAt, path: "p", title: "t", kinds });
    const m = mergeReading([v("2026-10-16T02:00:00Z", "2026-10-16T03:00:00Z", ["word"])], [v("2026-10-16T01:00:00Z", "2026-10-16T05:00:00Z", ["add"])]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ at: "2026-10-16T01:00:00Z", updatedAt: "2026-10-16T05:00:00Z", kinds: ["word", "add"] });
  });
});

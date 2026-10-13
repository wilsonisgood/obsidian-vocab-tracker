import { describe, expect, it } from "vitest";
import { POLY_WORDS } from "../../../src/core/poly/catalog";
import { filterPolyWords, practiceFilterFor, wordProgress } from "../../../src/ui/blocks/polysemyMapModel";

describe("polysemy map model", () => {
  it("category filter", () => {
    expect(filterPolyWords("all", "")).toHaveLength(POLY_WORDS.length);
    const a = filterPolyWords("A", "");
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((w) => w.category === "A")).toBe(true);
  });
  it("search by word (case-insensitive) or Chinese meaning, combined with category", () => {
    const w = POLY_WORDS[0];
    expect(filterPolyWords("all", w.word.toUpperCase()).map((x) => x.word)).toContain(w.word);
    expect(filterPolyWords("all", w.senses[0].zh).map((x) => x.word)).toContain(w.word);
    const other = POLY_WORDS.find((x) => x.category !== w.category)!;
    expect(filterPolyWords(w.category, other.word).map((x) => x.word)).not.toContain(other.word);
    expect(filterPolyWords("all", "qqqqzzzz")).toEqual([]);
  });
  it("progress and practice filter", () => {
    const w = POLY_WORDS[0];
    const p = wordProgress(w, (id) =>
      id === w.senses[0].id ? { correct: 3, wrong: 0, recent: [true, true, true] } : undefined
    );
    expect(p).toEqual({ done: 1, total: w.senses.length });
    expect(practiceFilterFor("get")).toEqual({ words: ["get"], levels: [], excluded: [] });
  });
});

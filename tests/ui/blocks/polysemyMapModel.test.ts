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
    expect(filterPolyWords("all", w.senses[0].zh.replace(/[（(][^）)]*[）)]/g, "").slice(0, 2)).map((x) => x.word)).toContain(w.word);
    const other = POLY_WORDS.find((x) => x.category !== w.category)!;
    expect(filterPolyWords(w.category, other.word).map((x) => x.word)).not.toContain(other.word);
    expect(filterPolyWords("all", "qqqqzzzz")).toEqual([]);
  });
  it("English query: word only, exact first, then prefix; no Chinese-column hits", () => {
    const words = (q: string) => filterPolyWords("all", q).map((x) => x.word);
    const ins = words("in");
    expect(ins[0]).toBe("in");
    expect(ins.every((w) => w.startsWith("in"))).toBe(true);
    expect(ins).not.toContain("case");
    expect(ins).not.toContain("order");
    expect(ins).not.toContain("go");
    const os = words("o");
    expect(os).toContain("of");
    expect(os.every((w) => w.startsWith("o"))).toBe(true);
  });
  it("Chinese query ignores English inside brackets", () => {
    const ws = [
      { word: "case", category: "A", senses: [{ id: "case.a", zh: "以防（just in case）" }] },
      { word: "go", category: "A", senses: [{ id: "go.a", zh: "去" }] },
    ] as never;
    expect(filterPolyWords("all", "以防", ws).map((w) => w.word)).toEqual(["case"]);
    expect(filterPolyWords("all", "去", ws).map((w) => w.word)).toEqual(["go"]);
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

import { describe, expect, it } from "vitest";
import { glossCandidates, glossOf, noteGlosses } from "../../../src/core/learner/gloss";
import type { ParagraphGloss } from "../../../src/core/model/learner";

const P = "Sodium is far more ==abundant== than lithium, and the market may trade density for cost. ^vt-abc1";

describe("glossCandidates (1030 #3 words above the learner's level)", () => {
  it("an A2 learner skips A1 words and keeps A2 and up, plus words outside the lists", () => {
    const words = glossCandidates(P, "A2");
    expect(words).not.toContain("the");
    expect(words).not.toContain("is");
    expect(words).toEqual(expect.arrayContaining(["sodium", "abundant", "market", "trade", "density", "cost"]));
  });

  it("a B2 learner skips A1–B1 words", () => {
    const words = glossCandidates(P, "B2");
    expect(words).not.toContain("market"); // A2
    expect(words).not.toContain("abundant"); // B1
    expect(words).toContain("density"); // not in the list
  });

  it("no level set counts as A2; the AI's own levels are used too; ^ids and ==marks== are dropped", () => {
    expect(glossCandidates(P, "")).toEqual(glossCandidates(P, "A2"));
    expect(glossCandidates(P, "A2", new Map([["density", "A1" as const]]))).not.toContain("density");
    expect(glossCandidates(P, "A2").some((w) => w.includes("vt") || w.includes("="))).toBe(false);
  });

  it("dedupes and stops at the cap", () => {
    expect(glossCandidates("cost cost Cost", "A1")).toEqual(["cost"]);
    expect(glossCandidates(P, "A1", undefined, 3)).toHaveLength(3);
  });
});

describe("noteGlosses / glossOf", () => {
  const g = (id: string, at: string, words: ParagraphGloss["words"]): ParagraphGloss => ({ id, path: "a.md", at, words });
  const glosses = [
    g("h1", "2026-10-01T00:00:00.000Z", [{ w: "trade", zh: "貿易", en: "buying and selling" }]),
    g("h2", "2026-10-02T00:00:00.000Z", [{ w: "trade", pos: "v.", zh: "拿…換取", en: "give up one thing for another" }, { w: "analyzed", zh: "分析", en: "studied" }]),
    g("h3", "2026-10-03T00:00:00.000Z", [{ w: "cell", zh: "牢房", en: "a prison room" }]),
  ];

  it("only the note's paragraphs count, the newest gloss of a word winning", () => {
    const map = noteGlosses(glosses, ["h1", "h2"]);
    expect(map.get("trade")?.zh).toBe("拿…換取");
    expect(map.has("cell")).toBe(false);
  });

  it("finds a saved word through an inflected form glossed in the paragraph", () => {
    const map = noteGlosses(glosses, ["h2"]);
    expect(glossOf(map, "Trade")?.pos).toBe("v.");
    expect(glossOf(map, "analyze")?.zh).toBe("分析");
    expect(glossOf(map, "market")).toBeUndefined();
  });
});

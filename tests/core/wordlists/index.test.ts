import { describe, expect, it } from "vitest";
import { lemmaCandidates } from "../../../src/core/wordlists/lemma";
import { WordlistIndex } from "../../../src/core/wordlists/WordlistIndex";

describe("lemmaCandidates", () => {
  it.each([
    ["analyzed", "analyze"],
    ["walked", "walk"],
    ["stopped", "stop"],
    ["studies", "study"],
    ["studied", "study"],
    ["boxes", "box"],
    ["makes", "make"],
    ["making", "make"],
    ["running", "run"],
    ["lying", "lie"],
    ["easily", "easy"],
    ["significantly", "significant"],
    ["student's", "student"],
  ])("%s → %s", (word, base) => {
    expect(lemmaCandidates(word)).toContain(base);
  });

  it("doesn't strip -eed or -er, or leave tiny stems", () => {
    expect(lemmaCandidates("feed")).not.toContain("fee");
    expect(lemmaCandidates("number")).not.toContain("numb");
    expect(lemmaCandidates("bed")).toEqual([]);
  });
});

describe("WordlistIndex", () => {
  const index = new WordlistIndex([
    { tag: "exam/TOEIC", words: ["budget", "analyze"], path: "l/exam-TOEIC.md" },
    { tag: "exam/IELTS", words: ["analyze", "building"] },
    { tag: "exam/IELTS", words: ["data", "analyze"], path: "l/more.md" },
  ]);

  it("merges lists with the same tag and orders tags alphabetically", () => {
    expect(index.tags).toEqual(["exam/IELTS", "exam/TOEIC"]);
    expect(index.lists).toEqual([
      { tag: "exam/IELTS", words: 3, paths: ["l/more.md"] },
      { tag: "exam/TOEIC", words: 2, paths: ["l/exam-TOEIC.md"] },
    ]);
    expect(index.lookup("analyze")).toEqual(["exam/IELTS", "exam/TOEIC"]);
  });

  it("is case-insensitive and falls back to base forms", () => {
    expect(index.lookup("Budget")).toEqual(["exam/TOEIC"]);
    expect(index.lookup("analyzing")).toEqual(["exam/IELTS", "exam/TOEIC"]);
    expect(index.lookup("analyzing", false)).toEqual([]);
    expect(index.lookup("unrelated")).toEqual([]);
  });

  it("prefers the exact form over a base form", () => {
    expect(index.lookup("building")).toEqual(["exam/IELTS"]);
    expect(index.lookup("buildings")).toEqual(["exam/IELTS"]);
  });

  it("is empty with no lists", () => {
    expect(new WordlistIndex().isEmpty).toBe(true);
  });
});

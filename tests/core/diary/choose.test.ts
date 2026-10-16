import { describe, expect, it } from "vitest";
import { chooseDiaryKind, materialSources } from "../../../src/core/diary/choose";
import type { DiaryMaterial, DiaryRecent } from "../../../src/core/diary/types";

const art = (title: string) => ({ path: `${title}.md`, title, headings: [] });
const mat = (titles: string[], labels: string[] = []): DiaryMaterial => ({
  day: "2026-10-15",
  articles: titles.map(art),
  points: labels.map((label) => ({ kind: "new-word" as const, label, day: "2026-10-15" })),
});
const rec = (day: string, sources: string[]): DiaryRecent => ({ day, kind: "diary", sources });
const rnd = (v: number) => () => v;

describe("materialSources", () => {
  it("titles then labels, deduped", () => {
    expect(materialSources(mat(["A", "B"], ["x", "a", "x"]))).toEqual(["A", "B", "x"]);
  });
});

describe("chooseDiaryKind", () => {
  it("too little: quote or place by random", () => {
    expect(chooseDiaryKind(mat([]), [], { random: rnd(0.2) })).toBe("quote");
    expect(chooseDiaryKind(mat([]), [], { random: rnd(0.7) })).toBe("place");
  });
  it("too much repetition (>=60%) switches", () => {
    const m = mat(["A", "B"], ["x", "y", "z"]);
    const recent = [rec("2026-10-14", ["A", "B", "x"])];
    expect(chooseDiaryKind(m, recent, { random: rnd(0.9) })).toBe("place");
    expect(chooseDiaryKind(m, recent, { random: rnd(0.1) })).toBe("quote");
  });
  it("under 60% repeat stays diary at high random", () => {
    const m = mat(["A", "B"], ["x", "y", "z"]);
    expect(chooseDiaryKind(m, [rec("2026-10-14", ["A", "B"])], { random: rnd(0.9) })).toBe("diary");
  });
  it("only the latest 3 diaries count", () => {
    const m = mat(["A"], ["x"]);
    const recent = [rec("1", ["A", "x"]), rec("5", []), rec("6", []), rec("7", [])];
    expect(chooseDiaryKind(m, recent, { random: rnd(0.9) })).toBe("diary");
  });
  it("normal day: 1/5 chance to switch", () => {
    const m = mat(["A", "B"]);
    expect(chooseDiaryKind(m, [], { random: rnd(0.19) })).toBe("quote");
    expect(chooseDiaryKind(m, [], { random: rnd(0.21) })).toBe("diary");
  });
  it("single article doubles the chance; custom quoteEvery", () => {
    const m = mat(["A"]);
    expect(chooseDiaryKind(m, [], { random: rnd(0.39) })).toBe("quote");
    expect(chooseDiaryKind(m, [], { random: rnd(0.41) })).toBe("diary");
    expect(chooseDiaryKind(mat(["A", "B"]), [], { random: rnd(0.4), quoteEvery: 2 })).toBe("quote");
  });
});

import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Morpheme, MorphemeType } from "../../../src/core/model/morpheme";
import type { MorphemeStat } from "../../../src/services/learn/MorphemeService";
import { dnaPageGroups } from "../../../src/ui/dna/dnaPage";

function makeEntry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "1",
    word: "word",
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...overrides,
  };
}

function makeMorpheme(overrides: Partial<Morpheme> = {}): Morpheme {
  return {
    id: "m1",
    form: "-ee",
    variants: [],
    type: "suffix",
    meaningZh: "接受動作的人",
    origin: "盎格魯法語 -é",
    timeline: [],
    suggested: [],
    source: "ai",
    ...overrides,
  };
}

function makeStat(overrides: Partial<MorphemeStat> = {}): MorphemeStat {
  return { morpheme: makeMorpheme(), learned: [], suggested: [], ...overrides };
}

const emptyStats: Record<MorphemeType, readonly MorphemeStat[]> = { prefix: [], root: [], suffix: [] };

describe("dnaPageGroups (1007-2 #13)", () => {
  it("returns the three groups in 字首/字根/字尾 order, every time", () => {
    const groups = dnaPageGroups(emptyStats, () => undefined, () => "");
    expect(groups.map((g) => g.key)).toEqual(["dna:prefix", "dna:root", "dna:suffix"]);
    expect(groups.every((g) => g.words.length === 0)).toBe(true);
  });

  it("gives learned words their entryId and a morpheme tag", () => {
    const entry = makeEntry({ id: "e1", word: "employee", definitionZh: "員工" });
    const stat = makeStat({ morpheme: makeMorpheme({ id: "m1", type: "suffix", form: "-ee" }), learned: [entry] });
    const stats = { ...emptyStats, suffix: [stat] };
    const groups = dnaPageGroups(stats, () => undefined, (e) => `[${e.word}]`);
    const suffixGroup = groups.find((g) => g.key === "dna:suffix")!;
    expect(suffixGroup.words).toEqual([
      { word: "employee", zh: "員工", emoji: "[employee]", entryId: "e1", morpheme: { id: "m1", label: "-ee" } },
    ]);
  });

  it("gives a suggested word entryId only when findEntry resolves it (already in the vocab but not 拆過/liked)", () => {
    const stat = makeStat({
      morpheme: makeMorpheme({ id: "m2", type: "prefix", form: "ex-" }),
      suggested: [
        { word: "exile", zh: "流放", emoji: "🏝️" },
        { word: "export", zh: "出口", emoji: "📦" },
      ],
    });
    const stats = { ...emptyStats, prefix: [stat] };
    const inVocab = makeEntry({ id: "v1", word: "exile" });
    const groups = dnaPageGroups(stats, (word) => (word === "exile" ? inVocab : undefined), () => "");
    const prefixGroup = groups.find((g) => g.key === "dna:prefix")!;
    expect(prefixGroup.words).toEqual([
      { word: "exile", zh: "流放", emoji: "🏝️", entryId: "v1", morpheme: { id: "m2", label: "ex-" } },
      { word: "export", zh: "出口", emoji: "📦", entryId: undefined, morpheme: { id: "m2", label: "ex-" } },
    ]);
  });

  it("does not dedupe a word that shows up under two morphemes of the same type", () => {
    const a = makeStat({ morpheme: makeMorpheme({ id: "a", type: "root", form: "pel" }), learned: [makeEntry({ id: "e1", word: "expel" })] });
    const b = makeStat({ morpheme: makeMorpheme({ id: "b", type: "root", form: "ex-" }), learned: [makeEntry({ id: "e1", word: "expel" })] });
    const stats = { ...emptyStats, root: [a, b] };
    const groups = dnaPageGroups(stats, () => undefined, () => "");
    const rootGroup = groups.find((g) => g.key === "dna:root")!;
    expect(rootGroup.words).toHaveLength(2);
    expect(rootGroup.words.map((w) => w.morpheme?.id)).toEqual(["a", "b"]);
  });
});

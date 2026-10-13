import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../../src/core/i18n";
import { POLY_WORDS, wordsInCategory } from "../../../../src/core/poly/catalog";
import {
  categoryLabel,
  filterToValue,
  initialCategory,
  polyGroups,
  polyQuickPicks,
  polySummary,
  progressDot,
  senseSections,
  testedSenseIds,
  toggleExcluded,
  valueToFilter,
  wordCheckedSummary,
  wordCollapsed,
} from "../../../../src/ui/blocks/practice/polyTabModel";

beforeEach(() => setLocale("zh-TW"));

const W = POLY_WORDS[0];
const W2 = POLY_WORDS.find((w) => w.category !== W.category)!;

describe("poly filter ⇄ chips", () => {
  it("groups: category single, word multi of that category, level multi", () => {
    const g = polyGroups(W.category);
    expect(g.map((x) => [x.id, x.multi])).toEqual([["category", false], ["word", true], ["level", true]]);
    expect(g[0].options).toHaveLength(5);
    expect(g[1].options.map((o) => o.id)).toEqual(wordsInCategory(W.category).map((w) => w.word));
    expect(g[2].options.map((o) => o.label)).toEqual(["基礎", "中級", "進階"]);
  });
  it("round-trips and keeps words of other categories", () => {
    const f = { words: [W.word, W2.word], levels: [1 as const, 3 as const], excluded: [W.senses[0].id] };
    const v = filterToValue(f, W.category);
    expect(v.word).toEqual([W.word, W2.word]);
    expect(valueToFilter(v, f).filter).toEqual(f);
  });
  it("drops unticked senses of a word that was deselected", () => {
    const f = { words: [W.word], levels: [], excluded: [W.senses[0].id] };
    const v = { ...filterToValue(f, W.category), word: [W2.word] };
    expect(valueToFilter(v, f).filter.excluded).toEqual([]);
  });
  it("category falls back to the first word's", () => {
    expect(initialCategory({ words: [W2.word], levels: [], excluded: [] })).toBe(W2.category);
    expect(initialCategory({ words: [], levels: [], excluded: [] })).toBe("A");
    expect(valueToFilter({}, { words: [W2.word], levels: [], excluded: [] }).category).toBe(W2.category);
  });
  it("summary", () => {
    expect(polySummary({ words: [], levels: [], excluded: [] })).toBe("尚未選字");
    expect(polySummary({ words: [W.word], levels: [1, 2], excluded: [] })).toBe(`${W.word} · 基礎、中級`);
    expect(polySummary({ words: [W.word], levels: [], excluded: [] })).toBe(`${W.word} · 全部級數`);
    expect(categoryLabel("B")).toBe("萬用動詞");
  });
});

describe("quick picks", () => {
  it("saved = intersection with POLY_WORDS; weak = words of weak senses", () => {
    const picks = polyQuickPicks({ saved: [W.word.toUpperCase(), "zzzznotaword"], weakSenseIds: [W2.senses[0].id] });
    expect(picks.map((p) => p.id)).toEqual(["saved", "weak"]);
    expect(picks[0].apply({}).word).toEqual([W.word]);
    expect(picks[1].apply({}).word).toEqual([W2.word]);
    expect(picks[1].apply({}).category).toEqual([W2.category]);
  });
  it("offers nothing when nothing matches", () => {
    expect(polyQuickPicks({ saved: ["zzzz"], weakSenseIds: [] })).toEqual([]);
  });
});

describe("sense map", () => {
  const f = { words: [W.word], levels: [] as (1 | 2 | 3)[], excluded: [] as string[] };
  it("rows follow the words, unticking toggles excluded", () => {
    const secs = senseSections(f, () => undefined);
    expect(secs).toHaveLength(1);
    expect(secs[0].rows).toHaveLength(W.senses.length);
    expect(secs[0].rows.every((r) => r.checked && r.dot === "none")).toBe(true);
    const id = W.senses[0].id;
    const f2 = toggleExcluded(f, id);
    expect(f2.excluded).toEqual([id]);
    expect(senseSections(f2, () => undefined)[0].rows[0].checked).toBe(false);
    expect(testedSenseIds(f2).has(id)).toBe(false);
    expect(toggleExcluded(f2, id).excluded).toEqual([]);
  });
  it("progress dots", () => {
    expect(progressDot(undefined)).toBe("none");
    expect(progressDot({ correct: 0, wrong: 0, recent: [] })).toBe("none");
    expect(progressDot({ correct: 3, wrong: 1, recent: [false, true, true, true] })).toBe("done");
    expect(progressDot({ correct: 2, wrong: 1, recent: [true, false, true] })).toBe("partial");
    expect(progressDot({ correct: 2, wrong: 0, recent: [true, true] })).toBe("partial");
  });
  it("level filter marks other levels as out of level", () => {
    const l = W.senses[0].level;
    const other = ([1, 2, 3] as const).find((x) => x !== l)!;
    const rows = senseSections({ ...f, levels: [other] }, () => undefined)[0].rows;
    expect(rows[0].outOfLevel).toBe(true);
  });
});

describe("word fold (1013-3)", () => {
  it("lone word starts open, several start folded, overrides win", () => {
    expect(wordCollapsed("of", 1, new Map())).toBe(false);
    expect(wordCollapsed("of", 3, new Map())).toBe(true);
    expect(wordCollapsed("of", 3, new Map([["of", false]]))).toBe(false);
    expect(wordCollapsed("of", 1, new Map([["of", true]]))).toBe(true);
  });
  it("counts ticked senses", () => {
    const [sec] = senseSections({ words: [W.word], levels: [], excluded: [W.senses[0].id] }, () => undefined);
    expect(wordCheckedSummary(sec)).toEqual({ checked: W.senses.length - 1, total: W.senses.length });
  });
});

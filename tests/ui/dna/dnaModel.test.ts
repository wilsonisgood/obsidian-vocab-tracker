import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { Morpheme } from "../../../src/core/model/morpheme";
import {
  defaultFocusEntryId,
  formatTimeline,
  morphemeChips,
  parseDnaParams,
  parseTimeline,
  relatedWords,
  resolveDnaSelection,
  wiktionaryUrl,
} from "../../../src/ui/dna/dnaModel";
import type { MorphemeStat } from "../../../src/ui/dna/types";

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

describe("morphemeChips", () => {
  it("sorts by learned count descending", () => {
    const a = makeStat({ morpheme: makeMorpheme({ id: "a", form: "-ee" }), learned: [makeEntry({ id: "e1" })] });
    const b = makeStat({
      morpheme: makeMorpheme({ id: "b", form: "-ure" }),
      learned: [makeEntry({ id: "e2" }), makeEntry({ id: "e3" })],
    });
    const chips = morphemeChips([a, b]);
    expect(chips.map((c) => c.id)).toEqual(["b", "a"]);
    expect(chips[0]).toMatchObject({ form: "-ure", learnedCount: 2 });
    expect(chips[1]).toMatchObject({ form: "-ee", learnedCount: 1 });
  });
});

describe("relatedWords", () => {
  const emojiOf = (e: VocabEntry) => `[${e.word}]`;

  it("lists learned before suggested", () => {
    const stat = makeStat({
      learned: [makeEntry({ id: "e1", word: "tenure", definitionZh: "任期" })],
      suggested: [{ word: "failure", zh: "失敗", emoji: "❌" }],
    });
    const list = relatedWords(stat, emojiOf);
    expect(list.map((r) => r.kind)).toEqual(["learned", "suggested"]);
    expect(list[0]).toMatchObject({ word: "tenure", zh: "任期", emoji: "[tenure]", entryId: "e1" });
    expect(list[1]).toMatchObject({ word: "failure", zh: "失敗", emoji: "❌" });
  });

  it("drops a suggestion that duplicates an already-learned word (case/space insensitive)", () => {
    const stat = makeStat({
      learned: [makeEntry({ id: "e1", word: "Tenure" })],
      suggested: [
        { word: " tenure ", zh: "任期", emoji: "🪑" },
        { word: "failure", zh: "失敗", emoji: "❌" },
      ],
    });
    const list = relatedWords(stat, emojiOf);
    expect(list.map((r) => r.word)).toEqual(["Tenure", "failure"]);
  });
});

describe("defaultFocusEntryId", () => {
  it("picks the first learned entry", () => {
    const stat = makeStat({ learned: [makeEntry({ id: "e1" }), makeEntry({ id: "e2" })] });
    expect(defaultFocusEntryId(stat)).toBe("e1");
  });

  it("is undefined with no learned entries", () => {
    expect(defaultFocusEntryId(makeStat({ learned: [] }))).toBeUndefined();
  });
});

describe("parseDnaParams", () => {
  it("reads type/morpheme, ignoring unrelated lines", () => {
    expect(parseDnaParams("type: suffix\nmorpheme: ee\n# comment")).toEqual({ type: "suffix", morpheme: "ee" });
    expect(parseDnaParams("")).toEqual({});
  });
});

describe("resolveDnaSelection", () => {
  const prefixStat = makeStat({ morpheme: makeMorpheme({ id: "p1", type: "prefix", form: "ex-" }) });
  const suffixStat = makeStat({ morpheme: makeMorpheme({ id: "s1", type: "suffix", form: "-ee" }) });

  it("defaults to suffix", () => {
    const sel = resolveDnaSelection({}, { prefix: [], suffix: [suffixStat], root: [] });
    expect(sel).toEqual({ type: "suffix", morphemeId: undefined });
  });

  it("honors an explicit type when it has data", () => {
    const sel = resolveDnaSelection({ type: "prefix" }, { prefix: [prefixStat], suffix: [suffixStat], root: [] });
    expect(sel.type).toBe("prefix");
  });

  it("falls back to the first tab (字首→字尾→字根) with data when the requested one is empty", () => {
    const sel = resolveDnaSelection({ type: "suffix" }, { prefix: [prefixStat], suffix: [], root: [] });
    expect(sel.type).toBe("prefix");
  });

  it("falls back to suffix's default even with no params when suffix is empty but root has data", () => {
    const rootStat = makeStat({ morpheme: makeMorpheme({ id: "r1", type: "root", form: "ten" }) });
    const sel = resolveDnaSelection({}, { prefix: [], suffix: [], root: [rootStat] });
    expect(sel.type).toBe("root");
  });

  it("matches `morpheme:` against form/variants via normalizeForm", () => {
    const sel = resolveDnaSelection(
      { type: "suffix", morpheme: "EE" },
      { prefix: [], suffix: [suffixStat], root: [] }
    );
    expect(sel.morphemeId).toBe("s1");
  });

  it("leaves morphemeId undefined when nothing matches", () => {
    const sel = resolveDnaSelection(
      { type: "suffix", morpheme: "zzz" },
      { prefix: [], suffix: [suffixStat], root: [] }
    );
    expect(sel.morphemeId).toBeUndefined();
  });
});

describe("wiktionaryUrl", () => {
  it("strips a leading/trailing hyphen", () => {
    expect(wiktionaryUrl("ex-")).toBe("https://en.wiktionary.org/wiki/ex");
    expect(wiktionaryUrl("-ee")).toBe("https://en.wiktionary.org/wiki/ee");
  });

  it("takes the first variant out of a multi-variant form", () => {
    expect(wiktionaryUrl("ten / tin / tain")).toBe("https://en.wiktionary.org/wiki/ten");
    expect(wiktionaryUrl("pel / puls")).toBe("https://en.wiktionary.org/wiki/pel");
  });
});

describe("parseTimeline / formatTimeline", () => {
  it("parses one stage per line, full- or half-width colon", () => {
    expect(parseTimeline("拉丁語：ex（出、離開）\n古法語: es- / ex-")).toEqual([
      { stage: "拉丁語", form: "ex（出、離開）" },
      { stage: "古法語", form: "es- / ex-" },
    ]);
  });

  it("skips blank lines and lines without a stage", () => {
    expect(parseTimeline("\n  \n：no stage\njust text\n拉丁語：per")).toEqual([{ stage: "拉丁語", form: "per" }]);
  });

  it("round-trips through formatTimeline", () => {
    const timeline = [
      { stage: "拉丁語", form: "pellere（推）" },
      { stage: "現代英語", form: "expel, propel" },
    ];
    expect(parseTimeline(formatTimeline(timeline))).toEqual(timeline);
  });
});

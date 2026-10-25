import { describe, expect, it } from "vitest";
import { buildReport, type ReportInput } from "../../../src/core/learner/report";
import { baselineLevels } from "../../../src/core/learner/levelEstimate";
import {
  askedAndLooked,
  emptyTierCount,
  parseTiersSource,
  tierExamples,
  tierSegments,
  tiersFenceJson,
  UNKNOWN_WORDS_MAX,
  vocabLevelFromTiers,
  vocabTierProfile,
  type TierCount,
  type TierProfile,
} from "../../../src/core/learner/vocabTiers";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { AskEvent, WordTouch } from "../../../src/core/model/learner";
import type { CefrTier } from "../../../src/core/wordlists/cefr";

const P = { from: "2026-10-19", to: "2026-10-25" };
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
let n = 0;
const ask = (o: Partial<AskEvent> = {}): AskEvent => ({ id: `a${n++}`, at: at("2026-10-20"), surface: "word", taskId: "word.usage", custom: false, ok: true, ...o });
const touch = (word: string, o: Partial<WordTouch> = {}): WordTouch => ({ id: `${o.day ?? "2026-10-21"}|${word}`, day: "2026-10-21", word, lookup: 1, pronounce: 0, saved: false, updatedAt: "", ...o });
const entry = (id: string, word: string, o: Partial<VocabEntry> = {}): VocabEntry =>
  ({ id, word, liked: true, added: "2026-09-01", createdAt: "2026-09-01T00:00:00Z", ...o }) as VocabEntry;
const matureSrs = { state: 2, stability: 30, due: "2027-01-01T00:00:00Z" } as VocabEntry["srs"];
const input = (o: Partial<ReportInput> = {}): ReportInput => ({ level: "B1", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0, ...o });
const count = (o: Partial<Record<keyof TierCount, number>>): TierCount => ({ ...emptyTierCount(), ...o });
const profile = (o: Partial<TierProfile> = {}): TierProfile => ({ asked: emptyTierCount(), looked: emptyTierCount(), saved: emptyTierCount(), mature: emptyTierCount(), unknownWords: [], ...o });

describe("vocabTierProfile", () => {
  it("asked: ok asks in the period; word discussions by entry, selections only when a single word", () => {
    const vocab = [entry("e1", "walk"), entry("e2", "ice cream"), entry("e3", "anxiety")];
    const p = vocabTierProfile(
      input({
        vocab,
        asks: [
          ask({ entryId: "e1" }),
          ask({ entryId: "e1" }), // same word twice counts once
          ask({ entryId: "e2" }), // a phrase is skipped
          ask({ surface: "paragraph", taskId: "paragraph.vocab", selection: "Arrogant" }),
          ask({ surface: "paragraph", selection: "a whole phrase here" }),
          ask({ entryId: "e3", ok: false }),
          ask({ entryId: "e3", at: at("2026-09-01") }),
        ],
      }),
      P
    );
    expect(p.asked).toEqual(count({ A1: 1, B2: 1 }));
  });

  it("looked: word touches with a lookup in the period", () => {
    const p = vocabTierProfile(
      input({ wordTouches: [touch("basket"), touch("basket", { day: "2026-10-22" }), touch("anxiety", { lookup: 0, pronounce: 2 }), touch("walk", { day: "2026-10-01" }), touch("ice cream")] }),
      P
    );
    expect(p.looked).toEqual(count({ A2: 1 }));
  });

  it("saved: words newly liked in the period; deleted or unliked ones don't count", () => {
    const p = vocabTierProfile(
      input({
        vocab: [
          entry("1", "walk", { added: "2026-10-20" }),
          entry("2", "ubiquitous", { added: "2026-10-21" }),
          entry("3", "book", { added: "2026-10-21", deletedAt: "2026-10-22T00:00:00Z" }),
          entry("4", "blue", { added: "2026-10-21", liked: false }),
          entry("5", "arena", { added: "2026-09-01" }),
        ],
      }),
      P
    );
    expect(p.saved).toEqual(count({ A1: 1, "?": 1 }));
  });

  it("mature: liked, live, Review with stability >= 21, whatever the period", () => {
    const p = vocabTierProfile(
      input({
        vocab: [
          entry("1", "walk", { srs: matureSrs }),
          entry("2", "basket", { srs: { ...matureSrs, stability: 20 } as VocabEntry["srs"] }),
          entry("3", "book", { srs: { ...matureSrs, state: 1 } as VocabEntry["srs"] }),
          entry("4", "anxiety", { srs: matureSrs, deletedAt: "2026-10-01T00:00:00Z" }),
          entry("5", "arena", { srs: matureSrs, liked: false }),
          entry("6", "arrogant", { srs: matureSrs }),
        ],
      }),
      P
    );
    expect(p.mature).toEqual(count({ A1: 1, B2: 1 }));
  });

  it("unknown words count as ? and are listed once; the AI-tagged level fills them in", () => {
    const i = input({ wordTouches: [touch("ubiquitous"), touch("ubiquitous", { day: "2026-10-22" }), touch("pug"), touch("walk")] });
    const p = vocabTierProfile(i, P);
    expect(p.looked).toEqual(count({ A1: 1, "?": 2 }));
    expect(p.unknownWords.sort()).toEqual(["pug", "ubiquitous"]);
    const q = vocabTierProfile(i, P, new Map<string, CefrTier>([["ubiquitous", "C1"]]));
    expect(q.looked).toEqual(count({ A1: 1, C1: 1, "?": 1 }));
    expect(q.unknownWords).toEqual(["pug"]);
  });

  it("caps unknownWords at 60", () => {
    const touches = Array.from({ length: 80 }, (_, i) => touch(`zzword${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`));
    const p = vocabTierProfile(input({ wordTouches: touches }), P);
    expect(p.looked["?"]).toBe(80);
    expect(p.unknownWords).toHaveLength(UNKNOWN_WORDS_MAX);
  });
});

describe("tierExamples", () => {
  it("lists asked / looked words per level, at most `max`", () => {
    const e = tierExamples(input({ wordTouches: [touch("walk"), touch("book"), touch("blue"), touch("basket"), touch("zzz")] }), P, undefined, 2);
    expect(e.A1).toEqual(["walk", "book"]);
    expect(e.A2).toEqual(["basket"]);
    expect(e.B1).toEqual([]);
  });
});

describe("vocabLevelFromTiers", () => {
  it("too few leveled words → null (the caller falls back)", () => {
    expect(vocabLevelFromTiers(profile({ asked: count({ B1: 7, "?": 20 }) }))).toBeNull();
  });

  it("the most common level is the edge; the estimate is the level below up to it", () => {
    const e = vocabLevelFromTiers(profile({ asked: count({ A2: 3, B1: 6, B2: 9, C1: 2 }) })) as NonNullable<ReturnType<typeof vocabLevelFromTiers>>;
    expect(e.area).toBe("字彙量");
    expect(e.level).toBe("約 B1–B2");
    expect(e.detail).toBe("估 2,000–5,000 字");
    expect(e.rough).toBeUndefined();
  });

  it("asked and looked are pooled; an A1 edge is just 約 A1", () => {
    const e = vocabLevelFromTiers(profile({ asked: count({ A1: 4 }), looked: count({ A1: 5, A2: 1 }) }));
    expect(e?.level).toBe("約 A1");
    expect(e?.detail).toBe("估 500–700 字");
  });

  it("mature words mostly at or above the edge move it up half a level", () => {
    const base = { asked: count({ B1: 4, B2: 6 }) };
    expect(vocabLevelFromTiers(profile({ ...base, mature: count({ A2: 4, B1: 1 }) }))?.level).toBe("約 B1–B2");
    const up = vocabLevelFromTiers(profile({ ...base, mature: count({ A2: 1, B2: 3 }) }));
    expect(up?.level).toBe("約 B2");
    expect(up?.detail).toBe("估 4,000–5,000 字");
    // exactly half is not a majority
    expect(vocabLevelFromTiers(profile({ ...base, mature: count({ A2: 2, B2: 2 }) }))?.level).toBe("約 B1–B2");
  });

  it("basis lists the shares of the levels that have words, and where the mature words are", () => {
    const e = vocabLevelFromTiers(profile({ asked: count({ A2: 3, B1: 6, B2: 9, C1: 2, "?": 5 }), mature: count({ A2: 3, B1: 2 }) }));
    expect(e?.basis).toBe("你查／問的字：A2 15%、B1 30%、B2 45%、C1 10%；熟練的字多在 A2–B1");
  });

  it("leaves out the mature sentence when there are fewer than 3 leveled mature words", () => {
    const e = vocabLevelFromTiers(profile({ asked: count({ B1: 10 }), mature: count({ B1: 2 }) }));
    expect(e?.basis).toBe("你查／問的字：B1 100%");
  });
});

describe("baselineLevels 字彙量 with tiers", () => {
  const data = (tiers?: TierProfile) => ({ ...buildReport(input(), P), ...(tiers ? { tiers } : {}) });

  it("uses the tier-based estimate, no 粗估", () => {
    const row = baselineLevels(data(profile({ asked: count({ B1: 10 }) })), "A2", 5)[0];
    expect(row.level).toBe("約 A2–B1");
    expect(row.rough).toBeUndefined();
  });

  it("falls back to the self level and says why when the sample is small", () => {
    const row = baselineLevels(data(profile({ asked: count({ B1: 2 }) })), "A2", 5)[0];
    expect(row.level).toBe("約 A2");
    expect(row.rough).toBe(true);
    expect(row.basis).toBe("以自述程度＋熟練 5 字粗估（查／問的字還不夠多，暫以自述程度粗估）");
  });

  it("is unchanged without a tier profile", () => {
    expect(baselineLevels(data(), "A2", 5)[0].basis).toBe("以自述程度＋熟練 5 字粗估");
  });
});

describe("tiers block data", () => {
  it("segments: only levels with words, percentages sum to 100, A1 first", () => {
    const s = tierSegments(count({ A1: 1, B1: 2, "?": 1 }));
    expect(s.map((x) => [x.tier, x.count])).toEqual([["A1", 1], ["B1", 2], ["?", 1]]);
    expect(s.map((x) => x.percent)).toEqual([25, 50, 25]);
    expect(s.map((x) => x.start)).toEqual([0, 25, 75]);
    expect(tierSegments(emptyTierCount())).toEqual([]);
  });

  it("round-trips through the fence JSON, asked = asked + looked", () => {
    const p = profile({ asked: count({ A1: 1 }), looked: count({ A1: 2, B1: 1 }), mature: count({ B2: 3 }) });
    expect(askedAndLooked(p)).toEqual(count({ A1: 3, B1: 1 }));
    const bars = parseTiersSource(tiersFenceJson(p));
    expect(bars?.asked).toEqual(count({ A1: 3, B1: 1 }));
    expect(bars?.mature).toEqual(count({ B2: 3 }));
  });

  it("parse: bad JSON, wrong shape or no words → null; odd numbers are cleaned", () => {
    expect(parseTiersSource("nope")).toBeNull();
    expect(parseTiersSource("[1]")).toBeNull();
    expect(parseTiersSource('{"asked":{},"mature":{}}')).toBeNull();
    expect(parseTiersSource('{"asked":{"A1":"x","B1":-2,"B2":2.9}}')?.asked).toEqual(count({ B2: 2 }));
  });
});

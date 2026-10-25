import { describe, expect, it } from "vitest";
import { buildReport, levelSignals, type ReportInput } from "../../../src/core/learner/report";
import type { AskEvent, LearnEvent, ReadingVisit, Track, WordTouch } from "../../../src/core/model/learner";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { ReviewLog } from "../../../src/core/model/srs";

const P = { from: "2026-10-19", to: "2026-10-25" };
const PREV = { from: "2026-10-12", to: "2026-10-18" };
// Local noon of a day, as ISO.
const at = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};

let n = 0;
const ask = (day: string, o: Partial<AskEvent> = {}): AskEvent => ({
  id: `a${n++}`,
  at: at(day),
  surface: "word",
  taskId: "word.compare",
  custom: false,
  ok: true,
  ...o,
});
const touch = (day: string, word: string, o: Partial<WordTouch> = {}): WordTouch => ({
  id: `${day}|${word}`,
  day,
  word,
  lookup: 1,
  pronounce: 0,
  saved: false,
  updatedAt: at(day),
  ...o,
});
const visit = (day: string, path: string, heading?: string): ReadingVisit => ({
  id: `${day}|${path}|${heading ?? ""}`,
  day,
  at: at(day),
  updatedAt: at(day),
  path,
  title: path,
  ...(heading ? { heading } : {}),
  kinds: ["word"],
});
const ev = (day: string, result: LearnEvent["result"], o: Partial<LearnEvent> = {}): LearnEvent => ({
  id: `e${n++}`,
  at: at(day),
  track: "grammar",
  focus: { kind: "grammar-objective", id: "articles-advanced/x" },
  result,
  ...o,
});
const rev = (day: string, rating: 1 | 2 | 3 | 4, elapsedMs = 4000): ReviewLog => ({
  id: `r${n++}`,
  entryId: "v1",
  at: at(day),
  rating,
  mode: "manual",
  elapsedMs,
});
const entry = (id: string, word: string, o: Partial<VocabEntry> = {}): VocabEntry =>
  ({ id, word, level: "", added: "2026-10-01", liked: true, ...o }) as VocabEntry;

function input(o: Partial<ReportInput> = {}): ReportInput {
  return { level: "B2", asks: [], wordTouches: [], reading: [], events: [], reviews: [], vocab: [], grammarMastered: 0, ...o };
}
const many = <T>(k: number, f: (i: number) => T): T[] => Array.from({ length: k }, (_, i) => f(i));
// `total` grammar answers on a band-5 topic, `correct` of them right.
const grammarEvents = (total: number, correct: number, topic = "articles-advanced") =>
  many(total, (i) => ev("2026-10-20", i < correct ? "correct" : "wrong", { focus: { kind: "grammar-objective", id: `${topic}/x` } }));
const paraAsks = (translate: number, grammar: number, other = 0) => [
  ...many(translate, () => ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.translate" })),
  ...many(grammar, () => ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.grammar" })),
  ...many(other, () => ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.other" })),
];

describe("activity", () => {
  it("counts the union of active days, distinct articles and sections within the period", () => {
    const r = buildReport(
      input({
        asks: [ask("2026-10-19"), ask("2026-10-01")],
        wordTouches: [touch("2026-10-20", "a")],
        reading: [visit("2026-10-20", "a.md", "H1"), visit("2026-10-20", "a.md", "H2"), visit("2026-10-21", "b.md"), visit("2026-09-01", "c.md")],
        events: [ev("2026-10-22", "correct")],
        reviews: [rev("2026-10-25", 3), rev("2026-10-26", 3)],
      }),
      P
    );
    expect(r.activity).toEqual({ activeDays: 5, articles: 2, sections: 3 });
  });
});

describe("ai", () => {
  it("counts only ok asks, ranks, and compares with the previous period", () => {
    const vocab = [entry("v1", "run"), entry("v2", "walk")];
    const r = buildReport(
      input({
        vocab,
        asks: [
          ask("2026-10-20", { entryId: "v1", taskId: "word.compare" }),
          ask("2026-10-20", { entryId: "v1", taskId: "word.compare", custom: true }),
          ask("2026-10-21", { entryId: "v2", taskId: "word.etymology" }),
          ask("2026-10-21", { entryId: "gone", taskId: "word.etymology" }),
          ask("2026-10-21", { surface: "paragraph", taskId: "paragraph.translate", path: "n.md" }),
          ask("2026-10-21", { ok: false }),
          ask("2026-10-14"),
          ask("2026-10-15"),
        ],
      }),
      P,
      PREV
    );
    expect(r.ai.total).toBe(5);
    expect(r.ai.custom).toBe(1);
    expect(r.ai.prevTotal).toBe(2);
    expect(r.ai.byTask).toEqual([
      { key: "word.compare", count: 2 },
      { key: "word.etymology", count: 2 },
      { key: "paragraph.translate", count: 1 },
    ]);
    expect(r.ai.bySurface).toEqual([
      { key: "word", count: 4 },
      { key: "paragraph", count: 1 },
    ]);
    expect(r.ai.topWords).toEqual([
      { entryId: "v1", word: "run", count: 2 },
      { entryId: "v2", word: "walk", count: 1 },
    ]);
    expect(r.ai.topPaths).toEqual([{ key: "n.md", count: 1 }]);
  });
  it("leaves prevTotal null without a previous period", () => {
    expect(buildReport(input(), P).ai.prevTotal).toBeNull();
  });
});

describe("words", () => {
  const touches = [
    touch("2026-10-19", "ephemeral", { lookup: 2, pronounce: 1 }),
    touch("2026-10-21", "ephemeral", { lookup: 1, pronounce: 4 }),
    touch("2026-10-20", "once", { lookup: 3 }),
    touch("2026-10-20", "known", { lookup: 1, saved: true, pronounce: 2 }),
    touch("2026-10-22", "known", { lookup: 0, saved: true, pronounce: 0 }),
    touch("2026-09-01", "old", { lookup: 9, pronounce: 9 }),
  ];
  const w = buildReport(input({ wordTouches: touches }), P).words;
  it("totals lookups in the period", () => expect(w.lookups).toBe(7));
  it("lists words looked up on 2+ days", () => expect(w.repeated).toEqual([{ word: "ephemeral", days: 2, lookups: 3 }]));
  it("lists saved words still looked up", () => expect(w.savedStillLooked).toEqual([{ word: "known", lookups: 1 }]));
  it("ranks most-pronounced words", () =>
    expect(w.mostPronounced).toEqual([
      { word: "ephemeral", pronounce: 5 },
      { word: "known", pronounce: 2 },
    ]));
  it("limits repeated to 10", () => {
    const ts = many(12, (i) => [touch("2026-10-19", `w${i}`), touch("2026-10-20", `w${i}`)]).flat();
    expect(buildReport(input({ wordTouches: ts }), P).words.repeated).toHaveLength(10);
  });
});

describe("vocab", () => {
  it("counts new saved entries, review stats and the previous recall rate", () => {
    const r = buildReport(
      input({
        vocab: [
          entry("a", "a", { added: "2026-10-20" }),
          entry("b", "b", { added: "2026-10-05", createdAt: "2026-10-21T01:00:00" }),
          entry("c", "c", { added: "2026-10-20", liked: false }),
          entry("d", "d", { added: "2026-10-20", deletedAt: "2026-10-22" }),
          entry("e", "e", { added: "2026-09-20" }),
        ],
        reviews: [rev("2026-10-20", 3, 3000), rev("2026-10-20", 1, 4000), rev("2026-10-21", 4, 5000), rev("2026-10-21", 2, 4000), rev("2026-10-13", 3), rev("2026-10-13", 1), rev("2026-10-14", 1), rev("2026-10-14", 1)],
      }),
      P,
      PREV
    );
    expect(r.vocab.newSaved).toBe(1);
    expect(r.vocab.reviews).toBe(4);
    expect(r.vocab.recallRate).toBe(0.5);
    expect(r.vocab.avgSeconds).toBe(4);
    expect(r.vocab.prevRecallRate).toBe(0.25);
  });
  it("returns null rates with no reviews", () => {
    const v = buildReport(input(), P).vocab;
    expect(v.recallRate).toBeNull();
    expect(v.avgSeconds).toBeNull();
    expect(v.prevRecallRate).toBeNull();
  });
});

describe("practice", () => {
  it("computes accuracy per track, ignoring skipped, with the previous rate and weak spots", () => {
    const t = (track: Track, day: string, result: LearnEvent["result"]) => ev(day, result, { track, focus: { kind: "word", id: `w-${track}` } });
    const r = buildReport(
      input({
        events: [t("vocab", "2026-10-20", "correct"), t("vocab", "2026-10-20", "wrong"), t("vocab", "2026-10-21", "wrong"), t("vocab", "2026-10-21", "skipped"), t("vocab", "2026-10-13", "correct"), t("poly", "2026-10-22", "correct")],
      }),
      P,
      PREV
    );
    expect(r.practice.tracks).toEqual([
      { track: "poly", total: 1, correct: 1, rate: 1, prevRate: null },
      { track: "vocab", total: 3, correct: 1, rate: 1 / 3, prevRate: 1 },
    ]);
    expect(r.practice.weak.map((w) => w.focus.id)).toEqual(["w-vocab"]);
  });
});

describe("grammar", () => {
  it("splits grammar-objective answers by topic difficulty", () => {
    const e = (topic: string, result: LearnEvent["result"]) => ev("2026-10-20", result, { focus: { kind: "grammar-objective", id: `${topic}/o` } });
    const r = buildReport(
      input({
        grammarMastered: 7,
        events: [e("be-verb", "correct"), e("be-verb", "wrong"), e("noun-clauses", "correct"), e("articles-advanced", "wrong"), e("advanced-relative-clauses", "correct"), e("nope", "correct"), ev("2026-10-20", "correct", { focus: { kind: "word", id: "x" } })],
      }),
      P
    );
    expect(r.grammar.mastered).toBe(7);
    expect(r.grammar.bands.map((b) => [b.label, b.total, b.correct, b.rate])).toEqual([
      ["1–3", 2, 1, 0.5],
      ["4–6", 2, 1, 0.5],
      ["7–9", 1, 1, 1],
    ]);
  });
  it("has null rates for empty bands", () => {
    expect(buildReport(input(), P).grammar.bands.every((b) => b.rate === null)).toBe(true);
  });
});

describe("tags", () => {
  it("counts exam tags of new saved words and of saved words that were looked up", () => {
    const r = buildReport(
      input({
        vocab: [
          entry("a", "alpha", { added: "2026-10-20", level: "多益中級, 托福高級" }),
          entry("b", "beta", { added: "2026-09-01", level: "多益中級" }),
          entry("c", "gamma", { added: "2026-09-01", level: "雅思" }),
        ],
        wordTouches: [touch("2026-10-20", "beta", { saved: true }), touch("2026-10-20", "gamma", { saved: false })],
      }),
      P
    );
    expect(r.tags).toEqual([
      { key: "多益中級", count: 2 },
      { key: "托福高級", count: 1 },
    ]);
  });
});

describe("levelSignals: grammar", () => {
  const kind = (i: ReportInput) => levelSignals(i, P).signals.filter((s) => s.kind === "grammar").map((s) => s.direction);
  it("85% over 20 questions signals up, with the figures in the reason", () => {
    const a = levelSignals(input({ events: grammarEvents(20, 17) }), P);
    expect(a.signals[0]).toMatchObject({ kind: "grammar", direction: "up" });
    expect(a.signals[0].reason).toContain("文法 4–6 級答對率 85%（20 題）");
  });
  it("80% gives no signal", () => expect(kind(input({ events: grammarEvents(20, 16) }))).toEqual([]));
  it("fewer than 20 questions gives no signal", () => expect(kind(input({ events: grammarEvents(19, 19) }))).toEqual([]));
  it("below 60% signals down", () => expect(kind(input({ events: grammarEvents(20, 11) }))).toEqual(["down"]));
  it("exactly 60% gives no signal", () => expect(kind(input({ events: grammarEvents(20, 12) }))).toEqual([]));
  it("looks at the band of the self-reported level", () => {
    expect(kind(input({ level: "A1", events: grammarEvents(20, 20) }))).toEqual([]);
  });
});

describe("levelSignals: paragraph help", () => {
  const dir = (asks: AskEvent[]) => levelSignals(input({ asks }), P).signals.filter((s) => s.kind === "paragraph").map((s) => s.direction);
  it("more than 60% translate signals down", () => expect(dir(paraAsks(4, 1))).toEqual(["down"]));
  it("exactly 60% translate gives no signal", () => expect(dir(paraAsks(3, 2))).toEqual([]));
  it("fewer than 5 help requests gives no signal", () => expect(dir(paraAsks(4, 0))).toEqual([]));
  it("grammar + paraphrase at 70% or more signals up", () => {
    const asks = [...paraAsks(1, 2), ...many(1, () => ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.paraphrase" })), ...paraAsks(0, 0, 0)];
    expect(dir([...asks, ...many(1, () => ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.grammar" }))])).toEqual(["up"]);
  });
  it("grammar at 60% gives no signal", () => expect(dir(paraAsks(1, 3, 1))).toEqual([]));
  it("ignores failed asks and other surfaces", () => {
    const asks = [...paraAsks(4, 0), ask("2026-10-20", { surface: "paragraph", taskId: "paragraph.translate", ok: false })];
    expect(dir(asks)).toEqual([]);
  });
});

describe("levelSignals: vocabulary", () => {
  const repeated = (k: number) => many(k, (i) => [touch("2026-10-19", `w${i}`), touch("2026-10-20", `w${i}`)]).flat();
  const reviews = (total: number, good: number) => many(total, (i) => rev("2026-10-20", i < good ? 3 : 1));
  const dir = (i: ReportInput) => levelSignals(i, P).signals.filter((s) => s.kind === "vocab").map((s) => s.direction);
  it("recall under 70% with 3 repeated words signals down", () => {
    expect(dir(input({ reviews: reviews(10, 6), wordTouches: repeated(3) }))).toEqual(["down"]);
  });
  it("only 2 repeated words gives no signal", () => {
    expect(dir(input({ reviews: reviews(10, 6), wordTouches: repeated(2) }))).toEqual([]);
  });
  it("recall of exactly 70% gives no signal", () => {
    expect(dir(input({ reviews: reviews(10, 7), wordTouches: repeated(3) }))).toEqual([]);
  });
  it("recall over 90% with 30 reviews signals up", () => {
    expect(dir(input({ reviews: reviews(30, 29) }))).toEqual(["up"]);
  });
  it("recall of exactly 90% gives no signal", () => expect(dir(input({ reviews: reviews(30, 27) }))).toEqual([]));
  it("under 30 reviews gives no up signal", () => expect(dir(input({ reviews: reviews(29, 29) }))).toEqual([]));
});

describe("levelSignals: tags and verdicts", () => {
  const up = () => ({ events: grammarEvents(20, 20), asks: paraAsks(0, 5) });
  it("describes where lookups concentrate without counting as a signal", () => {
    const a = levelSignals(
      input({ vocab: [entry("a", "alpha", { level: "托福高級" })], wordTouches: [touch("2026-10-20", "alpha", { saved: true })] }),
      P
    );
    expect(a.signals).toEqual([{ kind: "tags", direction: "info", reason: "查的字多半在 托福高級（1 個）" }]);
    expect(a.verdict).toBe("insufficient");
  });
  it("up: two up signals and no down", () => {
    const a = levelSignals(input(up()), P);
    expect(a.verdict).toBe("up");
    expect(a.suggestedLevel).toBe("C1");
  });
  it("keep: a single up signal", () => {
    const a = levelSignals(input({ events: grammarEvents(20, 20) }), P);
    expect(a.verdict).toBe("keep");
    expect(a.suggestedLevel).toBeUndefined();
  });
  it("keep: enough data and nothing notable", () => {
    expect(levelSignals(input({ events: grammarEvents(20, 16) }), P).verdict).toBe("keep");
  });
  it("down: a down signal outweighing the ups", () => {
    const a = levelSignals(input({ events: grammarEvents(20, 5), asks: paraAsks(0, 5) }), P);
    expect(a.verdict).toBe("down");
    expect(a.suggestedLevel).toBe("B1");
  });
  it("down wins a tie, keep when ups outnumber downs", () => {
    const reviews = many(10, (i) => rev("2026-10-20", i < 6 ? 3 : 1));
    const touches = many(3, (i) => [touch("2026-10-19", `w${i}`), touch("2026-10-20", `w${i}`)]).flat();
    expect(levelSignals(input({ ...up(), reviews: [], wordTouches: [] }), P).verdict).toBe("up");
    expect(levelSignals(input({ ...up(), reviews, wordTouches: touches }), P).verdict).toBe("keep");
  });
  it("insufficient: not enough data for any rule", () => {
    const a = levelSignals(input({ events: grammarEvents(5, 5), asks: paraAsks(2, 0) }), P);
    expect(a.verdict).toBe("insufficient");
    expect(a.suggestedLevel).toBeUndefined();
  });
  it("clamps the suggested level and skips it without a level", () => {
    expect(levelSignals(input({ level: "C2", events: grammarEvents(20, 20, "advanced-relative-clauses"), asks: paraAsks(0, 5) }), P).suggestedLevel).toBe("C2");
    expect(levelSignals(input({ level: "", ...up() }), P).suggestedLevel).toBeUndefined();
  });
});

describe("buildReport advice", () => {
  it("embeds levelSignals", () => {
    const i = input({ events: grammarEvents(20, 20) });
    expect(buildReport(i, P).advice).toEqual(levelSignals(i, P));
  });
});

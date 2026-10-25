import { topicById } from "../grammar/catalog";
import { startDifficulty } from "../grammar/progress";
import type { VocabEntry } from "../model/entry";
import type { AskEvent, LearnEvent, ReadingVisit, Track, WordTouch } from "../model/learner";
import { TRACKS } from "../model/learner";
import { CEFR_LEVELS, type CefrLevel } from "../model/settings";
import { Rating, type ReviewLog } from "../model/srs";
import { localDayOf } from "./reading";
import { weakFocuses, type WeakFocus } from "./weakness";

// Learning report numbers (規劃書 15 §3). Pure: the caller hands in the data
// and gets display-ready numbers back. Inputs may hold records outside the
// period; everything is filtered here.

export interface ReportInput {
  level: CefrLevel | "";
  asks: readonly AskEvent[];
  wordTouches: readonly WordTouch[];
  reading: readonly ReadingVisit[];
  events: readonly LearnEvent[];
  reviews: readonly ReviewLog[];
  vocab: readonly VocabEntry[];
  // Current value from LearnerModel.snapshot(); not period-bound.
  grammarMastered: number;
}
export interface Period {
  from: string;
  to: string;
}

export interface Counted {
  key: string;
  count: number;
}
export interface ActivityStats {
  activeDays: number;
  articles: number;
  sections: number;
}
export interface AiStats {
  total: number;
  byTask: Counted[];
  bySurface: Counted[];
  custom: number;
  prevTotal: number | null;
  topWords: { entryId: string; word: string; count: number }[];
  topPaths: Counted[];
}
export interface WordStats {
  lookups: number;
  repeated: { word: string; days: number; lookups: number }[];
  savedStillLooked: { word: string; lookups: number }[];
  mostPronounced: { word: string; pronounce: number }[];
}
export interface VocabStats {
  newSaved: number;
  reviews: number;
  recallRate: number | null;
  avgSeconds: number | null;
  prevRecallRate: number | null;
}
export interface TrackStats {
  track: Track;
  total: number;
  correct: number;
  rate: number;
  prevRate: number | null;
}
export interface PracticeStats {
  tracks: TrackStats[];
  weak: WeakFocus[];
}
export interface GrammarBand {
  label: string; // "1–3"
  min: number;
  max: number;
  total: number;
  correct: number;
  rate: number | null;
}
export interface GrammarStats {
  mastered: number;
  bands: GrammarBand[];
}

export type SignalKind = "grammar" | "paragraph" | "vocab" | "tags";
export type SignalDirection = "up" | "down" | "info";
export interface LevelSignal {
  kind: SignalKind;
  direction: SignalDirection;
  reason: string;
}
export type Verdict = "up" | "keep" | "down" | "insufficient";
export interface LevelAdvice {
  verdict: Verdict;
  suggestedLevel?: CefrLevel;
  signals: LevelSignal[];
}

export interface ReportData {
  period: Period;
  activity: ActivityStats;
  ai: AiStats;
  words: WordStats;
  vocab: VocabStats;
  practice: PracticeStats;
  grammar: GrammarStats;
  tags: Counted[];
  advice: LevelAdvice;
}

// Thresholds (規劃書 15 §3.1).
const GRAMMAR_MIN_N = 20;
const GRAMMAR_UP = 0.85;
const GRAMMAR_DOWN = 0.6;
const PARA_MIN_N = 5;
const PARA_TRANSLATE_DOWN = 0.6;
const PARA_REFINE_UP = 0.7;
const VOCAB_LOW = 0.7;
const VOCAB_REPEATED_MIN = 3;
const VOCAB_HIGH = 0.9;
const VOCAB_HIGH_MIN_REVIEWS = 30;

const pct = (r: number) => `${Math.round(r * 100)}%`;
const inRange = (day: string, p: Period) => day >= p.from && day <= p.to;
const dayOfIso = (at: string): string | null => {
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : localDayOf(new Date(t));
};
function dayOfField(s: string | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return dayOfIso(s);
}
const atIn = <T extends { at: string }>(xs: readonly T[], p: Period): T[] =>
  xs.filter((x) => {
    const d = dayOfIso(x.at);
    return d !== null && inRange(d, p);
  });

function ranked(m: Map<string, number>, limit?: number): Counted[] {
  const out = [...m].map(([key, count]) => ({ key, count }));
  out.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return limit === undefined ? out : out.slice(0, limit);
}
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

function activityOf(input: ReportInput, p: Period): ActivityStats {
  const days = new Set<string>();
  for (const a of atIn(input.asks, p)) days.add(dayOfIso(a.at) as string);
  for (const e of atIn(input.events, p)) days.add(dayOfIso(e.at) as string);
  for (const r of atIn(input.reviews, p)) days.add(dayOfIso(r.at) as string);
  for (const w of input.wordTouches) if (inRange(w.day, p)) days.add(w.day);
  const reading = input.reading.filter((r) => inRange(r.day, p));
  for (const r of reading) days.add(r.day);
  return {
    activeDays: days.size,
    articles: new Set(reading.map((r) => r.path)).size,
    sections: reading.length,
  };
}

function aiOf(input: ReportInput, p: Period, prev?: Period): AiStats {
  const asks = atIn(input.asks, p).filter((a) => a.ok);
  const byTask = new Map<string, number>();
  const bySurface = new Map<string, number>();
  const byEntry = new Map<string, number>();
  const byPath = new Map<string, number>();
  let custom = 0;
  for (const a of asks) {
    bump(byTask, a.taskId);
    bump(bySurface, a.surface);
    if (a.custom) custom++;
    if (a.entryId) bump(byEntry, a.entryId);
    if (a.path) bump(byPath, a.path);
  }
  const wordOf = new Map(input.vocab.map((v) => [v.id, v.word]));
  const topWords: AiStats["topWords"] = [];
  for (const { key, count } of ranked(byEntry)) {
    const word = wordOf.get(key);
    if (!word) continue;
    topWords.push({ entryId: key, word, count });
    if (topWords.length === 5) break;
  }
  return {
    total: asks.length,
    byTask: ranked(byTask),
    bySurface: ranked(bySurface),
    custom,
    prevTotal: prev ? atIn(input.asks, prev).filter((a) => a.ok).length : null,
    topWords,
    topPaths: ranked(byPath, 3),
  };
}

interface WordAgg {
  word: string;
  days: Set<string>;
  lookups: number;
  pronounce: number;
  saved: boolean;
}
function touchesOf(input: ReportInput, p: Period): Map<string, WordAgg> {
  const m = new Map<string, WordAgg>();
  for (const t of input.wordTouches) {
    if (!inRange(t.day, p)) continue;
    let a = m.get(t.word);
    if (!a) {
      a = { word: t.word, days: new Set(), lookups: 0, pronounce: 0, saved: false };
      m.set(t.word, a);
    }
    if (t.lookup > 0) a.days.add(t.day);
    a.lookups += t.lookup;
    a.pronounce += t.pronounce;
    if (t.saved && t.lookup > 0) a.saved = true;
  }
  return m;
}
const byWord = (a: { word: string }, b: { word: string }) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0);

function wordsOf(touches: Map<string, WordAgg>): WordStats {
  const all = [...touches.values()];
  return {
    lookups: all.reduce((s, a) => s + a.lookups, 0),
    repeated: all
      .filter((a) => a.days.size >= 2)
      .map((a) => ({ word: a.word, days: a.days.size, lookups: a.lookups }))
      .sort((a, b) => b.days - a.days || b.lookups - a.lookups || byWord(a, b))
      .slice(0, 10),
    savedStillLooked: all
      .filter((a) => a.saved && a.lookups > 0)
      .map((a) => ({ word: a.word, lookups: a.lookups }))
      .sort((a, b) => b.lookups - a.lookups || byWord(a, b))
      .slice(0, 10),
    mostPronounced: all
      .filter((a) => a.pronounce > 0)
      .map((a) => ({ word: a.word, pronounce: a.pronounce }))
      .sort((a, b) => b.pronounce - a.pronounce || byWord(a, b))
      .slice(0, 5),
  };
}

const recallOf = (rs: readonly ReviewLog[]): number | null =>
  rs.length === 0 ? null : rs.filter((r) => r.rating >= Rating.Good).length / rs.length;

function newSavedOf(vocab: readonly VocabEntry[], p: Period): VocabEntry[] {
  return vocab.filter((v) => {
    if (v.deletedAt || v.liked !== true) return false;
    const d = dayOfField(v.added) ?? dayOfField(v.createdAt);
    return d !== null && inRange(d, p);
  });
}

function vocabOf(input: ReportInput, p: Period, prev?: Period): VocabStats {
  const rs = atIn(input.reviews, p);
  const avg = rs.length === 0 ? null : Math.round((rs.reduce((s, r) => s + r.elapsedMs, 0) / rs.length / 1000) * 10) / 10;
  return {
    newSaved: newSavedOf(input.vocab, p).length,
    reviews: rs.length,
    recallRate: recallOf(rs),
    avgSeconds: avg,
    prevRecallRate: prev ? recallOf(atIn(input.reviews, prev)) : null,
  };
}

function rateByTrack(events: readonly LearnEvent[]): Map<Track, { total: number; correct: number }> {
  const m = new Map<Track, { total: number; correct: number }>();
  for (const e of events) {
    if (e.result !== "correct" && e.result !== "wrong") continue;
    const a = m.get(e.track) ?? { total: 0, correct: 0 };
    a.total++;
    if (e.result === "correct") a.correct++;
    m.set(e.track, a);
  }
  return m;
}

function endOfDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59);
}

function practiceOf(input: ReportInput, p: Period, prev?: Period): PracticeStats {
  const cur = rateByTrack(atIn(input.events, p));
  const old = prev ? rateByTrack(atIn(input.events, prev)) : new Map();
  const tracks: TrackStats[] = [];
  for (const t of TRACKS) {
    const a = cur.get(t);
    if (!a) continue;
    const o = old.get(t);
    tracks.push({ track: t, total: a.total, correct: a.correct, rate: a.correct / a.total, prevRate: o ? o.correct / o.total : null });
  }
  return { tracks, weak: weakFocuses(input.events, { now: endOfDay(p.to), limit: 5 }) };
}

const BANDS: readonly [number, number][] = [
  [1, 3],
  [4, 6],
  [7, 9],
];
function grammarOf(input: ReportInput, p: Period): GrammarStats {
  const bands: GrammarBand[] = BANDS.map(([min, max]) => ({ label: `${min}–${max}`, min, max, total: 0, correct: 0, rate: null }));
  for (const e of atIn(input.events, p)) {
    if (e.track !== "grammar" || e.focus.kind !== "grammar-objective") continue;
    if (e.result !== "correct" && e.result !== "wrong") continue;
    const topic = topicById(e.focus.id.split("/")[0]);
    if (!topic) continue;
    const band = bands.find((b) => topic.difficulty >= b.min && topic.difficulty <= b.max);
    if (!band) continue;
    band.total++;
    if (e.result === "correct") band.correct++;
  }
  for (const b of bands) b.rate = b.total === 0 ? null : b.correct / b.total;
  return { mastered: input.grammarMastered, bands };
}

function tagsOf(input: ReportInput, p: Period, touches: Map<string, WordAgg>): Counted[] {
  const picked = new Map<string, VocabEntry>();
  for (const v of newSavedOf(input.vocab, p)) picked.set(v.id, v);
  const byWordKey = new Map<string, VocabEntry>();
  for (const v of input.vocab) if (!v.deletedAt) byWordKey.set(v.word.toLowerCase(), v);
  for (const a of touches.values()) {
    if (!a.saved || a.lookups === 0) continue;
    const v = byWordKey.get(a.word);
    if (v) picked.set(v.id, v);
  }
  const m = new Map<string, number>();
  for (const v of picked.values()) {
    const tags = new Set(
      v.level
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const t of tags) bump(m, t);
  }
  return ranked(m);
}

// ---- level signals (規劃書 15 §3.1) ----

function suggestLevel(level: CefrLevel | "", verdict: Verdict): CefrLevel | undefined {
  if (!level || (verdict !== "up" && verdict !== "down")) return undefined;
  const i = CEFR_LEVELS.indexOf(level);
  const j = Math.min(CEFR_LEVELS.length - 1, Math.max(0, i + (verdict === "up" ? 1 : -1)));
  return CEFR_LEVELS[j];
}

export function levelSignals(input: ReportInput, period: Period): LevelAdvice {
  const signals: LevelSignal[] = [];
  let judged = false; // at least one rule had enough data to decide

  // 1. grammar: the band the learner's level starts in
  const start = startDifficulty(input.level);
  const band = grammarOf(input, period).bands.find((b) => start >= b.min && start <= b.max);
  if (band && band.rate !== null && band.total >= GRAMMAR_MIN_N) {
    judged = true;
    const text = `文法 ${band.label} 級答對率 ${pct(band.rate)}（${band.total} 題）`;
    if (band.rate >= GRAMMAR_UP) signals.push({ kind: "grammar", direction: "up", reason: `${text}，已達 ${pct(GRAMMAR_UP)} 以上` });
    else if (band.rate < GRAMMAR_DOWN) signals.push({ kind: "grammar", direction: "down", reason: `${text}，低於 ${pct(GRAMMAR_DOWN)}` });
  }

  // 2. paragraph help
  const para = atIn(input.asks, period).filter((a) => a.ok && a.surface === "paragraph");
  if (para.length >= PARA_MIN_N) {
    judged = true;
    const translate = para.filter((a) => a.taskId === "paragraph.translate").length;
    const refine = para.filter((a) => a.taskId === "paragraph.grammar" || a.taskId === "paragraph.paraphrase").length;
    if (translate / para.length > PARA_TRANSLATE_DOWN) {
      signals.push({
        kind: "paragraph",
        direction: "down",
        reason: `段落討論 ${para.length} 次中有 ${translate} 次是翻譯（${pct(translate / para.length)}），閱讀材料可能偏難`,
      });
    } else if (refine / para.length >= PARA_REFINE_UP) {
      signals.push({
        kind: "paragraph",
        direction: "up",
        reason: `段落討論 ${para.length} 次中有 ${refine} 次是文法／換句話說（${pct(refine / para.length)}），理解沒問題，在精進表達`,
      });
    }
  }

  // 3. vocabulary
  const touches = touchesOf(input, period);
  const words = wordsOf(touches);
  const rs = atIn(input.reviews, period);
  const recall = recallOf(rs);
  const repeatedAll = [...touches.values()].filter((a) => a.days.size >= 2).length;
  if (recall !== null && recall < VOCAB_LOW && repeatedAll >= VOCAB_REPEATED_MIN) {
    judged = true;
    signals.push({
      kind: "vocab",
      direction: "down",
      reason: `單字記住率 ${pct(recall)}，且有 ${repeatedAll} 個字反覆查，新字進來太快，建議放慢`,
    });
  } else if (recall !== null && rs.length >= VOCAB_HIGH_MIN_REVIEWS) {
    judged = true;
    if (recall > VOCAB_HIGH) {
      signals.push({ kind: "vocab", direction: "up", reason: `單字記住率 ${pct(recall)}（複習 ${rs.length} 次），可以加量` });
    }
  }

  // 4. tags: description only
  const tags = tagsOf(input, period, touches);
  if (tags.length > 0 && words.lookups > 0) {
    signals.push({ kind: "tags", direction: "info", reason: `查的字多半在 ${tags[0].key}（${tags[0].count} 個）` });
  }

  const up = signals.filter((s) => s.direction === "up").length;
  const down = signals.filter((s) => s.direction === "down").length;
  let verdict: Verdict;
  if (up >= 2 && down === 0) verdict = "up";
  else if (down > 0 && down >= up) verdict = "down";
  else if (up === 0 && down === 0 && !judged) verdict = "insufficient";
  else verdict = "keep";

  const suggestedLevel = suggestLevel(input.level, verdict);
  return suggestedLevel ? { verdict, suggestedLevel, signals } : { verdict, signals };
}

export function buildReport(input: ReportInput, period: Period, prev?: Period): ReportData {
  const touches = touchesOf(input, period);
  return {
    period,
    activity: activityOf(input, period),
    ai: aiOf(input, period, prev),
    words: wordsOf(touches),
    vocab: vocabOf(input, period, prev),
    practice: practiceOf(input, period, prev),
    grammar: grammarOf(input, period),
    tags: tagsOf(input, period, touches),
    advice: levelSignals(input, period),
  };
}

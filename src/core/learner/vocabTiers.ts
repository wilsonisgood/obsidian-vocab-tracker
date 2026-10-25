import { cefrOf, CEFR_TIERS, type CefrTier } from "../wordlists/cefr";
import { CEFR_LEVELS } from "../model/settings";
import { SrsState } from "../model/srs";
import type { LevelEstimate } from "./levelEstimate";
import { atIn, newSavedOf, type Period, type ReportInput } from "./report";
import { num, VOCAB_SIZE } from "./vocabSize";

// Where the words the learner looks up / asks about / has mastered sit on
// the CEFR ladder (第二十三波 R7), and the vocabulary level read from it.
// Pure.

export type TierKey = CefrTier | "?";
export type TierCount = Record<TierKey, number>;
export interface TierProfile {
  asked: TierCount;
  looked: TierCount;
  saved: TierCount;
  mature: TierCount;
  // Words with no known level (deduped, at most UNKNOWN_WORDS_MAX).
  unknownWords: string[];
}

export const UNKNOWN_WORDS_MAX = 60;
export const TIER_SAMPLE_MIN = 8;
export const TIER_MATURE_MIN = 3;
export const TIER_EXAMPLES_MAX = 10;
const MATURE_STABILITY_DAYS = 21;
const TIER_KEYS: readonly TierKey[] = [...CEFR_TIERS, "?"];

export const emptyTierCount = (): TierCount => ({ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, "?": 0 });

const WORD = /^[a-z][a-z'’-]*$/;
// A single English word (a phrase, a number or Chinese text is skipped).
function single(raw: string | undefined): string | null {
  const w = raw?.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  return w && WORD.test(w) ? w : null;
}

interface TierWords {
  asked: Set<string>;
  looked: Set<string>;
  saved: Set<string>;
  mature: Set<string>;
}

function collectWords(input: ReportInput, period: Period): TierWords {
  const out: TierWords = { asked: new Set(), looked: new Set(), saved: new Set(), mature: new Set() };
  const wordOf = new Map(input.vocab.map((v) => [v.id, v.word]));
  for (const a of atIn(input.asks, period)) {
    if (!a.ok) continue;
    const w = single(a.entryId ? wordOf.get(a.entryId) : a.selection);
    if (w) out.asked.add(w);
  }
  for (const t of input.wordTouches) {
    if (t.lookup <= 0 || t.day < period.from || t.day > period.to) continue;
    const w = single(t.word);
    if (w) out.looked.add(w);
  }
  for (const v of newSavedOf(input.vocab, period)) {
    const w = single(v.word);
    if (w) out.saved.add(w);
  }
  for (const v of input.vocab) {
    if (v.deletedAt || v.liked !== true || !v.srs) continue;
    if (v.srs.state !== SrsState.Review || v.srs.stability < MATURE_STABILITY_DAYS) continue;
    const w = single(v.word);
    if (w) out.mature.add(w);
  }
  return out;
}

function countOf(words: Iterable<string>, extra: ReadonlyMap<string, CefrTier> | undefined, unknown: Set<string>): TierCount {
  const c = emptyTierCount();
  for (const w of words) {
    const t = cefrOf(w, extra);
    if (t) c[t]++;
    else {
      c["?"]++;
      unknown.add(w);
    }
  }
  return c;
}

export function vocabTierProfile(input: ReportInput, period: Period, extra?: ReadonlyMap<string, CefrTier>): TierProfile {
  const w = collectWords(input, period);
  // asked / looked / saved first, so the cap drops mature words first.
  const unknown = new Set<string>();
  const asked = countOf(w.asked, extra, unknown);
  const looked = countOf(w.looked, extra, unknown);
  const saved = countOf(w.saved, extra, unknown);
  const mature = countOf(w.mature, extra, unknown);
  return { asked, looked, saved, mature, unknownWords: [...unknown].slice(0, UNKNOWN_WORDS_MAX) };
}

// Example words per level among what was asked / looked up, for the analysis material.
export function tierExamples(input: ReportInput, period: Period, extra?: ReadonlyMap<string, CefrTier>, max = TIER_EXAMPLES_MAX): Record<CefrTier, string[]> {
  const w = collectWords(input, period);
  const out = Object.fromEntries(CEFR_TIERS.map((t) => [t, [] as string[]])) as Record<CefrTier, string[]>;
  for (const word of [...w.asked, ...w.looked]) {
    const t = cefrOf(word, extra);
    if (t && out[t].length < max && !out[t].includes(word)) out[t].push(word);
  }
  return out;
}

export const sumTiers = (a: TierCount, b: TierCount): TierCount => {
  const c = emptyTierCount();
  for (const k of TIER_KEYS) c[k] = a[k] + b[k];
  return c;
};
// Asked and looked-up words together: the "查／問的字" bar.
export const askedAndLooked = (p: TierProfile): TierCount => sumTiers(p.asked, p.looked);
const leveled = (c: TierCount): number => CEFR_TIERS.reduce((s, t) => s + c[t], 0);
const total = (c: TierCount): number => leveled(c) + c["?"];
const pct = (r: number) => `${Math.round(r * 100)}%`;

// ── The level read from the distribution ──

function tierLabel(lo: number, hi: number): string {
  return lo === hi ? CEFR_TIERS[lo] : `${CEFR_TIERS[lo]}–${CEFR_TIERS[hi]}`;
}

// null when fewer than TIER_SAMPLE_MIN of the asked / looked-up words have a
// level — the caller then falls back to the self-reported level.
export function vocabLevelFromTiers(profile: TierProfile): LevelEstimate | null {
  const both = askedAndLooked(profile);
  const n = leveled(both);
  if (n < TIER_SAMPLE_MIN) return null;

  // The median level: counting up from A1, the first level where the
  // running total passes half. Unlike the most common level, a spread-out
  // profile (A1 3, B1 2, B2 2) doesn't get pulled to one low peak.
  let edge = 0;
  for (let i = 0, run = 0; i < CEFR_TIERS.length; i++) {
    run += both[CEFR_TIERS[i]];
    if (run * 2 > n) {
      edge = i;
      break;
    }
  }
  let lo = Math.max(0, edge - 1);
  let hi = edge;
  let label = tierLabel(lo, hi);

  // Most of the mastered words at or above the edge → half a level up.
  const m = leveled(profile.mature);
  let promoted = false;
  if (m >= TIER_MATURE_MIN) {
    const atOrAbove = CEFR_TIERS.slice(edge).reduce((s, t) => s + profile.mature[t], 0);
    if (atOrAbove / m > 0.5) {
      promoted = true;
      if (edge === 0) {
        lo = 0;
        hi = 1;
      } else lo = hi;
      label = tierLabel(lo, hi);
    }
  }

  const parts = CEFR_TIERS.filter((t) => both[t] > 0).map((t) => `${t} ${pct(both[t] / n)}`);
  let basis = `你查／問的字：${parts.join("、")}`;
  if (m >= TIER_MATURE_MIN) basis += `；熟練的字多在 ${matureSpan(profile.mature)}`;
  if (promoted) basis += "（熟練的字多已在這一級以上，程度往上修半級）";

  const size = `估 ${num(VOCAB_SIZE[CEFR_LEVELS[lo]][0])}–${num(VOCAB_SIZE[CEFR_LEVELS[hi]][1])} 字`;
  return { area: "字彙量", level: `約 ${label}`, detail: size, basis };
}

// The two neighbouring levels that hold the most mastered words ("A2–B1"),
// or the one level when the rest is empty.
function matureSpan(c: TierCount): string {
  let best = 0;
  let bestSum = -1;
  for (let i = 0; i < CEFR_TIERS.length - 1; i++) {
    const s = c[CEFR_TIERS[i]] + c[CEFR_TIERS[i + 1]];
    if (s >= bestSum) {
      bestSum = s;
      best = i;
    }
  }
  const a = c[CEFR_TIERS[best]];
  const b = c[CEFR_TIERS[best + 1]];
  if (a === 0) return CEFR_TIERS[best + 1];
  if (b === 0) return CEFR_TIERS[best];
  return `${CEFR_TIERS[best]}–${CEFR_TIERS[best + 1]}`;
}

// ── For the AI and the analysis material ──

export function tierSummary(profile: TierProfile): string {
  const line = (label: string, c: TierCount) => {
    const parts = TIER_KEYS.filter((k) => c[k] > 0).map((k) => `${k === "?" ? "不明" : k} ${c[k]}`);
    return `- ${label}（${total(c)} 字）：${parts.join("、") || "沒有"}`;
  };
  return [line("查／問的字", askedAndLooked(profile)), line("熟練的字", profile.mature), line("這期新收藏的字", profile.saved)].join("\n");
}

// ── The vocab-report-tiers block ──

export interface TierSegment {
  tier: TierKey;
  count: number;
  // 0–100 each, summing to 100.
  percent: number;
  // Start of the segment, 0–100.
  start: number;
}

export function tierSegments(c: TierCount): TierSegment[] {
  const sum = total(c);
  if (sum === 0) return [];
  const out: TierSegment[] = [];
  let at = 0;
  for (const k of TIER_KEYS) {
    if (c[k] <= 0) continue;
    const percent = (c[k] / sum) * 100;
    out.push({ tier: k, count: c[k], percent, start: at });
    at += percent;
  }
  return out;
}

export function tiersFenceJson(profile: TierProfile): string {
  const trim = (c: TierCount) => Object.fromEntries(TIER_KEYS.map((k) => [k, c[k]]));
  return JSON.stringify({ asked: trim(askedAndLooked(profile)), mature: trim(profile.mature) });
}

export interface TierBars {
  asked: TierCount;
  mature: TierCount;
}

function countFrom(raw: unknown): TierCount {
  const c = emptyTierCount();
  if (typeof raw !== "object" || raw === null) return c;
  for (const k of TIER_KEYS) {
    const v = Number((raw as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v > 0) c[k] = Math.floor(v);
  }
  return c;
}

// The block body; null when it isn't JSON or has no words at all.
export function parseTiersSource(source: string): TierBars | null {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const bars = { asked: countFrom(o.asked), mature: countFrom(o.mature) };
  return total(bars.asked) + total(bars.mature) === 0 ? null : bars;
}

export const hasTierData = (p: TierProfile): boolean => total(askedAndLooked(p)) + total(p.mature) > 0;

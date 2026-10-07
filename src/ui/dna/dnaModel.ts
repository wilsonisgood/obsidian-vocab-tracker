import { parseBlockParams } from "../blocks/params";
import { matchMorpheme, normalizeForm, type MorphemeType } from "../../core/model/morpheme";
import type { VocabEntry } from "../../core/model/entry";
import type { MorphemeStat } from "../../services/learn/MorphemeService";

// Pure helpers behind the vocab-dna block (規劃書 09 §7 A3/A9) — no DOM, so
// they're unit-testable in vitest's node environment. dna.ts owns the DOM;
// this file owns the decisions.

export const DNA_TAB_ORDER: readonly MorphemeType[] = ["prefix", "suffix", "root"];

// ── Params (`type: suffix`, `morpheme: ee`) ─────────────────────────

export interface DnaParams {
  type?: string;
  morpheme?: string;
}

export function parseDnaParams(source: string): DnaParams {
  const p = parseBlockParams(source);
  const out: DnaParams = {};
  if (p.type) out.type = p.type;
  if (p.morpheme) out.morpheme = p.morpheme;
  return out;
}

export interface DnaSelection {
  type: MorphemeType;
  morphemeId?: string;
}

function isMorphemeType(s: string): s is MorphemeType {
  return (DNA_TAB_ORDER as readonly string[]).includes(s);
}

// `type:` defaults to "suffix"; if that tab has no data, falls back to the
// first tab (字首→字尾→字根 order) that does. `morpheme:` is matched the
// same way matchMorpheme() does (normalizeForm against form/variants),
// scoped to the resolved tab's own chips.
export function resolveDnaSelection(
  params: DnaParams,
  statsByType: Record<MorphemeType, readonly MorphemeStat[]>
): DnaSelection {
  const requested = params.type?.trim().toLowerCase() ?? "";
  let type: MorphemeType = isMorphemeType(requested) ? requested : "suffix";
  if (statsByType[type].length === 0) {
    const fallback = DNA_TAB_ORDER.find((t) => statsByType[t].length > 0);
    if (fallback) type = fallback;
  }
  const want = params.morpheme?.trim();
  const morphemeId = want
    ? matchMorpheme(
        statsByType[type].map((s) => s.morpheme),
        type,
        want
      )?.id
    : undefined;
  return { type, morphemeId };
}

// ── Focus from outside the block (09 §7.1) ─────────────────────────
// A word page's strand part opens Word DNA.md on that morpheme: main.ts
// records the request, every vocab-dna block applies it once — an open
// block right away (onRequest), one still opening when it first renders.

// A request older than this is stale: opening Word DNA.md by hand later
// shouldn't jump to whatever was last clicked.
export const DNA_FOCUS_TTL_MS = 10_000;

export interface DnaFocusRequest {
  morphemeId: string;
  at: number;
}

export interface DnaFocusPort {
  request(): DnaFocusRequest | undefined;
  onRequest(fn: () => void): () => void;
}

export function createDnaFocus(now: () => number = () => Date.now()): DnaFocusPort & { focus(morphemeId: string): void } {
  let current: DnaFocusRequest | undefined;
  const listeners = new Set<() => void>();
  return {
    request: () => current,
    onRequest(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    focus(morphemeId) {
      current = { morphemeId, at: now() };
      for (const fn of listeners) fn();
    },
  };
}

// The request a block hasn't applied yet (newer than `appliedAt`, not stale).
export function pendingFocus(req: DnaFocusRequest | undefined, appliedAt: number, now: number): DnaFocusRequest | null {
  if (!req || req.at <= appliedAt || now - req.at > DNA_FOCUS_TTL_MS) return null;
  return req;
}

// The tab a morpheme sits in; null when it has no learned word yet (stats
// only list morphemes with ≥1 liked word).
export function selectionForMorpheme(
  statsByType: Record<MorphemeType, readonly MorphemeStat[]>,
  morphemeId: string
): DnaSelection | null {
  for (const type of DNA_TAB_ORDER) {
    if (statsByType[type].some((s) => s.morpheme.id === morphemeId)) return { type, morphemeId };
  }
  return null;
}

// ── Chips (「-ee 接受動作的人 · 已學 2」) ────────────────────────────

export interface MorphemeChip {
  id: string;
  form: string;
  meaningZh: string;
  learnedCount: number;
}

// Sorted by learned count descending (stats() should already give this
// order; sorting again here keeps the chip list correct even if a fake in
// a test — or a future caller — hands them over unsorted).
export function morphemeChips(stats: readonly MorphemeStat[]): MorphemeChip[] {
  return stats
    .map((s) => ({ id: s.morpheme.id, form: s.morpheme.form, meaningZh: s.morpheme.meaningZh, learnedCount: s.learned.length }))
    .sort((a, b) => b.learnedCount - a.learnedCount);
}

// ── Related words (side list) ────────────────────────────────────

export interface RelatedWord {
  kind: "learned" | "suggested";
  word: string;
  zh: string;
  emoji: string;
  entryId?: string;
}

// 已學在前、建議在後；建議裡跟已學同一個字（不分大小寫、去頭尾空白）的要
// 扣掉，不然「還有哪些字」展開出一個早就在單字庫裡的字。
export function relatedWords(stat: MorphemeStat, emojiOf: (entry: VocabEntry) => string): RelatedWord[] {
  const key = (w: string) => w.trim().toLowerCase();
  const learnedKeys = new Set(stat.learned.map((e) => key(e.word)));
  const learned: RelatedWord[] = stat.learned.map((e) => ({
    kind: "learned",
    word: e.word,
    zh: e.definitionZh ?? "",
    emoji: emojiOf(e),
    entryId: e.id,
  }));
  const suggested: RelatedWord[] = stat.suggested
    .filter((s) => !learnedKeys.has(key(s.word)))
    .map((s) => ({ kind: "suggested", word: s.word, zh: s.zh, emoji: s.emoji }));
  return [...learned, ...suggested];
}

// 預設焦點字＝第一個已學字（stats() 保證 learned.length >= 1）。
export function defaultFocusEntryId(stat: MorphemeStat): string | undefined {
  return stat.learned[0]?.id;
}

// ── Wiktionary link ───────────────────────────────────────────────

// A morpheme's `form` can hold several spellings in one string
// ("ten / tin / tain"); the link uses the first one, with "-" and
// whitespace stripped the same way normalizeForm() does ("ex-" → "ex").
export function wiktionaryUrl(form: string): string {
  const first = (form.split("/")[0] ?? form).trim();
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(normalizeForm(first))}`;
}

// ── Timeline editing (MorphemeEditModal's textarea) ─────────────────

export interface TimelineStage {
  stage: string;
  form: string;
}

// One stage per line, "階段：形式" (full- or half-width colon). Blank
// lines and lines without a colon (or an empty stage before it) are
// skipped rather than erroring — a stray line in the textarea shouldn't
// block saving the rest.
export function parseTimeline(text: string): TimelineStage[] {
  const out: TimelineStage[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.search(/[:：]/);
    if (i <= 0) continue;
    const stage = line.slice(0, i).trim();
    const form = line.slice(i + 1).trim();
    if (stage) out.push({ stage, form });
  }
  return out;
}

export function formatTimeline(timeline: readonly TimelineStage[]): string {
  return timeline.map((s) => `${s.stage}：${s.form}`).join("\n");
}

import { topicById } from "../../core/grammar/catalog";
import { dueTopics } from "../../core/grammar/progress";
import { sightingsByTopic, sightingsOfPath } from "../../core/grammar/sightings";
import type { GrammarProgress, GrammarSighting, GrammarStage, GrammarTopic } from "../../core/model/grammar";
import type { VocabEntry } from "../../core/model/entry";
import { usagesOf } from "../../core/model/usage";

// Rows of the sidebar's 「文法」 section → 動詞用法 subheading (Wave 6 W):
// every verb that has a generated usage block, most recently generated,
// regenerated, or saved (收藏) first. Pure, so the ordering and the cap
// are unit-tested; GrammarSection.ts draws it. A 句型結構 subheading is
// meant to join this section later — its own pure module, not stubbed
// here yet.

export interface VerbUsageFavorite {
  // VerbFavorite.updatedAt — when it was (last) saved/unsaved.
  updatedAt?: string;
}

export interface VerbUsageRow {
  entryId: string;
  word: string;
  // Saved (寫入單字頁) right now.
  favorited: boolean;
  // generatedAt, or later if it was favorited after that (ISO).
  lastAt: string;
}

function ms(iso: string | undefined): number {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

// The later of two ISO timestamps (either may be missing).
function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return ms(b) > ms(a) ? b : a;
}

// `favoriteOf` mirrors LearnStore.verbFavorite: undefined when the verb
// isn't (currently) saved.
//
// `anyPos` (wave 14 U): while a Usage page is the visible main tab, the
// sidebar is its word list, so it lists every word with a usage block of
// any part of speech (what the page's old left column listed), not just
// verbs.
export function verbUsageRows(
  entries: readonly VocabEntry[],
  favoriteOf: (entryId: string) => VerbUsageFavorite | undefined,
  anyPos = false
): VerbUsageRow[] {
  const rows: VerbUsageRow[] = [];
  for (const e of entries) {
    // Wave 8 U1 (1006-2 #21): usage is per pos now; this section only
    // ever listed verbs, so it still only cares about pos "v" (merges
    // the legacy entry.usage field in — usagesOf()).
    const all = usagesOf(e);
    const blocks = anyPos ? Object.values(all) : all.v ? [all.v] : [];
    if (e.deletedAt || !blocks.length) continue;
    const fav = favoriteOf(e.id);
    let gen: string | undefined;
    for (const b of blocks) gen = later(gen, b?.generatedAt);
    const lastAt = later(gen, fav?.updatedAt) ?? "";
    rows.push({ entryId: e.id, word: e.word, favorited: !!fav, lastAt });
  }
  return rows.sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || a.entryId.localeCompare(b.entryId));
}

// How many rows the section shows before 「查看全部」 (which always links
// to 動詞用法.md, not a show-more toggle — the full, alphabetical list
// lives there).
export const RECENT_VERB_USAGE = 10;

// Wave 14 U: with a Usage page (not `word=` mode) visible as the main tab,
// a row switches that page's word and the list is uncapped (the page has no
// left column any more, so words past the cap would be unreachable);
// otherwise a row opens the word page and the list is capped as before.
export interface GrammarPlan {
  click: "select" | "openWord";
  limit: number | null;
}

export function grammarPlan(usagePageVisible: boolean): GrammarPlan {
  return usagePageVisible
    ? { click: "select", limit: null }
    : { click: "openWord", limit: RECENT_VERB_USAGE };
}

// ── 本篇用到的文法 / 待複習 (wave 15 S, 1013 §3.4) ─────────────────────

export const MAX_NOTE_GRAMMAR = 8;
export const MAX_DUE_GRAMMAR = 5;

export interface GrammarTopicRow {
  topicId: string;
  title: string;
  stage: GrammarStage;
}

export interface NoteGrammarRow extends GrammarTopicRow {
  // How many 文法解析 answers in this note named the topic.
  count: number;
}

// The topics the note's 文法解析 answers named, most-met first (then by
// stage / order), capped at `limit`. A topic that is no longer in the
// catalog is dropped.
export function noteGrammarRows(
  sightings: readonly GrammarSighting[],
  path: string | null,
  limit = MAX_NOTE_GRAMMAR
): NoteGrammarRow[] {
  if (!path) return [];
  const rows: { row: NoteGrammarRow; order: number }[] = [];
  for (const [topicId, list] of sightingsByTopic(sightingsOfPath(sightings, path))) {
    const topic = topicById(topicId);
    if (topic) rows.push({ row: { topicId, title: topic.title, stage: topic.stage, count: list.length }, order: topic.order });
  }
  rows.sort((a, b) => b.row.count - a.row.count || a.row.stage - b.row.stage || a.order - b.order);
  return rows.slice(0, limit).map((r) => r.row);
}

// Topics whose review is due, earliest due first, capped at `limit`.
export function dueGrammarRows(
  topics: readonly GrammarTopic[],
  progressOf: (topicId: string) => GrammarProgress | undefined,
  now: Date,
  limit = MAX_DUE_GRAMMAR
): GrammarTopicRow[] {
  return dueTopics(topics, progressOf, now)
    .slice(0, limit)
    .map((t) => ({ topicId: t.id, title: t.title, stage: t.stage }));
}

// The 文法（n）heading counts every row in all three subsections.
export function grammarTotal(noteRows: number, dueRows: number, verbRows: number): number {
  return noteRows + dueRows + verbRows;
}

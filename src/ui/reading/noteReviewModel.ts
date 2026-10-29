import type { VocabEntry } from "../../core/model/entry";
import { isNewCard } from "../../services/srs/queue";
import type { VocabRef } from "../../services/practice/scenarioApi";
import { SCENARIO_MAX_WORDS } from "../blocks/practice/vocabFilterModel";

// 「複習這篇筆記」(1030 #4), pure parts: which notes get the panel, which
// words its 單字 tab asks about, and what's remembered of it per device.

export type ReviewTab = "vocab" | "ai";

export interface ReviewPrefs {
  open: boolean;
  tab: ReviewTab;
}

export const REVIEW_STORAGE_KEY = "vt-note-review";
const DEFAULT_PREFS: ReviewPrefs = { open: false, tab: "vocab" };

// Per note path; kept for good (the learner asked for 「永遠記住」).
export function parseReviewPrefs(raw: unknown): Map<string, ReviewPrefs> {
  const out = new Map<string, ReviewPrefs>();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [path, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Record<string, unknown>;
    out.set(path, { open: r.open === true, tab: r.tab === "ai" ? "ai" : "vocab" });
  }
  return out;
}

export function reviewPrefsOf(all: ReadonlyMap<string, ReviewPrefs>, path: string): ReviewPrefs {
  return all.get(path) ?? DEFAULT_PREFS;
}

export function serializeReviewPrefs(all: ReadonlyMap<string, ReviewPrefs>): Record<string, ReviewPrefs> {
  return Object.fromEntries(all);
}

// A renamed note keeps its panel state.
export function renameReviewPrefs(all: Map<string, ReviewPrefs>, oldPath: string, newPath: string): boolean {
  const cur = all.get(oldPath);
  if (!cur) return false;
  all.delete(oldPath);
  all.set(newPath, cur);
  return true;
}

// Only notes with something to review: a word of the note (本篇) or a
// discussion of it (a paragraph's or the whole note's).
export function showsReview(o: { skip: boolean; words: number; discussions: number }): boolean {
  return !o.skip && (o.words > 0 || o.discussions > 0);
}

function isDue(e: VocabEntry, nowMs: number): boolean {
  return !isNewCard(e) && !!e.srs && Date.parse(e.srs.due) <= nowMs;
}

const added = (e: VocabEntry) => e.createdAt ?? e.added ?? "";

// The words the 單字 tab's scenarios are written around: the note's words
// (scope), each with its meaning in this note when it has one (語境意思),
// else its own Chinese meaning; words with neither are left out. Due first
// (oldest due first), then the newest; at most `max`.
export function noteVocabRefs(
  entries: readonly VocabEntry[],
  scope: ReadonlySet<string>,
  glossOf: (word: string) => { zh: string; pos?: string } | undefined,
  now: Date,
  max = SCENARIO_MAX_WORDS
): VocabRef[] {
  const nowMs = now.getTime();
  const refs: { e: VocabEntry; ref: VocabRef }[] = [];
  for (const e of entries) {
    if (e.deletedAt || !scope.has(e.id)) continue;
    const g = glossOf(e.word);
    const zh = (g?.zh ?? e.definitionZh).trim();
    if (!zh) continue;
    refs.push({ e, ref: { id: e.id, word: e.word, zh, pos: g?.pos || e.partOfSpeech } });
  }
  const due = refs.filter((r) => isDue(r.e, nowMs)).sort((a, b) => Date.parse(a.e.srs!.due) - Date.parse(b.e.srs!.due));
  const rest = refs.filter((r) => !isDue(r.e, nowMs)).sort((a, b) => (added(a.e) < added(b.e) ? 1 : added(a.e) > added(b.e) ? -1 : 0));
  return [...due, ...rest].slice(0, max).map((r) => r.ref);
}

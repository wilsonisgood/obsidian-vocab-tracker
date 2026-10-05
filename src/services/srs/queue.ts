import type { VocabEntry } from "../../core/model/entry";
import { SrsState, type CardMode, type ReviewLog } from "../../core/model/srs";
import { clozeParts } from "../../core/text/cloze";

// Pure queue-building logic for SrsService (規劃書 06 §7.1), split out so
// ordering and the daily new-card cap can be tested without ts-fsrs or a
// store.

export interface QueueFilter {
  // Vault path prefix, e.g. "eng/" — only words captured from notes under it.
  source?: string;
  // Cloze needs an example sentence that actually contains the word;
  // other modes accept every card.
  mode?: CardMode;
  // Max cards in the returned queue (after due/new ordering).
  limit?: number;
}

export interface QueueContext {
  now: Date;
  dailyNew: number;
  logs: readonly ReviewLog[];
}

// A missing card is "new" too: entries migrated before M2 have no srs at
// all, and are scheduled lazily the first time they're rated.
export function isNewCard(entry: VocabEntry): boolean {
  return !entry.srs || entry.srs.state === SrsState.New;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Distinct cards that left the New state today (local calendar day). The
// daily cap is "new cards *introduced* per day", so rating the same new
// card Again three times still only uses one slot.
export function newIntroducedToday(logs: readonly ReviewLog[], now: Date): number {
  const dayStart = startOfLocalDay(now).getTime();
  const ids = new Set<string>();
  for (const log of logs) {
    if (log.prevState !== SrsState.New) continue;
    if (new Date(log.at).getTime() >= dayStart) ids.add(log.entryId);
  }
  return ids.size;
}

export function matchesFilter(entry: VocabEntry, filter: QueueFilter): boolean {
  if (entry.deletedAt) return false;
  if (filter.source && !(entry.source?.path ?? "").startsWith(filter.source)) return false;
  if (filter.mode === "cloze" && !clozeParts(entry.example, entry.word)) return false;
  return true;
}

function dueMs(entry: VocabEntry): number {
  return entry.srs ? new Date(entry.srs.due).getTime() : 0;
}

// Oldest-added first, so new cards come up roughly in the order they were
// captured. createdAt is ISO; `added` (local "YYYY-MM-DD HH:mm:ss") sorts
// lexically too and covers entries stamped before createdAt existed.
function addedKey(entry: VocabEntry): string {
  return entry.createdAt ?? entry.added ?? "";
}

// Due reviews (learning/review/relearning cards with due ≤ now) sorted by
// due date, then new cards up to whatever is left of today's new-card
// allowance. Reviews go first so a backlog is never starved by new words.
export function buildQueue(
  entries: readonly VocabEntry[],
  filter: QueueFilter,
  ctx: QueueContext
): VocabEntry[] {
  const nowMs = ctx.now.getTime();
  const candidates = entries.filter((e) => matchesFilter(e, filter));

  const due = candidates
    .filter((e) => !isNewCard(e) && dueMs(e) <= nowMs)
    .sort((a, b) => dueMs(a) - dueMs(b));

  const allowance = Math.max(0, ctx.dailyNew - newIntroducedToday(ctx.logs, ctx.now));
  const fresh = candidates
    .filter(isNewCard)
    .sort((a, b) => (addedKey(a) < addedKey(b) ? -1 : addedKey(a) > addedKey(b) ? 1 : 0))
    .slice(0, allowance);

  const queue = [...due, ...fresh];
  return filter.limit !== undefined && filter.limit >= 0 ? queue.slice(0, filter.limit) : queue;
}

// Where a card stands when it's reviewed on its own (「複習這個字」 on a
// word page), which ignores the queue: never scheduled, due now, or early.
export type ReviewTiming =
  | { kind: "new" }
  | { kind: "due"; due: Date }
  | { kind: "early"; due: Date };

export function reviewTiming(entry: VocabEntry, now: Date): ReviewTiming {
  if (isNewCard(entry) || !entry.srs) return { kind: "new" };
  const due = new Date(entry.srs.due);
  if (Number.isNaN(due.getTime())) return { kind: "new" };
  return due.getTime() <= now.getTime() ? { kind: "due", due } : { kind: "early", due };
}

// Scheduled (non-new) cards whose due date falls in [from, to) — e.g.
// "明天到期" on the done screen (L4).
export function countDueBetween(
  entries: readonly VocabEntry[],
  filter: QueueFilter,
  from: Date,
  to: Date
): number {
  const a = from.getTime();
  const b = to.getTime();
  return entries.filter((e) => {
    if (!matchesFilter(e, filter) || isNewCard(e)) return false;
    const ms = dueMs(e);
    return ms >= a && ms < b;
  }).length;
}

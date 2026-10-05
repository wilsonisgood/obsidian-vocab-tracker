import type { VocabEntry } from "../../core/model/entry";
import { nowStamp } from "../../core/nowStamp";

// Word list order and grouping (1005 回饋 1、13). Pure, so the order is
// unit-tested; GroupedWordList.ts and the sidebar draw it.

// "2026-07-25 14:03:11" (nowStamp, local time — `added`, `lastReviewed`),
// or a plain "2026-07-25".
const LOCAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// Milliseconds for a stored time: ISO (createdAt / updatedAt) or a local
// nowStamp. NaN when missing or unreadable.
export function stampMs(s: string | undefined): number {
  if (!s) return NaN;
  const m = LOCAL_STAMP.exec(s.trim());
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
  }
  // ISO only: Date.parse alone would read "July 25" as some year's date.
  return ISO.test(s) ? Date.parse(s) : NaN;
}

function firstMs(...values: (string | undefined)[]): number {
  for (const v of values) {
    const ms = stampMs(v);
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

// When the word was last changed: updatedAt, else when it was added.
export function entryRecency(e: VocabEntry): number {
  return firstMs(e.updatedAt, e.createdAt, e.added);
}

export function entryAddedMs(e: VocabEntry): number {
  return firstMs(e.createdAt, e.added);
}

// Most recently changed first; ties (e.g. a batch import, or the v1→v2
// migration stamping every word at once) put the newer word first, then
// keep the list's own order.
export function sortByRecent(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries
    .map((entry, i) => ({ entry, i, r: entryRecency(entry), a: entryAddedMs(entry) }))
    .sort((x, y) => y.r - x.r || y.a - x.a || x.i - y.i)
    .map((x) => x.entry);
}

// ── Groups ──────────────────────────────────────────────────────────────

//   note      the source note (words clicked in an article, exam imports)
//   family    no note, added from a word family (origin "family:<id>")
//   wordlist  no note, imported from an exam word list
//   none      no note, origin unknown (added by hand from a word page…)
export type GroupKind = "note" | "family" | "wordlist" | "none";

export interface GroupRef {
  // Stable id of the group (collapsed state is keyed by it).
  key: string;
  kind: GroupKind;
  path?: string;
  familyId?: string;
}

const FAMILY_PREFIX = "family:";

export function groupOf(e: Pick<VocabEntry, "source" | "origin">): GroupRef {
  const path = e.source?.path;
  if (path) return { key: `note:${path}`, kind: "note", path };
  const origin = e.origin;
  if (origin?.startsWith(FAMILY_PREFIX)) {
    return { key: origin, kind: "family", familyId: origin.slice(FAMILY_PREFIX.length) };
  }
  if (origin === "wordlist") return { key: "wordlist", kind: "wordlist" };
  return { key: "none", kind: "none" };
}

export interface WordGroup extends GroupRef {
  entries: VocabEntry[];
  // Recency of the group's most recently changed word.
  latest: number;
}

export type GroupOrder = "recent" | "title";

// "recent": groups by their latest change, words inside most recent first
// (the sidebar). "title": groups A→Z by `titleOf`, words in list order
// (the vocab-list dashboard).
export function groupEntries(
  entries: readonly VocabEntry[],
  order: GroupOrder,
  titleOf: (g: GroupRef) => string = (g) => g.key
): WordGroup[] {
  const byKey = new Map<string, WordGroup>();
  for (const entry of entries) {
    const ref = groupOf(entry);
    let g = byKey.get(ref.key);
    if (!g) {
      g = { ...ref, entries: [], latest: 0 };
      byKey.set(ref.key, g);
    }
    g.entries.push(entry);
    g.latest = Math.max(g.latest, entryRecency(entry));
  }
  const groups = [...byKey.values()];
  if (order === "recent") {
    for (const g of groups) g.entries = sortByRecent(g.entries);
    return groups.sort((a, b) => b.latest - a.latest || a.key.localeCompare(b.key));
  }
  return groups.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
}

// The note's name for a note group.
export function noteTitle(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/, "");
}

// ── Dates on the word card (1005 回饋 14) ───────────────────────────────

// The same "YYYY-MM-DD HH:mm:ss" the card already shows for 加入時間.
export function displayStamp(s: string | undefined): string {
  const ms = stampMs(s);
  if (Number.isNaN(ms)) return s ?? "";
  return nowStamp(new Date(ms));
}

export function displayDate(s: string | undefined): string {
  const ms = stampMs(s);
  if (Number.isNaN(ms)) return s ?? "";
  return nowStamp(new Date(ms)).slice(0, 10);
}

// What the card shows as 加入 / 更新 (raw stored values; empty when unknown).
export function entryDates(e: VocabEntry): { added: string; updated: string } {
  return { added: e.added || e.createdAt || "", updated: e.updatedAt || "" };
}

import type { VocabEntry } from "../../core/model/entry";
import { liveTurns, type Thread } from "../../core/model/thread";
import { lastTurnAt } from "./paragraphRows";

// Rows of the sidebar's 「AI 討論」 section (1005 回饋 2; Wave 6 W: word
// discussions only — paragraph discussions moved to their own 「段落討論」
// section (VocabSidebarView §段落討論), so they aren't listed twice.
// Every word with a live question, most recently active first. Pure, so
// the order is unit-tested; DiscussionList.ts draws them.

// What it reads from ThreadService — a method it has today, so no new
// query is needed.
export interface DiscussionSource {
  wordThread(entryId: string): Thread | undefined;
}

export interface DiscussionRow {
  threadId: string;
  entryId: string;
  // The word.
  title: string;
  // Questions asked.
  count: number;
  // When the last turn was added (ISO).
  lastAt?: string;
}

function questions(thread: Thread): number {
  return liveTurns(thread).filter((t) => t.role === "user").length;
}

function ms(iso: string | undefined): number {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

export function discussionRows(src: DiscussionSource, entries: readonly VocabEntry[]): DiscussionRow[] {
  const rows: DiscussionRow[] = [];
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const thread = src.wordThread(entry.id);
    if (!thread || thread.deletedAt) continue;
    const count = questions(thread);
    if (!count) continue;
    rows.push({ threadId: thread.id, entryId: entry.id, title: entry.word, count, lastAt: lastTurnAt(thread) });
  }
  return rows.sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || a.threadId.localeCompare(b.threadId));
}

// How many rows the section shows before 「顯示全部」.
export const RECENT_DISCUSSIONS = 20;

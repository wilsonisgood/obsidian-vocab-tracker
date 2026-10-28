import { liveTurns, pairTurns, type Thread, type Turn } from "../model/thread";

// 學習夥伴頁面的純邏輯：對話清單依日期分組、十則存檔、第 9 則提示。

// ── 對話清單依日期分組 ─────────────────────────────────────────────

export interface GroupItem {
  id: string;
  // ISO stamp the conversation is filed under (last update).
  at: string;
}

export interface DayGroup {
  // Local day, YYYY-MM-DD — also the key the collapsed state is stored by.
  key: string;
  label: { kind: "today" } | { kind: "yesterday" } | { kind: "date"; md: string };
  ids: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Groups keep the order of `items` (newest first); unparseable stamps are dropped.
export function groupByDay(items: readonly GroupItem[], now: Date): DayGroup[] {
  const today = localDay(now);
  const yesterday = localDay(new Date(dayStart(now) - 12 * 3_600_000));
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const item of items) {
    const d = new Date(item.at);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDay(d);
    let g = byKey.get(key);
    if (!g) {
      const label: DayGroup["label"] =
        key === today ? { kind: "today" } : key === yesterday ? { kind: "yesterday" } : { kind: "date", md: `${d.getMonth() + 1}/${d.getDate()}` };
      g = { key, label, ids: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.ids.push(item.id);
  }
  return groups;
}

// Open by default: today's group and the group the open conversation is in.
export function defaultExpandedKeys(groups: readonly DayGroup[], activeId: string, now: Date): Set<string> {
  const keys = new Set<string>([localDay(now)]);
  for (const g of groups) if (g.ids.includes(activeId)) keys.add(g.key);
  return keys;
}

// `overrides`: what the learner toggled while this block lived (true = collapsed).
export function isGroupCollapsed(key: string, overrides: ReadonlyMap<string, boolean>, defaults: ReadonlySet<string>): boolean {
  return overrides.get(key) ?? !defaults.has(key);
}

// ── 對話整理：活著的問答滿 10 組，把最舊的 8 組存成筆記並刪掉 ──────────

export const ARCHIVE_TRIGGER = 10;
export const ARCHIVE_TAKE = 8;
export const WARN_AT = ARCHIVE_TRIGGER - 1;

export function userQuestionCount(thread: Thread | undefined): number {
  return liveTurns(thread).filter((turn) => turn.role === "user").length;
}

export interface ArchivePair {
  user: Turn;
  assistant: Turn;
}

// 一組問答 that finished with an answer, in order.
export function answeredPairs(thread: Thread | undefined): ArchivePair[] {
  const out: ArchivePair[] = [];
  for (const p of pairTurns(liveTurns(thread))) {
    if (p.assistant && p.assistant.status === "done" && p.assistant.content.trim()) out.push({ user: p.user, assistant: p.assistant });
  }
  return out;
}

// `questionNumber`: which question the one just sent is.
export function shouldWarnNinth(questionNumber: number, lastWarnedDay: string | null, today: string): boolean {
  return questionNumber === WARN_AT && lastWarnedDay !== today;
}

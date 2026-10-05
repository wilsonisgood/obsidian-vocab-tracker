import { t } from "../../core/i18n";

// 加入日期 / 更新日期 on the learning pages (字族樹, 動詞用法, 冷知識;
// 1005 回饋 #14). Pure — no "obsidian" import — so it's unit-tested.

export type DateLabel = "added" | "updated" | "saved";

export function dateLabel(key: DateLabel, date: string): string {
  return t(`learn.dates.${key}`, { date });
}

const pad = (n: number) => String(n).padStart(2, "0");

// 「10/05」 in local time, 「2025/10/05」 for another year; undefined for a
// missing or unparseable stamp.
export function dayLabel(iso: string | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const md = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

export interface DatesView {
  added?: string;
  // Only when it falls on another day than `added`.
  updated?: string;
}

export function recordDates(
  rec: { createdAt?: string; updatedAt?: string },
  now: Date = new Date()
): DatesView {
  const added = dayLabel(rec.createdAt, now);
  const updated = dayLabel(rec.updatedAt, now);
  const out: DatesView = {};
  if (added) out.added = added;
  if (updated && updated !== added) out.updated = updated;
  return out;
}

// 「加入 10/03 · 更新 10/05」 (or 「收藏 10/03 · …」 with `first: "saved"`);
// "" when there's no date at all.
export function datesText(d: DatesView, first: "added" | "saved" = "added"): string {
  const parts: string[] = [];
  if (d.added) parts.push(dateLabel(first, d.added));
  if (d.updated) parts.push(dateLabel("updated", d.updated));
  return parts.join(" · ");
}

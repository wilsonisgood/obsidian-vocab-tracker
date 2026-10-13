import { joinWords, t, type I18nKey } from "../../../core/i18n";
import type { VocabEntry } from "../../../core/model/entry";
import { splitTags, type QueueFilter } from "../../../services/srs/queue";
import {
  selectedIds,
  selectedLabels,
  type FilterGroup,
  type FilterValue,
  type QuickPick,
} from "./filterBarModel";

// The vocab tab's filter (第十六波 E): which cards the flashcards round
// draws from. Value keys: status, level, pos, folder, added.

export const RECENT_DAYS = 7;

export interface VocabFilterOptions {
  levels: string[];
  pos: string[];
  folders: string[];
}

// "eng/Articles/a.md" → "eng/"; a note at the vault root has none.
export function firstFolder(path: string | undefined): string | undefined {
  const i = (path ?? "").indexOf("/");
  return i > 0 ? path!.slice(0, i + 1) : undefined;
}

// Most used first, ties alphabetical.
function ranked(counts: Map<string, number>): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

// What the chips offer, collected from the cards the queue could draw from
// (liked and not deleted).
export function collectVocabOptions(entries: readonly VocabEntry[]): VocabFilterOptions {
  const levels = new Map<string, number>();
  const pos = new Map<string, number>();
  const folders = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const e of entries) {
    if (e.deletedAt || e.liked !== true) continue;
    for (const l of new Set(splitTags(e.level))) bump(levels, l);
    for (const p of new Set(splitTags(e.partOfSpeech))) bump(pos, p);
    const f = firstFolder(e.source?.path);
    if (f) bump(folders, f);
  }
  return { levels: ranked(levels), pos: ranked(pos), folders: ranked(folders) };
}

export function vocabGroups(opts: VocabFilterOptions): FilterGroup[] {
  const mk = (id: string, label: I18nKey, ids: string[], multi: boolean): FilterGroup => ({
    id,
    label: t(label),
    multi,
    options: ids.map((x) => ({ id: x, label: x })),
  });
  const groups: FilterGroup[] = [
    {
      id: "status",
      label: t("practice.vocab.status"),
      multi: false,
      options: [
        { id: "due", label: t("practice.vocab.due") },
        { id: "new", label: t("practice.vocab.new") },
        { id: "all", label: t("practice.vocab.all") },
      ],
    },
    { id: "added", label: t("practice.vocab.added"), multi: false, options: [{ id: "recent", label: t("practice.vocab.recent") }] },
  ];
  if (opts.levels.length > 0) groups.push(mk("level", "practice.vocab.level", opts.levels, true));
  if (opts.pos.length > 0) groups.push(mk("pos", "practice.vocab.pos", opts.pos, true));
  // One prefix at a time: QueueFilter.source is a single path prefix.
  if (opts.folders.length > 0) groups.push(mk("folder", "practice.vocab.folder", opts.folders, false));
  return groups;
}

export function vocabQuickPicks(): QuickPick[] {
  return [
    { id: "due-today", label: t("practice.vocab.quickDue"), apply: () => ({ status: ["due"] }) },
    { id: "recent", label: t("practice.vocab.quickRecent"), apply: () => ({ status: ["all"], added: ["recent"] }) },
  ];
}

export function statusOf(value: FilterValue): "due" | "new" | "all" {
  const s = selectedIds(value, "status")[0];
  return s === "new" || s === "all" ? s : "due";
}

// 「到期 · 多益中級、托福高級 · 名詞 · eng/」; nothing picked beyond the
// default reads just 「到期」.
export function vocabSummary(value: FilterValue, groups: readonly FilterGroup[]): string {
  const parts: string[] = [];
  const statusGroup = groups.find((g) => g.id === "status");
  parts.push(statusGroup?.options.find((o) => o.id === statusOf(value))?.label ?? t("practice.vocab.due"));
  for (const g of groups) {
    if (g.id === "status") continue;
    const labels = selectedLabels(value, g);
    if (labels.length > 0) parts.push(joinWords(labels));
  }
  return parts.join(" · ");
}

// The value as queue filters. `now` anchors 「7 天內」.
export function toQueueFilter(value: FilterValue, now: Date): Partial<QueueFilter> {
  const out: Partial<QueueFilter> = { status: statusOf(value) };
  const levels = selectedIds(value, "level");
  if (levels.length > 0) out.levels = levels;
  const pos = selectedIds(value, "pos");
  if (pos.length > 0) out.pos = pos;
  const folder = selectedIds(value, "folder")[0];
  if (folder) out.source = folder;
  if (selectedIds(value, "added")[0] === "recent") {
    out.addedSince = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  return out;
}

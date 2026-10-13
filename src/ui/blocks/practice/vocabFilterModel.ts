import { joinWords, t, type I18nKey } from "../../../core/i18n";
import type { VocabEntry } from "../../../core/model/entry";
import { isNewCard, matchesFilter, splitTags, type QueueFilter } from "../../../services/srs/queue";
import {
  selectedIds,
  selectedLabels,
  type FilterGroup,
  type FilterValue,
  type QuickPick,
} from "./filterBarModel";
import type { ScenarioRequest, VocabRef } from "./mixTypes";

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

// ── 情境練習 (第十七波 V) ───────────────────────────────────────

export const SCENARIO_MAX_WORDS = 12;
export const SCENARIO_MIN_WORDS = 3;

export type VocabMode = "cards" | "scenario";

export function parseVocabMode(raw: unknown): VocabMode {
  return raw === "scenario" ? "scenario" : "cards";
}

function isDue(e: VocabEntry, nowMs: number): boolean {
  return !isNewCard(e) && !!e.srs && new Date(e.srs.due).getTime() <= nowMs;
}

function addedStamp(e: VocabEntry): string {
  return e.createdAt ?? e.added ?? "";
}

// The words a scenario round is written around: the same filter as the
// cards (liked, not deleted, level / pos / folder / added), except the
// status chip only narrows when it says 「新」 — 「到期」 would leave a
// scenario with nothing to write about when nothing is due. Due words first
// (oldest due first), then the most recently added; at most `max`.
// Words without a Chinese meaning are skipped (the writer needs one).
export function pickScenarioEntries(
  entries: readonly VocabEntry[],
  value: FilterValue,
  now: Date,
  max = SCENARIO_MAX_WORDS
): VocabEntry[] {
  const filter = toQueueFilter(value, now);
  const onlyNew = filter.status === "new";
  const nowMs = now.getTime();
  const ok = entries.filter(
    (e) =>
      matchesFilter(e, { ...filter, requireLiked: true }) &&
      e.definitionZh.trim() !== "" &&
      (!onlyNew || isNewCard(e))
  );
  const due = ok.filter((e) => isDue(e, nowMs)).sort((a, b) => new Date(a.srs!.due).getTime() - new Date(b.srs!.due).getTime());
  const rest = ok
    .filter((e) => !isDue(e, nowMs))
    .sort((a, b) => (addedStamp(a) < addedStamp(b) ? 1 : addedStamp(a) > addedStamp(b) ? -1 : 0));
  return [...due, ...rest].slice(0, max);
}

export function toVocabRefs(entries: readonly VocabEntry[]): VocabRef[] {
  return entries.map((e) => ({ id: e.id, word: e.word, zh: e.definitionZh.trim(), pos: e.partOfSpeech }));
}

export function pickVocabRefs(entries: readonly VocabEntry[], value: FilterValue, now: Date, max = SCENARIO_MAX_WORDS): VocabRef[] {
  return toVocabRefs(pickScenarioEntries(entries, value, now, max));
}

// The request for a round, or null when there are too few words.
export function vocabScenarioRequest(refs: readonly VocabRef[]): ScenarioRequest | null {
  return refs.length >= SCENARIO_MIN_WORDS ? { track: "vocab", words: [...refs] } : null;
}

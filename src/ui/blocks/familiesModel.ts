import type { VocabEntry } from "../../core/model/entry";
import { familyMembers, type Family, type FamilyMember } from "../../core/model/family";
import { WordIndex } from "../../services/learn/wordIndex";
import { recordDates, type DatesView } from "../kit/dates";
import { parseBlockParams } from "./params";

// View-models for the vocab-families block (規劃書 06 §7.2, screens L5 字族樹
// and W3 找字族 · 選字入庫). Pure — no "obsidian" import — so it's unit-tested.

export interface FamiliesParams {
  // Family to open first, by topic or label (「topic: kitchenware」).
  topic?: string;
  // Word-page mode (W3): only families containing this word, and 「找字族」
  // grows families around it.
  word?: string;
}

const unquote = (s: string | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function parseFamiliesParams(source: string): FamiliesParams {
  const p = parseBlockParams(source);
  const out: FamiliesParams = {};
  const topic = unquote(p.topic ?? p.family);
  if (topic) out.topic = topic;
  const word = unquote(p.word);
  if (word) out.word = word;
  return out;
}

const key = (w: string) => w.trim().toLowerCase();

// 「kitchenware 廚房用品」, but just 「gl- 發光家族」 when the label already
// carries the topic.
export function familyTitle(f: { topic: string; label: string }): string {
  const topic = f.topic.trim();
  const label = f.label.trim();
  if (!label) return topic;
  if (!topic || key(label).includes(key(topic))) return label;
  return `${topic} ${label}`;
}

// The family `topic` names, matching topic, label or the full title.
export function findFamily(families: readonly Family[], topic: string | undefined): Family | undefined {
  if (!topic) return undefined;
  const k = key(topic);
  return families.find((f) => key(f.topic) === k || key(f.label) === k || key(familyTitle(f)) === k);
}

// Whether a member is in the vocab list right now: its entryId is live, or
// the word itself (any inflection) is — learned since the family was saved.
export class MemberLookup {
  private byId: Map<string, VocabEntry>;
  private index: WordIndex;

  constructor(entries: readonly VocabEntry[]) {
    const live = entries.filter((e) => !e.deletedAt);
    this.byId = new Map(live.map((e) => [e.id, e]));
    this.index = new WordIndex(live);
  }

  entry(m: Pick<FamilyMember, "entryId" | "word">): VocabEntry | undefined {
    return (m.entryId ? this.byId.get(m.entryId) : undefined) ?? this.index.find(m.word);
  }

  byEntryId(id: string): VocabEntry | undefined {
    return this.byId.get(id);
  }
}

// ── L5 tree ────────────────────────────────────────────────────

export interface TreeChip {
  word: string;
  zh: string;
  known: boolean;
  entryId?: string;
  // The word the learner came from (「來源：字族樹 …」 on its word page).
  focus?: boolean;
}

export interface TreeColumn {
  label: string;
  chips: TreeChip[];
}

export interface FamilyTreeView {
  id: string;
  title: string;
  columns: TreeColumn[];
  // 「起點：你學過的 aprons、kitchenware」 — the seed words still in the list.
  seeds: string[];
  knownCount: number;
  suggestedCount: number;
  // 加入 / 更新日期 (1005 回饋 #14).
  dates: DatesView;
}

export function familyTree(f: Family, lookup: MemberLookup, opts: { focusEntryId?: string; now?: Date } = {}): FamilyTreeView {
  let knownCount = 0;
  let suggestedCount = 0;
  const columns: TreeColumn[] = [];
  for (const g of f.groups) {
    const chips: TreeChip[] = [];
    for (const m of g.members) {
      if (!m.word.trim()) continue;
      const e = lookup.entry(m);
      if (e) knownCount++;
      else suggestedCount++;
      const chip: TreeChip = e ? { word: m.word, zh: m.zh, known: true, entryId: e.id } : { word: m.word, zh: m.zh, known: false };
      if (e && opts.focusEntryId && e.id === opts.focusEntryId) chip.focus = true;
      chips.push(chip);
    }
    if (chips.length) columns.push({ label: g.label, chips });
  }
  const seeds = (f.seedEntryIds ?? [])
    .map((id) => lookup.byEntryId(id)?.word)
    .filter((w): w is string => !!w);
  return { id: f.id, title: familyTitle(f), columns, seeds, knownCount, suggestedCount, dates: recordDates(f, opts.now) };
}

// Word-page mode: the families a word belongs to, by entry or by spelling.
export function familiesWith(families: readonly Family[], entry: VocabEntry): Family[] {
  const word = key(entry.word);
  return families.filter((f) =>
    familyMembers(f).some((m) => m.entryId === entry.id || key(m.word) === word)
  );
}

// After a save: open the first saved family that's on screen.
export function pickSelected(
  families: readonly Family[],
  current: string | undefined,
  preferTopic?: string
): string | undefined {
  if (current && families.some((f) => f.id === current)) return current;
  return (findFamily(families, preferTopic) ?? families[0])?.id;
}

// ── 「來源：字族樹 …」 → the tree on that family ─────────────────────
//
// The word page's origin chip (wordHeader.ts) asks for a family and opens
// 字族樹.md. A tree block already on screen jumps to it (onFamilyFocus);
// one that's about to open takes the request when it loads
// (takeFamilyFocus). Module state, so the two never import each other.

export interface FamilyFocus {
  familyId: string;
  // The member to highlight: the word the learner came from.
  entryId?: string;
}

let pendingFocus: FamilyFocus | null = null;
const focusListeners = new Set<(f: FamilyFocus) => void>();

export function focusFamily(focus: FamilyFocus): void {
  pendingFocus = focus;
  for (const fn of focusListeners) fn(focus);
}

export function takeFamilyFocus(): FamilyFocus | null {
  const f = pendingFocus;
  pendingFocus = null;
  return f;
}

export function onFamilyFocus(fn: (f: FamilyFocus) => void): () => void {
  focusListeners.add(fn);
  return () => focusListeners.delete(fn);
}

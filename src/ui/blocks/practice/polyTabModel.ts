import { joinWords, t, type I18nKey } from "../../../core/i18n";
import type { PolyCategory, PolyFilter, PolyLevel, PolySense } from "../../../core/model/poly";
import {
  parsePolyFilter,
  POLY_CATEGORIES,
  POLY_WORDS,
  polyWord,
  sensesInFilter,
  wordsInCategory,
} from "../../../core/poly/catalog";
import { selectedLabels, type FilterGroup, type FilterValue, type QuickPick } from "./filterBarModel";

// Pure logic of the 常用字 practice tab and the Polysemy map (第十七波 Q):
// filter ⇄ chip value, quick picks, the sense-map rows and progress dots.
// No DOM, so it's unit-tested.

export const POLY_REFILL_THRESHOLD = 4;
export const POLY_LEVELS: readonly PolyLevel[] = [1, 2, 3];

export function categoryLabel(c: PolyCategory): string {
  return t(`poly.cat.${c}` as I18nKey);
}

export function levelLabel(l: PolyLevel): string {
  return t(`poly.level.${l}` as I18nKey);
}

export function categoryOfWord(word: string): PolyCategory | undefined {
  return polyWord(word)?.category;
}

// The category the 字 chips show when the tab opens: the first chosen word's.
export function initialCategory(f: PolyFilter): PolyCategory {
  return (f.words[0] && categoryOfWord(f.words[0])) || "A";
}

// ── Filter ⇄ chip value ─────────────────────────────────────────

// `category` only decides which words the 字 chips list; selected words from
// other categories stay in `word` (and in the filter).
export function filterToValue(f: PolyFilter, category: PolyCategory): FilterValue {
  const v: FilterValue = { category: [category] };
  if (f.words.length > 0) v.word = [...f.words];
  if (f.levels.length > 0) v.level = f.levels.map(String);
  return v;
}

// Unticked senses are kept only for words still chosen.
export function valueToFilter(v: FilterValue, prev: PolyFilter): { filter: PolyFilter; category: PolyCategory } {
  const category = (v.category?.[0] as PolyCategory | undefined) ?? initialCategory(prev);
  const filter = parsePolyFilter({
    words: v.word ?? [],
    levels: (v.level ?? []).map(Number),
    excluded: prev.excluded,
  });
  const wordSet = new Set(filter.words);
  filter.excluded = filter.excluded.filter((id) => wordSet.has(id.split(".")[0]));
  return { filter, category: POLY_CATEGORIES.includes(category) ? category : initialCategory(filter) };
}

export function polyGroups(category: PolyCategory): FilterGroup[] {
  return [
    {
      id: "category",
      label: t("practice.poly.category"),
      multi: false,
      options: POLY_CATEGORIES.map((c) => ({ id: c, label: categoryLabel(c) })),
    },
    {
      id: "word",
      label: t("practice.poly.word"),
      multi: true,
      options: wordsInCategory(category).map((w) => ({ id: w.word, label: w.word })),
    },
    {
      id: "level",
      label: t("practice.poly.level"),
      multi: true,
      options: POLY_LEVELS.map((l) => ({ id: String(l), label: levelLabel(l) })),
    },
  ];
}

// 「get、take · 基礎、中級」; nothing chosen reads 「尚未選字」.
export function polySummary(f: PolyFilter): string {
  if (f.words.length === 0) return t("practice.poly.noneChosen");
  const levels = f.levels.length > 0 ? joinWords(f.levels.map(levelLabel)) : t("practice.poly.allLevels");
  return `${joinWords(f.words)} · ${levels}`;
}

// Kept for callers that want the group's own labels.
export function wordLabels(v: FilterValue, group: FilterGroup): string[] {
  return selectedLabels(v, group);
}

// ── Quick picks ─────────────────────────────────────────────────

export interface PolyQuickSources {
  // Words the learner saved (VocabEntry words); only those in the data count.
  saved: readonly string[];
  // Sense ids that were wrong last time.
  weakSenseIds: readonly string[];
}

export function savedPolyWords(saved: readonly string[]): string[] {
  const lower = new Set(saved.map((w) => w.trim().toLowerCase()));
  return POLY_WORDS.filter((w) => lower.has(w.word)).map((w) => w.word);
}

export function weakPolyWords(senseIds: readonly string[]): string[] {
  const words = new Set(senseIds.map((id) => id.split(".")[0]));
  return POLY_WORDS.filter((w) => words.has(w.word)).map((w) => w.word);
}

// A quick pick sets the words (all levels, nothing unticked) and shows the
// first word's category. Picks that would select nothing aren't offered.
export function polyQuickPicks(src: PolyQuickSources): QuickPick[] {
  const pick = (id: string, label: I18nKey, words: string[]): QuickPick[] =>
    words.length > 0
      ? [
          {
            id,
            label: t(label),
            apply: () => filterToValue({ words, levels: [], excluded: [] }, categoryOfWord(words[0]) ?? "A"),
          },
        ]
      : [];
  return [
    ...pick("saved", "practice.poly.quickSaved", savedPolyWords(src.saved)),
    ...pick("weak", "practice.poly.quickWeak", weakPolyWords(src.weakSenseIds)),
  ];
}

// ── Sense map ───────────────────────────────────────────────────

export interface SenseStats {
  correct: number;
  wrong: number;
  // Newest last.
  recent: boolean[];
}

// ○ never practised · ◐ practised but not settled (has a wrong, or fewer
// than three right in a row) · ● the last three were all right.
export type ProgressDot = "none" | "partial" | "done";

export function progressDot(s: SenseStats | undefined): ProgressDot {
  if (!s || s.correct + s.wrong === 0) return "none";
  const last3 = s.recent.slice(-3);
  if (last3.length === 3 && last3.every(Boolean)) return "done";
  return "partial";
}

export const DOT_CHAR: Record<ProgressDot, string> = { none: "○", partial: "◐", done: "●" };

export interface SenseRow {
  id: string;
  word: string;
  zh: string;
  example: string;
  cue: string;
  level: PolyLevel;
  // Ticked in the map: it will be tested (unticked = reference only).
  checked: boolean;
  // Outside the chosen levels: reference only whatever the tick says.
  outOfLevel: boolean;
  dot: ProgressDot;
}

export interface WordSection {
  word: string;
  rows: SenseRow[];
}

// One section per chosen word, one row per sense.
export function senseSections(f: PolyFilter, stats: (id: string) => SenseStats | undefined): WordSection[] {
  const excluded = new Set(f.excluded);
  return f.words.flatMap((word) => {
    const w = polyWord(word);
    if (!w) return [];
    return [
      {
        word,
        rows: w.senses.map((s) => ({
          id: s.id,
          word,
          zh: s.zh,
          example: s.example,
          cue: s.cue,
          level: s.level,
          checked: !excluded.has(s.id),
          outOfLevel: f.levels.length > 0 && !f.levels.includes(s.level),
          dot: progressDot(stats(s.id)),
        })),
      },
    ];
  });
}

// Ticking / unticking one sense; returns a new filter.
export function toggleExcluded(f: PolyFilter, senseId: string): PolyFilter {
  const excluded = f.excluded.includes(senseId) ? f.excluded.filter((x) => x !== senseId) : [...f.excluded, senseId];
  return { ...f, excluded };
}

// Ids of the senses one practice set tests: the pool is scoped to these.
export function testedSenseIds(f: PolyFilter): Set<string> {
  return new Set(sensesInFilter(f).tested.map((s: PolySense) => s.id));
}

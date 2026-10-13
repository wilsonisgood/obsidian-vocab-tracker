import type { PolyCategory, PolyFilter, PolyWord } from "../../core/model/poly";
import { POLY_WORDS } from "../../core/poly/catalog";
import { progressDot, type SenseStats } from "./practice/polyTabModel";

// Pure logic of the vocab-polysemy block (Polysemy.md, 第十七波 Q).

export type MapCategory = PolyCategory | "all";

// Category segment + search box. The query matches the word (substring,
// case-insensitive) or any sense's Chinese meaning.
export function filterPolyWords(category: MapCategory, query: string, words: readonly PolyWord[] = POLY_WORDS): PolyWord[] {
  const q = query.trim().toLowerCase();
  return words.filter((w) => {
    if (category !== "all" && w.category !== category) return false;
    if (q === "") return true;
    return w.word.includes(q) || w.senses.some((s) => s.zh.includes(q));
  });
}

// How many of a word's senses are settled (● : last three right).
export function wordProgress(w: PolyWord, stats: (id: string) => SenseStats | undefined): { done: number; total: number } {
  return { done: w.senses.filter((s) => progressDot(stats(s.id)) === "done").length, total: w.senses.length };
}

// 「練習這個字」: only this word, every level, nothing unticked.
export function practiceFilterFor(word: string): PolyFilter {
  return { words: [word], levels: [], excluded: [] };
}

import type { PolyCategory, PolyFilter, PolyWord } from "../../core/model/poly";
import { POLY_WORDS } from "../../core/poly/catalog";
import { progressDot, type SenseStats } from "./practice/polyTabModel";

// Pure logic of the vocab-polysemy block (Polysemy.md, 第十七波 Q).

export type MapCategory = PolyCategory | "all";

const HAS_CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
// The part of a meaning outside half- and full-width brackets: the English
// in 「以防（just in case）」 must not match a query.
const stripBrackets = (zh: string): string => zh.replace(/[（(][^）)]*[）)]/g, "");

// Category segment + search box (第十八波 R). An English (ASCII) query
// matches the word itself only — the exact word first, then words starting
// with it. A query
// with Chinese matches the Chinese meanings, brackets removed.
export function filterPolyWords(category: MapCategory, query: string, words: readonly PolyWord[] = POLY_WORDS): PolyWord[] {
  const q = query.trim().toLowerCase();
  const inCat = words.filter((w) => category === "all" || w.category === category);
  if (q === "") return inCat;
  if (!HAS_CJK.test(q)) {
    const rank = (w: PolyWord): number => (w.word === q ? 0 : w.word.startsWith(q) ? 1 : 2);
    return inCat
      .map((w) => ({ w, r: rank(w) }))
      .filter((x) => x.r < 2)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.w);
  }
  return inCat.filter((w) => w.senses.some((s) => stripBrackets(s.zh).includes(q)));
}

// How many of a word's senses are settled (● : last three right).
export function wordProgress(w: PolyWord, stats: (id: string) => SenseStats | undefined): { done: number; total: number } {
  return { done: w.senses.filter((s) => progressDot(stats(s.id)) === "done").length, total: w.senses.length };
}

// 「練習這個字」: only this word, every level, nothing unticked.
export function practiceFilterFor(word: string): PolyFilter {
  return { words: [word], levels: [], excluded: [] };
}

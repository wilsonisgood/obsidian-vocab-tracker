import type { PolyCategory, PolyFilter, PolyLevel, PolySense, PolyWord } from "../model/poly";
import { POLY_WORDS } from "./data";

export { POLY_WORDS };

export const POLY_CATEGORIES: readonly PolyCategory[] = ["A", "B", "C", "D", "E"];

const byWord = new Map(POLY_WORDS.map((w) => [w.word, w]));
const bySense = new Map(POLY_WORDS.flatMap((w) => w.senses.map((s) => [s.id, s] as const)));

export function polyWord(word: string): PolyWord | undefined {
  return byWord.get(word.trim().toLowerCase());
}

export function senseById(id: string): PolySense | undefined {
  return bySense.get(id);
}

export function wordsInCategory(category: PolyCategory): PolyWord[] {
  return POLY_WORDS.filter((w) => w.category === category);
}

const isLevel = (n: unknown): n is PolyLevel => n === 1 || n === 2 || n === 3;

// A stored filter value (undefined, an older shape, junk) → a clean filter.
// Unknown words and sense ids are dropped.
export function parsePolyFilter(v: unknown): PolyFilter {
  const out: PolyFilter = { words: [], levels: [], excluded: [] };
  if (!v || typeof v !== "object") return out;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.words)) {
    out.words = [...new Set(o.words.filter((x): x is string => typeof x === "string" && byWord.has(x)))];
  }
  if (Array.isArray(o.levels)) out.levels = [...new Set(o.levels.filter(isLevel))].sort();
  if (Array.isArray(o.excluded)) {
    out.excluded = [...new Set(o.excluded.filter((x): x is string => typeof x === "string" && bySense.has(x)))];
  }
  return out;
}

// The senses one practice set is about: `tested` (標「考」) and `reference`
// (標「參考」: unticked in the sense map, or outside the chosen levels).
export function sensesInFilter(f: PolyFilter): { tested: PolySense[]; reference: PolySense[] } {
  const tested: PolySense[] = [];
  const reference: PolySense[] = [];
  const excluded = new Set(f.excluded);
  for (const word of f.words) {
    for (const s of polyWord(word)?.senses ?? []) {
      const inLevel = f.levels.length === 0 || f.levels.includes(s.level);
      (inLevel && !excluded.has(s.id) ? tested : reference).push(s);
    }
  }
  return { tested, reference };
}

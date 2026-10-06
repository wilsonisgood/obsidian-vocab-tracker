import type { VocabEntry } from "../../core/model/entry";

// Rows of the sidebar's 「文法」 section → 動詞用法 subheading (Wave 6 W):
// every verb that has a generated usage block, most recently generated,
// regenerated, or saved (收藏) first. Pure, so the ordering and the cap
// are unit-tested; GrammarSection.ts draws it. A 句型結構 subheading is
// meant to join this section later — its own pure module, not stubbed
// here yet.

export interface VerbUsageFavorite {
  // VerbFavorite.updatedAt — when it was (last) saved/unsaved.
  updatedAt?: string;
}

export interface VerbUsageRow {
  entryId: string;
  word: string;
  // Saved (寫入單字頁) right now.
  favorited: boolean;
  // generatedAt, or later if it was favorited after that (ISO).
  lastAt: string;
}

function ms(iso: string | undefined): number {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

// The later of two ISO timestamps (either may be missing).
function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return ms(b) > ms(a) ? b : a;
}

// `favoriteOf` mirrors LearnStore.verbFavorite: undefined when the verb
// isn't (currently) saved.
export function verbUsageRows(
  entries: readonly VocabEntry[],
  favoriteOf: (entryId: string) => VerbUsageFavorite | undefined
): VerbUsageRow[] {
  const rows: VerbUsageRow[] = [];
  for (const e of entries) {
    if (e.deletedAt || !e.usage) continue;
    const fav = favoriteOf(e.id);
    const lastAt = later(e.usage.generatedAt, fav?.updatedAt) ?? e.usage.generatedAt;
    rows.push({ entryId: e.id, word: e.word, favorited: !!fav, lastAt });
  }
  return rows.sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || a.entryId.localeCompare(b.entryId));
}

// How many rows the section shows before 「查看全部」 (which always links
// to 動詞用法.md, not a show-more toggle — the full, alphabetical list
// lives there).
export const RECENT_VERB_USAGE = 10;

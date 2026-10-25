import type { VocabEntry } from "../model/entry";
import { lemmaCandidates } from "./lemma";
import type { Lookup } from "./scan";

const NONE: readonly string[] = [];
const SINGLE_WORD = /^[a-z][a-z'-]*$/;

// The saved single words, lowercased. Phrases are left out: the reading
// view is matched one word at a time, so "look up" could never hit.
export function savedWords(entries: readonly VocabEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const w = e.word.trim().toLowerCase();
    if (SINGLE_WORD.test(w)) out.add(w);
  }
  return out;
}

// Reading-view lookup for saved words in every note — not only the note a
// word was added from, whose text got ==word== written into it. Answers
// with the saved word itself (["analyze"] for "analyzed"), so a click can
// open that word's card.
export function vocabLookup(words: ReadonlySet<string>, inflections: boolean): Lookup {
  const memo = new Map<string, readonly string[]>();
  return (word) => {
    const lower = word.toLowerCase();
    let hit = memo.get(lower);
    if (hit) return hit;
    hit = NONE;
    if (words.has(lower)) hit = [lower];
    else if (inflections) {
      const base = lemmaCandidates(lower).find((b) => words.has(b));
      if (base) hit = [base];
    }
    memo.set(lower, hit);
    return hit;
  };
}

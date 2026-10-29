import type { CefrLevel } from "../model/settings";
import type { GlossWord, ParagraphGloss } from "../model/learner";
import { plainParagraph } from "../text/paragraphs";
import { matchesWord } from "../text/occurrences";
import { CEFR_TIERS, cefrOf, type CefrTier } from "../wordlists/cefr";

// 語境意思 (1030 #3), pure parts: which words of a paragraph to gloss, and
// looking a word's gloss up for a note.

// A long paragraph is glossed in one fast call; past this the rest waits
// (the AI answer has to stay small).
export const GLOSS_MAX_WORDS = 40;

const TOKEN_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

// Words below the learner's level are skipped: an A2 learner skips A1
// words and glosses everything else (words outside the lists included —
// names are left for the AI to drop). No level set: treated as A2.
export function glossCandidates(
  paragraph: string,
  level: CefrLevel | "",
  extra?: ReadonlyMap<string, CefrTier>,
  max = GLOSS_MAX_WORDS
): string[] {
  const floor = CEFR_TIERS.indexOf(level || "A2");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of plainParagraph(paragraph).matchAll(TOKEN_RE)) {
    const w = m[0].toLowerCase().replace(/^'+|'+$/g, "");
    if (w.length < 2 || seen.has(w)) continue;
    seen.add(w);
    const tier = cefrOf(w, extra);
    if (tier && CEFR_TIERS.indexOf(tier) < floor) continue;
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

export interface NoteGloss extends GlossWord {
  at: string;
}

// Every glossed word of the paragraphs whose hashes are given (one note's
// paragraphs), the newest gloss winning when a word was glossed twice.
export function noteGlosses(glosses: readonly ParagraphGloss[], hashes: Iterable<string>): Map<string, NoteGloss> {
  const ids = new Set(hashes);
  const out = new Map<string, NoteGloss>();
  for (const g of glosses) {
    if (!ids.has(g.id)) continue;
    for (const w of g.words) {
      const cur = out.get(w.w);
      if (!cur || g.at > cur.at) out.set(w.w, { ...w, at: g.at });
    }
  }
  return out;
}

// A saved word's gloss in the note: its own form first, else an inflected
// form glossed in the paragraph ("analyze" → "analyzed").
export function glossOf(map: ReadonlyMap<string, NoteGloss>, word: string): NoteGloss | undefined {
  const w = word.trim().toLowerCase();
  const hit = map.get(w);
  if (hit) return hit;
  for (const [form, g] of map) if (matchesWord(form, w, true)) return g;
  return undefined;
}

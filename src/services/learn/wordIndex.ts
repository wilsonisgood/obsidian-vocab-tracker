import type { VocabEntry } from "../../core/model/entry";
import { buildWordRe } from "../../core/text/wordRe";
import { lemmaCandidates } from "../../core/wordlists/lemma";

// Finds learned words in AI text: family members → entries (W3, L5), and
// the 「mentions」 of a trivia answer (規劃書 06 §4.1, §7.4). Matching is
// case-insensitive and tolerates simple inflections both ways — the list
// may hold "aprons" while the text says "apron", or the other way round.

const TOKEN_RE = /[A-Za-z][A-Za-z'-]*/g;

// An entry stored as a plural ("aprons") also matches the singular. Only
// plurals: lemma rules run backwards turn common words into learned ones
// (thing → "the", likely → "like", shed → "she").
const STOP = new Set(["the", "she", "new", "even", "like", "use", "her", "his", "one"]);
function pluralBases(w: string): string[] {
  if (w.length > 4 && w.endsWith("ies")) return [w.slice(0, -3) + "y"];
  if (/(?:s|x|z|ch|sh)es$/.test(w)) return [w.slice(0, -2)];
  if (w.length > 3 && w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) return [w.slice(0, -1)];
  return [];
}

export class WordIndex {
  private exact = new Map<string, VocabEntry>();
  // Base forms of the entries' own words ("aprons" → "apron").
  private base = new Map<string, VocabEntry>();
  // Multi-word entries ("paring knife", "gloss over") are matched as phrases.
  private phrases: VocabEntry[] = [];

  constructor(entries: readonly VocabEntry[]) {
    for (const e of entries) {
      if (e.deletedAt) continue;
      const w = e.word.trim().toLowerCase();
      if (!w) continue;
      if (/\s/.test(w)) {
        this.phrases.push(e);
        continue;
      }
      if (!this.exact.has(w)) this.exact.set(w, e);
    }
    for (const [w, e] of this.exact) {
      for (const b of pluralBases(w)) if (!STOP.has(b) && !this.exact.has(b) && !this.base.has(b)) this.base.set(b, e);
    }
  }

  // The entry for a single word or phrase, if it's in the list.
  find(word: string): VocabEntry | undefined {
    const w = word.trim().toLowerCase();
    if (!w) return undefined;
    if (/\s/.test(w)) return this.phrases.find((e) => e.word.trim().toLowerCase() === w);
    const hit = this.exact.get(w) ?? this.base.get(w);
    if (hit) return hit;
    for (const b of lemmaCandidates(w)) {
      const e = this.exact.get(b);
      if (e) return e;
    }
    return undefined;
  }

  // Ids of the learned words appearing in `text`, in order of first
  // appearance (phrases after single words), minus `exclude`.
  mentions(text: string, exclude: ReadonlySet<string> = new Set()): string[] {
    const out: string[] = [];
    const add = (e: VocabEntry | undefined) => {
      if (e && !exclude.has(e.id) && !out.includes(e.id)) out.push(e.id);
    };
    for (const token of text.match(TOKEN_RE) ?? []) add(this.find(token.replace(/^['-]+|['-]+$/g, "")));
    for (const e of this.phrases) if (buildWordRe(e.word.trim()).test(text)) add(e);
    return out;
  }
}

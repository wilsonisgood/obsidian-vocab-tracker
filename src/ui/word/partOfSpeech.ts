// Wave 7 R — collapsed row badge: part-of-speech abbreviations
// (1006report.md 定案規格 #12). Pure, so it's unit-tested without any DOM.

// entry.partOfSpeech is free text from the dictionary sources (Datamuse,
// Wiktionary) or hand-written: "noun", "Verb, noun", "transitive verb",
// already-abbreviated ("v."), or non-English ("動詞") — see
// core/model/usage.ts's isVerb() comment for the same free-for-all. A word
// can carry several at once (comma/slash/semicolon-separated), and the
// collapsed row lists every one of them abbreviated, in order, deduped.
interface Abbrev {
  re: RegExp;
  short: string;
}

const ABBREV: Abbrev[] = [
  { re: /noun/i, short: "n." },
  // adverb before verb: "adverb" contains the substring "verb", so it must
  // be checked first or it'd never match its own rule.
  { re: /adverb/i, short: "adv." },
  { re: /verb/i, short: "v." },
  { re: /adjective/i, short: "adj." },
  { re: /pronoun/i, short: "pron." },
  { re: /preposition/i, short: "prep." },
  { re: /conjunction/i, short: "conj." },
  { re: /interjection/i, short: "interj." },
  { re: /article|determiner/i, short: "det." },
  { re: /numeral/i, short: "num." },
];

// Splits on the usual list separators, abbreviates every recognised part
// (checked in the order above — adverb before verb matters, see that
// entry's comment). A part that doesn't match anything (already
// abbreviated, non-English, or just unrecognised) is kept as-is, trimmed.
// Deduped, order preserved.
export function abbreviatePartOfSpeech(raw: string | undefined): string[] {
  const parts = (raw ?? "")
    .split(/[,;/]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const part of parts) {
    const hit = ABBREV.find((a) => a.re.test(part));
    const short = hit ? hit.short : part;
    if (!out.includes(short)) out.push(short);
  }
  return out;
}

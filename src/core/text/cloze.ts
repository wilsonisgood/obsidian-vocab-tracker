import { escapeRe } from "./wordRe";

export interface ClozeParts {
  before: string;
  // The form actually found in the sentence (may be inflected or
  // differently cased), revealed when the card is flipped.
  answer: string;
  after: string;
}

// Common inflectional endings, so "endeavor" still blanks out "endeavors"
// in its example. Deliberately a short closed list rather than "any
// trailing letters": the latter would let "art" blank out "article".
const SUFFIXES = "(?:s|es|ed|d|ing|er|est|ly)?";

// Splits `sentence` around the first whole-word occurrence of `word` for a
// fill-in-the-blank card. Returns null when the word can't be found, which
// the flashcard queue treats as "no usable example — skip this card in
// cloze mode" (規劃書 06 §7.1).
export function clozeParts(sentence: string, word: string): ClozeParts | null {
  const w = word.trim();
  if (!sentence || !w) return null;
  const re = new RegExp(
    `(?<![A-Za-z0-9'\\-])${escapeRe(w)}${SUFFIXES}(?![A-Za-z0-9'\\-])`,
    "i"
  );
  const m = re.exec(sentence);
  if (!m) return null;
  return {
    before: sentence.slice(0, m.index),
    answer: m[0],
    after: sentence.slice(m.index + m[0].length),
  };
}

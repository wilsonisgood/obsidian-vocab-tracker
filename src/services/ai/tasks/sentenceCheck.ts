// Shape checks for a question sentence (第十八波 R, 1013-3). The model
// sometimes writes the *question* ("[[of]] 在這句中是什麼意思？") into the
// sentence slot, or leaves the gap at the very end ("a cup ____."). Both make
// the question unanswerable, so the parsers drop them.

export const MIN_SENTENCE_WORDS = 6;
export const MIN_OPTION_WORDS = 4;

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3001-\u303f\uff00-\uffef]/;
const GAP_ANY = /_{3,}/g;

export const englishWords = (s: string): string[] => s.match(WORD_RE) ?? [];
export const hasCjk = (s: string): boolean => CJK_RE.test(s);

// The sentence with [[ ]] and ____ taken out (so "a cup ____ tea" counts the
// words around the gap only).
export function sentenceWordCount(text: string): number {
  return englishWords(text.replace(/\[\[|\]\]/g, "").replace(GAP_ANY, " ")).length;
}

// A full natural sentence: enough English words, no Chinese, and — when it
// has a gap — at least one English word after the gap.
export function isFullSentence(text: string): boolean {
  if (hasCjk(text)) return false;
  if (sentenceWordCount(text) < MIN_SENTENCE_WORDS) return false;
  const i = text.search(GAP_ANY);
  if (i >= 0) {
    const after = text.slice(i).replace(GAP_ANY, " ");
    if (englishWords(after).length === 0) return false;
  }
  return true;
}

const MAX_EDITS = 2;

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Lowercase prefix match on the first token, or a close spelling that starts
// with the same letter ("got" for "get"). The wholly irregular forms of the
// 常用字 verbs, which neither rule catches, are listed.
const IRREGULAR: Readonly<Record<string, readonly string[]>> = {
  go: ["went", "gone"],
  do: ["did"],
  get: ["gotten"],
  take: ["took"],
  break: ["broke", "broken"],
  catch: ["caught"],
  bring: ["brought"],
};

export function isTargetForm(marked: string, target: string): boolean {
  const a = (englishWords(marked)[0] ?? "").toLowerCase();
  const b = (englishWords(target)[0] ?? "").toLowerCase();
  if (!a || !b) return false;
  if (IRREGULAR[b]?.includes(a)) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return Math.min(a.length, b.length) >= 3 && a[0] === b[0] && editDistance(a, b) <= MAX_EDITS;
}

// same-sense option sentences: short English sentences holding the target.
export function isOptionSentence(text: string, target: string | undefined): boolean {
  if (hasCjk(text)) return false;
  const words = englishWords(text);
  if (words.length < MIN_OPTION_WORDS) return false;
  if (target && !words.some((w) => isTargetForm(w, target))) return false;
  return true;
}

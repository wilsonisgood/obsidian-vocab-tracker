import { escapeRe } from "./wordRe";

// ── Locate the clicked word's line in the note's source ────────

export function findSourceLine(content: string, word: string, sentence?: string): number {
  const lines = content.split("\n");
  const wordRe = new RegExp(
    `(?<![A-Za-z0-9'\\-])${escapeRe(word)}(?![A-Za-z0-9'\\-])`,
    "i"
  );

  const candidates: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (wordRe.test(lines[i])) candidates.push(i);
  }
  if (candidates.length === 0) return -1;
  if (candidates.length === 1 || !sentence) return candidates[0];

  // Several lines contain the word — pick the one that overlaps the
  // clicked sentence the most.
  const sentWords = new Set(sentence.toLowerCase().match(/[a-z']+/g) || []);
  let best = candidates[0];
  let bestScore = -1;
  for (const i of candidates) {
    const lw = lines[i].toLowerCase().match(/[a-z']+/g) || [];
    let score = 0;
    for (const w of lw) if (sentWords.has(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

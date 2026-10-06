// 第八波 R2 — 在筆記裡定位單字 (1006-2 #7 #8 #9)。純函式，沒有 DOM／obsidian
// 依賴，可以單獨測。斷詞規則沿用 ../wordlists/scan.ts 的 WORD_RE（跟
// noteWords.ts 同一套：proseLines 去掉 frontmatter／code／連結目標，剩下的
// 行用同一個 WORD_RE 斷詞），變化形判定沿用 ../wordlists/lemma.ts 的
// lemmaCandidates，跟 noteWords.ts 的 noteWordSet() 是同一套規則，只是這裡
// 要留住每一處的行號／欄位，不能只留 Set。

import { proseLines } from "../wordlists/scan";
import { lemmaCandidates } from "../wordlists/lemma";

// 跟 wordlists/scan.ts 的 WORD_RE 完全一樣。
const WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

export interface Occurrence {
  // 原文行號（0-based，含 frontmatter，跟 VocabSource.line 一致）。
  line: number;
  // 該行裡的字元欄位（0-based）。
  ch: number;
  // 比對到的原文長度（可能跟 target 的長度不同，例如變化形 "studied"）。
  length: number;
}

// candidate（原文裡斷出來的字）是不是在找 target（已經是小寫、trim 過的
// lemma）：完全相同，或 inflections 開著時 candidate 的某個 lemmaCandidates
// 等於 target（"studied" 算 "study"）。跟 noteWords.ts 的 noteWordSet() 同一
// 套規則。
export function matchesWord(candidate: string, target: string, inflections: boolean): boolean {
  const lower = candidate.toLowerCase();
  if (lower === target) return true;
  return inflections && lemmaCandidates(lower).includes(target);
}

// `word` 在 `markdown` 正文裡的每一處，依行號／欄位（原文順序）排序。範圍同
// proseLines：忽略 frontmatter、code、連結目標等。
export function findOccurrences(markdown: string, word: string, inflections: boolean): Occurrence[] {
  const target = word.trim().toLowerCase();
  const out: Occurrence[] = [];
  if (!target) return out;
  const lines = proseLines(markdown);
  for (let line = 0; line < lines.length; line++) {
    for (const m of lines[line].matchAll(WORD_RE)) {
      if (matchesWord(m[0], target, inflections)) {
        out.push({ line, ch: m.index!, length: m[0].length });
      }
    }
  }
  return out;
}

// (1006-2 #7) 同一個字再點一次 → 跳到下一處，循環。total 為 0 時沒有東西可
// 跳，回 -1。
export function nextOccurrenceIndex(current: number, total: number): number {
  if (total <= 0) return -1;
  return (current + 1) % total;
}

// (1006-2 #16) 回到筆記後，挑離原本捲動行最近的一處。兩處一樣近時挑前面
// 那個（index 較小）。occurrences 為空回 -1。
export function nearestOccurrenceIndex(occurrences: readonly Pick<Occurrence, "line">[], nearLine: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < occurrences.length; i++) {
    const dist = Math.abs(occurrences[i].line - nearLine);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

// 同一行裡，這一處排第幾個（0-based，依 ch 排序，也就是陣列順序）。閱讀模式
// 要在渲染出來的 DOM 裡數到第幾個符合的文字節點時用（同一段落、同一行可能
// 有好幾個符合的詞）。
export function occurrenceIndexInLine(occurrences: readonly Occurrence[], index: number): number {
  const target = occurrences[index];
  let k = 0;
  for (let i = 0; i < index; i++) {
    if (occurrences[i].line === target.line) k++;
  }
  return k;
}

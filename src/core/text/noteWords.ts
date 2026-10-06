// Wave 7 Z — 「這篇有出現這個字」(1006report.md 定案規格 #6)：like 的字不一
// 定在任何考試字表裡，考試字表的比對（WordlistIndex）幫不上忙，所以另外用
// 同一套斷詞／變化形規則（../wordlists/scan.ts 的 proseLines + WORD_RE，
// ../wordlists/lemma.ts 的 lemmaCandidates）直接在筆記文字裡找這個字。純函
// 式，呼叫端（側欄）負責快取到 mtime 改變為止。

import { proseLines } from "../wordlists/scan";
import { lemmaCandidates } from "../wordlists/lemma";

// 跟 wordlists/scan.ts 的 WORD_RE 完全一樣——兩邊斷出來的「字」必須一致，
// 不然「這篇有出現」的判定會跟背景掃描（考試字）兜不起來。
const WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

// `word` 是否在 `markdown` 的正文裡出現過（忽略 frontmatter、code、連結目標
// 等——同 proseLines 的範圍）。`inflections` true 時，像 scan.ts 的
// WordlistIndex.match 一樣接受變化形（"studied" 也算 "study" 出現過）。
export function noteHasWord(markdown: string, word: string, inflections: boolean): boolean {
  const target = word.trim().toLowerCase();
  if (!target) return false;
  for (const line of proseLines(markdown)) {
    for (const m of line.matchAll(WORD_RE)) {
      const lower = m[0].toLowerCase();
      if (lower === target) return true;
      if (inflections && lemmaCandidates(lower).includes(target)) return true;
    }
  }
  return false;
}

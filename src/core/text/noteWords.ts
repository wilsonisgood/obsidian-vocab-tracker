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

// 筆記正文裡出現過的所有字（小寫）。`inflections` true 時，每個字的
// lemmaCandidates 也一起放進來，像 scan.ts 的 WordlistIndex.match 一樣接受變化
// 形（"studied" 也算 "study" 出現過）。範圍同 proseLines（忽略 frontmatter、
// code、連結目標等）。側欄一次要比對上千個 like 的字，所以斷詞只做一次、之後
// 查表，不要每個字重掃一遍全文。
export function noteWordSet(markdown: string, inflections: boolean): Set<string> {
  const words = new Set<string>();
  for (const line of proseLines(markdown)) {
    for (const m of line.matchAll(WORD_RE)) {
      const lower = m[0].toLowerCase();
      if (words.has(lower)) continue;
      words.add(lower);
      if (inflections) for (const c of lemmaCandidates(lower)) words.add(c);
    }
  }
  return words;
}

// `word` 是否在 `markdown` 的正文裡出現過。只查一個字時方便用；要查很多字就
// 自己留著 noteWordSet() 的結果。
export function noteHasWord(markdown: string, word: string, inflections: boolean): boolean {
  const target = word.trim().toLowerCase();
  return !!target && noteWordSet(markdown, inflections).has(target);
}

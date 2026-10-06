// Wave 7 Z — 「本篇」的判定（1006report.md 定案規格 #6）：改成「這篇有出現
// 這個字」。考試字直接用背景掃描（WordlistService.cachedScan）的 hits；
// like 的字額外用 core/text/noteWords.ts 的斷詞規則比對筆記文字。純函式，
// VocabSidebarView 負責快取到 mtime 改變為止（見那邊的 noteScopeFor /
// loadNoteScope）。

import type { VocabEntry } from "../../core/model/entry";
import type { ScanHit } from "../../core/wordlists/scan";
import { noteHasWord } from "../../core/text/noteWords";

// 這個字在 hits 裡出現過——hits 的 word 是比對到的 list 詞條本身（可能是變
// 化形的原形），用小寫比對 entry.word。
function inHits(word: string, hits: readonly ScanHit[]): boolean {
  const lower = word.toLowerCase();
  return hits.some((h) => h.word.toLowerCase() === lower);
}

// `noteText` 是這篇筆記目前的全文；null 代表還沒讀到（例如非同步讀取還在
// 跑），那就只靠 hits 判斷——liked 的字暫時不算「本篇有出現」，等讀到文字
// 後重新算一次（呼叫端的事）。
export function computeNoteScope(
  entries: readonly VocabEntry[],
  hits: readonly ScanHit[],
  noteText: string | null,
  inflections: boolean
): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    if (inHits(entry.word, hits)) {
      ids.add(entry.id);
      continue;
    }
    if (entry.liked && noteText != null && noteHasWord(noteText, entry.word, inflections)) {
      ids.add(entry.id);
    }
  }
  return ids;
}

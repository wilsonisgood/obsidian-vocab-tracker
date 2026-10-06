// Wave 7 Z — 「本篇」的判定（1006report.md 定案規格 #6）：改成「這篇有出現
// 這個字」。考試字直接用背景掃描（WordlistService.cachedScan）的 hits；
// like 的字額外用 core/text/noteWords.ts 的斷詞規則比對筆記文字。純函式，
// VocabSidebarView 負責快取到 mtime 改變為止（見那邊的 noteScopeFor /
// loadNoteScope）。

import type { VocabEntry } from "../../core/model/entry";
import type { ScanHit } from "../../core/wordlists/scan";
import { noteWordSet } from "../../core/text/noteWords";

// `noteText` 是這篇筆記目前的全文；null 代表還沒讀到（例如非同步讀取還在
// 跑），那就只靠 hits 判斷——liked 的字暫時不算「本篇有出現」，等讀到文字
// 後重新算一次（呼叫端的事）。
export function computeNoteScope(
  entries: readonly VocabEntry[],
  hits: readonly ScanHit[],
  noteText: string | null,
  inflections: boolean
): Set<string> {
  // hits 的 word 是比對到的 list 詞條本身（可能是變化形的原形），用小寫比對
  // entry.word。兩邊都先建成 Set：上千個 like 的字若逐一重掃全文，側欄開啟會從 ~10 ms 變成 ~500 ms。
  const hitWords = new Set(hits.map((h) => h.word.toLowerCase()));
  let noteWords: Set<string> | undefined;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const lower = entry.word.trim().toLowerCase();
    if (hitWords.has(lower)) {
      ids.add(entry.id);
      continue;
    }
    if (!entry.liked || noteText == null || !lower) continue;
    noteWords ??= noteWordSet(noteText, inflections);
    if (noteWords.has(lower)) {
      ids.add(entry.id);
    }
  }
  return ids;
}

// Wave 8 S (1006-2 #4)：Like chip 的數字——本篇＝這篇出現的 like 字數，全部
// ＝單字庫的 like 字數（1006 #9 同一條規則）。純函式：呼叫端（examStrip.ts
// 的 likeCountFor／dashboard.ts）決定要不要套本篇範圍——`ids === null`＝全
// 部（不限範圍）；給一個 Set＝只算這個範圍裡的（本篇 scope，或還在等
// loadNoteScope() resolve 時的來源筆記 fallback，兩者呼叫端都算好了才傳進
// 來，這裡不管是哪一種）。
export function likeCountInScope(entries: readonly VocabEntry[], ids: Set<string> | null): number {
  const liked = entries.filter((e) => !e.deletedAt && e.liked === true);
  return ids ? liked.filter((e) => ids.has(e.id)).length : liked.length;
}

// Wave 8 S (1006-2 #2)：noteScopeCache 的失效判斷。cache 原本只看 path+mtime
// ——跟 store.addEntry/deleteEntry/restoreEntry/setLiked 用不同時機寫入
// (main.ts addWordToVocab 先 vault.modify 再 store.addEntry；
// restoreEntry()/setLiked() 根本不碰 mtime) 會有先後競爭，可能在新字/新
// liked 狀態進 store 前就已經用當時的 mtime 算好快取，之後 mtime 不再變就
// re永遠讀到舊的。
//
// 不能每次 data:changed 都整個重算重畫——那會連累單純的欄位編輯
// (store.touch()) 也觸發重排（違反 1006report.md #10：編輯不該重新排序／
// 重畫整份清單）。這裡只抓「會改變 computeNoteScope() 輸出」的兩種訊號：
// 非刪除字的總數（add/delete/restore 都會變）、liked 字的 id 集合（純粹
// like/unlike，數量不變也要抓到）。純文字欄位編輯兩者都不變，簽名跟著不
// 變，快取保留，不會多餘地重畫。O(n log n)（排序 liked id），比
// computeNoteScope() 真正貴的部分（重新斷詞全文）便宜得多，呼叫端
// （VocabSidebarView 的 data:changed 監聽）每次資料變動都算一次簽名跟快取
// 存的比，不同才真的丟棄快取。
export function noteScopeSig(entries: readonly VocabEntry[]): string {
  let count = 0;
  const likedIds: string[] = [];
  for (const e of entries) {
    if (e.deletedAt) continue;
    count++;
    if (e.liked) likedIds.push(e.id);
  }
  likedIds.sort();
  return `${count}:${likedIds.join(",")}`;
}

// Wave 7 F — like 篩選的純函式（1006report.md 定案規格 #13-#15, #23）。
// 不 import obsidian；呼叫端（services/ui）負責把 WordlistService.index.tags
// 和 tagEnabled() 的結果轉成這裡要的 knownTags / isTagOn。

import type { VocabEntry } from "./entry";
import { tagLabel } from "../wordlists/parse";

// entry.level 是逗號分隔的「標籤」字串，但存的是標籤的*顯示名*
// （tagLabel(tag)，例如 "exam/TOEFL" 存成 "TOEFL"——見 main.ts examLabels() /
// importPlan.ts），不是完整的 tag key。使用者也可能自己在 level 填非考試的
// 字串（例如「多益中級」），那不會對上任何 knownTags，就當作普通文字，不算
// 考試標籤。

// 把 entry.level 拆成 trim 過的片段（小寫比對用）。
function levelParts(level: string): Set<string> {
  return new Set(
    level
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

// 這個字的 level 裡，有哪些屬於目前已載入的考試字表（knownTags，完整 tag
// key，例如 "exam/TOEFL"，即 WordlistService.index.tags）。回傳的也是完整
// tag key，方便呼叫端接著用 isTagOn 判斷亮不亮。不管標籤有沒有被使用者按
// 淡——「有標籤」跟「標籤亮著」是兩件事，混在一起判斷放在 isListed()。
export function examTags(entry: Pick<VocabEntry, "level">, knownTags: readonly string[]): string[] {
  const parts = levelParts(entry.level);
  return knownTags.filter((tag) => parts.has(tagLabel(tag).toLowerCase()));
}

// 這個字是否掛著任何考試標籤（不管亮不亮）。取消 like 時用來決定要不要直接
// 刪除（規格 #14：「不屬於任何標籤」才直接刪，按淡的也算有標籤）。
export function hasExamTag(entry: Pick<VocabEntry, "level">, knownTags: readonly string[]): boolean {
  return examTags(entry, knownTags).length > 0;
}

export interface IsListedContext {
  // WordlistService.index.tags：目前已載入的考試字表的完整 tag key。
  knownTags: readonly string[];
  // 對應 core/model/wordlists.ts 的 tagEnabled(settings, tag)：這個 tag
  // 有沒有被使用者按亮。
  isTagOn: (tag: string) => boolean;
  // Wave 8 S (1006-2 #4)：Like chip 有沒有被按亮（對應
  // core/model/wordlists.ts 的 likeChipOn(settings)）。按淡時，單靠 liked
  // 撐著、本身沒有任何亮著標籤的字就不算 listed 了——有亮著標籤的字不受
  // 影響（liked 與否都一樣算 listed）。
  likeOn: boolean;
}

// 側欄「單字」列表的篩選規則（規格 #7, 1006-2 #4）：liked 的字且 Like chip
// 亮著，或者有任一亮著的考試標籤的字。一個字有多個標籤時，只要一個亮著就
// 算（some）。liked 是 undefined（尚未回填）時不算 like，但仍可能靠亮著的
// 標籤被列出。
export function isListed(entry: Pick<VocabEntry, "level" | "liked">, ctx: IsListedContext): boolean {
  if (entry.liked && ctx.likeOn) return true;
  return examTags(entry, ctx.knownTags).some(ctx.isTagOn);
}

// initialLiked() 需要的訊號。每一項都是呼叫端（main.ts/services）用現有資料
// 算出來的布林值——這裡只負責怎麼組合，不負責怎麼算，因為要用到
// ThreadService／WordlistService 等 services 層的東西，core 不能碰。
export interface InitialLikeSignals {
  // 這個字有（曾經有）至少一則 AI 討論串掛在它身上：提問、找字族、產生動詞
  // 用法、拿冷知識都會走 services/threads 的討論串機制。可靠：討論串只有
  // 真的用過 AI 才會存在。
  hasWordThread: boolean;
  // entry.usage（動詞用法 block）已經有內容。可靠：只有 AI 產生會寫這個
  // 欄位，沒有其他路徑會填它。
  hasUsage: boolean;
  // entry.reviews > 0，或者已經有 entry.srs（排進單字卡複習過至少一次）。
  // 規格 #15 把「單字卡複習」算進會自動 like 的動作之一。
  hasReviewed: boolean;
  // 對「改過內容」的近似值（規格 #23：手動改過資料頁籤任何欄位才算）。沒有
  // 編輯歷史可查，只能用「哪個欄位絕對不會被自動流程寫入」來猜，所以只看
  // entry.grammar 有沒有值（Wave 7 Y 實作，src/services/like/backfill.ts）：
  // - 字典重抓（dictionary enrich）只會補 phonetic / audio / partOfSpeech /
  //   definition / definitionZh / synonyms / antonyms（main.ts
  //   enrichEntry()），從不碰 grammar——用那些欄位判斷會把每個考試字表自動
  //   匯入、背景補完字典的字都誤判成「已 like」，幾乎失去篩選效果。
  // - entry.example 同樣不能用：加字（main.ts addWordToVocab()，約行 985）
  //   和考試字匯入（importExamWords()，約行 612）都會把筆記裡的原句自動填
  //   進 example，不是使用者手打的內容。
  // - grammar 只有兩條路徑會寫：使用者在資料頁籤手動編輯，或把一則 AI 回答
  //   釘選到文法提示（ThreadService.setPinned() → addPin()）。兩者都是真
  //   正「對這個字做了動作」，沒有已知的自動流程會動到它。
  hasEditedContent: boolean;
}

// 一次性回填規則（規格 #23）：origin 不是 "wordlist" 的字（手動加入、閱讀
// 模式點字加入、從字族樹加入…）一律算已 like。origin 是 "wordlist"（考試字
// 表自動匯入）的字，只有「用過 AI，或複習過，或改過內容」才算已 like，否則
// 算未 like。
export function initialLiked(entry: Pick<VocabEntry, "origin">, signals: InitialLikeSignals): boolean {
  if (entry.origin !== "wordlist") return true;
  return signals.hasWordThread || signals.hasUsage || signals.hasReviewed || signals.hasEditedContent;
}

import type { VocabEntry } from "../../core/model/entry";
import { initialLiked } from "../../core/model/like";

// Wave 7 Y — 一次性回填 (1006report.md #23) 需要的訊號組裝。
//
// VocabStore.backfillLiked() 只負責寫入，怎麼決定一個字算不算已 like 要靠
// core/model/like.ts 的 initialLiked()；但 initialLiked() 要的訊號
// （有沒有討論串、有沒有複習過…）得問 services 層的東西（ThreadService），
// core 不能 import services，所以組裝的工作放在這裡，main.ts 只要呼叫
// likeBackfillDecider({ threads: this.threads }) 拿到 decide 函式就能直接
// 丟給 store.backfillLiked()。

export interface LikeBackfillDeps {
  // 只需要 ThreadService 這一個唯讀方法：這個字的單字討論串問過幾次。
  threads: { wordQuestionCount(entryId: string): number };
}

// 給 VocabStore.backfillLiked(decide) 當 decide 參數用。
//
// 呼叫前務必 await threads.ensureLoaded()——wordQuestionCount() 讀的是
// ThreadService 記憶體裡的 threads，沒載入過就一律回報 0，會把真的問過
// AI 的字誤判成未 like（這段 await 留給 main.ts 的整合事項，這裡只負責組
// 訊號，不碰生命週期）。
export function likeBackfillDecider(deps: LikeBackfillDeps): (entry: VocabEntry) => boolean {
  return (entry) =>
    initialLiked(entry, {
      hasWordThread: deps.threads.wordQuestionCount(entry.id) > 0,
      hasUsage: !!entry.usage,
      // 規格 #15 把「單字卡複習」列進自動 like 的動作；reviews 是每次
      // SrsService.rate() 都會累加的舊欄位，srs 則是「排進過複習、至少被
      // FSRS 評分一次」才會出現（SrsService.rate()）——両者任一就算複習
      // 過，對應 services/srs/queue.ts isNewCard() 判斷「從未評分」的反面。
      hasReviewed: (entry.reviews ?? 0) > 0 || entry.srs !== undefined,
      // 見 core/model/like.ts 的 InitialLikeSignals.hasEditedContent 註解：
      // 只有 grammar 不會被任何已知的自動流程寫入。
      hasEditedContent: !!entry.grammar?.trim(),
    });
}

import { actionNotice } from "../mobile/actionNotice";
import { t } from "../../core/i18n";

// Wave 7 F — 共用的「延遲提交＋復原」元件（1006report.md 定案規格 #14,
// #20, #21）：取消 like 時直接刪除、聊天面板刪一問一答／刪整串討論，都不
// 跳確認，改成立刻動手但給幾秒按「復原」。這個檔案分兩層：
//   - UndoableQueue：純 TS 邏輯，計時器用注入的 Scheduler，測試不用等真的
//     6 秒（也不用碰 obsidian）。
//   - runUndoable() / flushUndoables()：薄薄一層 UI，接 Obsidian 的
//     Notice，背後就是一個共用的 UndoableQueue 實例。

// 預設給使用者的復原窗口。規格只說「幾秒內」，6 秒是這裡定的，呼叫端可以
// 用 ms 覆寫（例如比較大的破壞性操作想留久一點）。
const DEFAULT_MS = 6000;

// 可注入的計時器，測試用假的（手動觸發 callback）取代真的
// setTimeout/clearTimeout，不用 vi.useFakeTimers() 也不用真的等待。
export interface UndoScheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realScheduler: UndoScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface UndoableSpec<T = void> {
  // 立刻執行：把畫面上的東西藏起來／標成待刪，讓使用者覺得「已經做完了」。
  // 回傳值會原封不動轉給 restore/commit，兩邊可以共用同一份快照
  // （例如被刪掉的 entry 物件、它原本所在的陣列位置）。
  apply: () => T;
  // 使用者在時間到之前按了「復原」：把 apply() 做的事還原回去。
  restore: (applied: T) => void;
  // 時間到（或 flush() 被呼叫）：真正的破壞性步驟，例如
  // VocabStore.deleteEntry。
  commit: (applied: T) => void;
  // 復原窗口，預設 DEFAULT_MS。
  ms?: number;
}

interface Pending {
  commit: () => void;
  restore: () => void;
}

// 純邏輯：同時可以有好幾筆待提交的動作互不干擾（各自一個 id、各自的計時
//器），且提供 flush() 讓外殼（plugin unload）把還沒到時間的全部立刻提交，
// 不會漏掉真正的刪除。
export class UndoableQueue {
  private pending = new Map<number, Pending>();
  private nextId = 0;

  constructor(private scheduler: UndoScheduler = realScheduler) {}

  // 立刻跑 apply()，排定時間到就 commit()。回傳的 restore() 可以安全地被
  // 呼叫多次或在已經 commit/restore 過之後呼叫——都是沒事發生的 no-op，
  // 呼叫端（例如按鈕的 click handler）不用自己追蹤「是不是已經處理過」。
  start<T>(spec: UndoableSpec<T>): { restore: () => void } {
    const applied = spec.apply();
    const id = this.nextId++;

    const commitNow = () => {
      if (!this.pending.delete(id)) return;
      spec.commit(applied);
    };
    const timer = this.scheduler.setTimeout(commitNow, spec.ms ?? DEFAULT_MS);
    const restore = () => {
      if (!this.pending.delete(id)) return;
      this.scheduler.clearTimeout(timer);
      spec.restore(applied);
    };

    this.pending.set(id, { commit: commitNow, restore });
    return { restore };
  }

  // 外掛 unload 時呼叫：還沒到時間的全部立刻 commit（不是 restore——使用
  // 者已經看到「做完了」的畫面，unload 時沒機會再給他們按復原，所以讓破壞
  // 性步驟照常完成，而不是悄悄撤銷使用者剛做的操作）。
  flush(): void {
    for (const entry of [...this.pending.values()]) entry.commit();
  }

  // 目前還有幾筆在等復原窗口——測試用，UI 不需要。
  get size(): number {
    return this.pending.size;
  }
}

// main.ts 可以持有自己的 UndoableQueue 實例（例如測試時想要獨立的
// instance），但大多數呼叫端（WordRow、ChatPanel…）只需要一個全域共用的
// 佇列——跟 Notice 本身一樣，這類提示不分散在各自的元件狀態裡。
const sharedQueue = new UndoableQueue();

export interface RunUndoableOptions<T = void> extends UndoableSpec<T> {
  // Notice 裡顯示的訊息，例如 t("undo.deletedWord", { word })。
  message: string;
}

// 薄薄一層 UI：立刻跑 apply()，彈一個帶「復原」按鈕的 Notice（復用
// src/ui/mobile/actionNotice.ts 既有的「文字＋按鈕」Notice，風格、CSS 跟
// mobile 的滑動刪除共用，不用重做一套）。按下去就 restore()
// （actionNotice 的按鈕點了會自己 hide()，這裡不用再管 Notice 本身）；放
// 著不管，時間到背後的 UndoableQueue 會自動 commit()。
export function runUndoable<T>(opts: RunUndoableOptions<T>): void {
  const ms = opts.ms ?? DEFAULT_MS;
  const { restore } = sharedQueue.start(opts);
  actionNotice(opts.message, [{ label: t("undo.action"), run: restore }], ms);
}

// 外掛 onunload() 呼叫：還沒到時間的待提交動作全部立刻完成，Obsidian 關掉
// 之前不會留下「使用者以為刪掉了，但其實沒真的刪」的半完成狀態。
export function flushUndoables(): void {
  sharedQueue.flush();
}

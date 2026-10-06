import type { TypedEmitter } from "../../core/events";
import type { VocabEntry } from "../../core/model/entry";
import { liveTurns, wordThreadId, type Thread } from "../../core/model/thread";
import type { FamilyServiceEvents } from "../learn/FamilyService";
import type { VerbUsageEvents } from "../learn/VerbUsageService";
import type { SrsServiceEvents } from "../srs/SrsService";
import type { ThreadEvents } from "../threads/ThreadService";

// Wave 7 Y — 自動 like (1006report.md #15)：下面任一動作完成後，如果那個
// 字還沒 like，就補 like 回去。取消 like 之後再做其中任何一個動作，會把
// like 補回來，這是故意的（規格原話）。
//
//   - 單字 AI 頁籤提問，或釘選／取消釘選一則回答到文法提示（監聽
//     ThreadService 的 thread:upsert，只看 word 類型的討論串）。
//   - 找字族，只算 seed 字（FamilyService 的 family:saved 事件）。
//   - 產生動詞用法（VerbUsageService 的 verb:usage 事件）。
//   - 單字卡複習（SrsService 的 srs:rated 事件）。
//   - 冷知識「從單字頁來一則」／「冷知識頁指定一個字」——TriviaService 歸
//     P，這裡摸不到它的事件，呼叫端（main.ts 或 P 的頁面程式碼）要在
//     `trivia.ask(kind, { entryId })` resolve 之後自己呼叫
//     `autoLike.likeEntry(subject.id)`（entryId 有給值才算；見整合事項）。
//
// 字典重抓、整體分群（沒有 seed 的找字族）都不算，所以沒有接到這裡。

export interface AutoLikeVocabPort {
  readonly entries: VocabEntry[];
  setLiked(entry: VocabEntry, liked: boolean): Promise<void>;
}

// 只需要 ThreadService 這三個方法：讀目前的討論串（算 baseline、算釘選狀
// 態）、確保已經從磁碟載入（init() 要用，見下方 init() 的註解）。events
// 直接用 ThreadService 公開的完整事件表型別（不用 Pick narrow 一個子
// 集）——TypedEmitter<Events> 的方法都是泛型方法，narrow 過的事件表反而
// 會讓「把真正的 ThreadService.events 傳進來」卡在型別不相容上。
export interface AutoLikeThreadsPort {
  events: TypedEmitter<ThreadEvents>;
  wordThread(entryId: string): Thread | undefined;
  ensureLoaded(): Promise<void>;
}

export interface AutoLikeFamilyPort {
  events: TypedEmitter<FamilyServiceEvents>;
}

export interface AutoLikeVerbsPort {
  events: TypedEmitter<VerbUsageEvents>;
}

export interface AutoLikeSrsPort {
  events: TypedEmitter<SrsServiceEvents>;
}

export interface AutoLikeDeps {
  store: AutoLikeVocabPort;
  // 這四個都可選，方便個別測試；main.ts 正式接線時全部都會給。
  threads?: AutoLikeThreadsPort;
  family?: AutoLikeFamilyPort;
  verbs?: AutoLikeVerbsPort;
  srs?: AutoLikeSrsPort;
}

function liveUserTurnCount(thread: Thread | undefined): number {
  return liveTurns(thread).filter((t) => t.role === "user").length;
}

function livePinnedIds(thread: Thread | undefined): Set<string> {
  return new Set(liveTurns(thread).filter((t) => t.pinnedToGrammar).map((t) => t.id));
}

export class AutoLike {
  private unsubs: (() => void)[] = [];
  // word threadId → 上一次看到的 live user turn 數／釘選中的 live turn id
  // 集合。用來判斷「有沒有變多」「有沒有變」，而不是看 upsert 事件本身——
  // 刪除一組問答、同步重新載入、重試失敗都會讓 upsert 事件發生，但都不該
  // 觸發自動 like（見 onThreadUpsert() 的註解）。
  private turnCount = new Map<string, number>();
  private pinned = new Map<string, Set<string>>();

  constructor(private deps: AutoLikeDeps) {
    if (deps.threads) this.unsubs.push(deps.threads.events.on("thread:upsert", (th) => this.onThreadUpsert(th)));
    if (deps.family) this.unsubs.push(deps.family.events.on("family:saved", ({ seedEntryIds }) => this.onFamilySaved(seedEntryIds)));
    if (deps.verbs) this.unsubs.push(deps.verbs.events.on("verb:usage", ({ entryId }) => void this.likeEntry(entryId)));
    if (deps.srs) this.unsubs.push(deps.srs.events.on("srs:rated", ({ entryId }) => void this.likeEntry(entryId)));
  }

  // 建立 baseline：在任何使用者互動（提問、釘選…）有機會發生之前呼叫過一
  // 次，把「目前每個單字討論串有幾個 user turn、哪些 turn 釘選中」記下來，
  // 否則第一個 thread:upsert 事件沒有「之前」可以比較，沒辦法分辨是真的新
  // 問題，還是單純第一次看到就已經有的舊資料。main.ts 應該在 onload 早
  // 期（constructor 之後、UI 還沒機會呼叫 ask()/setPinned() 之前）就
  // await 這個方法——見整合事項。
  //
  // 呼叫 threads.ensureLoaded() 會讓 threads.json 提前讀取（原本是「開第
  // 一個討論才讀」的 lazy 設計），這是為了正確性刻意的取捨：讀一個小 JSON
  // 檔一次，換來不會被刪除問答誤觸發。
  async init(): Promise<void> {
    if (!this.deps.threads) return;
    await this.deps.threads.ensureLoaded();
    for (const entry of this.deps.store.entries) {
      const threadId = wordThreadId(entry.id);
      if (this.turnCount.has(threadId)) continue;
      const thread = this.deps.threads.wordThread(entry.id);
      this.turnCount.set(threadId, liveUserTurnCount(thread));
      this.pinned.set(threadId, livePinnedIds(thread));
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
  }

  // 公開給外部呼叫端用：TriviaService 歸 P，摸不到它的事件，main.ts（或
  // P 的頁面程式碼）在「單字頁來一則」「冷知識頁指定一個字」成功後自己呼
  // 叫這個方法。已經 like 的字呼叫這個是 no-op。
  async likeEntry(entryId: string): Promise<void> {
    const entry = this.deps.store.entries.find((e) => e.id === entryId);
    if (!entry || entry.liked === true) return;
    await this.deps.store.setLiked(entry, true);
  }

  private onFamilySaved(seedEntryIds: string[]): void {
    for (const id of seedEntryIds) void this.likeEntry(id);
  }

  private onThreadUpsert(thread: Thread): void {
    if (thread.anchor.kind !== "word" || thread.deletedAt) return;
    const { entryId } = thread.anchor;
    const threadId = thread.id;

    const prevCount = this.turnCount.get(threadId) ?? 0;
    const nextCount = liveUserTurnCount(thread);
    this.turnCount.set(threadId, nextCount);
    let trigger = nextCount > prevCount;

    const prevPins = this.pinned.get(threadId) ?? new Set<string>();
    const nextPins = livePinnedIds(thread);
    this.pinned.set(threadId, nextPins);
    if (!trigger) {
      for (const id of nextPins) {
        if (!prevPins.has(id)) {
          trigger = true; // 新釘選了一則
          break;
        }
      }
    }
    if (!trigger) {
      for (const id of prevPins) {
        if (nextPins.has(id)) continue;
        // 這個 turn 不在「目前釘選中」的集合裡了：可能是使用者真的取消
        // 釘選（turn 還是活的，pinnedToGrammar 被改成 false），也可能是
        // C 的刪除一組問答功能把它刪掉了（turn 被標上 deletedAt，不再算
        // live）。只有前者是真的「取消釘選」動作；後者是刪除，刪除不該
        // 觸發自動 like（否則使用者明明刻意取消 like 之後，光是刪掉一組
        // 舊問答就會把 like 補回來）。
        const turn = thread.turns.find((x) => x.id === id);
        if (turn && !turn.deletedAt) {
          trigger = true; // 真的取消釘選
          break;
        }
      }
    }

    if (trigger) void this.likeEntry(entryId);
  }
}

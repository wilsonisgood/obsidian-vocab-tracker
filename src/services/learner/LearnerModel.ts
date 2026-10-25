import { GRAMMAR_TOPICS } from "../../core/grammar/catalog";
import { topicStatuses } from "../../core/grammar/progress";
import { weakFocuses } from "../../core/learner/weakness";
import type { WeakFocus } from "../../core/learner/weakness";
import type { VocabEntry } from "../../core/model/entry";
import { localDayOf } from "../../core/learner/reading";
import type { AskEvent, LearnEvent, ReadingVisit, WordTouch } from "../../core/model/learner";
import type { CefrLevel } from "../../core/model/settings";
import { SrsState } from "../../core/model/srs";
import type { ReviewLog } from "../../core/model/srs";
import type { CefrTier } from "../../core/wordlists/cefr";
import type { GrammarStore } from "../grammar/GrammarStore";
import type { LearnerStore } from "./LearnerStore";

// 「學過程度」的單一讀取入口（第十七波 Z）。所有要知道使用者學到哪裡的地方
// （AI 學習者區塊、各頁籤）都只問 LearnerModel；資料本身暫時留在原處。
//
// 盤點清單（第十七波 Z；資料本身這一期不搬家，只統一「讀取」入口）
//
//  1. 單字 FSRS 排程       data.json  entries[].srs（SrsCard：due／stability／state…）
//                           寫入：SrsService（複習評分）、情境練習答錯記 Again（C6）
//                           同步：VocabStore 以 entry 為單位，updatedAt → rev 取新者（core/store/merge.ts）
//  2. 單字複習紀錄          reviews.json（ReviewLog）＋ entry.reviews／lastReviewed 計數
//                           寫入：SrsService；同步：依 id 聯集（mergeReviewLogs），只留 90 天
//  3. 單字「學過」意願      data.json  entries[].liked（isListed 看它）；刪除＝entries[].deletedAt 墓碑
//  4. 文法作答紀錄          grammar.json  attempts[]（GrammarAttempt，append-only）
//                           寫入：GrammarStore.addAttempt；同步：依 id 聯集
//  5. 文法主題 FSRS         grammar.json  progress[]（GrammarProgress.srs／lastPracticedAt）
//                           寫入：GrammarStore.upsertProgress；同步：updatedAt → rev
//     文法題庫              grammar.json  questions[]（不是學習程度，是題目）
//  6. 作答事件              learner.json  events[]（LearnEvent：track／focus／result）
//                           寫入：LearnerStore.addEvent；同步：依 id 聯集，保留 365 天
//                           弱點、常用字練習量、focusStats 都從它算，不另存
//  7. 待答池／錯題區／篩選  learner.json  pool[]／mistakes[]／filters[]
//                           同步：同 id 取較新 updatedAt（墓碑不被舊版復活）
//  8. CEFR 程度（自述）     data.json  settings.learner.level（LearnerProfile，另有 goal／語言／補充）
//                           寫入：設定頁；同步：設定區段整段取新者（SectionStamp）
//                           讀取者：AI 學習者區塊（services/ai/context/profile.ts）、文法 startDifficulty
//
//  讀取入口（本檔）：LearnerModel.snapshot()／level()／focusStats()。
//  之後搬家建議順序（各步獨立、可逐步做）：
//    (1) 先把「新的」讀取者全改走 LearnerModel（頁籤、AI 區塊）；
//    (2) 文法 progress（5）併入 learner.json，格式與合併規則已相同（updatedAt/rev）；
//    (3) 文法 attempts（4）轉成 LearnEvent（migrateGrammar 已有雛形），停寫 attempts；
//    (4) 單字 srs（1）抽成 learner.json 的 vocab 區段（按 entry.id），entry.srs 留舊欄位讀取相容一版；
//    (5) 最後 CEFR（8）：保留在設定（使用者直接編輯），LearnerModel.level() 為唯一讀取點，不必搬。
//  同步只需處理 learner.json 的合併規則，其餘 store 搬完後可刪除。

export const MATURE_STABILITY_DAYS = 21;
export const WEAK_LIMIT = 8;

export interface LearnerSnapshot {
  level: CefrLevel | "";
  vocab: { total: number; learning: number; mature: number; due: number };
  grammar: { started: number; mastered: number; due: number };
  poly: { practisedSenses: number; weakSenses: number };
  weak: WeakFocus[];
}

export interface LearnerModelDeps {
  vocab: () => readonly VocabEntry[];
  grammar: Pick<GrammarStore, "questions" | "attempts" | "progress">;
  learner: Pick<LearnerStore, "learnEvents"> & Partial<Pick<LearnerStore, "asks" | "wordTouches" | "readingBetween" | "wordCefr">>;
  reviews?: () => readonly ReviewLog[];
  level: () => CefrLevel | "";
  now?: () => Date;
}

// Counted as practice: skipped / retired say nothing about what was learned.
const SCORED = new Set<LearnEvent["result"]>(["correct", "wrong"]);

// What the learner did in a period (規劃書 15 §2.5); every list oldest first.
export interface LearnerActivity {
  asks: AskEvent[];
  wordTouches: WordTouch[];
  reading: ReadingVisit[];
  events: LearnEvent[];
  reviews: ReviewLog[];
}

const byAt = <T extends { at: string }>(a: T, b: T) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

export class LearnerModel {
  constructor(private deps: LearnerModelDeps) {}

  level(): CefrLevel | "" {
    return this.deps.level();
  }

  snapshot(now: Date = this.deps.now?.() ?? new Date()): LearnerSnapshot {
    const events = this.deps.learner.learnEvents();
    const senses = new Set<string>();
    for (const e of events) if (e.focus.kind === "sense" && (SCORED.has(e.result) || e.result === "hinted")) senses.add(e.focus.id);
    const weakAll = weakFocuses(events, { now, limit: Number.MAX_SAFE_INTEGER });
    return {
      level: this.level(),
      vocab: this.vocab(now),
      grammar: this.grammar(now),
      poly: { practisedSenses: senses.size, weakSenses: weakAll.filter((w) => w.focus.kind === "sense").length },
      weak: weakAll.slice(0, WEAK_LIMIT),
    };
  }

  // `from` / `to`: local dates YYYY-MM-DD, both ends included.
  activity(from: string, to: string): LearnerActivity {
    const l = this.deps.learner;
    const inRange = (iso: string) => {
      const day = localDayOf(new Date(iso));
      return day >= from && day <= to;
    };
    return {
      asks: (l.asks?.() ?? []).filter((a) => inRange(a.at)).sort(byAt),
      wordTouches: (l.wordTouches?.() ?? []).filter((w) => w.day >= from && w.day <= to).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.word < b.word ? -1 : 1)),
      reading: l.readingBetween?.(from, to) ?? [],
      events: l.learnEvents().filter((e) => inRange(e.at)).sort(byAt),
      reviews: (this.deps.reviews?.() ?? []).filter((r) => inRange(r.at)).sort(byAt),
    };
  }

  // Levels the AI tagged for words outside the built-in list.
  wordCefr(): ReadonlyMap<string, CefrTier> {
    return this.deps.learner.wordCefr?.() ?? new Map();
  }

  focusStats(focusId: string): { correct: number; wrong: number; lastAt?: string } {
    let correct = 0;
    let wrong = 0;
    let lastAt: string | undefined;
    for (const e of this.deps.learner.learnEvents({ focusId })) {
      if (!SCORED.has(e.result)) continue;
      if (e.result === "correct") correct++;
      else wrong++;
      if (!lastAt || Date.parse(e.at) > Date.parse(lastAt)) lastAt = e.at;
    }
    return lastAt ? { correct, wrong, lastAt } : { correct, wrong };
  }

  // For the 常用字 sense map (Q's progressDot): hinted is not a "right"
  // answer, so it counts on the wrong side; skipped / retired don't count.
  // `recent` = the last 3 outcomes, newest last.
  senseStats(id: string): { correct: number; wrong: number; recent: boolean[] } {
    let correct = 0;
    let wrong = 0;
    const seq: { at: number; ok: boolean }[] = [];
    for (const e of this.deps.learner.learnEvents({ focusId: id })) {
      if (e.focus.kind !== "sense") continue;
      if (e.result !== "correct" && e.result !== "wrong" && e.result !== "hinted") continue;
      const ok = e.result === "correct";
      if (ok) correct++;
      else wrong++;
      seq.push({ at: Date.parse(e.at), ok });
    }
    seq.sort((a, b) => a.at - b.at);
    return { correct, wrong, recent: seq.slice(-3).map((x) => x.ok) };
  }

  private vocab(now: Date): LearnerSnapshot["vocab"] {
    const out = { total: 0, learning: 0, mature: 0, due: 0 };
    for (const e of this.deps.vocab()) {
      if (e.deletedAt || e.liked !== true) continue;
      out.total++;
      const s = e.srs;
      if (!s || s.state === SrsState.New) continue;
      if (s.state === SrsState.Review && s.stability >= MATURE_STABILITY_DAYS) out.mature++;
      else out.learning++;
      if (Date.parse(s.due) <= now.getTime()) out.due++;
    }
    return out;
  }

  private grammar(now: Date): LearnerSnapshot["grammar"] {
    const g = this.deps.grammar;
    const status = topicStatuses(GRAMMAR_TOPICS, g.attempts(), (id) => g.progress(id), now);
    const out = { started: 0, mastered: 0, due: 0 };
    for (const s of status.values()) {
      if (s !== "new") out.started++;
      if (s === "mastered") out.mastered++;
      else if (s === "due") out.due++;
    }
    return out;
  }
}

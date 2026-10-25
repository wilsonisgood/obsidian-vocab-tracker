import type { PracticeQuestion } from "./practice";
// Learner layer (規劃書 12 §1): one LearnEvent per answered question; mastery
// and weaknesses are computed from events, never stored. Pool and mistake
// records live beside them in store/learner.json.

// para: 換句話說 — paraphrase questions on paragraphs the learner discussed.
export type Track = "grammar" | "poly" | "vocab" | "mix" | "para";
export type FocusKind = "grammar-objective" | "sense" | "word" | "paragraph";
// grammar-objective id = `${topicId}/${objectiveId}`; sense = "get.arrive"; word = VocabEntry.id;
// paragraph = the paragraph discussion's thread id
export interface FocusRef {
  kind: FocusKind;
  id: string;
}
export type LearnResult = "correct" | "wrong" | "skipped" | "hinted" | "retired";

export interface LearnEvent {
  id: string;
  at: string;
  track: Track;
  focus: FocusRef;
  result: LearnResult;
  // What was picked when wrong (option text or senseId).
  given?: string;
  errorTag?: string;
  questionId?: string;
}

export type PoolRemoveReason = "answered" | "skipped" | "retired" | "filtered";

export interface PoolItem {
  id: string; // = `${track}:${questionId}`
  track: Track;
  questionId: string;
  // Questions from the same scenario share it.
  scenarioId?: string;
  // Answer order within the pool (ascending).
  seq: number;
  addedAt: string;
  updatedAt: string;
  removedAt?: string;
  removeReason?: PoolRemoveReason;
}

export interface MistakeItem {
  id: string; // = `${track}:${questionId}`
  track: Track;
  questionId: string;
  focus: FocusRef;
  addedAt: string;
  lastWrongAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

// `value` is shaped by each tab.
export interface TrackFilter {
  id: Track;
  value: unknown;
  updatedAt: string;
}

export interface LearnerMeta {
  grammarMigratedAt?: string;
  // 規劃書 15 §2.1: threads.json was backfilled into asks[] once.
  asksMigratedAt?: string;
}

export interface LearnerShard {
  events: LearnEvent[];
  pool: PoolItem[];
  mistakes: MistakeItem[];
  filters: TrackFilter[];
  // Scenario questions of 常用字 / 單字情境 / 混合 (第十七波 S).
  questions: PracticeQuestion[];
  meta: LearnerMeta;
  // 第十九波 D1; absent in older files.
  reading?: ReadingVisit[];
  diaryPicks?: DiaryPick[];
  // 規劃書 15 R1; absent in older files.
  asks?: AskEvent[];
  wordTouches?: WordTouch[];
}

export const TRACKS: readonly Track[] = ["grammar", "poly", "vocab", "mix", "para"];
export const FOCUS_KINDS: readonly FocusKind[] = ["grammar-objective", "sense", "word", "paragraph"];
export const LEARN_RESULTS: readonly LearnResult[] = ["correct", "wrong", "skipped", "hinted", "retired"];

// Reading log (第十九波 D1, 1016 #6-#8): which articles the learner
// interacted with, per local day. Titles only, never body text.
export type ReadingKind = "word" | "paragraph" | "add";
export const READING_KINDS: readonly ReadingKind[] = ["word", "paragraph", "add"];
export interface ReadingVisit {
  id: string; // `${day}|${path}|${heading ?? ""}`
  day: string; // local date YYYY-MM-DD
  at: string; // first interaction (ISO)
  updatedAt: string; // last interaction (ISO)
  path: string;
  title: string; // H1, else the file name
  heading?: string; // nearest H2/H3 above the interaction
  kinds: ReadingKind[];
}

// Quotes / places the diary already used, so they aren't picked again.
export type DiaryPickKind = "quote" | "place";
export const DIARY_PICK_KINDS: readonly DiaryPickKind[] = ["quote", "place"];
export interface DiaryPick {
  id: string; // `${kind}|${key}`
  kind: DiaryPickKind;
  key: string; // normalized (see normalizePickKey)
  day: string; // the diary day it was used on
  at: string;
}

// AI help requests (規劃書 15 §2.1): one per question asked in a discussion
// thread, kept here so deleting a discussion doesn't erase the history.
export type AskSurface = "word" | "paragraph" | "trivia" | "morpheme" | "grammar" | "other";
export const ASK_SURFACES: readonly AskSurface[] = ["word", "paragraph", "trivia", "morpheme", "grammar", "other"];
export const ASK_TEXT_MAX = 80;
export interface AskEvent {
  id: string; // = the user turn's id
  at: string;
  surface: AskSurface;
  taskId: string; // "paragraph.translate", "word.compare"…
  entryId?: string; // the word discussed / the trivia subject
  path?: string; // the paragraph discussion's note
  selection?: string; // highlighted text, first ASK_TEXT_MAX chars
  custom: boolean; // the learner typed their own question
  question?: string; // first ASK_TEXT_MAX chars
  ok: boolean; // an answer came back
}

// Reading-view lookups and 🔊 presses (規劃書 15 §2.2), one row per local
// day + word. Card autoplay doesn't count as a press.
export interface WordTouch {
  id: string; // `${day}|${word}`
  day: string; // local date YYYY-MM-DD
  word: string; // lowercased
  lookup: number;
  pronounce: number;
  saved: boolean; // already in the vocab list the first time it was touched
  updatedAt: string;
}

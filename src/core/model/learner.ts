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

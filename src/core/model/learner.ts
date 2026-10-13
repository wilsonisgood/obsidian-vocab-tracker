import type { PracticeQuestion } from "./practice";
// Learner layer (規劃書 12 §1): one LearnEvent per answered question; mastery
// and weaknesses are computed from events, never stored. Pool and mistake
// records live beside them in store/learner.json.

export type Track = "grammar" | "poly" | "vocab" | "mix";
export type FocusKind = "grammar-objective" | "sense" | "word";
// grammar-objective id = `${topicId}/${objectiveId}`; sense = "get.arrive"; word = VocabEntry.id
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
}

export const TRACKS: readonly Track[] = ["grammar", "poly", "vocab", "mix"];
export const FOCUS_KINDS: readonly FocusKind[] = ["grammar-objective", "sense", "word"];
export const LEARN_RESULTS: readonly LearnResult[] = ["correct", "wrong", "skipped", "hinted", "retired"];

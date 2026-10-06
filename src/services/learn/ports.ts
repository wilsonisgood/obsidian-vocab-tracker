import type { DictionaryResult } from "../../core/model/dictionary";
import type { VocabEntry } from "../../core/model/entry";
import type { Thread, Turn } from "../../core/model/thread";
import type { AiService } from "../ai/AiService";
import type { AskParams } from "../threads/ThreadService";

// What the learning services need from the rest of the plugin, as narrow
// structural interfaces so tests can fake them (規劃書 06 §3.1). The real
// objects satisfy them as they are: VocabStore, DictionaryService,
// AiService, ThreadService.

// VocabStore.
export interface LearnVocabPort {
  // Live entries (no tombstones).
  readonly entries: VocabEntry[];
  addEntries(entries: VocabEntry[]): Promise<void>;
  touch(entry: VocabEntry): Promise<void>;
  // FamilyService.addSuggested (A3): liking a word already in the list
  // instead of adding a duplicate entry. Same signature as
  // VocabStore.setLiked (core/store/VocabStore.ts).
  setLiked(entry: VocabEntry, liked: boolean): Promise<void>;
}

// DictionaryService.
export interface DictionaryLookupPort {
  fetchDictionary(word: string): Promise<DictionaryResult>;
}

// AiService — structured tasks are one-shot runs, not threads. prepare
// (optional, so test fakes can skip it) rebuilds the request for the
// debug box when an answer can't be read (structured.ts).
export type LearnAi = Pick<AiService, "run" | "cancel"> & Partial<Pick<AiService, "prepare">>;

// ThreadService.
export type TriviaAskParams = AskParams;

export interface TriviaThreadsPort {
  ensureLoaded(): Promise<void>;
  get(threadId: string): Thread | undefined;
  ask(p: TriviaAskParams): Promise<void>;
  isBusy(threadId: string): boolean;
  stop(threadId: string): void;
  // Tombstones a failed answer and its question; returns the question.
  dropFailedRound(thread: Thread | undefined, turnId: string): Turn | null;
}

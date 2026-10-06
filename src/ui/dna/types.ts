import { TypedEmitter } from "../../core/events";
import type { VocabEntry } from "../../core/model/entry";
import type { Morpheme, MorphemeType, WordBreakdown } from "../../core/model/morpheme";
import type { Thread } from "../../core/model/thread";

// Word DNA (規劃書 09 §7). `MorphemeService` is built by the parallel DS
// task (services/learn/MorphemeService.ts) and isn't in this branch yet —
// this interface is copied verbatim (method signatures + MorphemeStat)
// from .claude/tmp/w9-rules.md so the block can be built and unit-tested
// against a fake now. Integration swaps every `MorphemeApi` here for
// `import type { MorphemeService } from "../../services/learn/MorphemeService"`
// (the real class should structurally satisfy this interface unchanged).

export interface MorphemeStat {
  morpheme: Morpheme;
  // Vocab entries with `entry.liked === true` whose breakdown resolves to
  // this morpheme (決定/A3: liked words only).
  learned: VocabEntry[];
  suggested: { word: string; zh: string; emoji: string }[];
}

export interface DnaProgress {
  running: boolean;
  done: number;
  total: number;
}

export interface MorphemeApiEvents {
  "dna:progress": { done: number; total: number };
}

export interface MorphemeApi {
  // Only morphemes with learned.length >= 1, sorted by learned count desc.
  stats(type: MorphemeType): MorphemeStat[];
  breakdownOf(entryId: string): WordBreakdown | undefined;
  queue(entryIds: string[]): void;
  analyzeNow(entryIds: string[], signal?: AbortSignal): Promise<void>;
  // Background auto-analysis (A8): main.ts calls this ~10s after load.
  startAuto(): void;
  progress(): DnaProgress;
  // A9 「還有哪些字」 — new candidates are also persisted onto the
  // morpheme's `suggested` by the service; the caller just awaits and
  // relies on the "morpheme:upsert" event to repaint.
  expand(id: string, signal?: AbortSignal): Promise<{ word: string; zh: string; emoji: string }[]>;
  // A3: already in the vocab list but not liked → just likes it.
  addSuggested(id: string, word: string): Promise<VocabEntry | undefined>;
  setVerified(id: string, v: boolean): void;
  edit(id: string, patch: Partial<Pick<Morpheme, "meaningZh" | "origin" | "timeline" | "fact">>): void;
  // A9 對話 — one thread per morpheme (morphemeThreadId()).
  chatThread(id: string): Thread | undefined;
  isChatBusy(id: string): boolean;
  stopChat(id: string): void;
  askChat(id: string, kind: "examples" | "compare"): Promise<void>;
  followup(id: string, question: string, selection?: string): Promise<void>;
  retry(id: string, turnId: string): Promise<void>;
  readonly events: TypedEmitter<MorphemeApiEvents>;
}

import type { Record_ } from "./entry";

// AI discussion threads (規劃書 06 §4.1). Persisted in store/threads.json,
// owned by services/threads/ThreadService.

// Mirrors services/ai/errors.ts AiErrorCode. Duplicated as a plain string
// union because core/** can't import services; the service only ever
// writes codes from that list.
export type TurnErrorCode = string;

export type Anchor =
  | { kind: "paragraph"; path: string; blockId?: string; hash: string; snapshot: string }
  // origin: the note the word was captured from, for 「出自 ¶12」 and the
  // prompt's source paragraph.
  | { kind: "word"; entryId: string; origin?: { path: string; blockId?: string } }
  | { kind: "trivia-session" };

export type TurnStatus = "done" | "streaming" | "error" | "aborted";

export interface TurnUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  // User turn: what the bubble shows (the question, or the quick action's
  // label). Assistant turn: the answer — partial text for aborted/error.
  content: string;
  at: string;
  // Bumped on pin/feedback edits so a merge keeps the newer copy.
  updatedAt?: string;
  // Turns are never removed in place (a merge would resurrect them from
  // the other device's copy); a retry tombstones the failed pair instead.
  deletedAt?: string;
  taskId?: string;
  taskVersion?: number;
  // User turns: the highlighted text that went with the question, and the
  // exact final message sent to the model. History replays `sent` verbatim
  // so earlier turns stay byte-identical even after a template changes
  // (規劃書 06 §6.4.1).
  selection?: string;
  question?: string;
  sent?: string;
  subjectEntryId?: string;
  status: TurnStatus;
  error?: TurnErrorCode;
  errorMessage?: string;
  // "max_tokens" when the answer was cut off by the length cap.
  stop?: "end" | "max_tokens" | "refusal";
  model?: string;
  provider?: string;
  usage?: TurnUsage;
  feedback?: "up" | "down";
  pinnedToGrammar?: boolean;
}

export interface Thread extends Record_ {
  id: string;
  anchor: Anchor;
  turns: Turn[];
}

// One thread per word, with a deterministic id so two devices that each
// start discussing the same word end up with one thread after sync.
export function wordThreadId(entryId: string): string {
  return `word:${entryId}`;
}

export function liveTurns(thread: Thread | undefined): Turn[] {
  return thread ? thread.turns.filter((t) => !t.deletedAt) : [];
}

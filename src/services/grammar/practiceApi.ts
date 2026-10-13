import type { TypedEmitter } from "../../core/events";
import type { GrammarFilter } from "../../core/grammar/practiceFilter";
import type { GrammarQuestion } from "../../core/model/grammar";

export interface GrammarPracticeEvents {
  "pool:change": void;
  "refill:start": void;
  "refill:end": { error?: unknown };
}

// What the 練習中心 grammar tab (第十六波 H) needs from the question
// service. QuestionService implements it; the UI only sees this.
export interface GrammarPracticeApi {
  // Still-unanswered questions in the waiting pool, in answer order.
  poolQuestions(): GrammarQuestion[];
  // Open mistakes (grammar), latest first.
  mistakeQuestions(): GrammarQuestion[];
  isRefilling(): boolean;
  // Only generates when the pool is at REFILL_AT or fewer and AI is on;
  // otherwise returns at once. Failures come out as "refill:end" { error }.
  refill(filter: GrammarFilter, opts?: { signal?: AbortSignal }): Promise<void>;
  // Takes pool questions outside the filter out ("filtered").
  applyFilter(filter: GrammarFilter): void;
  answer(
    q: GrammarQuestion,
    optionText: string,
    correct: boolean,
    opts: { hinted: boolean; fromMistakes: boolean }
  ): void;
  skip(q: GrammarQuestion): void;
  // 👎: retires the question, leaves the pool, resolves its mistake.
  retire(q: GrammarQuestion): void;
  // A TypedEmitter<GrammarPracticeEvents>; only on / off are part of the
  // contract (the real service's emitter carries more events).
  events: Pick<TypedEmitter<GrammarPracticeEvents>, "on" | "off">;
}

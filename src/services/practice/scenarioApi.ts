import type { TypedEmitter } from "../../core/events";
import type { PolySense } from "../../core/model/poly";
import type { PracticeQuestion, ScenarioTrack } from "../../core/model/practice";

// What the 常用字 / 單字情境 / 混合 tabs (第十七波 Q, V) need from the
// scenario service. ScenarioService implements it; the UI only sees this.

export interface VocabRef {
  id: string;
  word: string;
  zh: string;
  pos: string;
}

export interface GrammarRef {
  topicId: string;
  objectiveId: string;
  text: string;
  title: string;
  pattern: string;
}

// `tested` senses are asked ("考"); `reference` ones only feed wrong options
// and the story ("參考").
export type ScenarioRequest =
  | { track: "poly"; tested: PolySense[]; reference: PolySense[] }
  | { track: "vocab"; words: VocabRef[] }
  | {
      track: "mix";
      poly?: { tested: PolySense[]; reference: PolySense[] };
      vocab?: VocabRef[];
      grammar?: GrammarRef[];
    };

export interface ScenarioEvents {
  "pool:change": ScenarioTrack;
  "refill:start": ScenarioTrack;
  "refill:end": { track: ScenarioTrack; error?: unknown };
}

export interface ScenarioPracticeApi {
  // Still-unanswered questions in the track's pool, in answer order (seq).
  poolQuestions(track: ScenarioTrack): PracticeQuestion[];
  // Open mistakes, latest first.
  mistakeQuestions(track?: ScenarioTrack): PracticeQuestion[];
  isRefilling(track: ScenarioTrack): boolean;
  // Only generates when the pool is at REFILL_AT or fewer, AI is on and no
  // refill is running; failures come out as "refill:end" { error }, never
  // thrown.
  refill(req: ScenarioRequest, opts?: { signal?: AbortSignal }): Promise<void>;
  // Takes pool questions whose focus id isn't in the set out ("filtered").
  applyScope(track: ScenarioTrack, focusIds: ReadonlySet<string>): void;
  answer(
    q: PracticeQuestion,
    optionId: string,
    correct: boolean,
    opts: { hinted: boolean; fromMistakes: boolean }
  ): void;
  skip(q: PracticeQuestion): void;
  // 👎: retires the question, leaves the pool, resolves its mistake.
  retire(q: PracticeQuestion): void;
  events: Pick<TypedEmitter<ScenarioEvents>, "on" | "off">;
}

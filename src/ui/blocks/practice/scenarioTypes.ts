import type { TypedEmitter } from "../../../core/events";
import type { PolySense } from "../../../core/model/poly";
import type { PracticeQuestion, ScenarioTrack } from "../../../core/model/practice";

// 第十七波 Q: the scenario service's interface (S owns the implementation in
// src/services/practice/scenarioApi.ts). Declared as-is here because this
// branch doesn't have S's file; integration swaps these for
// `export type { ... } from "../../../services/practice/scenarioApi"`.

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
  // Unanswered questions in the pool, by seq.
  poolQuestions(track: ScenarioTrack): PracticeQuestion[];
  // The 錯題區, newest mistake first.
  mistakeQuestions(track?: ScenarioTrack): PracticeQuestion[];
  isRefilling(track: ScenarioTrack): boolean;
  // Generates only when the pool is at or under REFILL_AT and AI is on;
  // failures are emitted as refill:end { error }, never thrown.
  refill(req: ScenarioRequest, opts?: { signal?: AbortSignal }): Promise<void>;
  // Questions in the pool whose focus.id isn't in the set leave it ("filtered").
  applyScope(track: ScenarioTrack, focusIds: ReadonlySet<string>): void;
  answer(q: PracticeQuestion, optionId: string, correct: boolean, opts: { hinted: boolean; fromMistakes: boolean }): void;
  skip(q: PracticeQuestion): void;
  retire(q: PracticeQuestion): void;
  events: Pick<TypedEmitter<ScenarioEvents>, "on" | "off">;
}

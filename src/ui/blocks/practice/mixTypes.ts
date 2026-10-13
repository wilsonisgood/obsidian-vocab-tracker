import type { TypedEmitter } from "../../../core/events";
import type { PolySense } from "../../../core/model/poly";
import type { PracticeQuestion, ScenarioTrack } from "../../../core/model/practice";
import type { PlayerQuestion } from "./playerTypes";

// 第十七波 V: S's scenarioApi.ts isn't on this branch, so its contract is
// declared here verbatim; integration swaps these for `import … from
// "../../../services/practice/scenarioApi"`. toPlayerQuestion is the minimal
// stand-in for Q's scenarioQuestionView.ts.

export interface VocabRef { id: string; word: string; zh: string; pos: string }
export interface GrammarRef { topicId: string; objectiveId: string; text: string; title: string; pattern: string }
export type ScenarioRequest =
  | { track: "poly"; tested: PolySense[]; reference: PolySense[] }
  | { track: "vocab"; words: VocabRef[] }
  | { track: "mix"; poly?: { tested: PolySense[]; reference: PolySense[] }; vocab?: VocabRef[]; grammar?: GrammarRef[] };

export interface ScenarioEvents {
  "pool:change": ScenarioTrack;
  "refill:start": ScenarioTrack;
  "refill:end": { track: ScenarioTrack; error?: unknown };
}

export interface ScenarioPracticeApi {
  poolQuestions(track: ScenarioTrack): PracticeQuestion[];
  mistakeQuestions(track?: ScenarioTrack): PracticeQuestion[];
  isRefilling(track: ScenarioTrack): boolean;
  refill(req: ScenarioRequest, opts?: { signal?: AbortSignal }): Promise<void>;
  applyScope(track: ScenarioTrack, focusIds: ReadonlySet<string>): void;
  answer(q: PracticeQuestion, optionId: string, correct: boolean, opts: { hinted: boolean; fromMistakes: boolean }): void;
  skip(q: PracticeQuestion): void;
  retire(q: PracticeQuestion): void;
  events: Pick<TypedEmitter<ScenarioEvents>, "on" | "off">;
}

// The shared mistakes panel (Q's renderMistakesPanel) as the tabs get it.
export type MountMistakes = (el: HTMLElement, track: ScenarioTrack, owner: import("obsidian").Component) => { refresh(): void };

// Category prefix of the player's tag: 「單字 · reluctant」.
export type MixCategory = "vocab" | "grammar" | "poly";

// Minimal PracticeQuestion → PlayerQuestion (fixed decision: fields copied
// as they are; tag = category prefix). `tagOf` gives the tag for a focus.
export function toPlayerQuestion(q: PracticeQuestion, tagOf: (q: PracticeQuestion) => string): PlayerQuestion {
  return {
    id: q.id,
    scenarioId: q.scenario.id,
    scene: q.scenario.scene,
    ...(q.scenario.lead && q.scenario.lead.length > 0 ? { lead: q.scenario.lead } : {}),
    ...(q.scenario.speaker ? { speaker: q.scenario.speaker } : {}),
    kind: q.kind,
    text: q.text,
    options: q.options,
    answerId: q.answerId,
    explanation: q.explanation,
    ...(q.optionNotes ? { optionNotes: q.optionNotes } : {}),
    ...(q.sentenceZh ? { sentenceZh: q.sentenceZh } : {}),
    tag: tagOf(q),
  };
}

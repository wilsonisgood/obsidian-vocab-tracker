import type { FocusRef, Track } from "./learner";

// 第十七波: one question shape for the scenario practice of 常用字, 單字
// 情境練習 and 混合 (grammar keeps its own GrammarQuestion in grammar.json).
// Stored in the learner shard (`questions`), so every learning record lives
// in one place (1013-card-tabs C5). Mirrors the player's PlayerQuestion.

// which-sense: [[word]] in `text`, pick its meaning (options are Chinese);
// pick-word / choice: one "____" in `text`, pick the English that fits;
// same-sense: pick the sentence where [[word]] means the same;
// find-error: the options are fragments of `text`, pick the wrong one.
export type PracticeKind = "which-sense" | "pick-word" | "same-sense" | "choice" | "find-error";

export type ScenarioTrack = Exclude<Track, "grammar">;

export interface PracticeScenarioInfo {
  id: string;
  scene: string;
  seq: number;
  speaker?: string;
  // 串場句 shown before this question.
  lead?: { speaker?: string; text: string }[];
}

export interface PracticeQuestion {
  id: string;
  track: ScenarioTrack;
  scenario: PracticeScenarioInfo;
  kind: PracticeKind;
  text: string;
  options: { id: string; text: string }[];
  answerId: string;
  explanation: string;
  // Wrong option id → why it's wrong here / when it would be right.
  optionNotes?: Record<string, string>;
  sentenceZh?: string;
  // What the question is about: a sense (常用字), a word (單字) or a grammar
  // objective (混合).
  focus: FocusRef;
  errorTag?: string;
  createdAt: string;
  updatedAt: string;
  // 👎: kept (events point at it) but never asked again.
  retiredAt?: string;
}

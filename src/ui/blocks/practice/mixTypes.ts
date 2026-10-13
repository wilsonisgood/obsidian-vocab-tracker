import type { ScenarioTrack } from "../../../core/model/practice";

// 第十七波 V: the scenario contract is S's (services/practice/scenarioApi);
// toPlayerQuestion is Q's (scenarioQuestionView).
export type {
  GrammarRef,
  ScenarioEvents,
  ScenarioPracticeApi,
  ScenarioRequest,
  VocabRef,
} from "../../../services/practice/scenarioApi";

// The shared mistakes panel (Q's renderMistakesPanel) as the tabs get it.
export type MountMistakes = (el: HTMLElement, track: ScenarioTrack, owner: import("obsidian").Component) => { refresh(): void };

// Category prefix of the player's tag: 「單字 · reluctant」.
export type MixCategory = "vocab" | "grammar" | "poly";

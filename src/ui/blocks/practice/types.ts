import type { App, Component, MarkdownPostProcessorContext } from "obsidian";
import type { FlashcardsHost } from "../flashcards";
import type { VocabScenarioDeps } from "./vocabTab";

// 練習中心 (第十六波 E, 規劃書 12). Shared contracts of the hub shell; the
// tabs other tasks add (文法, 常用字, 混合) register through PracticeHost.tabs().

import type { Track } from "../../../core/model/learner";
export type { Track };

// A track's filter value, synced across devices (LearnerStore.filter /
// setFilter once F is merged). Never localStorage.
export interface FilterStore {
  get(track: Track): unknown;
  set(track: Track, value: unknown): void;
}

export interface PracticeTabContext {
  app: App;
  filters: FilterStore;
  // Children of the mounted tab hang under this; it unloads when the tab is
  // switched away or the block goes.
  component: Component;
}

export interface PracticeTabDef {
  id: Track;
  label: string;
  order: number;
  // Called on every switch to this tab; `el` is empty.
  mount(el: HTMLElement, ctx: PracticeTabContext): void;
}

// What the hub needs from the plugin: the flashcards host for the vocab tab
// plus the registry of the other tabs and the filter store.
export interface PracticeHost extends FlashcardsHost {
  // Tabs added by other tasks (the vocab tab is built in).
  tabs(): readonly PracticeTabDef[];
  filters: FilterStore;
  // 第十七波 V: what the 單字 tab's 情境練習 switch needs; without it the tab is cards only.
  vocabScenario?(): VocabScenarioDeps;
}

export type RenderPractice = (
  host: PracticeHost,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) => void;

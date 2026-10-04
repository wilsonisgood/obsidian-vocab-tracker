import type { I18nKey } from "../../../core/i18n";
import type { LearnerProfile } from "../../../core/model/settings";
import type { AiRequest, AiResult, ChatMessage, Tier } from "../providers/types";

export type Surface = "paragraph" | "word" | "family" | "verb" | "trivia";

export interface TaskContext {
  profile: LearnerProfile;
  // Earlier turns of this thread, oldest first. compose.ts keeps the last
  // 6 rounds (規劃書 06 §6.4).
  history: ChatMessage[];
}

// One AI task = one quick-action button (規劃書 06 §6.3). Adding a button
// is adding a task object to registry.ts; the UI reads the registry.
export interface AiTask<I, O = string> {
  id: string;
  // Bump whenever the prompt changes; stored on each turn so a regression
  // can be traced to the prompt version that produced it.
  version: number;
  surface: Surface;
  // Only tasks with a label show up as quick-action buttons.
  label?: I18nKey;
  tier: Tier;
  maxTokens: number;
  build(input: I, ctx: TaskContext): AiRequest;
  parse?(r: AiResult): O;
}

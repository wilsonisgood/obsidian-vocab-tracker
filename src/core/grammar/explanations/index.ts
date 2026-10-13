import { STAGE1_EXPLANATIONS } from "./stage1";

// Built-in 「說明」 of the grammar topics (第十六波 C, 1013-2). Stage 2 and 3
// are added by the integration (STAGE2_EXPLANATIONS / STAGE3_EXPLANATIONS).
const ALL: Readonly<Record<string, string>> = {
  ...STAGE1_EXPLANATIONS,
};

export function builtInExplanation(topicId: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(ALL, topicId) ? ALL[topicId] : undefined;
}

export function builtInExplanationIds(): string[] {
  return Object.keys(ALL);
}

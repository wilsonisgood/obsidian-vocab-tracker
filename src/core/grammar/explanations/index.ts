import { STAGE1_EXPLANATIONS } from "./stage1";
import { STAGE2_EXPLANATIONS } from "./stage2";
import { STAGE3_EXPLANATIONS } from "./stage3";

// Built-in 「說明」 of every grammar topic (第十六波 C, 1013-2).
const ALL: Readonly<Record<string, string>> = {
  ...STAGE1_EXPLANATIONS,
  ...STAGE2_EXPLANATIONS,
  ...STAGE3_EXPLANATIONS,
};

export function builtInExplanation(topicId: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(ALL, topicId) ? ALL[topicId] : undefined;
}

export function builtInExplanationIds(): string[] {
  return Object.keys(ALL);
}

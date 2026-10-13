import type { GrammarStage } from "../model/grammar";
import type { CefrLevel } from "../model/settings";
import { GRAMMAR_TOPICS } from "./catalog";
import { startDifficulty } from "./progress";

// The 練習中心 grammar tab's filter (第十六波, 規劃書 12). Stored in the
// learner shard (LearnerStore.filter("grammar")) as plain JSON, so every
// read goes through parseGrammarFilter.

export interface GrammarFilter {
  // Empty = the learner's starting stage (see topicsInFilter).
  stages: GrammarStage[];
  // Empty = every topic of the chosen stages.
  topics: string[];
}

const STAGES: readonly GrammarStage[] = [1, 2, 3];

export function parseGrammarFilter(v: unknown): GrammarFilter {
  const o = typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const stages = STAGES.filter((s) => Array.isArray(o.stages) && o.stages.includes(s));
  const topics: string[] = [];
  if (Array.isArray(o.topics)) {
    for (const t of o.topics) if (typeof t === "string" && t && !topics.includes(t)) topics.push(t);
  }
  return { stages, topics };
}

// difficulty 1–3 → stage 1, 4–6 → 2, 7–9 → 3.
export function stageOfDifficulty(difficulty: number): GrammarStage {
  return difficulty <= 3 ? 1 : difficulty <= 6 ? 2 : 3;
}

export function startStage(level: CefrLevel | ""): GrammarStage {
  return stageOfDifficulty(startDifficulty(level));
}

// Topic ids in catalog order. Named topics that fall outside the chosen
// stages are ignored; if none is left the whole stage list is used.
export function topicsInFilter(f: GrammarFilter, level: CefrLevel | ""): string[] {
  const stages = f.stages.length ? f.stages : [startStage(level)];
  const inStages = GRAMMAR_TOPICS.filter((t) => stages.includes(t.stage));
  if (f.topics.length) {
    const want = new Set(f.topics);
    const named = inStages.filter((t) => want.has(t.id));
    if (named.length) return named.map((t) => t.id);
  }
  return inStages.map((t) => t.id);
}

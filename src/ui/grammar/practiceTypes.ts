import type { TypedEmitter } from "../../core/events";
import { topicById } from "../../core/grammar/catalog";
import { GRAMMAR_TOPICS } from "../../core/grammar/catalog";
import type { GrammarQuestion, GrammarStage } from "../../core/model/grammar";
import type { CefrLevel } from "../../core/model/settings";
import { defaultStage } from "../blocks/grammarMapModel";

// 第十六波 H: the grammar practice contracts G (QuestionService) implements,
// declared here word-for-word from w16-rules "第二批" so H builds without G's
// files. At integration swap the declarations for imports of G's
// core/grammar/practiceFilter.ts (GrammarFilter, parseGrammarFilter,
// topicsInFilter), GrammarPracticeApi and the GrammarQuestion fields.

export interface GrammarFilter {
  // Empty topics = every topic of the chosen stages; empty stages too = the
  // learner's starting stage.
  stages: (1 | 2 | 3)[];
  topics: string[];
}

export type GrammarQuestionLike = GrammarQuestion & {
  scenario?: { id: string; scene: string; seq: number; speaker?: string; lead?: { speaker?: string; text: string }[] };
  sentenceZh?: string;
};

export interface GrammarPracticeApi {
  poolQuestions(): GrammarQuestionLike[];
  mistakeQuestions(): GrammarQuestionLike[];
  isRefilling(): boolean;
  refill(filter: GrammarFilter, opts?: { signal?: AbortSignal }): Promise<void>;
  applyFilter(filter: GrammarFilter): void;
  answer(q: GrammarQuestionLike, optionText: string, correct: boolean, opts: { hinted: boolean; fromMistakes: boolean }): void;
  skip(q: GrammarQuestionLike): void;
  retire(q: GrammarQuestionLike): void;
  events: TypedEmitter<{ "pool:change": void; "refill:start": void; "refill:end": { error?: unknown } }>;
}

// ── Minimal stand-ins for G's pure helpers ──────────────────────

const isStage = (n: unknown): n is 1 | 2 | 3 => n === 1 || n === 2 || n === 3;

// A stored filter value (undefined, an older shape, junk) → a clean filter.
export function parseGrammarFilter(v: unknown): GrammarFilter {
  const out: GrammarFilter = { stages: [], topics: [] };
  if (!v || typeof v !== "object") return out;
  const o = v as { stages?: unknown; topics?: unknown };
  if (Array.isArray(o.stages)) out.stages = [...new Set(o.stages.filter(isStage))].sort();
  if (Array.isArray(o.topics)) out.topics = [...new Set(o.topics.filter((x): x is string => typeof x === "string" && !!topicById(x)))];
  return out;
}

// The topic ids the filter covers.
export function topicsInFilter(f: GrammarFilter, level: CefrLevel | ""): string[] {
  if (f.topics.length > 0) return f.topics.filter((id) => !!topicById(id));
  const stages: GrammarStage[] = f.stages.length > 0 ? f.stages : [defaultStage(level)];
  return GRAMMAR_TOPICS.filter((t) => stages.includes(t.stage)).map((t) => t.id);
}

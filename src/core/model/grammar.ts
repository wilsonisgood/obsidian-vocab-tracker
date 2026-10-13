import type { Record_ } from "./entry";
import type { SrsCard } from "./srs";

// Grammar learning (第十五波, docs/feature/1013-grammar-report.md). The
// built-in topic list lives in core/grammar/catalog.ts; this file is the
// shapes only. Question bank, attempts and per-topic progress persist in
// store/grammar.json (services/grammar/GrammarStore).

export type GrammarStage = 1 | 2 | 3;

export interface GrammarObjective {
  // Unique within its topic, kebab-case. Never renamed: attempts point at it.
  id: string;
  // 繁體中文, one learning goal ("能分辨…").
  text: string;
}

export interface GrammarTopic {
  // Kebab-case semantic id, never changes (wave 15 rule 1). Mistakes,
  // progress and sightings all hang on it.
  id: string;
  stage: GrammarStage;
  // Sort key inside a stage only.
  order: number;
  // 1–9: 1–3 基礎, 4–6 中級, 7–9 進階 (rule 3).
  difficulty: number;
  // 繁體中文.
  title: string;
  // English pattern, e.g. "have done / did".
  pattern: string;
  // One 繁體中文 sentence, ≤ 30 chars.
  summary: string;
  objectives: GrammarObjective[];
  prerequisites: string[];
  related: string[];
  // A line or two for the question-writing AI.
  promptHint?: string;
}

// ── Error tags (rule 6) ──────────────────────────────────────────

export const ERROR_TAGS = [
  "tense-choice",
  "aspect",
  "agreement",
  "article",
  "preposition",
  "word-order",
  "verb-pattern",
  "modal-meaning",
  "conditional",
  "voice",
  "relative-clause",
  "clause-link",
  "quantifier",
  "comparison",
  "pronoun",
  "plural",
  "participle",
  "reported-speech",
  "inversion",
  "emphasis",
  "register",
  "negation",
  "determiner",
  "possessive",
  "spelling-form",
  "other",
] as const;
export type ErrorTag = (typeof ERROR_TAGS)[number];

// Anything outside the list (the AI invented one, a hand-edited file) is "other".
export function normalizeErrorTag(v: unknown): ErrorTag {
  if (typeof v !== "string") return "other";
  const s = v.trim().toLowerCase();
  return (ERROR_TAGS as readonly string[]).includes(s) ? (s as ErrorTag) : "other";
}

// ── Questions / attempts / progress ──────────────────────────────

export const GRAMMAR_QUESTION_TYPES = ["choice", "blank", "find-error", "rewrite", "translate"] as const;
export type GrammarQuestionType = (typeof GRAMMAR_QUESTION_TYPES)[number];

// find-error convention: `stem` is the whole sentence, `options` are the 3–4
// marked fragments of it, `answer` is the wrong fragment and `accepted[0]`
// holds the corrected wording.
export interface GrammarQuestion extends Record_ {
  id: string;
  topicId: string;
  objectiveId: string;
  type: GrammarQuestionType;
  stem: string;
  options?: string[];
  answer: string;
  accepted?: string[];
  explanation: string;
  // Wrong option → why it's wrong.
  distractors?: Record<string, string>;
  errorTag: ErrorTag;
  // Set when the question was built from a sentence the learner read.
  source?: { path: string; sentence: string };
  createdAt?: string;
  // Retired questions stay stored (attempts point at them) but aren't asked again.
  retiredAt?: string;
}

export interface GrammarAttempt {
  id: string;
  questionId: string;
  topicId: string;
  objectiveId: string;
  at: string;
  correct: boolean;
  given: string;
}

export interface GrammarProgress extends Record_ {
  // = topicId
  id: string;
  srs?: SrsCard;
  lastPracticedAt?: string;
}

export interface GrammarShard {
  questions: GrammarQuestion[];
  attempts: GrammarAttempt[];
  progress: GrammarProgress[];
}

// Derived, never stored: "new" no attempts; "learning" some, not mastered;
// "mastered" per-objective recent accuracy reached; "due" srs.due passed.
export type GrammarTopicStatus = "new" | "learning" | "mastered" | "due";

// ── Reading sightings (rule 7) ───────────────────────────────────

// A topic the 文法解析 answer on a paragraph said it used. Computed from
// threads (core/grammar/sightings.ts), never persisted.
export interface GrammarSighting {
  topicId: string;
  threadId: string;
  turnId: string;
  // The note the paragraph is in.
  path: string;
  // anchor.snapshot: the paragraph text when it was asked.
  snapshot: string;
  // What the learner highlighted for that question, if anything.
  selection?: string;
  at: string;
}

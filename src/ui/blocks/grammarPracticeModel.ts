import { ERROR_TAGS, type ErrorTag, type GrammarQuestion } from "../../core/model/grammar";
import { isOpenQuestion } from "../../core/grammar/grading";
import { sessionRating } from "../../core/grammar/schedule";
import { defaultSessionSize, type SessionMode } from "../../core/grammar/session";
import { dueLabel } from "../../core/text/dueLabel";
import { t } from "../../core/i18n";
import { parseBlockParams } from "./params";

// View-model for the vocab-grammar-practice block (wave 15 P, 1013 §3.3):
// block parameters, the one-question-at-a-time state machine, how a stem is
// cut into pieces for drawing, the feedback texts and the keyboard map.
// Pure — no "obsidian" import — so it's unit-tested.

// ── Parameters ────────────────────────────────────────────────────

export type PracticeMode = SessionMode;

// mode / size are left out when the block doesn't write them, so the page
// can tell "not said" (a due topic defaults to review, a round's size
// follows its mode) from an explicit choice, which always wins.
export interface PracticeParams {
  topic?: string;
  mode?: PracticeMode;
  tag?: ErrorTag;
  size?: number;
}

export const MAX_SIZE = 20;

const MISTAKE_MODES = new Set(["mistakes", "mistake", "錯題", "錯題本"]);
const REVIEW_MODES = new Set(["review", "複習"]);
const LEARN_MODES = new Set(["learn", "學習"]);

//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   mode: learn        # or mistakes, review (default: review when the topic is due, else learn)
//   tag: tense-choice  # mistakes only
//   size: 8            # default 8, review 6
//   ```
export function parseGrammarPracticeParams(source: string): PracticeParams {
  const p = parseBlockParams(source);
  const out: PracticeParams = {};
  const mode = (p.mode ?? "").trim().toLowerCase();
  if (MISTAKE_MODES.has(mode)) out.mode = "mistakes";
  else if (REVIEW_MODES.has(mode)) out.mode = "review";
  else if (LEARN_MODES.has(mode)) out.mode = "learn";
  const topic = (p.topic ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (topic) out.topic = topic;
  const tag = (p.tag ?? "").trim().toLowerCase();
  if ((ERROR_TAGS as readonly string[]).includes(tag)) out.tag = tag as ErrorTag;
  const size = Number.parseInt(p.size ?? "", 10);
  if (Number.isFinite(size) && size > 0) out.size = Math.min(size, MAX_SIZE);
  return out;
}

// The mode a round runs in: the block's own `mode:` if it has one,
// otherwise review when its topic is due, else learn.
export function resolveMode(params: PracticeParams, topicDue: boolean): PracticeMode {
  if (params.mode) return params.mode;
  return params.topic && topicDue ? "review" : "learn";
}

export function resolveSize(params: PracticeParams, mode: PracticeMode): number {
  return params.size ?? defaultSessionSize(mode);
}

// ── The round ─────────────────────────────────────────────────────

// rewrite / translate (R2) take two more steps between answering and
// feedback: "grading" while the AI judges the answer, "selfcheck" when the
// learner compares it with the sample and marks themselves (AI off, the
// request failed, or they stopped it).
export type RoundPhase = "answering" | "grading" | "selfcheck" | "feedback" | "summary";

// What grammar.grade said about an answer.
export interface AiVerdict {
  feedback: string;
  corrected?: string;
}

export interface RoundResult {
  question: GrammarQuestion;
  given: string;
  correct: boolean;
  // Set when the AI graded it.
  ai?: AiVerdict;
  // Set when the learner marked it themselves (自評).
  selfAssessed?: boolean;
  // 👎: left out of the summary.
  retired?: boolean;
}

export interface RoundState {
  questions: GrammarQuestion[];
  index: number;
  phase: RoundPhase;
  // One per answered question, in order.
  results: RoundResult[];
  // The answer waiting for the AI or for self-assessment (open questions).
  pending?: string;
}

export function startRound(questions: readonly GrammarQuestion[]): RoundState {
  return { questions: [...questions], index: 0, phase: questions.length ? "answering" : "summary", results: [] };
}

export function currentQuestion(s: RoundState): GrammarQuestion | undefined {
  return s.phase === "summary" ? undefined : s.questions[s.index];
}

// The answer to the question on screen (already graded by the caller).
// Ignored outside the answering phase, so a double click can't answer twice.
export function submitAnswer(s: RoundState, given: string, correct: boolean): RoundState {
  const q = currentQuestion(s);
  if (s.phase !== "answering" || !q) return s;
  return { ...s, phase: "feedback", results: [...s.results, { question: q, given, correct }] };
}

// An open question's answer was sent: to the AI (`useAi`) or straight to
// the learner's own comparison. Only from answering, so a double click can't
// send it twice.
export function submitOpen(s: RoundState, given: string, useAi: boolean): RoundState {
  const q = currentQuestion(s);
  if (s.phase !== "answering" || !q || !given.trim()) return s;
  return { ...s, phase: useAi ? "grading" : "selfcheck", pending: given };
}

// The AI request failed or was stopped: the learner marks it themselves.
export function gradingFailed(s: RoundState): RoundState {
  return s.phase === "grading" ? { ...s, phase: "selfcheck" } : s;
}

// The AI's verdict arrived (ignored unless a grading is waiting).
export function finishGrading(s: RoundState, correct: boolean, ai: AiVerdict): RoundState {
  const q = currentQuestion(s);
  if (s.phase !== "grading" || !q || s.pending === undefined) return s;
  const { pending, ...rest } = s;
  return { ...rest, phase: "feedback", results: [...s.results, { question: q, given: pending, correct, ai }] };
}

// 「我答對了／我答錯了」.
export function selfAssess(s: RoundState, correct: boolean): RoundState {
  const q = currentQuestion(s);
  if (s.phase !== "selfcheck" || !q || s.pending === undefined) return s;
  const { pending, ...rest } = s;
  return { ...rest, phase: "feedback", results: [...s.results, { question: q, given: pending, correct, selfAssessed: true }] };
}

function advance(s: RoundState): RoundState {
  const index = s.index + 1;
  const next: RoundState = { ...s, index, phase: index >= s.questions.length ? "summary" : "answering" };
  delete next.pending;
  return next;
}

// 下一題 (or 看小結 after the last one).
export function nextQuestion(s: RoundState): RoundState {
  return s.phase === "feedback" ? advance(s) : s;
}

// 👎 這題有問題: straight on to the next question. After an answer the
// attempt is already stored; the summary just doesn't count it.
export function retireCurrent(s: RoundState): RoundState {
  if (s.phase === "summary") return s;
  if (s.phase === "feedback") {
    const results = s.results.slice();
    const last = results[results.length - 1];
    if (last) results[results.length - 1] = { ...last, retired: true };
    return advance({ ...s, results });
  }
  return advance(s);
}

export function lastResult(s: RoundState): RoundResult | undefined {
  return s.phase === "feedback" ? s.results[s.results.length - 1] : undefined;
}

// 3 / 8: the place of the question on screen.
export function progressLabel(s: RoundState): { position: number; total: number } {
  return { position: Math.min(s.index + 1, s.questions.length), total: s.questions.length };
}

export interface ObjectiveTally {
  objectiveId: string;
  answered: number;
  correct: number;
}

export interface RoundSummary {
  answered: number;
  correct: number;
  // Wrong answers, i.e. what the 錯題本 just gained (learn) or still holds (mistakes).
  wrong: number;
  retired: number;
  byObjective: ObjectiveTally[];
}

export function summarize(s: RoundState): RoundSummary {
  const counted = s.results.filter((r) => !r.retired);
  const tally = new Map<string, ObjectiveTally>();
  for (const r of counted) {
    const t = tally.get(r.question.objectiveId) ?? { objectiveId: r.question.objectiveId, answered: 0, correct: 0 };
    t.answered++;
    if (r.correct) t.correct++;
    tally.set(r.question.objectiveId, t);
  }
  const correct = counted.filter((r) => r.correct).length;
  return {
    answered: counted.length,
    correct,
    wrong: counted.length - correct,
    retired: s.results.length - counted.length,
    byObjective: [...tally.values()],
  };
}

// What the round tells the topic's FSRS card: the answers that stayed in
// the round (👎 ones left out). Empty = nothing to schedule.
export function scheduledResults(s: RoundState): { correct: boolean }[] {
  return s.results.filter((r) => !r.retired).map((r) => ({ correct: r.correct }));
}

// Whether the finished round should be scheduled at all: only a round that
// answered something, and never a 錯題本 redo.
export function schedulesTopic(mode: PracticeMode, s: RoundState): boolean {
  return mode !== "mistakes" && sessionRating(scheduledResults(s)) !== undefined;
}

// 「下次複習：今天／10/05」 — the same day label as a word row.
export function nextReviewText(due: string | Date, now: Date): string {
  const d = typeof due === "string" ? new Date(due) : due;
  const label = dueLabel(d, now);
  return t("grammar.practice.nextReview", { date: label.kind === "today" ? t("row.due.today") : label.text });
}

// 「✦ 生成新題目」: when the bank can't fill a whole round.
export function needsMoreQuestions(available: number, size: number): boolean {
  return available < size;
}

// ── Drawing a stem ────────────────────────────────────────────────

export type StemPiece =
  | { kind: "text"; text: string }
  // The gap of a choice / blank question.
  | { kind: "blank" }
  // find-error: a piece of the sentence that is one of the options.
  | { kind: "option"; text: string; index: number };

// choice / blank: the stem with its ___ as gaps.
export function stemPieces(stem: string): StemPiece[] {
  const out: StemPiece[] = [];
  stem.split(/_{3,}/).forEach((part, i) => {
    if (i > 0) out.push({ kind: "blank" });
    if (part) out.push({ kind: "text", text: part });
  });
  return out;
}

// find-error: the sentence cut so every option shows up where it sits in
// the sentence. Each option claims its first occurrence that doesn't overlap
// an earlier one; an option that can't be placed is left out (it is still
// offered as a button by the view).
export function findErrorPieces(stem: string, options: readonly string[]): StemPiece[] {
  const spans: { start: number; end: number; index: number }[] = [];
  options.forEach((opt, index) => {
    if (!opt) return;
    let from = 0;
    for (;;) {
      const start = stem.indexOf(opt, from);
      if (start === -1) return;
      const end = start + opt.length;
      if (!spans.some((s) => start < s.end && end > s.start)) {
        spans.push({ start, end, index });
        return;
      }
      from = start + 1;
    }
  });
  spans.sort((a, b) => a.start - b.start);
  const out: StemPiece[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push({ kind: "text", text: stem.slice(at, s.start) });
    out.push({ kind: "option", text: stem.slice(s.start, s.end), index: s.index });
    at = s.end;
  }
  if (at < stem.length) out.push({ kind: "text", text: stem.slice(at) });
  return out;
}

// 「出自〈筆記名〉」: the note's name from its path.
export function sourceName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

// ── Feedback ──────────────────────────────────────────────────────

export interface FeedbackModel {
  correct: boolean;
  given: string;
  // What the right answer reads as (for rewrite / translate, the sample).
  answer: string;
  // find-error: the sentence put right; rewrite / translate: the AI's version of the learner's sentence.
  corrected?: string;
  explanation: string;
  // Why the chosen wrong option is wrong, when the question says.
  whyWrong?: string;
  // rewrite / translate: what the AI said, or that the learner marked it.
  aiFeedback?: string;
  selfAssessed?: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function feedbackFor(
  q: GrammarQuestion,
  given: string,
  correct: boolean,
  how: Pick<RoundResult, "ai" | "selfAssessed"> = {}
): FeedbackModel {
  const out: FeedbackModel = { correct, given, answer: q.answer, explanation: q.explanation };
  if (isOpenQuestion(q)) {
    if (how.ai) {
      out.aiFeedback = how.ai.feedback;
      if (!correct && how.ai.corrected) out.corrected = how.ai.corrected;
    }
    if (how.selfAssessed) out.selfAssessed = true;
    return out;
  }
  if (q.type === "find-error" && q.accepted?.[0]) out.corrected = q.accepted[0];
  if (!correct && q.distractors) {
    const key = Object.keys(q.distractors).find((k) => norm(k) === norm(given));
    if (key) out.whyWrong = q.distractors[key];
  }
  return out;
}

// ── Keyboard (only while the block has focus) ─────────────────────

export type KeyAction = { type: "choose"; index: number } | { type: "submit" } | { type: "next" } | null;

export interface KeyContext {
  phase: RoundPhase;
  // Options of the question on screen (0 for a blank question).
  optionCount: number;
  // The key landed in the text box of a blank question.
  inInput: boolean;
  // ...which is the multi-line box of a rewrite / translate question:
  // Enter belongs to the text (the box submits on Ctrl/⌘+Enter itself).
  multiline?: boolean;
  // A button has focus: Enter / Space belong to it.
  onButton: boolean;
}

// 1–4 pick an option; Enter checks a typed answer or goes on to the next
// question. The text box keeps its digits and Space.
export function keyAction(key: string, ctx: KeyContext): KeyAction {
  if (ctx.phase === "summary") return null;
  if (ctx.inInput) return ctx.phase === "answering" && key === "Enter" && !ctx.multiline ? { type: "submit" } : null;
  // While the AI grades, or the learner is marking, only the buttons act.
  if (ctx.phase === "grading" || ctx.phase === "selfcheck") return null;
  if (ctx.onButton && (key === "Enter" || key === " ")) return null;
  if (ctx.phase === "feedback") return key === "Enter" ? { type: "next" } : null;
  if (/^[1-4]$/.test(key)) {
    const index = Number(key) - 1;
    return index < ctx.optionCount ? { type: "choose", index } : null;
  }
  return null;
}

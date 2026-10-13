import { TypedEmitter } from "../../core/events";
import { GRAMMAR_TOPICS, topicById } from "../../core/grammar/catalog";
import { topicSentences } from "../../core/grammar/sentences";
import { sessionRating, scheduleTopic } from "../../core/grammar/schedule";
import type { SessionMode } from "../../core/grammar/session";
import { knownTopicIds, topicStatuses } from "../../core/grammar/progress";
import type { GrammarAttempt, GrammarQuestion, GrammarSighting } from "../../core/model/grammar";
import { DEFAULT_SRS_SETTINGS, type SrsCard } from "../../core/model/srs";
import { AiError } from "../ai/errors";
import {
  DEFAULT_QUESTION_COUNT,
  grammarQuestionsFor,
  MAX_AVOID_STEMS,
  MAX_WORDS,
  type GrammarQuestionsInput,
} from "../ai/tasks/grammarQuestions";
import { grammarGrade, type GrammarGradeResult } from "../ai/tasks/grammarGrade";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";
import type { GrammarStore } from "./GrammarStore";

// The question bank's front desk (wave 15 P, 1013 §1.3): asks the AI for a
// batch of questions once, stores them, hands practice rounds what's in the
// bank, retires 👎 questions and records every answer. Works only through
// GrammarStore and the LearnAi port.

export type GrammarBank = Pick<
  GrammarStore,
  | "ensureLoaded"
  | "questions"
  | "activeQuestions"
  | "question"
  | "attempts"
  | "addAttempt"
  | "progress"
  | "upsertQuestion"
  | "upsertProgress"
>;

export interface QuestionServiceDeps {
  grammar: GrammarBank;
  ai: LearnAi;
  // Words to build sentences from: recently saved, still being reviewed,
  // at most MAX_WORDS. main.ts returns [] when the learner turned
  // 「出題時使用我的單字」 off, so nothing is sent.
  recentWords?: () => string[];
  // Where the learner met this topic while reading (R2): main.ts returns
  // grammarSightings(threads). Their sentences go into the question prompt.
  sightings?: () => GrammarSighting[];
  // The 「出題時使用我的文章句子」 setting (grammar.useMySentences, default
  // true). false = no sentence leaves the vault.
  useMySentences?: () => boolean;
  // FSRS request_retention (the same setting as the word cards).
  retention?: () => number;
  clock?: () => Date;
  newId?: () => string;
}

export interface GenerateOptions {
  // Default: every objective of the topic.
  objectiveIds?: string[];
  count?: number;
  signal?: AbortSignal;
}

export interface QuestionServiceEvents {
  "questions:busy": { topicId: string; busy: boolean };
}

export function questionThreadId(topicId: string): string {
  return `grammar:${topicId}`;
}

// One AI grading at a time per question (R2).
export function gradeThreadId(questionId: string): string {
  return `grammar-grade:${questionId}`;
}

function defaultId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const stemKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export class QuestionService {
  readonly events = new TypedEmitter<QuestionServiceEvents>();
  private busy = new Set<string>();
  private clock: () => Date;
  private newId: () => string;

  constructor(private deps: QuestionServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => defaultId(this.clock()));
  }

  isBusy(topicId: string): boolean {
    return this.busy.has(topicId);
  }

  stop(topicId: string): void {
    this.deps.ai.cancel(questionThreadId(topicId));
  }

  // Questions that can still be asked (not retired).
  pool(topicId: string): GrammarQuestion[] {
    return this.deps.grammar.activeQuestions(topicId);
  }

  // Asks the AI for a batch, stores what's usable and returns it. A batch
  // whose every question is already in the bank is bad_output.
  async generate(topicId: string, opts: GenerateOptions = {}): Promise<GrammarQuestion[]> {
    const topic = topicById(topicId);
    if (!topic) throw new Error(`Unknown grammar topic "${topicId}"`);
    if (this.busy.has(topicId)) throw new Error(`Already generating questions for "${topicId}"`);
    await this.deps.grammar.ensureLoaded();

    const bank = this.deps.grammar.questions(topicId);
    const input: GrammarQuestionsInput = {
      topic,
      objectiveIds: opts.objectiveIds?.length ? opts.objectiveIds : topic.objectives.map((o) => o.id),
      count: opts.count ?? DEFAULT_QUESTION_COUNT,
      knownTopicTitles: this.knownTitles(),
      words: this.words(),
      avoidStems: [...bank]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, MAX_AVOID_STEMS)
        .map((q) => q.stem),
      sentences: this.sentences(topicId),
    };

    this.setBusy(topicId, true);
    try {
      const { value: drafts } = await runStructured(this.deps.ai, grammarQuestionsFor(topic, input.sentences), input, {
        threadId: questionThreadId(topicId),
        signal: opts.signal,
      });
      const taken = new Set(bank.map((q) => stemKey(q.stem)));
      const saved: GrammarQuestion[] = [];
      for (const d of drafts) {
        const key = stemKey(d.stem);
        if (taken.has(key)) continue;
        taken.add(key);
        saved.push(this.deps.grammar.upsertQuestion({ ...d, id: this.newId(), topicId }));
      }
      if (!saved.length) throw new AiError("bad_output", "grammar.questions: every question was already in the bank");
      return saved;
    } finally {
      this.setBusy(topicId, false);
    }
  }

  // AI grades a rewrite / translate answer (R2). Only called when the
  // learner pressed 送出; the caller records the attempt with the verdict
  // (or, when this throws, lets the learner mark themselves).
  async grade(question: GrammarQuestion, given: string, signal?: AbortSignal): Promise<GrammarGradeResult> {
    const { value } = await runStructured(this.deps.ai, grammarGrade, { question, given }, {
      threadId: gradeThreadId(question.id),
      signal,
    });
    return value;
  }

  stopGrade(questionId: string): void {
    this.deps.ai.cancel(gradeThreadId(questionId));
  }

  // 👎 這題有問題: stays stored (attempts point at it) but is never asked again.
  retire(questionId: string): GrammarQuestion | undefined {
    const q = this.deps.grammar.question(questionId);
    if (!q || q.retiredAt) return q;
    return this.deps.grammar.upsertQuestion({ ...q, retiredAt: this.clock().toISOString() });
  }

  // Writes the answer into the attempt log and stamps the topic's progress.
  record(question: GrammarQuestion, given: string, correct: boolean): GrammarAttempt {
    const at = this.clock().toISOString();
    const attempt = this.deps.grammar.addAttempt({
      id: this.newId(),
      questionId: question.id,
      topicId: question.topicId,
      objectiveId: question.objectiveId,
      at,
      correct,
      given,
    });
    const progress = this.deps.grammar.progress(question.topicId);
    this.deps.grammar.upsertProgress({ ...(progress ?? { id: question.topicId }), lastPracticedAt: at });
    return attempt;
  }

  // A finished practice round is one review of the topic: rates how it went
  // and writes progress.srs. Only answers that stayed in the round count
  // (👎 ones don't), and a 錯題本 redo (`mistakes`) doesn't schedule at all.
  // Returns the new card, or undefined when nothing was scheduled.
  finishSession(
    topicId: string,
    results: readonly { correct: boolean; retired?: boolean }[],
    now: Date = this.clock(),
    mode: SessionMode = "learn"
  ): SrsCard | undefined {
    if (mode === "mistakes" || !topicById(topicId)) return undefined;
    const rating = sessionRating(results.filter((r) => !r.retired));
    if (!rating) return undefined;
    const progress = this.deps.grammar.progress(topicId);
    const srs = scheduleTopic(progress, rating, now, this.retention());
    this.deps.grammar.upsertProgress({ ...(progress ?? { id: topicId }), srs, lastPracticedAt: now.toISOString() });
    return srs;
  }

  private retention(): number {
    try {
      const r = this.deps.retention?.();
      if (typeof r === "number" && Number.isFinite(r) && r > 0 && r < 1) return r;
    } catch {
      // fall through to the default
    }
    return DEFAULT_SRS_SETTINGS.retention;
  }

  // ── Prompt inputs ─────────────────────────────────────────────

  private knownTitles(): string[] {
    const { grammar } = this.deps;
    const status = topicStatuses(GRAMMAR_TOPICS, grammar.attempts(), (id) => grammar.progress(id), this.clock());
    return knownTopicIds(GRAMMAR_TOPICS, (id) => status.get(id) ?? "new")
      .map((id) => topicById(id)?.title ?? "")
      .filter(Boolean);
  }

  // The reading sentences for the prompt: none when the learner turned
  // 「使用我的文章句子」 off, and never an error (a broken sightings source
  // just means no sentences).
  private sentences(topicId: string): { path: string; sentence: string }[] {
    try {
      if (this.deps.useMySentences && !this.deps.useMySentences()) return [];
      return topicSentences(this.deps.sightings?.() ?? [], topicId);
    } catch {
      return [];
    }
  }

  private words(): string[] {
    try {
      return (this.deps.recentWords?.() ?? []).slice(0, MAX_WORDS);
    } catch {
      return [];
    }
  }

  private setBusy(topicId: string, busy: boolean): void {
    if (busy) this.busy.add(topicId);
    else this.busy.delete(topicId);
    this.events.emit("questions:busy", { topicId, busy });
  }
}

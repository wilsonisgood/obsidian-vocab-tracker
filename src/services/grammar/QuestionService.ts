import { TypedEmitter } from "../../core/events";
import { GRAMMAR_TOPICS, topicById } from "../../core/grammar/catalog";
import { topicSentences } from "../../core/grammar/sentences";
import { sessionRating, scheduleTopic } from "../../core/grammar/schedule";
import type { SessionMode } from "../../core/grammar/session";
import { knownTopicIds, topicStatuses } from "../../core/grammar/progress";
import { parseGrammarFilter, topicsInFilter, type GrammarFilter } from "../../core/grammar/practiceFilter";
import { weakFocuses, weaknessDigest } from "../../core/learner/weakness";
import type { GrammarAttempt, GrammarQuestion, GrammarSighting, GrammarTopic } from "../../core/model/grammar";
import type { LearnEvent, LearnResult, PoolRemoveReason } from "../../core/model/learner";
import type { CefrLevel } from "../../core/model/settings";
import { DEFAULT_SRS_SETTINGS, type SrsCard } from "../../core/model/srs";
import { recordWrong, resolveMistake } from "../../core/practice/mistakes";
import { addToPool, needsRefill, poolRoom, removeFromPool } from "../../core/practice/pool";
import { AiError } from "../ai/errors";
import {
  DEFAULT_QUESTION_COUNT,
  grammarQuestionsFor,
  MAX_AVOID_STEMS,
  MAX_WORDS,
  objectiveRef,
  type GrammarQuestionsInput,
  type GrammarScenarioTarget,
  type PreviousScenario,
} from "../ai/tasks/grammarQuestions";
import { grammarGrade, type GrammarGradeResult } from "../ai/tasks/grammarGrade";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";
import type { LearnerStore } from "../learner/LearnerStore";
import type { GrammarStore } from "./GrammarStore";
import type { GrammarPracticeApi } from "./practiceApi";

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

// The parts of LearnerStore the grammar tab's pool / mistakes / events use.
export type LearnerPort = Pick<
  LearnerStore,
  "ensureLoaded" | "pool" | "upsertPool" | "mistakes" | "mistake" | "upsertMistake" | "addEvent" | "learnEvents"
>;

export interface QuestionServiceDeps {
  grammar: GrammarBank;
  // AiService.status() (when present) decides whether a refill may run:
  // only "ready" sends anything.
  ai: LearnAi & { status?: () => string };
  // Waiting pool, 錯題區 and 學習紀錄 (第十六波). Without it the pool
  // methods do nothing.
  learner?: LearnerPort;
  // The learner's CEFR level (settings LearnerProfile.level): decides the
  // stage a filter without stages starts at.
  level?: () => CefrLevel | "";
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
  "pool:change": void;
  "refill:start": void;
  "refill:end": { error?: unknown };
}

export function questionThreadId(topicId: string): string {
  return `grammar:${topicId}`;
}

export const REFILL_THREAD_ID = "grammar:pool";

// One AI grading at a time per question (R2).
export function gradeThreadId(questionId: string): string {
  return `grammar-grade:${questionId}`;
}

function defaultId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const stemKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// Topics in one scenario: enough to make the chosen weak spots and the new
// ground both show up, few enough to keep one story coherent.
export const MAX_SCENARIO_TOPICS = 3;
const MAX_WEAK_TOPICS = 2;
const GRAMMAR = "grammar" as const;
const CLICK_TYPES: ReadonlySet<string> = new Set(["choice", "find-error"]);

const poolItemId = (questionId: string) => `${GRAMMAR}:${questionId}`;
const focusOf = (q: Pick<GrammarQuestion, "topicId" | "objectiveId">) => ({
  kind: "grammar-objective" as const,
  id: `${q.topicId}/${q.objectiveId}`,
});
const isClickable = (q: GrammarQuestion) => CLICK_TYPES.has(q.type) && !q.retiredAt && !q.deletedAt;

// The sentence of a question as the story reads it: the gap filled with the
// answer (find-error: the wrong part put right), with the speaker in front.
export function questionLine(q: GrammarQuestion): string {
  let text = q.stem;
  if (q.type === "choice") text = q.stem.replace(/_{3,}/, q.answer);
  else if (q.type === "find-error" && q.accepted?.[0] && q.stem.includes(q.answer)) text = q.stem.replace(q.answer, q.accepted[0]);
  return q.scenario?.speaker ? `${q.scenario.speaker}: ${text}` : text;
}

export class QuestionService implements GrammarPracticeApi {
  readonly events = new TypedEmitter<QuestionServiceEvents>();
  private busy = new Set<string>();
  private refilling = false;
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

  // ── Scenario generation ───────────────────────────────────────

  // One AI call → one scenario, stored in the bank (not the pool). Returns
  // what was saved, in scenario order.
  private async makeScenario(
    targets: GrammarScenarioTarget[],
    count: number,
    threadId: string,
    extra: { weakness?: string; previous?: PreviousScenario; signal?: AbortSignal }
  ): Promise<GrammarQuestion[]> {
    const { grammar } = this.deps;
    const topicIds = targets.map((t) => t.topic.id);
    const bank = topicIds.flatMap((id) => grammar.questions(id));
    const input: GrammarQuestionsInput = {
      targets,
      count,
      weakness: extra.weakness,
      previous: extra.previous,
      knownTopicTitles: this.knownTitles(),
      words: this.words(),
      avoidStems: [...bank]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, MAX_AVOID_STEMS)
        .map((q) => q.stem),
      sentences: topicIds.flatMap((id) => this.sentences(id)),
    };
    const { value: scenario } = await runStructured(this.deps.ai, grammarQuestionsFor(targets, input.sentences), input, {
      threadId,
      signal: extra.signal,
    });
    const taken = new Set(bank.map((q) => stemKey(q.stem)));
    const scenarioId = `sc-${this.newId()}`;
    const saved: GrammarQuestion[] = [];
    for (const d of scenario.questions) {
      const key = stemKey(d.stem);
      if (taken.has(key)) continue;
      taken.add(key);
      const { speaker, lead, ...rest } = d;
      const info: NonNullable<GrammarQuestion["scenario"]> = { id: scenarioId, scene: scenario.scene, seq: saved.length + 1 };
      if (speaker) info.speaker = speaker;
      if (lead?.length) info.lead = lead;
      saved.push(grammar.upsertQuestion({ ...rest, id: this.newId(), scenario: info }));
    }
    if (!saved.length) throw new AiError("bad_output", "grammar.questions: every question was already in the bank");
    return saved;
  }

  // Older entry point (the 主題頁 block until H replaces it): a scenario on
  // one topic, kept in the bank only.
  async generate(topicId: string, opts: GenerateOptions = {}): Promise<GrammarQuestion[]> {
    const topic = topicById(topicId);
    if (!topic) throw new Error(`Unknown grammar topic "${topicId}"`);
    if (this.busy.has(topicId)) throw new Error(`Already generating questions for "${topicId}"`);
    await this.deps.grammar.ensureLoaded();
    this.setBusy(topicId, true);
    try {
      const ids = opts.objectiveIds?.length ? opts.objectiveIds : topic.objectives.map((o) => o.id);
      return await this.makeScenario([{ topic, objectiveIds: ids }], opts.count ?? DEFAULT_QUESTION_COUNT, questionThreadId(topicId), {
        signal: opts.signal,
      });
    } finally {
      this.setBusy(topicId, false);
    }
  }

  isRefilling(): boolean {
    return this.refilling;
  }

  async refill(filter: GrammarFilter, opts: { signal?: AbortSignal } = {}): Promise<void> {
    const learner = this.deps.learner;
    if (!learner || this.refilling) return;
    this.refilling = true;
    let started = false;
    try {
      await Promise.all([learner.ensureLoaded(), this.deps.grammar.ensureLoaded()]);
      this.dropUnaskable();
      if (!needsRefill(learner.pool(GRAMMAR), GRAMMAR)) return;
      if (!this.aiReady()) return;
      const room = poolRoom(learner.pool(GRAMMAR), GRAMMAR);
      const count = Math.min(DEFAULT_QUESTION_COUNT, room);
      if (count <= 0) return;
      const f = parseGrammarFilter(filter);
      const targets = this.chooseTargets(f);
      if (!targets.length) return;
      started = true;
      this.events.emit("refill:start", undefined);
      const saved = await this.makeScenario(targets, count, REFILL_THREAD_ID, {
        weakness: this.weakness(targets),
        previous: this.previousScenario(),
        signal: opts.signal,
      });
      const added = addToPool(
        learner.pool(GRAMMAR),
        GRAMMAR,
        saved.map((q) => ({ questionId: q.id, scenarioId: q.scenario?.id })),
        this.clock()
      );
      if (added.length) learner.upsertPool(added);
      this.refilling = false;
      this.events.emit("refill:end", {});
      this.events.emit("pool:change", undefined);
    } catch (e) {
      this.refilling = false;
      if (started) this.events.emit("refill:end", { error: e });
    } finally {
      this.refilling = false;
    }
  }

  private aiReady(): boolean {
    const status = this.deps.ai.status;
    if (!status) return true;
    try {
      return status.call(this.deps.ai) === "ready";
    } catch {
      return false;
    }
  }

  // Topics for the next scenario: up to MAX_WEAK_TOPICS with a weak spot,
  // then the least-practised ones, MAX_SCENARIO_TOPICS in all.
  private chooseTargets(filter: GrammarFilter): GrammarScenarioTarget[] {
    const topics = topicsInFilter(filter, this.deps.level?.() ?? "")
      .map((id) => topicById(id))
      .filter((t): t is GrammarTopic => !!t);
    if (!topics.length) return [];
    const scope = new Set(topics.flatMap((t) => t.objectives.map((o) => objectiveRef(t.id, o.id))));
    const weak = weakFocuses(this.deps.learner!.learnEvents({ track: GRAMMAR }), {
      now: this.clock(),
      track: GRAMMAR,
      scope,
      limit: 8,
    });
    const weakIds: string[] = [];
    for (const w of weak) {
      const id = w.focus.id.split("/")[0];
      if (!weakIds.includes(id)) weakIds.push(id);
    }
    const rest = topics
      .filter((t) => !weakIds.includes(t.id))
      .map((t, i) => ({ t, i, n: this.deps.grammar.attempts(t.id).length }))
      .sort((a, b) => a.n - b.n || a.i - b.i)
      .map((x) => x.t.id);
    const order = [...weakIds.slice(0, MAX_WEAK_TOPICS), ...rest, ...weakIds.slice(MAX_WEAK_TOPICS)];
    return order.slice(0, MAX_SCENARIO_TOPICS).flatMap((id) => {
      const topic = topicById(id);
      return topic ? [{ topic, objectiveIds: topic.objectives.map((o) => o.id) }] : [];
    });
  }

  // 〔學習弱點〕: grammar only, scoped to this scenario's objectives.
  private weakness(targets: readonly GrammarScenarioTarget[]): string {
    const scope = new Set(targets.flatMap((t) => t.topic.objectives.map((o) => objectiveRef(t.topic.id, o.id))));
    const weak = weakFocuses(this.deps.learner!.learnEvents({ track: GRAMMAR }), {
      now: this.clock(),
      track: GRAMMAR,
      scope,
      limit: 5,
    });
    return weaknessDigest(weak, (f) => {
      const [tid, oid] = f.id.split("/");
      const topic = topicById(tid);
      const obj = topic?.objectives.find((o) => o.id === oid);
      return obj ? `${f.id}（${obj.text}）` : f.id;
    });
  }

  // 〔上一段〕: the scene and last two sentences of the scenario at the end
  // of the pool, so the next one carries on from it.
  private previousScenario(): PreviousScenario | undefined {
    const live = this.deps.learner!.pool(GRAMMAR);
    for (let i = live.length - 1; i >= 0; i--) {
      const last = this.deps.grammar.question(live[i].questionId)?.scenario;
      if (!last) continue;
      const lines = this.deps.grammar
        .questions()
        .filter((q) => q.scenario?.id === last.id)
        .sort((x, y) => (x.scenario?.seq ?? 0) - (y.scenario?.seq ?? 0))
        .flatMap((q) => [...(q.scenario?.lead ?? []).map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)), questionLine(q)]);
      return { scene: last.scene, lastLines: lines.slice(-2) };
    }
    return undefined;
  }

  // Pool entries whose question is gone, retired or can't be clicked
  // (a migrated blank / rewrite / translate) leave the pool, so they don't
  // hold a place or block a refill.
  private dropUnaskable(): void {
    const learner = this.deps.learner;
    if (!learner) return;
    const now = this.clock();
    const out = learner
      .pool(GRAMMAR)
      .filter((i) => !isClickable(this.deps.grammar.question(i.questionId) ?? ({ type: "blank", retiredAt: "x" } as GrammarQuestion)))
      .map((i) => removeFromPool(i, this.deps.grammar.question(i.questionId)?.retiredAt ? "retired" : "filtered", now));
    if (out.length) learner.upsertPool(out);
  }

  // ── Pool / 錯題區 for the practice tab ────────────────────────

  poolQuestions(): GrammarQuestion[] {
    const learner = this.deps.learner;
    if (!learner) return [];
    const out: GrammarQuestion[] = [];
    for (const i of learner.pool(GRAMMAR)) {
      const q = this.deps.grammar.question(i.questionId);
      if (q && isClickable(q)) out.push(q);
    }
    return out;
  }

  mistakeQuestions(): GrammarQuestion[] {
    const learner = this.deps.learner;
    if (!learner) return [];
    const out: GrammarQuestion[] = [];
    for (const m of learner.mistakes(GRAMMAR)) {
      const q = this.deps.grammar.question(m.questionId);
      if (q && isClickable(q)) out.push(q);
    }
    return out;
  }

  applyFilter(filter: GrammarFilter): void {
    const learner = this.deps.learner;
    if (!learner) return;
    const allowed = new Set(topicsInFilter(parseGrammarFilter(filter), this.deps.level?.() ?? ""));
    const now = this.clock();
    const items = learner.pool(GRAMMAR);
    const gone = items.filter((i) => {
      const q = this.deps.grammar.question(i.questionId);
      return !q || !allowed.has(q.topicId);
    });
    if (!gone.length) return;
    learner.upsertPool(gone.map((i) => removeFromPool(i, "filtered", now)));
    for (const sid of new Set(gone.map((i) => i.scenarioId).filter((x): x is string => !!x))) this.finishIfLast(sid, items, gone);
    this.events.emit("pool:change", undefined);
  }

  answer(
    q: GrammarQuestion,
    optionText: string,
    correct: boolean,
    opts: { hinted: boolean; fromMistakes: boolean }
  ): void {
    const attempt = this.record(q, optionText, correct);
    const learner = this.deps.learner;
    if (!learner) return;
    const result: LearnResult = !correct ? "wrong" : opts.hinted ? "hinted" : "correct";
    const e: LearnEvent = {
      id: `g:${attempt.id}`,
      at: attempt.at,
      track: GRAMMAR,
      focus: focusOf(q),
      result,
      given: optionText,
      questionId: q.id,
    };
    if (!correct) e.errorTag = q.errorTag;
    learner.addEvent(e);

    const now = this.clock();
    const existing = learner.mistake(poolItemId(q.id));
    if (!correct) {
      learner.upsertMistake(recordWrong(existing, GRAMMAR, q.id, focusOf(q), now));
    } else if (opts.fromMistakes && !opts.hinted && existing && !existing.resolvedAt) {
      learner.upsertMistake(resolveMistake(existing, now));
    }
    if (!opts.fromMistakes) this.leavePool(q, "answered");
  }

  skip(q: GrammarQuestion): void {
    const learner = this.deps.learner;
    if (!learner) return;
    learner.addEvent(this.plainEvent(q, "skipped", `g:skip:${this.newId()}`));
    this.leavePool(q, "skipped");
  }

  // 👎: the question is retired for good (attempts keep pointing at it).
  retire(q: GrammarQuestion | string): GrammarQuestion | undefined {
    const id = typeof q === "string" ? q : q.id;
    const stored = this.deps.grammar.question(id);
    if (!stored) return undefined;
    const retired = stored.retiredAt
      ? stored
      : this.deps.grammar.upsertQuestion({ ...stored, retiredAt: this.clock().toISOString() });
    const learner = this.deps.learner;
    if (learner) {
      learner.addEvent(this.plainEvent(retired, "retired", `g:retired:${id}`));
      const m = learner.mistake(poolItemId(id));
      if (m && !m.resolvedAt) learner.upsertMistake(resolveMistake(m, this.clock()));
      this.leavePool(retired, "retired");
    }
    return retired;
  }

  private plainEvent(q: GrammarQuestion, result: LearnResult, id: string): LearnEvent {
    return { id, at: this.clock().toISOString(), track: GRAMMAR, focus: focusOf(q), result, questionId: q.id };
  }

  // Takes the question's pool item out. When it was the last one of its
  // scenario in the pool, the scenario's topics each get one finishSession.
  private leavePool(q: GrammarQuestion, reason: PoolRemoveReason): void {
    const learner = this.deps.learner;
    if (!learner) return;
    const items = learner.pool(GRAMMAR);
    const item = items.find((i) => i.questionId === q.id);
    if (!item) return;
    learner.upsertPool([removeFromPool(item, reason, this.clock())]);
    if (item.scenarioId) this.finishIfLast(item.scenarioId, items, [item]);
    this.events.emit("pool:change", undefined);
  }

  private finishIfLast(scenarioId: string, before: readonly { id: string; scenarioId?: string }[], leaving: readonly { id: string }[]): void {
    const gone = new Set(leaving.map((i) => i.id));
    if (before.some((i) => i.scenarioId === scenarioId && !gone.has(i.id))) return;
    this.finishScenario(scenarioId);
  }

  // The scenario's answers (each question's first attempt; 👎 ones don't
  // count) rate every topic that appeared in it, once.
  private finishScenario(scenarioId: string): void {
    const { grammar } = this.deps;
    const qs = grammar.questions().filter((q) => q.scenario?.id === scenarioId);
    const first = new Map<string, GrammarAttempt>();
    for (const a of grammar.attempts()) if (!first.has(a.questionId)) first.set(a.questionId, a);
    const byTopic = new Map<string, { correct: boolean; retired?: boolean }[]>();
    for (const q of qs) {
      const a = first.get(q.id);
      if (!a) continue;
      const list = byTopic.get(q.topicId) ?? [];
      list.push({ correct: a.correct, retired: !!q.retiredAt });
      byTopic.set(q.topicId, list);
    }
    for (const [topicId, results] of byTopic) this.finishSession(topicId, results, this.clock());
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

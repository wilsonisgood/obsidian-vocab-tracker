import { TypedEmitter } from "../../core/events";
import { weakFocuses, weaknessDigest } from "../../core/learner/weakness";
import type { LearnEvent, LearnResult, PoolRemoveReason } from "../../core/model/learner";
import type { PracticeQuestion, ScenarioTrack } from "../../core/model/practice";
import type { CefrLevel } from "../../core/model/settings";
import { recordWrong, resolveMistake } from "../../core/practice/mistakes";
import { addToPool, needsRefill, poolRoom, removeFromPool } from "../../core/practice/pool";
import { AiError } from "../ai/errors";
import { MAX_WORDS } from "../ai/tasks/grammarQuestions";
import {
  MAX_AVOID,
  practiceScenarioFor,
  refsOf,
  type PracticeScenarioInput,
} from "../ai/tasks/practiceScenario";
import type { PreviousScenario } from "../ai/tasks/grammarQuestions";
import { practiceParaphraseFor, type ParaphraseInput } from "../ai/tasks/paraphrase";
import type { PracticeScenarioDraft } from "../ai/tasks/practiceScenario";
import { nextParagraph } from "../../core/practice/paraphrase";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";
import type { LearnerStore } from "../learner/LearnerStore";
import type { ParaRequest, ScenarioEvents, ScenarioPracticeApi, ScenarioRequest, StoryRequest } from "./scenarioApi";

// The scenario front desk for 常用字 / 單字情境 / 混合 (第十七波 S): asks
// the AI for one connected scenario at a time, stores its questions in the
// learner shard, keeps each track's waiting pool filled and records every
// answer. Same pool / 錯題區 / event handling as the grammar QuestionService.

export const SCENARIO_REFILL_COUNT = 6;

export type ScenarioLearnerPort = Pick<
  LearnerStore,
  | "ensureLoaded"
  | "pool"
  | "upsertPool"
  | "mistakes"
  | "mistake"
  | "upsertMistake"
  | "addEvent"
  | "learnEvents"
  | "practiceQuestions"
  | "practiceQuestion"
  | "upsertPracticeQuestions"
>;

export interface ScenarioServiceDeps {
  // AiService.status() (when present) decides whether a refill may run:
  // only "ready" sends anything.
  ai: LearnAi & { status?: () => string };
  learner: ScenarioLearnerPort;
  // Words to build sentences from; main.ts returns [] when the learner
  // turned 「出題時使用我的單字」 off.
  recentWords?: () => string[];
  // The learner's CEFR level. The prompt's 〔學習者設定〕 already carries it;
  // kept for the same wiring as QuestionService.
  level?: () => CefrLevel | "";
  // C6: a vocab word answered wrong in a scenario (not a 錯題區 redo) gets
  // one FSRS Again. `entryId` is the focus id of the question.
  rateVocabAgain?: (entryId: string) => void;
  clock?: () => Date;
  newId?: () => string;
}

type RefillJob = (signal?: AbortSignal) => Promise<PracticeScenarioDraft>;

export function refillThreadId(track: ScenarioTrack): string {
  return `practice:pool:${track}`;
}

function defaultId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const poolItemId = (track: ScenarioTrack, questionId: string) => `${track}:${questionId}`;
const textKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
// 換句話說 asks about the paragraph's own sentences, so one sentence can come
// back with other options; a question is the sentence plus its answer.
const questionKey = (q: Pick<PracticeQuestion, "kind" | "text" | "options" | "answerId">) =>
  q.kind === "paraphrase"
    ? `${textKey(q.text)}|${textKey(q.options.find((o) => o.id === q.answerId)?.text ?? "")}`
    : textKey(q.text);
const PARA_WEAK_DAYS = 30;
const unmark = (s: string) => s.replace(/\[\[([^[\]]+)\]\]/g, "$1");

// The sentence of a question as the story reads it: markers removed, the
// gap filled with the answer, with the speaker in front.
export function practiceLine(q: PracticeQuestion): string {
  let text = unmark(q.text);
  if (q.kind === "pick-word" || q.kind === "choice") {
    const ans = q.options.find((o) => o.id === q.answerId)?.text;
    if (ans) text = text.replace(/_{3,}/, ans);
  }
  return q.scenario.speaker ? `${q.scenario.speaker}: ${text}` : text;
}

export class ScenarioService implements ScenarioPracticeApi {
  readonly events = new TypedEmitter<ScenarioEvents>();
  private refilling = new Set<ScenarioTrack>();
  // 第十八波 T: the scope each track last applied and a version that grows
  // with every applyScope. A refill that returns after the scope changed
  // keeps only the questions the new scope covers.
  private scopes = new Map<ScenarioTrack, ReadonlySet<string>>();
  private scopeVersions = new Map<ScenarioTrack, number>();
  private clock: () => Date;
  private newId: () => string;

  constructor(private deps: ScenarioServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => defaultId(this.clock()));
  }

  isRefilling(track: ScenarioTrack): boolean {
    return this.refilling.has(track);
  }

  scopeVersion(track: ScenarioTrack): number {
    return this.scopeVersions.get(track) ?? 0;
  }

  // ── Refill ────────────────────────────────────────────────────

  async refill(req: ScenarioRequest, opts: { signal?: AbortSignal } = {}): Promise<void> {
    const track = req.track;
    const learner = this.deps.learner;
    if (this.refilling.has(track)) return;
    this.refilling.add(track);
    const version0 = this.scopeVersion(track);
    let started = false;
    try {
      await learner.ensureLoaded();
      this.dropUnaskable(track);
      if (!needsRefill(learner.pool(track), track)) return;
      if (!this.aiReady()) return;
      const count = Math.min(SCENARIO_REFILL_COUNT, poolRoom(learner.pool(track), track));
      if (count <= 0) return;
      const job = req.track === "para" ? this.paraJob(req, count) : this.storyJob(req, count);
      if (!job) return;
      started = true;
      this.events.emit("refill:start", track);
      const draft = await job(opts.signal);
      const now = this.clock().toISOString();
      const taken = new Set(learner.practiceQuestions(track).map(questionKey));
      const scenarioId = `sc-${this.newId()}`;
      const saved: PracticeQuestion[] = [];
      const scope = this.scopeVersion(track) !== version0 ? this.scopes.get(track) : undefined;
      let outOfScope = 0;
      for (const d of draft.questions) {
        if (scope && !scope.has(d.focus.id)) {
          outOfScope++;
          continue;
        }
        const key = questionKey(d);
        if (taken.has(key)) continue;
        taken.add(key);
        const scenario: PracticeQuestion["scenario"] = { id: scenarioId, scene: draft.scene, seq: saved.length + 1 };
        if (d.speaker) scenario.speaker = d.speaker;
        if (d.lead?.length) scenario.lead = d.lead;
        const q: PracticeQuestion = {
          id: this.newId(),
          track,
          scenario,
          kind: d.kind,
          text: d.text,
          options: d.options,
          answerId: d.answerId,
          explanation: d.explanation,
          focus: d.focus,
          createdAt: now,
          updatedAt: now,
        };
        if (d.optionNotes) q.optionNotes = d.optionNotes;
        if (d.sentenceZh) q.sentenceZh = d.sentenceZh;
        if (d.errorTag) q.errorTag = d.errorTag;
        saved.push(q);
      }
      if (!saved.length && outOfScope > 0) {
        // Everything was written for a scope the learner has left.
        this.refilling.delete(track);
        this.events.emit("refill:end", { track });
        return;
      }
      if (!saved.length) throw new AiError("bad_output", "practice.scenario: every question was already stored");
      learner.upsertPracticeQuestions(saved);
      const added = addToPool(
        learner.pool(track),
        track,
        saved.map((q) => ({ questionId: q.id, scenarioId: q.scenario.id })),
        this.clock()
      );
      if (added.length) learner.upsertPool(added);
      this.refilling.delete(track);
      this.events.emit("refill:end", { track });
      this.events.emit("pool:change", track);
    } catch (e) {
      this.refilling.delete(track);
      if (started) this.events.emit("refill:end", { track, error: e });
    } finally {
      this.refilling.delete(track);
    }
  }

  private storyJob(req: StoryRequest, count: number): RefillJob | null {
    if (!refsOf(req).tested.size) return null;
    const track = req.track;
    const input: PracticeScenarioInput = {
      request: req,
      count,
      weakness: this.weakness(req),
      previous: this.previousScenario(track),
      words: this.words(),
      avoid: this.avoid(track),
    };
    return async (signal) =>
      (await runStructured(this.deps.ai, practiceScenarioFor(req), input, { threadId: refillThreadId(track), signal })).value;
  }

  // 換句話說: one paragraph per refill — the one asked about least so far —
  // with the numbers of its sentences that already have a question.
  private paraJob(req: ParaRequest, count: number): RefillJob | null {
    const stored = this.deps.learner.practiceQuestions("para");
    const paragraph = nextParagraph(req.paragraphs, (id) => stored.filter((q) => q.focus.id === id).length);
    if (!paragraph) return null;
    const mine = new Set(stored.filter((q) => q.focus.id === paragraph.threadId).map((q) => textKey(q.text)));
    const asked = paragraph.sentences.flatMap((s, i) => (mine.has(textKey(s)) ? [i + 1] : []));
    const input: ParaphraseInput = { paragraph, count, weakness: this.paraWeakness(), asked };
    return async (signal) =>
      (await runStructured(this.deps.ai, practiceParaphraseFor(paragraph), input, { threadId: refillThreadId("para"), signal }))
        .value;
  }

  // 〔學習弱點〕 of 換句話說: the error types missed most in the last 30 days.
  private paraWeakness(): string {
    const since = new Date(this.clock().getTime() - PARA_WEAK_DAYS * 86_400_000).toISOString();
    const counts = new Map<string, number>();
    for (const e of this.deps.learner.learnEvents({ track: "para" })) {
      if (e.result !== "wrong" || !e.errorTag || e.at < since) continue;
      counts.set(e.errorTag, (counts.get(e.errorTag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag, n]) => `${tag}｜最近 ${PARA_WEAK_DAYS} 天錯 ${n} 次`)
      .join("\n");
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

  // 〔學習弱點〕: scoped to the ids this request sends.
  private weakness(req: StoryRequest): string {
    const refs = refsOf(req);
    const label = new Map<string, string>();
    if (req.track === "poly") for (const s of req.tested) label.set(s.id, s.zh);
    if (req.track === "vocab") for (const v of req.words) label.set(v.id, v.word);
    if (req.track === "mix") {
      for (const s of req.poly?.tested ?? []) label.set(s.id, s.zh);
      for (const v of req.vocab ?? []) label.set(v.id, v.word);
      for (const g of req.grammar ?? []) label.set(`${g.topicId}/${g.objectiveId}`, g.text);
    }
    const weak = weakFocuses(this.deps.learner.learnEvents(), {
      now: this.clock(),
      scope: new Set(refs.tested.keys()),
      limit: 5,
    });
    return weaknessDigest(weak, (f) => (label.has(f.id) ? `${f.id}（${label.get(f.id)}）` : f.id));
  }

  // 〔上一段〕: the scene and last two sentences of the scenario at the end
  // of the pool, so the next one carries on from it.
  private previousScenario(track: ScenarioTrack): PreviousScenario | undefined {
    const learner = this.deps.learner;
    const live = learner.pool(track);
    for (let i = live.length - 1; i >= 0; i--) {
      const last = learner.practiceQuestion(live[i].questionId)?.scenario;
      if (!last) continue;
      const lines = learner
        .practiceQuestions(track)
        .filter((q) => q.scenario.id === last.id)
        .sort((x, y) => x.scenario.seq - y.scenario.seq)
        .flatMap((q) => [...(q.scenario.lead ?? []).map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)), practiceLine(q)]);
      return { scene: last.scene, lastLines: lines.slice(-2) };
    }
    return undefined;
  }

  private avoid(track: ScenarioTrack): string[] {
    return [...this.deps.learner.practiceQuestions(track)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_AVOID)
      .map((q) => unmark(q.text));
  }

  private words(): string[] {
    try {
      return (this.deps.recentWords?.() ?? []).slice(0, MAX_WORDS);
    } catch {
      return [];
    }
  }

  // Pool entries whose question is gone or retired leave the pool, so they
  // don't hold a place or block a refill.
  private dropUnaskable(track: ScenarioTrack): void {
    const learner = this.deps.learner;
    const now = this.clock();
    const out = learner
      .pool(track)
      .filter((i) => {
        const q = learner.practiceQuestion(i.questionId);
        return !q || !!q.retiredAt;
      })
      .map((i) => removeFromPool(i, learner.practiceQuestion(i.questionId)?.retiredAt ? "retired" : "filtered", now));
    if (out.length) learner.upsertPool(out);
  }

  // ── Pool / 錯題區 for the practice tabs ───────────────────────

  poolQuestions(track: ScenarioTrack): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (const i of this.deps.learner.pool(track)) {
      const q = this.deps.learner.practiceQuestion(i.questionId);
      if (q && !q.retiredAt) out.push(q);
    }
    return out;
  }

  mistakeQuestions(track?: ScenarioTrack): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (const m of this.deps.learner.mistakes(track)) {
      if (m.track === "grammar") continue;
      const q = this.deps.learner.practiceQuestion(m.questionId);
      if (q && !q.retiredAt) out.push(q);
    }
    return out;
  }

  applyScope(track: ScenarioTrack, focusIds: ReadonlySet<string>): void {
    this.scopes.set(track, new Set(focusIds));
    this.scopeVersions.set(track, this.scopeVersion(track) + 1);
    const learner = this.deps.learner;
    const now = this.clock();
    const gone = learner.pool(track).filter((i) => {
      const q = learner.practiceQuestion(i.questionId);
      return !q || !focusIds.has(q.focus.id);
    });
    if (!gone.length) return;
    learner.upsertPool(gone.map((i) => removeFromPool(i, "filtered", now)));
    this.events.emit("pool:change", track);
  }

  // ── Answers ───────────────────────────────────────────────────

  answer(
    q: PracticeQuestion,
    optionId: string,
    correct: boolean,
    opts: { hinted: boolean; fromMistakes: boolean }
  ): void {
    const learner = this.deps.learner;
    const now = this.clock();
    const result: LearnResult = !correct ? "wrong" : opts.hinted ? "hinted" : "correct";
    const e: LearnEvent = {
      id: `p:${q.id}:${this.newId()}`,
      at: now.toISOString(),
      track: q.track,
      focus: q.focus,
      result,
      given: q.options.find((o) => o.id === optionId)?.text ?? optionId,
      questionId: q.id,
    };
    if (!correct && q.errorTag) e.errorTag = q.errorTag;
    learner.addEvent(e);

    const existing = learner.mistake(poolItemId(q.track, q.id));
    if (!correct) {
      learner.upsertMistake(recordWrong(existing, q.track, q.id, q.focus, now));
    } else if (opts.fromMistakes && !opts.hinted && existing && !existing.resolvedAt) {
      learner.upsertMistake(resolveMistake(existing, now));
    }
    if (!opts.fromMistakes) this.leavePool(q, "answered");
    if (!correct && !opts.fromMistakes && q.focus.kind === "word") {
      try {
        this.deps.rateVocabAgain?.(q.focus.id);
      } catch (err) {
        console.error("Vocab Tracker: couldn't rate the word", err);
      }
    }
  }

  // 1030 #2: 跳過 = leaves the pool and 錯題本, and doesn't count (no
  // rating: only answers are scored).
  skip(q: PracticeQuestion): void {
    const learner = this.deps.learner;
    learner.addEvent(this.plainEvent(q, "skipped", `p:skip:${q.id}:${this.newId()}`));
    const m = learner.mistake(poolItemId(q.track, q.id));
    if (m && !m.resolvedAt) learner.upsertMistake(resolveMistake(m, this.clock()));
    this.leavePool(q, "skipped");
  }

  // 👎: the question is retired for good (events keep pointing at it).
  retire(q: PracticeQuestion): void {
    const learner = this.deps.learner;
    const stored = learner.practiceQuestion(q.id) ?? q;
    const now = this.clock();
    const retired = stored.retiredAt ? stored : { ...stored, retiredAt: now.toISOString(), updatedAt: now.toISOString() };
    if (!stored.retiredAt) learner.upsertPracticeQuestions([retired]);
    learner.addEvent(this.plainEvent(retired, "retired", `p:retired:${q.id}`));
    const m = learner.mistake(poolItemId(q.track, q.id));
    if (m && !m.resolvedAt) learner.upsertMistake(resolveMistake(m, now));
    this.leavePool(retired, "retired");
  }

  private plainEvent(q: PracticeQuestion, result: LearnResult, id: string): LearnEvent {
    return { id, at: this.clock().toISOString(), track: q.track, focus: q.focus, result, questionId: q.id };
  }

  private leavePool(q: PracticeQuestion, reason: PoolRemoveReason): void {
    const learner = this.deps.learner;
    const item = learner.pool(q.track).find((i) => i.questionId === q.id);
    if (!item) return;
    learner.upsertPool([removeFromPool(item, reason, this.clock())]);
    this.events.emit("pool:change", q.track);
  }
}

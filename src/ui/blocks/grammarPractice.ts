import { MarkdownRenderChild, setIcon, type App, type Component, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t, type I18nKey } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import { canGradeLocally, grade } from "../../core/grammar/grading";
import { buildSession } from "../../core/grammar/session";
import type { SrsCard } from "../../core/model/srs";
import type { GrammarQuestion } from "../../core/model/grammar";
import type { AiService } from "../../services/ai/AiService";
import type { GrammarStore } from "../../services/grammar/GrammarStore";
import type { QuestionService } from "../../services/grammar/QuestionService";
import { aiErrorBox } from "../kit/aiDebug";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import {
  currentQuestion,
  feedbackFor,
  findErrorPieces,
  keyAction,
  lastResult,
  needsMoreQuestions,
  nextQuestion,
  nextReviewText,
  parseGrammarPracticeParams,
  progressLabel,
  resolveMode,
  resolveSize,
  retireCurrent,
  scheduledResults,
  schedulesTopic,
  startRound,
  stemPieces,
  submitAnswer,
  summarize,
  type PracticeMode,
  type PracticeParams,
  type RoundState,
} from "./grammarPracticeModel";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate } from "./learnUi";

// ── vocab-grammar-practice code block (wave 15 P; 1013 §3.3) ────────
//
//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   mode: learn            # or mistakes (the 錯題本) / review; default review when the topic is due
//   tag: tense-choice      # mistakes: only this error tag (no `topic:` = across all topics)
//   size: 8                # review: 6
//   ```
//
// A finished learn / review round rates the topic and schedules its next
// review (FSRS); a mistakes round never does (R1).
//
// One question at a time out of the stored bank (choice / blank /
// find-error, graded locally); answer → feedback → next → summary. Keys
// 1–4 / Enter work only while the block has focus. Questions that arrive
// while a round is running (sync, 「生成新題目」) never reorder it: they
// wait for the next round.

type LKey = Extract<I18nKey, `grammar.practice.${string}`> extends `grammar.practice.${infer K}` ? K : never;

function l(key: LKey, params?: Record<string, string | number>): string {
  return t(`grammar.practice.${key}` as I18nKey, params);
}

// What the block needs, bundled like DnaBlockDeps so it never depends on
// the concrete plugin class. main.ts / registry.ts wire it (整合事項).
export interface GrammarPracticeDeps {
  app: App;
  manifestId: string;
  grammar: GrammarStore;
  questions: QuestionService;
  // Only status() is used: the AI gate for 「生成新題目」.
  ai: Pick<AiService, "status">;
  now?(): Date;
}

export function renderGrammarPractice(
  deps: GrammarPracticeDeps,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new GrammarPracticeBlock(el, deps, parseGrammarPracticeParams(source)));
}

// The practice, mounted into any element (the 錯題本 redo opens one under
// its group). Returns the loaded component: the caller adds it as a child
// of its own owner (so it unloads with it) and unloads/removes it to close.
export function mountGrammarPractice(parent: HTMLElement, deps: GrammarPracticeDeps, params: PracticeParams): Component {
  const block = new GrammarPracticeBlock(parent, deps, params);
  block.load();
  return block;
}

type GenSlot = "empty" | "summary" | "round";

class GrammarPracticeBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private body!: HTMLElement;
  private gen!: HTMLElement;
  private ready = false;
  private disposed = false;
  private round: RoundState = startRound([]);
  private input: HTMLInputElement | null = null;
  // The keyboard needs the block focused after a click re-drew its buttons.
  private refocus = false;
  private genError: { text: string; cause: unknown } | null = null;
  private justAdded = 0;
  // What this round runs as (the block's `mode:` or, by the topic's state,
  // review / learn) and how long it is. Settled per round.
  private mode: PracticeMode = "learn";
  private size = 0;
  // The topic's new card once the round was scheduled (summary shows its date).
  private scheduled: SrsCard | null = null;
  private finished = false;
  private ctrl: AbortController | null = null;

  constructor(
    containerEl: HTMLElement,
    private deps: GrammarPracticeDeps,
    private params: PracticeParams
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-gr-practice"] });
    guardReadingClicks(this, this.root);
    // Focusable so 1–4 / Enter work once the learner clicks into the block.
    // A listener on the block, never a global keydown: keys typed anywhere
    // else in Obsidian must not answer a question.
    this.root.tabIndex = 0;
    this.registerDomEvent(this.root, "keydown", (e) => this.onKey(e));
    this.body = this.root.createDiv({ cls: "vt-gr-body" });
    this.gen = this.root.createDiv({ cls: "vt-gr-gen" });
    this.body.createDiv({ cls: "vt-learn-loading", text: l("loading") });

    const onBank = () => this.onBankChanged();
    this.register(this.deps.grammar.events.on("question:upsert", onBank));
    this.register(this.deps.grammar.events.on("grammar:reloaded", onBank));
    this.register(
      this.deps.questions.events.on("questions:busy", (e) => {
        if (e.topicId === this.params.topic) this.renderGen();
      })
    );
    this.register(() => {
      this.disposed = true;
    });

    void this.deps.grammar.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.ready = true;
      this.newRound();
    });
  }

  // ── Data ──────────────────────────────────────────────────────

  private topic() {
    return this.params.topic ? topicById(this.params.topic) : undefined;
  }

  private pool(): GrammarQuestion[] {
    return this.params.topic ? this.deps.questions.pool(this.params.topic) : this.deps.grammar.activeQuestions();
  }

  private attempts() {
    return this.deps.grammar.attempts(this.params.topic);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private topicIsDue(): boolean {
    const due = this.params.topic ? this.deps.grammar.progress(this.params.topic)?.srs?.due : undefined;
    const at = due ? new Date(due).getTime() : NaN;
    return Number.isFinite(at) && at <= this.now().getTime();
  }

  private newRound(): void {
    this.mode = resolveMode(this.params, this.topicIsDue());
    this.size = resolveSize(this.params, this.mode);
    const questions = buildSession(this.pool(), this.attempts(), {
      size: this.size,
      mode: this.mode,
      errorTag: this.params.tag,
    });
    this.round = startRound(questions);
    this.justAdded = 0;
    this.scheduled = null;
    this.finished = false;
    this.render();
  }

  // The round just ended: this is one review of the topic (R1). Once per
  // round — render() runs again for every redraw of the summary.
  private finishRound(): void {
    if (this.finished) return;
    this.finished = true;
    const topicId = this.params.topic;
    if (!topicId || !schedulesTopic(this.mode, this.round)) return;
    try {
      this.scheduled =
        this.deps.questions.finishSession(topicId, scheduledResults(this.round), this.now(), this.mode) ?? null;
    } catch (e) {
      console.error("Vocab Tracker: couldn't schedule grammar review", e);
    }
  }

  // Sync or a finished generation put questions in the bank. A round in
  // progress is left exactly as it is; only an empty screen picks them up.
  private onBankChanged(): void {
    if (!this.ready || this.disposed) return;
    if (this.round.questions.length === 0) this.newRound();
  }

  private objectiveText(q: GrammarQuestion): string {
    return topicById(q.topicId)?.objectives.find((o) => o.id === q.objectiveId)?.text ?? "";
  }

  // ── Render ────────────────────────────────────────────────────

  private render(): void {
    if (this.disposed) return;
    const body = this.body;
    body.empty();
    this.input = null;

    if (this.params.topic && !this.topic()) {
      body.appendChild(inlineNote({ tone: "error", text: l("noTopic") }));
      this.gen.empty();
      return;
    }

    const q = currentQuestion(this.round);
    if (!q && this.round.questions.length > 0) this.finishRound();
    if (this.mode === "review") body.createDiv({ cls: "vt-gr-review-tag", text: l("reviewTag") });
    if (!q && this.round.questions.length === 0) this.renderEmpty(body);
    else if (!q) this.renderSummary(body);
    else this.renderQuestion(body, q);

    this.renderGen();
    if (this.refocus) {
      this.refocus = false;
      (this.input ?? this.root).focus({ preventScroll: true });
    }
  }

  private renderEmpty(parent: HTMLElement): void {
    if (this.mode === "mistakes") {
      parent.appendChild(emptyState({ icon: "check-circle", title: l("noMistakes"), body: l("noMistakesBody") }));
      return;
    }
    parent.appendChild(emptyState({ icon: "list-checks", title: l("emptyTitle"), body: l("emptyBody") }));
  }

  private renderHeader(parent: HTMLElement, q: GrammarQuestion): void {
    const head = parent.createDiv({ cls: "vt-gr-head" });
    const { position, total } = progressLabel(this.round);
    head.createSpan({ cls: "vt-gr-count", text: `${position} / ${total}` });
    const goal = head.createSpan({ cls: "vt-gr-goal" });
    if (!this.params.topic) {
      const title = topicById(q.topicId)?.title;
      if (title) goal.createSpan({ cls: "vt-gr-topic", text: title });
    }
    const text = this.objectiveText(q);
    if (text) goal.createSpan({ text });
    const bar = parent.createDiv({ cls: "vt-gr-bar" });
    const done = this.round.results.length;
    bar.createDiv({ cls: "vt-gr-bar-fill" }).style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
  }

  private renderQuestion(parent: HTMLElement, q: GrammarQuestion): void {
    const fb = lastResult(this.round);
    const answered = !!fb;
    this.renderHeader(parent, q);
    const card = parent.createDiv({ cls: "vt-gr-card" });
    const stem = card.createDiv({ cls: "vt-gr-stem" });

    if (q.type === "find-error") {
      const options = q.options ?? [];
      const pieces = findErrorPieces(q.stem, options);
      const placed = new Set<number>();
      for (const p of pieces) {
        if (p.kind === "text") stem.appendText(p.text);
        else if (p.kind === "option") {
          placed.add(p.index);
          this.fragment(stem, q, p.text, p.index, fb?.given);
        }
      }
      card.createDiv({ cls: "vt-gr-hint", text: l("pickOne") });
      if (placed.size < options.length) {
        const row = card.createDiv({ cls: "vt-gr-options" });
        options.forEach((o, i) => {
          if (!placed.has(i)) this.optionButton(row, q, o, i, fb?.given);
        });
      }
    } else {
      for (const p of stemPieces(q.stem)) {
        if (p.kind === "text") stem.appendText(p.text);
        else if (p.kind === "blank") {
          const gap = stem.createSpan({ cls: "vt-gr-gap" });
          if (answered) {
            gap.addClass("is-filled");
            gap.setText(q.answer);
          }
        }
      }
      if (q.type === "choice") {
        const row = card.createDiv({ cls: "vt-gr-options" });
        (q.options ?? []).forEach((o, i) => this.optionButton(row, q, o, i, fb?.given));
      } else {
        this.renderBlankInput(card, q, fb?.given);
      }
    }

    if (fb) this.renderFeedback(parent, q, fb.given, fb.correct);
  }

  private optionButton(row: HTMLElement, q: GrammarQuestion, text: string, index: number, given: string | undefined): void {
    const btn = row.createEl("button", { cls: "vt-gr-opt", attr: { type: "button" } });
    btn.createSpan({ cls: "vt-gr-key", text: String(index + 1) });
    btn.createSpan({ cls: "vt-gr-opt-text", text });
    this.markOption(btn, q, text, given);
    btn.addEventListener("click", () => this.choose(index));
  }

  private fragment(stem: HTMLElement, q: GrammarQuestion, text: string, index: number, given: string | undefined): void {
    const btn = stem.createEl("button", { cls: "vt-gr-frag", attr: { type: "button" } });
    btn.createEl("sup", { cls: "vt-gr-key", text: String(index + 1) });
    btn.appendText(text);
    this.markOption(btn, q, text, given);
    btn.addEventListener("click", () => this.choose(index));
  }

  // After the answer: the right option green, a wrong pick red, all locked.
  private markOption(btn: HTMLButtonElement, q: GrammarQuestion, text: string, given: string | undefined): void {
    if (given === undefined) return;
    btn.disabled = true;
    if (text === q.answer) btn.addClass("is-correct");
    else if (text === given) btn.addClass("is-wrong");
  }

  private renderBlankInput(card: HTMLElement, q: GrammarQuestion, given: string | undefined): void {
    const row = card.createDiv({ cls: "vt-gr-blank-row" });
    const input = row.createEl("input", {
      cls: "vt-gr-input",
      attr: {
        type: "text",
        placeholder: l("typeAnswer"),
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        "aria-label": l("typeAnswer"),
      },
    });
    if (given !== undefined) {
      input.value = given;
      input.readOnly = true;
      const fb = lastResult(this.round);
      input.addClass(fb?.correct ? "is-correct" : "is-wrong");
      return;
    }
    this.input = input;
    learnButton(row, { label: l("check"), cta: true, onClick: () => this.submitTyped() });
  }

  private renderFeedback(parent: HTMLElement, q: GrammarQuestion, given: string, correct: boolean): void {
    const m = feedbackFor(q, given, correct);
    const box = parent.createDiv({ cls: ["vt-gr-feedback", correct ? "is-correct" : "is-wrong"] });
    const line = box.createDiv({ cls: "vt-gr-verdict" });
    setIcon(line.createSpan({ cls: "vt-gr-verdict-icon" }), correct ? "check" : "x");
    line.createSpan({ cls: "vt-gr-verdict-text", text: correct ? l("right") : l("wrong") });
    if (!correct) {
      const key = q.type === "blank" ? "youTyped" : q.type === "find-error" ? "youClicked" : "youPicked";
      box.createDiv({
        cls: "vt-gr-answer",
        text: l(key, { a: m.given, b: m.answer }),
      });
    } else if (q.type !== "blank") {
      box.createDiv({ cls: "vt-gr-answer", text: m.answer });
    }
    if (m.corrected) box.createDiv({ cls: "vt-gr-fixed", text: l("fixed", { s: m.corrected }) });
    box.createDiv({ cls: "vt-gr-explain", text: m.explanation });
    if (m.whyWrong) {
      const why = box.createDiv({ cls: "vt-gr-why" });
      why.createSpan({ cls: "vt-gr-why-opt", text: m.given });
      why.appendText(`：${m.whyWrong}`);
    }
    const actions = box.createDiv({ cls: "vt-gr-actions" });
    learnButton(actions, { label: l("retire"), icon: "thumbs-down", ghost: true, onClick: () => this.retire() });
    const last = this.round.index >= this.round.questions.length - 1;
    learnButton(actions, { label: l(last ? "seeSummary" : "next"), icon: "arrow-right", cta: true, onClick: () => this.next() });
  }

  private renderSummary(parent: HTMLElement): void {
    const sum = summarize(this.round);
    const box = parent.createDiv({ cls: "vt-gr-summary" });
    box.createDiv({ cls: "vt-gr-summary-title", text: l("summaryTitle") });
    box.createDiv({ cls: "vt-gr-score", text: l("score", { c: sum.correct, n: sum.answered }) });
    if (sum.byObjective.length) {
      const list = box.createDiv({ cls: "vt-gr-tally" });
      for (const t of sum.byObjective) {
        const row = list.createDiv({ cls: "vt-gr-tally-row" });
        const q = this.round.results.find((r) => r.question.objectiveId === t.objectiveId)?.question;
        row.createSpan({ cls: "vt-gr-tally-text", text: (q && this.objectiveText(q)) || t.objectiveId });
        row.createSpan({
          cls: t.correct === t.answered ? ["vt-gr-tally-score", "is-full"] : "vt-gr-tally-score",
          text: `${t.correct} / ${t.answered}`,
        });
      }
    }
    if (this.mode === "mistakes") box.createDiv({ cls: "vt-gr-summary-note", text: l("mistakesHint") });
    else if (sum.wrong > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("wrongAdded", { n: sum.wrong }) });
    else if (sum.answered > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("allRight") });
    if (sum.retired > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("retired", { n: sum.retired }) });
    if (this.scheduled) {
      box.createDiv({ cls: "vt-gr-summary-note vt-gr-next-review", text: nextReviewText(this.scheduled.due, this.now()) });
    }
    learnButton(box.createDiv({ cls: "vt-gr-actions" }), {
      label: l("again"),
      icon: "rotate-ccw",
      cta: true,
      onClick: () => {
        this.refocus = true;
        this.newRound();
      },
    });
  }

  // 「✦ 生成新題目」 — its own area, so a generation finishing never redraws
  // the question being answered.
  private renderGen(): void {
    const host = this.gen;
    host.empty();
    const topicId = this.params.topic;
    if (!topicId || this.mode === "mistakes" || !this.topic()) return;
    const slot: GenSlot =
      this.round.questions.length === 0 ? "empty" : currentQuestion(this.round) ? "round" : "summary";

    if (this.deps.questions.isBusy(topicId)) {
      const box = host.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: l("generating") });
      learnButton(box, { label: l("stop"), icon: "square", onClick: () => this.deps.questions.stop(topicId) });
      return;
    }
    if (this.genError) host.appendChild(aiErrorBox({ text: this.genError.text, error: this.genError.cause }));
    if (this.justAdded > 0 && slot === "round") {
      host.appendChild(inlineNote({ text: l("added", { n: this.justAdded }) }));
    }

    const available = this.pool().filter(canGradeLocally).length;
    if (!needsMoreQuestions(available, this.size)) return;
    if (this.deps.ai.status() !== "ready") {
      // Mid-round the gate would only be noise; the empty and summary
      // screens are where the learner is looking for more.
      if (slot !== "round") renderLearnAiGate(host, this.gatePlugin());
      return;
    }
    if (slot === "round" && available > 0) {
      host.createDiv({ cls: "vt-gr-short", text: l("short", { n: available }) });
    }
    learnButton(host.createDiv({ cls: "vt-gr-gen-row" }), {
      label: l("generate"),
      cta: slot !== "round",
      ghost: slot === "round",
      onClick: () => void this.generate(),
    });
  }

  // renderLearnAiGate only reads ai.status(), app and manifest.id.
  private gatePlugin(): VocabTrackerPlugin {
    const { ai, app, manifestId } = this.deps;
    return { ai, app, manifest: { id: manifestId } } as unknown as VocabTrackerPlugin;
  }

  // ── Actions ───────────────────────────────────────────────────

  private async generate(): Promise<void> {
    const topicId = this.params.topic;
    if (!topicId || this.deps.questions.isBusy(topicId)) return;
    this.genError = null;
    this.justAdded = 0;
    // Only a round that is already running leaves the new questions for
    // later; an empty screen starts one with them at once (onBankChanged).
    const running = this.round.questions.length > 0;
    this.ctrl = new AbortController();
    try {
      const saved = await this.deps.questions.generate(topicId, { signal: this.ctrl.signal });
      this.justAdded = running ? saved.length : 0;
    } catch (e) {
      if (!isAbort(e)) this.genError = { text: learnErrorText(e), cause: e };
    }
    this.ctrl = null;
    if (this.disposed) return;
    // The empty screen starts a round by itself (onBankChanged); everything
    // else just refreshes this area.
    this.renderGen();
  }

  private choose(index: number): void {
    const q = currentQuestion(this.round);
    if (!q || this.round.phase !== "answering") return;
    const given = q.options?.[index];
    if (given !== undefined) this.answer(q, given);
  }

  private submitTyped(): void {
    const q = currentQuestion(this.round);
    if (!q || this.round.phase !== "answering" || q.type !== "blank" || !this.input) return;
    const text = this.input.value;
    if (!text.trim()) return;
    this.answer(q, text);
  }

  private answer(q: GrammarQuestion, given: string): void {
    const g = grade(q, given);
    try {
      this.deps.questions.record(q, g.normalizedGiven, g.correct);
    } catch (e) {
      console.error("Vocab Tracker: couldn't record grammar attempt", e);
    }
    this.round = submitAnswer(this.round, g.normalizedGiven, g.correct);
    this.refocus = true;
    this.render();
  }

  private next(): void {
    this.round = nextQuestion(this.round);
    this.refocus = true;
    this.render();
  }

  private retire(): void {
    const q = currentQuestion(this.round);
    if (!q) return;
    try {
      this.deps.questions.retire(q.id);
    } catch (e) {
      console.error("Vocab Tracker: couldn't retire grammar question", e);
    }
    this.round = retireCurrent(this.round);
    this.refocus = true;
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const q = currentQuestion(this.round);
    if (!q) return;
    const target = e.target as HTMLElement | null;
    const action = keyAction(e.key, {
      phase: this.round.phase,
      optionCount: q.options?.length ?? 0,
      inInput: target instanceof HTMLInputElement,
      onButton: target?.tagName === "BUTTON",
    });
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action.type === "choose") this.choose(action.index);
    else if (action.type === "submit") this.submitTyped();
    else this.next();
  }
}

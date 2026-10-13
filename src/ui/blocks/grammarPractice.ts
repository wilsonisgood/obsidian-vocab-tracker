import { MarkdownRenderChild, setIcon, type App, type Component, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t, type I18nKey } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import { grade, isAskable, isOpenQuestion } from "../../core/grammar/grading";
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
  finishGrading,
  findErrorPieces,
  gradingFailed,
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
  selfAssess,
  sourceName,
  startRound,
  stemPieces,
  submitAnswer,
  submitOpen,
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
// find-error graded locally; rewrite / translate by the AI when it is on,
// else by the learner comparing with the sample answer); answer → feedback →
// next → summary. Keys
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
  // Opens a note by its path (「出自〈筆記名〉」). Without it the source is
  // shown as plain text.
  openPath?(path: string): void;
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
  private input: HTMLInputElement | HTMLTextAreaElement | null = null;
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
  // The AI grading in flight (rewrite / translate). The token tells a late
  // answer from one the learner already moved past.
  private gradeCtrl: AbortController | null = null;
  private gradeToken = 0;
  private gradeError: { text: string; cause: unknown } | null = null;
  // What was typed into the multi-line box, kept across redraws.
  private draft = "";

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
      this.cancelGrade();
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
    this.draft = "";
    this.gradeError = null;
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
  // While this topic's batch is still being saved (one question:upsert per
  // question) wait for all of it — starting on the first event gave a
  // one-question round; generate() starts the round once the batch is in.
  private onBankChanged(): void {
    if (!this.ready || this.disposed) return;
    const topicId = this.params.topic;
    if (topicId && this.deps.questions.isBusy(topicId)) return;
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
    const head = parent.createDiv({ cls: "vt-gr-q-head" });
    const { position, total } = progressLabel(this.round);
    head.createSpan({ cls: "vt-gr-count", text: `${position} / ${total}` });
    const goal = head.createSpan({ cls: "vt-gr-goal" });
    if (!this.params.topic) {
      const title = topicById(q.topicId)?.title;
      if (title) goal.createSpan({ cls: "vt-gr-topic", text: title });
    }
    const text = this.objectiveText(q);
    if (text) goal.createSpan({ text });
    const bar = parent.createDiv({ cls: "vt-gr-progress" });
    const done = this.round.results.length;
    bar.createDiv({ cls: "vt-gr-progress-fill" }).style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
  }

  private renderQuestion(parent: HTMLElement, q: GrammarQuestion): void {
    const fb = lastResult(this.round);
    const answered = !!fb;
    this.renderHeader(parent, q);
    const card = parent.createDiv({ cls: "vt-gr-card" });
    const stem = card.createDiv({ cls: "vt-gr-stem" });

    if (isOpenQuestion(q)) {
      stem.addClass("is-open");
      stem.setText(q.stem);
      if (q.source) this.renderSource(card, q.source);
      this.renderOpen(card, q);
      if (fb) this.renderFeedback(parent, q, fb.given, fb.correct);
      return;
    }
    if (q.source) this.renderSource(card, q.source);

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

  // 「出自〈筆記名〉」 — the sentence this question was adapted from.
  private renderSource(card: HTMLElement, source: { path: string; sentence: string }): void {
    const line = card.createDiv({ cls: "vt-gr-source" });
    const name = sourceName(source.path);
    const open = this.deps.openPath;
    line.title = source.sentence;
    if (open) {
      const link = line.createEl("a", { cls: "vt-gr-source-link", text: l("source", { name }), attr: { href: "#" } });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        open(source.path);
      });
    } else {
      line.setText(l("source", { name }));
    }
  }

  // rewrite / translate: a multi-line box → (AI grading | self-check) →
  // feedback. answering shows the box; the later phases keep the answer
  // read-only above their own panel.
  private renderOpen(card: HTMLElement, q: GrammarQuestion): void {
    const phase = this.round.phase;
    const fb = lastResult(this.round);
    const given = fb?.given ?? this.round.pending;
    const area = card.createEl("textarea", {
      cls: "vt-gr-textarea",
      attr: {
        rows: "3",
        placeholder: l(q.type === "translate" ? "typeTranslation" : "typeRewrite"),
        "aria-label": l("typeAnswer"),
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
    });
    if (given !== undefined) {
      area.value = given;
      area.readOnly = true;
      if (fb) area.addClass(fb.correct ? "is-correct" : "is-wrong");
    }
    if (phase === "answering") {
      area.value = this.draft;
      this.input = area;
      area.addEventListener("input", () => {
        this.draft = area.value;
      });
      area.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        this.submitOpenAnswer();
      });
      const row = card.createDiv({ cls: "vt-gr-open-row" });
      row.createSpan({
        cls: "vt-gr-hint",
        text: l(this.deps.ai.status() === "ready" ? "openAiHint" : "openSelfHint"),
      });
      learnButton(row, { label: l("submit"), cta: true, onClick: () => this.submitOpenAnswer() });
    } else if (phase === "grading") {
      const box = card.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: l("grading") });
      learnButton(box, { label: l("stop"), icon: "square", onClick: () => this.stopGrade() });
    } else if (phase === "selfcheck") {
      this.renderSelfCheck(card, q);
    }
  }

  private renderSelfCheck(card: HTMLElement, q: GrammarQuestion): void {
    if (this.gradeError) {
      card.appendChild(aiErrorBox({ text: this.gradeError.text, error: this.gradeError.cause }));
      card.createDiv({ cls: "vt-gr-hint", text: l("gradeFailed") });
    }
    const box = card.createDiv({ cls: "vt-gr-selfcheck" });
    box.createDiv({ cls: "vt-gr-selfcheck-title", text: l("sample") });
    box.createDiv({ cls: "vt-gr-sample", text: q.answer });
    for (const a of q.accepted ?? []) box.createDiv({ cls: "vt-gr-sample is-alt", text: a });
    box.createDiv({ cls: "vt-gr-q-explain", text: q.explanation });
    box.createDiv({ cls: "vt-gr-hint", text: l("selfAsk") });
    const actions = box.createDiv({ cls: "vt-gr-actions" });
    learnButton(actions, { label: l("retire"), icon: "thumbs-down", ghost: true, onClick: () => this.retire() });
    learnButton(actions, { label: l("selfWrong"), icon: "x", onClick: () => this.selfMark(false) });
    learnButton(actions, { label: l("selfRight"), icon: "check", cta: true, onClick: () => this.selfMark(true) });
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
    const result = lastResult(this.round);
    const m = feedbackFor(q, given, correct, result);
    const box = parent.createDiv({ cls: ["vt-gr-feedback", correct ? "is-correct" : "is-wrong"] });
    const line = box.createDiv({ cls: "vt-gr-verdict" });
    setIcon(line.createSpan({ cls: "vt-gr-verdict-icon" }), correct ? "check" : "x");
    line.createSpan({ cls: "vt-gr-verdict-text", text: correct ? l("right") : l("wrong") });
    if (m.selfAssessed) line.createSpan({ cls: "vt-gr-self-tag", text: l("selfTag") });
    if (isOpenQuestion(q)) {
      if (m.aiFeedback) box.createDiv({ cls: "vt-gr-ai-feedback", text: m.aiFeedback });
      if (m.corrected) box.createDiv({ cls: "vt-gr-fixed", text: l("fixed", { s: m.corrected }) });
      box.createDiv({ cls: "vt-gr-answer", text: l("sampleIs", { s: m.answer }) });
    } else if (!correct) {
      const key = q.type === "blank" ? "youTyped" : q.type === "find-error" ? "youClicked" : "youPicked";
      box.createDiv({
        cls: "vt-gr-answer",
        text: l(key, { a: m.given, b: m.answer }),
      });
    } else if (q.type !== "blank") {
      box.createDiv({ cls: "vt-gr-answer", text: m.answer });
    }
    if (m.corrected && !isOpenQuestion(q)) box.createDiv({ cls: "vt-gr-fixed", text: l("fixed", { s: m.corrected }) });
    box.createDiv({ cls: "vt-gr-q-explain", text: m.explanation });
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

    const available = this.pool().filter(isAskable).length;
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
    // later; an empty screen starts one with the whole batch below.
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
    // The empty screen starts a round with the whole batch; everything else
    // just refreshes this area.
    if (!running && this.round.questions.length === 0 && this.pool().length) this.newRound();
    else this.renderGen();
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
    this.record(q, g.normalizedGiven, g.correct);
    this.round = submitAnswer(this.round, g.normalizedGiven, g.correct);
    this.refocus = true;
    this.render();
  }

  private record(q: GrammarQuestion, given: string, correct: boolean): void {
    try {
      this.deps.questions.record(q, given, correct);
    } catch (e) {
      console.error("Vocab Tracker: couldn't record grammar attempt", e);
    }
  }

  // 送出 on a rewrite / translate question. The AI is called only here, and
  // only when it is on; otherwise the learner marks themselves.
  private submitOpenAnswer(): void {
    const q = currentQuestion(this.round);
    if (!q || !isOpenQuestion(q) || this.round.phase !== "answering" || !this.input) return;
    const given = grade(q, this.input.value).normalizedGiven;
    if (!given) return;
    const useAi = this.deps.ai.status() === "ready";
    this.gradeError = null;
    this.draft = "";
    this.round = submitOpen(this.round, given, useAi);
    this.render();
    if (useAi) void this.runGrade(q, given);
  }

  private async runGrade(q: GrammarQuestion, given: string): Promise<void> {
    const token = ++this.gradeToken;
    const ctrl = new AbortController();
    this.gradeCtrl = ctrl;
    try {
      const v = await this.deps.questions.grade(q, given, ctrl.signal);
      if (this.disposed || token !== this.gradeToken || this.round.phase !== "grading") return;
      this.record(q, given, v.correct);
      this.round = finishGrading(this.round, v.correct, { feedback: v.feedback, corrected: v.corrected });
    } catch (e) {
      if (this.disposed || token !== this.gradeToken || this.round.phase !== "grading") return;
      // Stopped or failed: back to marking it yourself.
      if (!isAbort(e)) this.gradeError = { text: learnErrorText(e), cause: e };
      this.round = gradingFailed(this.round);
    } finally {
      if (token === this.gradeToken) this.gradeCtrl = null;
    }
    this.refocus = true;
    this.render();
  }

  private stopGrade(): void {
    const q = currentQuestion(this.round);
    if (q) this.deps.questions.stopGrade(q.id);
    this.gradeCtrl?.abort();
  }

  // Leaving the question (👎, closing): a grading still in flight is dropped.
  private cancelGrade(): void {
    this.gradeToken++;
    this.gradeCtrl?.abort();
    this.gradeCtrl = null;
  }

  private selfMark(correct: boolean): void {
    const q = currentQuestion(this.round);
    const given = this.round.pending;
    if (!q || this.round.phase !== "selfcheck" || given === undefined) return;
    this.record(q, given, correct);
    this.round = selfAssess(this.round, correct);
    this.refocus = true;
    this.render();
  }

  private next(): void {
    this.gradeError = null;
    this.round = nextQuestion(this.round);
    this.refocus = true;
    this.render();
  }

  private retire(): void {
    const q = currentQuestion(this.round);
    if (!q) return;
    this.cancelGrade();
    this.gradeError = null;
    this.draft = "";
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
      inInput: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement,
      multiline: target instanceof HTMLTextAreaElement,
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

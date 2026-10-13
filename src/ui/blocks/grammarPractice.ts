import { MarkdownRenderChild, setIcon, type App, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { getLocale } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import { canGradeLocally, grade } from "../../core/grammar/grading";
import { buildSession } from "../../core/grammar/session";
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
  parseGrammarPracticeParams,
  progressLabel,
  retireCurrent,
  startRound,
  stemPieces,
  submitAnswer,
  summarize,
  type PracticeParams,
  type RoundState,
} from "./grammarPracticeModel";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate } from "./learnUi";

// ── vocab-grammar-practice code block (wave 15 P; 1013 §3.3) ────────
//
//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   mode: learn            # or mistakes (the 錯題本)
//   tag: tense-choice      # mistakes: only this error tag
//   size: 8
//   ```
//
// One question at a time out of the stored bank (choice / blank /
// find-error, graded locally); answer → feedback → next → summary. Keys
// 1–4 / Enter work only while the block has focus. Questions that arrive
// while a round is running (sync, 「生成新題目」) never reorder it: they
// wait for the next round.

// New strings live here until i18n takes them over (整合事項).
const L = {
  "zh-TW": {
    loading: "載入中…",
    noTopic: "找不到這個文法主題，請檢查 topic 參數。",
    mistakesOf: "錯題本",
    emptyTitle: "題庫還沒有題目",
    emptyBody: "按下「生成新題目」，AI 會為這個主題出一批題目並存起來，之後可以重複練習。",
    noMistakes: "目前沒有錯題",
    noMistakesBody: "答錯的題目會出現在這裡，做對就會移走。",
    generate: "✦ 生成新題目",
    generating: "AI 正在出題…",
    stop: "停止",
    added: "已加入 {n} 題，下一輪會用到。",
    short: "題庫只有 {n} 題，不夠一輪。",
    typeAnswer: "輸入答案",
    check: "檢查",
    right: "答對了",
    wrong: "答錯了",
    youPicked: "你選 {a} → 正解 {b}",
    youTyped: "你填 {a} → 正解 {b}",
    youClicked: "你點 {a} → 錯的是 {b}",
    fixed: "改成：{s}",
    retire: "這題有問題",
    next: "下一題",
    seeSummary: "看小結",
    summaryTitle: "這一輪完成",
    score: "答對 {c} / {n} 題",
    wrongAdded: "{n} 題錯題已加入錯題本。",
    allRight: "全部答對！",
    mistakesHint: "做對的題目會從錯題本移走。",
    retired: "{n} 題被標成有問題，之後不會再出現。",
    again: "再練一輪",
    pickOne: "點出錯的地方",
    objective: "目標",
  },
  en: {
    loading: "Loading…",
    noTopic: "Unknown grammar topic: check the topic parameter.",
    mistakesOf: "Mistakes",
    emptyTitle: "No questions yet",
    emptyBody: "Press “Generate questions” and the AI writes a batch for this topic and stores it for repeat practice.",
    noMistakes: "No mistakes right now",
    noMistakesBody: "Questions you get wrong show up here and leave once you get them right.",
    generate: "✦ Generate questions",
    generating: "The AI is writing questions…",
    stop: "Stop",
    added: "{n} questions added; they’re used next round.",
    short: "The bank has only {n} questions, not a full round.",
    typeAnswer: "Type your answer",
    check: "Check",
    right: "Correct",
    wrong: "Not quite",
    youPicked: "You chose {a} → answer: {b}",
    youTyped: "You wrote {a} → answer: {b}",
    youClicked: "You clicked {a} → the error is {b}",
    fixed: "Should be: {s}",
    retire: "Report a problem",
    next: "Next",
    seeSummary: "See summary",
    summaryTitle: "Round complete",
    score: "{c} / {n} correct",
    wrongAdded: "{n} wrong answers added to your mistakes.",
    allRight: "All correct!",
    mistakesHint: "Questions you get right leave the mistakes list.",
    retired: "{n} questions flagged and won’t come back.",
    again: "Another round",
    pickOne: "Click the error",
    objective: "Goal",
  },
} as const;
type LKey = keyof (typeof L)["zh-TW"];

function l(key: LKey, params: Record<string, string | number> = {}): string {
  const table = L[getLocale() === "en" ? "en" : "zh-TW"];
  return table[key].replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? ""));
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
}

export function renderGrammarPractice(
  deps: GrammarPracticeDeps,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new GrammarPracticeBlock(el, deps, parseGrammarPracticeParams(source)));
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

  private newRound(): void {
    const questions = buildSession(this.pool(), this.attempts(), {
      size: this.params.size,
      mode: this.params.mode,
      errorTag: this.params.tag,
    });
    this.round = startRound(questions);
    this.justAdded = 0;
    this.render();
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
    if (this.params.mode === "mistakes") {
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
    if (this.params.mode === "mistakes") box.createDiv({ cls: "vt-gr-summary-note", text: l("mistakesHint") });
    else if (sum.wrong > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("wrongAdded", { n: sum.wrong }) });
    else if (sum.answered > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("allRight") });
    if (sum.retired > 0) box.createDiv({ cls: "vt-gr-summary-note", text: l("retired", { n: sum.retired }) });
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
    if (!topicId || this.params.mode !== "learn" || !this.topic()) return;
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
    if (!needsMoreQuestions(available, this.params.size)) return;
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

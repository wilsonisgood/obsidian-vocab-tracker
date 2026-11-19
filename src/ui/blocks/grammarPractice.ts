import { MarkdownRenderChild, type Component, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import type { GrammarQuestion } from "../../core/model/grammar";
import { renderGrammarVisual } from "../../grammar-visual";
import type { VisualService } from "../../services/grammar/VisualService";
import type { GrammarPracticeApi, GrammarFilter } from "../grammar/practiceTypes";
import { stageLabel } from "../grammar/labels";
import { guardReadingClicks, isAbort, learnButton, learnErrorText } from "./learnUi";
import { parseBlockParams } from "./params";
import { routeToPractice, toPlayerQuestion } from "./practice/grammarTabModel";
import type { PlayerHandle, PlayerOptions, PlayerQuestion } from "./practice/playerTypes";
import { dockSummary, type DockAnswer } from "./grammarPracticeModel";

// ── vocab-grammar-practice code block (wave 15 P → 第十六波 H → 概念版面) ──
//
//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   ```
//
// 主題頁「## 說明」下面這一塊，由上往下：
//   1. 概念版面（grammar-visual 模組畫；內建一份，「換一個例句」問 AI）
//   2. 練習這個概念：「出 3 題」就在這裡做，概念留在上面邊看邊做
//   3. 原本的「在練習中心練這個主題」卡（錯題數）

// What the card needs; registry.ts builds it. Every field is optional so a
// host missing one just leaves that part out.
export interface GrammarPracticeDeps {
  api?: Pick<GrammarPracticeApi, "mistakeQuestions" | "events" | "answer" | "skip">;
  // Resolves when the grammar and learner stores have loaded.
  ready?(): Promise<void>;
  setGrammarFilter?(f: GrammarFilter): void;
  openPractice?(track: "grammar"): void;
  visuals?: Pick<VisualService, "current" | "isGenerated" | "isBusy" | "regenerate" | "reset" | "stop" | "events">;
  // 只出題、不放進待答池（QuestionService.generate）。
  generate?(topicId: string, count: number): Promise<GrammarQuestion[]>;
  aiReady?(): boolean;
  mountPlayer?(el: HTMLElement, opts: PlayerOptions, owner: Component): PlayerHandle;
}

const DOCK_COUNT = 3;

export function renderGrammarPractice(
  deps: GrammarPracticeDeps,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const topic = (parseBlockParams(source).topic ?? "").trim().replace(/^["']|["']$/g, "").trim();
  ctx.addChild(new GrammarPracticeCard(el, deps, topic));
}

const isMobile = (): boolean => document.body.classList.contains("is-mobile");

class GrammarPracticeCard extends MarkdownRenderChild {
  private root!: HTMLElement;
  private visualEl!: HTMLElement;
  private dockEl!: HTMLElement;
  private countEl: HTMLElement | null = null;
  private alive = true;
  private visualError = "";
  // 練習區
  private batch: GrammarQuestion[] = [];
  private answers: DockAnswer[] = [];
  private done = new Set<string>();
  private dockBusy = false;
  private dockError = "";
  private player: PlayerHandle | null = null;

  constructor(
    containerEl: HTMLElement,
    private deps: GrammarPracticeDeps,
    private topicId: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-gr", "vt-gr-practice-card"] });
    guardReadingClicks(this, this.root);
    this.register(() => {
      this.alive = false;
      this.player?.unload();
    });
    const topic = topicById(this.topicId);
    if (!topic) {
      this.root.createDiv({ cls: "vt-gr-empty", text: t("grammar.practiceCard.noTopic") });
      return;
    }
    this.visualEl = this.root.createDiv({ cls: "vt-gr-visual" });
    this.dockEl = this.root.createDiv({ cls: "vt-gr-dock" });
    const { visuals } = this.deps;
    if (visuals) {
      this.register(
        visuals.events.on("visual:change", (e) => {
          if (e.topicId === topic.id) this.renderVisual();
        })
      );
    }
    this.renderVisual();
    this.renderDock();
    this.renderHubCard(topic.id, `${stageLabel(topic.stage)} · ${topic.title}`);
  }

  // ── 1. 概念版面 ────────────────────────────────────────────────

  private renderVisual(): void {
    if (!this.alive) return;
    const el = this.visualEl;
    el.empty();
    const { visuals } = this.deps;
    const v = visuals?.current(this.topicId) ?? null;
    if (!v) {
      el.createDiv({ cls: "vt-gr-empty", text: t("grammar.visual.none") });
      return;
    }
    renderGrammarVisual(el, v, { mobile: isMobile() });
    if (!visuals || !this.canAsk()) return;
    const row = el.createDiv({ cls: "vt-gr-visual-actions" });
    if (visuals.isBusy(this.topicId)) {
      row.createSpan({ cls: "vt-gr-visual-busy", text: t("grammar.visual.regenBusy") });
      learnButton(row, { label: t("grammar.visual.stop"), ghost: true, onClick: () => visuals.stop(this.topicId) });
      return;
    }
    learnButton(row, { label: t("grammar.visual.regen"), icon: "sparkles", ghost: true, onClick: () => void this.regenerate() });
    if (visuals.isGenerated(this.topicId)) {
      learnButton(row, { label: t("grammar.visual.reset"), ghost: true, onClick: () => visuals.reset(this.topicId) });
    }
    if (this.visualError) row.createDiv({ cls: "vt-learn-error", text: this.visualError });
  }

  private async regenerate(): Promise<void> {
    const { visuals } = this.deps;
    if (!visuals) return;
    this.visualError = "";
    try {
      await visuals.regenerate(this.topicId);
    } catch (e) {
      if (!isAbort(e)) this.visualError = t("grammar.visual.failed", { error: learnErrorText(e) });
      this.renderVisual();
    }
  }

  private canAsk(): boolean {
    return this.deps.aiReady ? this.deps.aiReady() : true;
  }

  // ── 2. 練習這個概念 ────────────────────────────────────────────

  private renderDock(): void {
    if (!this.alive) return;
    const { generate, mountPlayer, api } = this.deps;
    if (!generate || !mountPlayer || !api) return;
    const el = this.dockEl;
    this.player?.unload();
    this.player = null;
    el.empty();
    const head = el.createDiv({ cls: "vt-gr-dock-head" });
    const text = head.createDiv({ cls: "vt-gr-dock-text" });
    text.createDiv({ cls: "vt-gr-bar-main", text: t("grammar.dock.title") });
    text.createDiv({ cls: "vt-gr-bar-sub", text: t("grammar.dock.sub") });
    const started = this.batch.length > 0;
    if (!this.canAsk()) {
      el.createDiv({ cls: "vt-gr-empty", text: t("grammar.dock.noAi") });
      return;
    }
    if (this.dockBusy) {
      head.createSpan({ cls: "vt-gr-visual-busy", text: t("grammar.dock.busy") });
    } else if (!started || this.finished()) {
      learnButton(head, {
        label: started ? t("grammar.dock.more") : t("grammar.dock.start"),
        icon: "list-checks",
        cta: !started,
        onClick: () => void this.startBatch(),
      });
    }
    if (this.dockError) el.createDiv({ cls: "vt-learn-error", text: this.dockError });
    if (!started) return;
    if (this.finished()) {
      const s = dockSummary(this.answers);
      el.createDiv({ cls: "vt-gr-dock-done", text: t("grammar.dock.done", { right: s.right, total: s.total }) });
      return;
    }
    const byId = new Map(this.batch.map((q) => [q.id, q]));
    this.player = mountPlayer(
      el,
      {
        questions: () => this.remaining(),
        callbacks: {
          onAnswer: (a) => {
            this.done.add(a.question.id);
            this.answers.push({ id: a.question.id, correct: a.correct });
            const q = byId.get(a.question.id);
            if (q) api.answer(q, a.optionId, a.correct, { hinted: a.hinted, fromMistakes: false });
          },
          onSkip: (pq) => {
            this.done.add(pq.id);
            const q = byId.get(pq.id);
            if (q) api.skip(q);
          },
          // 三題都做完、按了「下一題」。
          onEmpty: () => queueMicrotask(() => this.renderDock()),
        },
      },
      this
    );
  }

  private remaining(): PlayerQuestion[] {
    const out: PlayerQuestion[] = [];
    for (const q of this.batch) {
      if (this.done.has(q.id)) continue;
      const pq = toPlayerQuestion(q);
      if (pq) out.push(pq);
    }
    return out;
  }

  private finished(): boolean {
    return this.batch.length > 0 && this.remaining().length === 0;
  }

  private async startBatch(): Promise<void> {
    const { generate, ready } = this.deps;
    if (!generate || this.dockBusy) return;
    this.dockBusy = true;
    this.dockError = "";
    this.renderDock();
    try {
      await (ready ? ready() : Promise.resolve());
      const qs = await generate(this.topicId, DOCK_COUNT);
      this.batch = qs.filter((q) => toPlayerQuestion(q) !== null);
      this.answers = [];
      this.done.clear();
    } catch (e) {
      if (!isAbort(e)) this.dockError = t("grammar.dock.failed", { error: learnErrorText(e) });
    } finally {
      this.dockBusy = false;
      this.renderDock();
    }
  }

  // ── 3. 練習中心卡 ──────────────────────────────────────────────

  private renderHubCard(topicId: string, sub: string): void {
    const card = this.root.createDiv({ cls: "vt-gr-bar vt-gr-practice-bar" });
    const text = card.createDiv({ cls: "vt-gr-practice-text" });
    text.createDiv({ cls: "vt-gr-bar-main", text: t("grammar.practiceCard.title") });
    text.createDiv({ cls: "vt-gr-bar-sub", text: sub });
    this.countEl = text.createDiv({ cls: "vt-gr-practice-count" });
    const { setGrammarFilter, openPractice } = this.deps;
    if (setGrammarFilter && openPractice) {
      learnButton(card, {
        label: t("grammar.practiceCard.go"),
        icon: "play",
        onClick: () => routeToPractice({ setGrammarFilter, openPractice }, topicId),
      });
    }

    const { api, ready } = this.deps;
    if (!api) return;
    const refresh = () => {
      if (!this.alive || !this.countEl) return;
      const n = api.mistakeQuestions().filter((q) => q.topicId === topicId).length;
      this.countEl.setText(n > 0 ? t("grammar.practiceCard.mistakes", { n }) : t("grammar.practiceCard.noMistakes"));
    };
    this.register(api.events.on("pool:change", refresh));
    void (ready ? ready() : Promise.resolve()).then(refresh);
  }
}

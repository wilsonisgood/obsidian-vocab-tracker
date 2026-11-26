import type { Component } from "obsidian";
import { t } from "../../core/i18n";
import type { GrammarQuestion } from "../../core/model/grammar";
import type { GrammarPracticeApi } from "../grammar/practiceTypes";
import { isAbort, learnButton, learnErrorText } from "./learnUi";
import { toPlayerQuestion } from "./practice/grammarTabModel";
import type { PlayerHandle, PlayerOptions, PlayerQuestion } from "./practice/playerTypes";
import { dockSummary, type DockAnswer } from "./grammarPracticeModel";

// 「練習這個概念」：主題頁頁首、概念版面「換一個例句」下面。按「出 3 題」
// 就在這裡做（練習中心的題目畫面），答案照常記進學習紀錄與錯題本。

export interface PracticeDockDeps {
  api?: Pick<GrammarPracticeApi, "answer" | "skip">;
  // Resolves when the grammar and learner stores have loaded.
  ready?(): Promise<void>;
  // 只出題、不放進待答池（QuestionService.generate）。
  generate?(topicId: string, count: number): Promise<GrammarQuestion[]>;
  aiReady?(): boolean;
  mountPlayer?(el: HTMLElement, opts: PlayerOptions, owner: Component): PlayerHandle;
}

const DOCK_COUNT = 3;

export function mountPracticeDock(el: HTMLElement, deps: PracticeDockDeps, topicId: string, owner: Component): void {
  const dock = new PracticeDock(el, deps, topicId, owner);
  owner.register(() => dock.dispose());
  dock.render();
}

class PracticeDock {
  private alive = true;
  private batch: GrammarQuestion[] = [];
  private answers: DockAnswer[] = [];
  private done = new Set<string>();
  private dockBusy = false;
  private dockError = "";
  private player: PlayerHandle | null = null;

  constructor(
    private dockEl: HTMLElement,
    private deps: PracticeDockDeps,
    private topicId: string,
    private owner: Component
  ) {}

  dispose(): void {
    this.alive = false;
    this.player?.unload();
  }

  render(): void {
    this.renderDock();
  }

  private canAsk(): boolean {
    return this.deps.aiReady ? this.deps.aiReady() : true;
  }

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
      this.owner
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
}

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import type { GrammarPracticeApi, GrammarFilter } from "../grammar/practiceTypes";
import { stageLabel } from "../grammar/labels";
import { guardReadingClicks, learnButton } from "./learnUi";
import { parseBlockParams } from "./params";
import { routeToPractice } from "./practice/grammarTabModel";

// ── vocab-grammar-practice code block (wave 15 P → 第十六波 H → 概念版面) ──
//
//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   ```
//
// 主題頁「## 說明」下面這一塊，由上往下：
// 「在練習中心練這個主題」卡（錯題數）。概念版面與「練習這個概念」在頁首
// （grammarVisualPanel.ts、grammarPracticeDock.ts，由主題區塊掛上）。

// What the card needs; registry.ts builds it.
export interface GrammarPracticeDeps {
  api?: Pick<GrammarPracticeApi, "mistakeQuestions" | "events">;
  // Resolves when the grammar and learner stores have loaded.
  ready?(): Promise<void>;
  setGrammarFilter?(f: GrammarFilter): void;
  openPractice?(track: "grammar"): void;
}

export function renderGrammarPractice(
  deps: GrammarPracticeDeps,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const topic = (parseBlockParams(source).topic ?? "").trim().replace(/^["']|["']$/g, "").trim();
  ctx.addChild(new GrammarPracticeCard(el, deps, topic));
}

class GrammarPracticeCard extends MarkdownRenderChild {
  private root!: HTMLElement;
  private dockEl!: HTMLElement;
  private countEl: HTMLElement | null = null;
  private alive = true;

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
    this.register(() => (this.alive = false));
    const topic = topicById(this.topicId);
    if (!topic) {
      this.root.createDiv({ cls: "vt-gr-empty", text: t("grammar.practiceCard.noTopic") });
      return;
    }
    this.renderHubCard(topic.id, `${stageLabel(topic.stage)} · ${topic.title}`);
  }

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

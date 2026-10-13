import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { topicById } from "../../core/grammar/catalog";
import type { GrammarPracticeApi, GrammarFilter } from "../grammar/practiceTypes";
import { stageLabel } from "../grammar/labels";
import { guardReadingClicks, learnButton } from "./learnUi";
import { parseBlockParams } from "./params";
import { routeToPractice } from "./practice/grammarTabModel";

// ── vocab-grammar-practice code block (wave 15 P → 第十六波 H) ──────
//
//   ```vocab-grammar-practice
//   topic: present-perfect-vs-past
//   ```
//
// Practice moved to the practice hub's 文法 tab (固定決定 5): the block is
// one card, 「在練習中心練這個主題」 with the topic's open-mistake count.
// The button sets the grammar filter to the topic and opens the tab.

const L = {
  title: { zh: "在練習中心練這個主題", en: "Practice this topic in the Practice hub" },
  go: { zh: "去練習", en: "Practice" },
  mistakes: { zh: "這個主題有 {n} 題錯題", en: "{n} mistakes in this topic" },
  noMistakes: { zh: "這個主題沒有待重做的錯題", en: "No mistakes to redo in this topic" },
  noTopic: { zh: "找不到這個主題，請檢查 topic: 的 id。", en: "Topic not found; check the topic: id." },
};

// What the card needs; registry.ts builds it (整合事項). The practice fields
// stay optional until main.ts wires them: without them the button is left
// out.
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
      this.root.createDiv({ cls: "vt-gr-empty", text: L.noTopic.zh });
      return;
    }
    const card = this.root.createDiv({ cls: "vt-gr-bar vt-gr-practice-bar" });
    const text = card.createDiv({ cls: "vt-gr-practice-text" });
    text.createDiv({ cls: "vt-gr-bar-main", text: L.title.zh });
    text.createDiv({ cls: "vt-gr-bar-sub", text: `${stageLabel(topic.stage)} · ${topic.title}` });
    this.countEl = text.createDiv({ cls: "vt-gr-practice-count" });
    const { setGrammarFilter, openPractice } = this.deps;
    if (setGrammarFilter && openPractice) {
      learnButton(card, {
        label: L.go.zh,
        icon: "play",
        cta: true,
        onClick: () => routeToPractice({ setGrammarFilter, openPractice }, topic.id),
      });
    }

    const { api, ready } = this.deps;
    if (!api) return;
    const refresh = () => {
      if (!this.alive || !this.countEl) return;
      const n = api.mistakeQuestions().filter((q) => q.topicId === topic.id).length;
      this.countEl.setText(n > 0 ? L.mistakes.zh.replace("{n}", String(n)) : L.noMistakes.zh);
    };
    this.register(api.events.on("pool:change", refresh));
    void (ready ? ready() : Promise.resolve()).then(refresh);
  }
}

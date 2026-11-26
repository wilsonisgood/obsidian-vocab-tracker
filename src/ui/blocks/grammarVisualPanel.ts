import type { Component } from "obsidian";
import { t } from "../../core/i18n";
import { renderGrammarVisual } from "../../grammar-visual";
import type { VisualService } from "../../services/grammar/VisualService";
import { isAbort, learnButton, learnErrorText } from "./learnUi";

// 主題頁最上面的概念版面（grammar-visual 模組畫）：內建一份，
// 「換一個例句」問 AI。由主題區塊（vocab-grammar-topic）掛在頁首。

export interface VisualPanelDeps {
  visuals?: Pick<VisualService, "current" | "isGenerated" | "isBusy" | "regenerate" | "reset" | "stop" | "events">;
  aiReady?(): boolean;
}

const isMobile = (): boolean => document.body.classList.contains("is-mobile");

export function mountVisualPanel(el: HTMLElement, deps: VisualPanelDeps, topicId: string, owner: Component): void {
  const { visuals } = deps;
  if (!visuals) return;
  let error = "";
  let alive = true;
  owner.register(() => (alive = false));

  const canAsk = (): boolean => (deps.aiReady ? deps.aiReady() : true);

  const regenerate = async (): Promise<void> => {
    error = "";
    try {
      await visuals.regenerate(topicId);
    } catch (e) {
      if (!isAbort(e)) error = t("grammar.visual.failed", { error: learnErrorText(e) });
      render();
    }
  };

  const render = (): void => {
    if (!alive) return;
    el.empty();
    const v = visuals.current(topicId);
    if (!v) {
      el.createDiv({ cls: "vt-gr-empty", text: t("grammar.visual.none") });
      return;
    }
    renderGrammarVisual(el, v, { mobile: isMobile() });
    if (!canAsk()) return;
    const row = el.createDiv({ cls: "vt-gr-visual-actions" });
    if (visuals.isBusy(topicId)) {
      row.createSpan({ cls: "vt-gr-visual-busy", text: t("grammar.visual.regenBusy") });
      learnButton(row, { label: t("grammar.visual.stop"), ghost: true, onClick: () => visuals.stop(topicId) });
      return;
    }
    learnButton(row, { label: t("grammar.visual.regen"), icon: "sparkles", ghost: true, onClick: () => void regenerate() });
    if (visuals.isGenerated(topicId)) {
      learnButton(row, { label: t("grammar.visual.reset"), ghost: true, onClick: () => visuals.reset(topicId) });
    }
    if (error) row.createDiv({ cls: "vt-learn-error", text: error });
  };

  owner.register(
    visuals.events.on("visual:change", (e) => {
      if (e.topicId === topicId) render();
    })
  );
  render();
}

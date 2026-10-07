import { setIcon } from "obsidian";
import { t } from "../../core/i18n";
import { renderStrand } from "../dna/strand";
import { type GalaxyCardData, type GalaxyDetailRow } from "./galaxyView.model";
import type { GalaxyCounts } from "./galaxyModel";

// Galaxy 詳情面板 (規劃書 09 §6.1 A4, w9-rules.md「GB」). Pure DOM — no own
// event subscriptions/timers, so it's simply re-rendered from scratch by
// its host (families.ts's embedded panel, GalaxyView's full screen) every
// time the family/selection changes; nothing here needs its own destroy().

export interface GalaxyDetailModel {
  counts: GalaxyCounts;
  rows: readonly GalaxyDetailRow[];
  // null = no word selected: show the learned-words list instead of a card.
  selected: GalaxyCardData | null;
}

export interface GalaxyDetailActions {
  onSelectRow(entryId: string): void;
  onCollapse(): void;
  onReview(entryId: string): void;
  onOpenWordPage(entryId: string): void;
  onOpenAi(entryId: string): void;
}

function actionButton(parent: HTMLElement, opts: { label: string; icon?: string; primary?: boolean; onClick: () => void }): void {
  const btn = parent.createEl("button", { cls: ["vt-gx-card-btn"], attr: { type: "button" } });
  if (opts.primary) btn.addClass("mod-cta");
  if (opts.icon) setIcon(btn.createSpan({ cls: "vt-gx-card-btn-icon" }), opts.icon);
  btn.createSpan({ text: opts.label });
  btn.addEventListener("click", opts.onClick);
}

export class GalaxyDetail {
  constructor(private container: HTMLElement) {
    this.container.addClass("vt-gx-detail");
  }

  render(model: GalaxyDetailModel, actions: GalaxyDetailActions): void {
    this.container.empty();

    const progress = this.container.createDiv({ cls: "vt-gx-progress" });
    progress.createSpan({ cls: "vt-gx-progress-text", text: t("galaxy.progress", { learned: model.counts.known, total: model.counts.total }) });
    const bar = progress.createDiv({ cls: "vt-gx-bar" });
    const pct = model.counts.total ? Math.round((model.counts.known / model.counts.total) * 100) : 100;
    bar.createSpan({ attr: { style: `width:${pct}%` } });

    if (model.selected) {
      this.renderCard(model.selected, actions);
      return;
    }
    this.renderList(model.rows, actions);
  }

  private renderList(rows: readonly GalaxyDetailRow[], actions: GalaxyDetailActions): void {
    this.container.createDiv({ cls: "vt-gx-sub", text: t("galaxy.topicLearnedOf", { n: rows.length }) });
    if (!rows.length) {
      this.container.createDiv({ cls: "vt-gx-empty", text: t("galaxy.noneLearnedYet") });
      return;
    }
    const list = this.container.createDiv({ cls: "vt-gx-list" });
    for (const r of rows) {
      const row = list.createEl("button", { cls: "vt-gx-row", attr: { type: "button" } });
      row.createSpan({ cls: "vt-gx-row-emoji", text: r.emoji });
      row.createSpan({ cls: "vt-gx-row-word", text: r.word });
      row.createSpan({ cls: "vt-gx-row-zh", text: r.zh });
      row.addEventListener("click", () => actions.onSelectRow(r.entryId));
    }
  }

  private renderCard(card: GalaxyCardData, actions: GalaxyDetailActions): void {
    const box = this.container.createDiv({ cls: "vt-gx-card" });
    const top = box.createDiv({ cls: "vt-gx-card-top" });
    top.createSpan({ cls: "vt-gx-card-emoji", text: card.emoji });
    const info = top.createDiv({ cls: "vt-gx-card-info" });
    info.createDiv({ cls: "vt-gx-card-word", text: card.word });
    const meta = [card.phonetic, card.partOfSpeech].filter(Boolean).join(" · ");
    if (meta) info.createDiv({ cls: "vt-gx-card-ipa", text: meta });
    const collapse = top.createEl("button", {
      cls: "vt-gx-card-collapse clickable-icon",
      attr: { type: "button", "aria-label": t("galaxy.collapse") },
    });
    setIcon(collapse, "chevron-up");
    collapse.addEventListener("click", () => actions.onCollapse());

    if (card.zh) box.createDiv({ cls: "vt-gx-card-zh", text: card.zh });
    if (card.example) {
      const ex = box.createDiv({ cls: "vt-gx-card-example" });
      ex.createDiv({ text: card.example });
      if (card.sourceLabel) ex.createDiv({ cls: "vt-gx-card-source", text: card.sourceLabel });
    }
    if (card.breakdown) renderStrand(box, card.breakdown);

    const acts = box.createDiv({ cls: "vt-gx-card-actions" });
    actionButton(acts, { label: t("galaxy.review"), icon: "rotate-ccw", primary: true, onClick: () => actions.onReview(card.entryId) });
    actionButton(acts, { label: t("galaxy.wordPage"), icon: "file-text", onClick: () => actions.onOpenWordPage(card.entryId) });
    actionButton(acts, { label: t("galaxy.ai"), icon: "sparkles", onClick: () => actions.onOpenAi(card.entryId) });
  }
}

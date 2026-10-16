import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { applySectionEmpty } from "../reading/WordPageDecorator";
import { setSectionEmpty, type FoldSection } from "../reading/wordPageFolds";
import {
  breakdownDisplay,
  findTarget,
  renderBreakdownArea,
  renderEntryField,
  wordTarget,
  type WordHeaderHost,
  type WordTarget,
} from "./wordHeader";
import { headerVisibility, type HeaderVisibility } from "./wordHeaderModel";
import { parseBlockParams } from "./params";

// ── 「## Info」 and 「## 字根」 on a word page (1016 #1) ──
//
// Both are managed sections like 字族 / 用法: the heading (fold, chevron,
// count) belongs to WordPageDecorator, the body is one small live block
// drawn here from the store. Redrawn on every data change, like the
// header block. Nothing to show → the section's heading and body are
// hidden (see wordPageFolds.ts's setSectionEmpty).

export const WORD_INFO_LANG = "vocab-word-info";
export const WORD_DNA_LANG = "vocab-word-dna";

// Pure: does the Info section have anything to draw?
export function hasInfo(vis: Pick<HeaderVisibility, "showInfo">): boolean {
  return vis.showInfo;
}

export type SectionKind = Extract<FoldSection, "info" | "dna">;

export function renderWordInfo(host: WordHeaderHost, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  addBlock(host, source, el, ctx, "info");
}

export function renderWordDna(host: WordHeaderHost, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  addBlock(host, source, el, ctx, "dna");
}

function addBlock(
  host: WordHeaderHost,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  kind: SectionKind
): void {
  const frontmatter = (ctx.frontmatter as Record<string, unknown> | undefined) ?? host.frontmatterOf(ctx.sourcePath);
  const target = wordTarget(parseBlockParams(source), frontmatter, ctx.sourcePath);
  ctx.addChild(new WordSectionBlock(el, host, target, kind));
}

class WordSectionBlock extends MarkdownRenderChild {
  private disposed = false;
  private readonly breakdownState = { busy: false };

  constructor(
    containerEl: HTMLElement,
    private host: WordHeaderHost,
    private target: WordTarget,
    private kind: SectionKind
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.addClass("vt-ws-block");
    // Not the plugin's reading-mode "add the clicked word" handler.
    this.registerDomEvent(this.containerEl, "click", (e) => e.stopPropagation());
    const redraw = () => {
      const active = this.containerEl.ownerDocument?.activeElement;
      if (active && this.containerEl.contains(active)) return;
      this.render();
    };
    this.register(this.host.store.events.on("data:changed", redraw));
    // A background 拆字 write lives in wordMeta, off VocabEntry.
    if (this.host.learn?.events) {
      this.register(
        this.host.learn.events.on("wordMeta:upsert", (meta) => {
          const entry = findTarget(this.host.store.entries, this.target);
          if (entry && meta.id === entry.id) redraw();
        })
      );
    }
    this.render();
  }

  onunload(): void {
    this.disposed = true;
  }

  private render(): void {
    if (this.disposed) return;
    const el = this.containerEl;
    el.empty();
    const entry = findTarget(this.host.store.entries, this.target);
    if (!entry) {
      el.addClass("is-empty");
      return;
    }
    const root = el.createDiv({ cls: ["vt", "vt-word-section", `vt-ws-${this.kind}`] });
    const shown = this.kind === "info" ? this.drawInfo(root, entry) : this.drawDna(root, entry);
    el.toggleClass("is-empty", !shown);
    this.syncEmpty(entry.id, !shown);
  }

  // Hide (or show) the section's heading and body. The heading may not
  // exist yet, or not be attached yet, so the set is the source of truth
  // (the decorator reads it too) and the DOM is nudged now and once more
  // after this tick.
  private syncEmpty(entryId: string, empty: boolean): void {
    setSectionEmpty(entryId, this.kind, empty);
    const apply = () => {
      if (this.disposed) return;
      const root = this.containerEl.closest(".markdown-preview-view, .markdown-rendered");
      if (root) applySectionEmpty(root, this.kind, empty);
    };
    apply();
    window.setTimeout(apply, 0);
  }

  private drawInfo(root: HTMLElement, entry: VocabEntry): boolean {
    const vis = headerVisibility(entry);
    if (!hasInfo(vis)) return false;
    if (vis.senses.length) {
      const row = root.createDiv({ cls: "vt-wh-inforow" });
      row.createSpan({ cls: "vt-wh-inforow-label", text: t("wordHeader.senses") });
      const lines = row.createDiv({ cls: "vt-wh-senses" });
      for (const line of vis.senses) lines.createDiv({ cls: "vt-wh-sense", text: line });
    }
    for (const key of vis.infoRows) {
      const label = t(`row.field.${key}`);
      const row = root.createDiv({ cls: "vt-wh-inforow" });
      row.createSpan({ cls: "vt-wh-inforow-label", text: label });
      renderEntryField(row, this.host.store, entry, key, label, { multiline: true }, () => this.render());
    }
    return true;
  }

  private drawDna(root: HTMLElement, entry: VocabEntry): boolean {
    const morphemes = this.host.morphemes;
    if (!morphemes || breakdownDisplay(morphemes.breakdownOf(entry.id)) === "none") return false;
    renderBreakdownArea(
      root,
      entry,
      morphemes,
      this.breakdownState,
      this.host.openMorpheme ? (id) => this.host.openMorpheme?.(id) : undefined,
      () => this.render()
    );
    return true;
  }
}


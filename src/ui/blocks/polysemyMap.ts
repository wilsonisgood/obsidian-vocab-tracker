import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import type { PolyFilter, PolyWord } from "../../core/model/poly";
import { POLY_CATEGORIES } from "../../core/poly/catalog";
import { segmented } from "../kit/segmented";
import { guardReadingClicks, learnButton } from "./learnUi";
import {
  filterPolyWords,
  practiceFilterFor,
  wordProgress,
  type MapCategory,
} from "./polysemyMapModel";
import { categoryLabel, DOT_CHAR, levelLabel, progressDot, type SenseStats } from "./practice/polyTabModel";

// ── vocab-polysemy code block (第十七波 Q) ─────────────────────────
//
//   ```vocab-polysemy
//   ```
//
// The 意思地圖 (Polysemy.md): a category segmented + search box over the
// common many-sense words; each word is an expandable card with its sense
// table (意思, 例, 判斷線索, 級數, 進度點), common phrases and a 「練習這個字」
// button that sets the 常用字 filter and opens the practice hub.

export interface PolysemyMapDeps {
  // Counts and latest results of one sense (LearnerStore).
  senseStats(id: string): SenseStats;
  // LearnerStore.setFilter("poly", f).
  setPolyFilter(f: PolyFilter): void;
  // Opens the practice hub on that tab.
  openPractice(track: "poly"): void;
}

// The category / search the learner last used, per note, this session only.
const picked = new Map<string, { category: MapCategory; query: string }>();

export function renderPolysemyMap(
  deps: PolysemyMapDeps,
  _source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new PolysemyMapBlock(el, deps, ctx.sourcePath));
}

class PolysemyMapBlock extends MarkdownRenderChild {
  private category: MapCategory;
  private query: string;
  private open = new Set<string>();
  private listEl!: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    private deps: PolysemyMapDeps,
    private sourcePath: string
  ) {
    super(containerEl);
    const p = picked.get(sourcePath);
    this.category = p?.category ?? "all";
    this.query = p?.query ?? "";
  }

  onload(): void {
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-pm"] });
    guardReadingClicks(this, root);
    root.createDiv({ cls: "vt-gr-title", text: t("poly.map.title") });

    const bar = root.createDiv({ cls: "vt-pm-bar" });
    const segHost = bar.createDiv({ cls: "vt-pm-seg" });
    const drawSeg = () => {
      segHost.empty();
      segmented<MapCategory>(segHost, {
        options: [
          { value: "all", label: t("poly.map.all") },
          ...POLY_CATEGORIES.map((c) => ({ value: c as MapCategory, label: categoryLabel(c) })),
        ],
        value: this.category,
        ariaLabel: t("practice.poly.category"),
        onChange: (v) => {
          this.category = v;
          this.remember();
          drawSeg();
          this.renderList();
        },
      });
    };
    drawSeg();
    const search = bar.createEl("input", {
      cls: "vt-pm-search",
      attr: { type: "search", placeholder: t("poly.map.search"), "aria-label": t("poly.map.search") },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.remember();
      this.renderList();
    });

    this.listEl = root.createDiv({ cls: "vt-pm-list" });
    this.renderList();
  }

  private remember(): void {
    picked.set(this.sourcePath, { category: this.category, query: this.query });
  }

  private renderList(): void {
    const el = this.listEl;
    el.empty();
    const words = filterPolyWords(this.category, this.query);
    if (words.length === 0) {
      el.createDiv({ cls: "vt-pr-empty", text: t("poly.map.none") });
      return;
    }
    for (const w of words) this.renderCard(el, w);
  }

  private renderCard(parent: HTMLElement, w: PolyWord): void {
    const stats = (id: string) => this.deps.senseStats(id);
    const isOpen = this.open.has(w.word);
    const card = parent.createDiv({ cls: "vt-pm-card" });
    const head = card.createEl("button", {
      cls: "vt-pm-card-head",
      attr: { type: "button", "aria-expanded": String(isOpen) },
    });
    head.createSpan({ cls: "vt-pm-word", text: w.word });
    head.createSpan({ cls: "vt-pm-cat", text: categoryLabel(w.category) });
    const prog = wordProgress(w, stats);
    head.createSpan({
      cls: "vt-pm-count",
      text: t("poly.map.progress", { done: prog.done, total: prog.total }),
    });
    head
      .createSpan({ cls: "vt-pr-chevron", text: "›", attr: { "aria-hidden": "true" } })
      .toggleClass("is-open", isOpen);
    head.addEventListener("click", () => {
      if (isOpen) this.open.delete(w.word);
      else this.open.add(w.word);
      this.renderList();
    });
    if (!isOpen) return;

    const body = card.createDiv({ cls: "vt-pm-card-body" });
    const table = body.createDiv({ cls: "vt-pm-senses" });
    for (const s of w.senses) {
      const row = table.createDiv({ cls: "vt-pm-sense" });
      const main = row.createDiv({ cls: "vt-pm-sense-main" });
      const top = main.createDiv({ cls: "vt-pm-sense-top" });
      top.createSpan({ cls: "vt-pm-zh", text: s.zh });
      top.createSpan({ cls: "vt-pm-eg", text: s.example });
      main.createDiv({ cls: "vt-pm-cue", text: s.cue });
      const meta = row.createDiv({ cls: "vt-pm-meta" });
      meta.createSpan({ cls: "vt-pm-level", text: levelLabel(s.level) });
      const dot = progressDot(stats(s.id));
      meta.createSpan({
        cls: ["vt-pr-poly-dot", `is-${dot}`],
        text: DOT_CHAR[dot],
        attr: { title: t(`practice.poly.dot.${dot}`) },
      });
    }
    if (w.phrases.length > 0) {
      const ph = body.createDiv({ cls: "vt-pm-phrases" });
      ph.createSpan({ cls: "vt-pm-phrases-label", text: t("poly.map.phrases") });
      for (const p of w.phrases) ph.createSpan({ cls: "vt-pm-phrase", text: p });
    }
    learnButton(body, {
      label: t("poly.map.practice"),
      icon: "play",
      cta: true,
      onClick: () => {
        this.deps.setPolyFilter(practiceFilterFor(w.word));
        this.deps.openPractice("poly");
      },
    });
  }
}

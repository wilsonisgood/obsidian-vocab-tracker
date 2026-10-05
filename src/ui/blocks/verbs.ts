import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import { WordIndex } from "../../services/learn/wordIndex";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { t } from "../../core/i18n";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate, wordChip } from "./learnUi";
import {
  filterVerbs,
  parseVerbsParams,
  phoneticLine,
  pickVerb,
  usageMeta,
  usageRows,
  type VerbsParams,
} from "./verbsModel";

// ── vocab-verbs code block (規劃書 06 §7.3, §9.6; 設計稿 L6) ──
//
//   ```vocab-verbs
//   word: sugarcoat     # single-verb mode, e.g. on a word page (optional)
//   ```
//
// Left: the learned verbs with a filter; right: the selected verb's usage
// (patterns, examples, similar expressions). Usage is generated once and
// stored on the entry; 「重新產生」 replaces it.

export function renderVerbs(
  plugin: VocabTrackerPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new VerbsBlock(el, plugin, parseVerbsParams(source)));
}

class VerbsBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private listEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private detailEl!: HTMLElement;
  private query = "";
  private selectedId: string | undefined;
  // Last failure per entry, shown under its usage until the next try.
  private errors = new Map<string, string>();

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: VerbsParams
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-verbs"] });
    guardReadingClicks(this, this.root);

    if (this.params.word) {
      this.root.addClass("is-single");
      this.detailEl = this.root.createDiv({ cls: "vt-verb-detail" });
    } else {
      this.buildLayout();
    }

    // The filter input is built once and never redrawn, so typing in it
    // survives store events.
    const redraw = () => this.render();
    this.register(this.plugin.store.events.on("data:changed", redraw));
    this.register(this.plugin.verbs.events.on("verb:busy", redraw));
    this.render();
  }

  private buildLayout(): void {
    const grid = this.root.createDiv({ cls: "vt-verbs-grid" });
    const side = grid.createDiv({ cls: "vt-verbs-side" });
    const search = side.createDiv({ cls: "vt-verbs-search" });
    setIcon(search.createSpan({ cls: "vt-verbs-search-icon" }), "search");
    const input = search.createEl("input", { cls: "vt-verbs-filter", type: "search" });
    input.placeholder = t("learn.verb.filter");
    input.addEventListener("input", () => {
      this.query = input.value;
      this.render();
    });
    this.countEl = side.createDiv({ cls: "vt-verbs-count" });
    this.listEl = side.createDiv({ cls: "vt-verbs-list" });
    this.detailEl = grid.createDiv({ cls: "vt-verb-detail" });
  }

  private render(): void {
    if (this.params.word) return this.renderSingle(this.params.word);

    const all = this.plugin.verbs.verbs();
    const shown = filterVerbs(all, this.query);
    this.selectedId = pickVerb(shown, this.selectedId);
    this.root.toggleClass("is-empty", !all.length);

    if (this.countEl) this.countEl.setText(t("learn.verb.count", { n: all.length }));
    const list = this.listEl;
    if (list) {
      list.empty();
      if (all.length && !shown.length) list.createDiv({ cls: "vt-verbs-nomatch", text: t("learn.verb.noMatch") });
      for (const e of shown) {
        const row = list.createEl("button", { cls: "vt-verbs-row" });
        row.toggleClass("is-active", e.id === this.selectedId);
        row.setAttr("aria-pressed", String(e.id === this.selectedId));
        row.createSpan({ cls: "vt-verbs-row-word", text: e.word });
        if (this.plugin.verbs.isBusy(e.id)) setIcon(row.createSpan({ cls: "vt-verbs-row-icon is-busy" }), "loader");
        else if (e.usage) {
          const icon = row.createSpan({ cls: "vt-verbs-row-icon" });
          setIcon(icon, "check");
          icon.setAttr("aria-label", t("learn.verb.hasUsage"));
        }
        row.addEventListener("click", () => {
          this.selectedId = e.id;
          this.render();
        });
      }
    }

    this.detailEl.empty();
    if (!all.length) {
      this.detailEl.appendChild(
        emptyState({ icon: "list", title: t("learn.verb.none.title"), body: t("learn.verb.none.body") })
      );
      return;
    }
    const selected = shown.find((e) => e.id === this.selectedId);
    if (selected) this.renderDetail(selected);
  }

  private renderSingle(word: string): void {
    this.detailEl.empty();
    const entry = new WordIndex(this.plugin.store.entries).find(word);
    if (!entry) {
      this.detailEl.appendChild(inlineNote({ text: t("learn.notFound", { word }) }));
      return;
    }
    if (!this.plugin.verbs.canGenerate(entry)) {
      this.detailEl.appendChild(inlineNote({ text: t("learn.verb.notVerb", { word: entry.word }) }));
      return;
    }
    this.renderDetail(entry);
  }

  // ── Right pane ────────────────────────────────────────────────

  private renderDetail(e: VocabEntry): void {
    const el = this.detailEl;
    const head = el.createDiv({ cls: "vt-verb-head" });
    head.createSpan({ cls: "vt-verb-word", text: e.word });
    const phon = phoneticLine(e);
    if (phon) head.createSpan({ cls: "vt-verb-phon", text: phon });
    const speak = head.createEl("button", { cls: "vt-verb-speak clickable-icon" });
    setIcon(speak, "volume-2");
    speak.setAttr("aria-label", t("learn.verb.speak"));
    speak.addEventListener("click", () => this.plugin.speakWord(e));

    const usage = this.plugin.verbs.usage(e);
    const meta = usageMeta(e, usage);
    const metaParts: string[] = [];
    if (meta.source) metaParts.push(t("learn.verb.meta.source", { source: meta.source }));
    if (meta.date) metaParts.push(t("learn.verb.meta.generated", { date: meta.date }));
    if (metaParts.length) el.createDiv({ cls: "vt-verb-meta", text: metaParts.join(" · ") });

    const busy = this.plugin.verbs.isBusy(e.id);
    if (busy) {
      const box = el.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: t("learn.verb.generating", { word: e.word }) });
      learnButton(box, { label: t("learn.stop"), icon: "square", onClick: () => this.plugin.verbs.stop(e.id) });
    }

    const error = this.errors.get(e.id);
    if (error && !busy) el.appendChild(inlineNote({ tone: "error", text: error }));

    if (usage) {
      const { patterns, related } = usageRows(usage);
      const list = el.createDiv({ cls: "vt-verb-patterns" });
      for (const p of patterns) {
        const row = list.createDiv({ cls: "vt-verb-pattern" });
        row.createSpan({ cls: "vt-verb-pattern-p", text: p.pattern });
        const right = row.createDiv({ cls: "vt-verb-pattern-body" });
        if (p.meaningZh) right.createDiv({ cls: "vt-verb-pattern-zh", text: p.meaningZh });
        if (p.example) right.createDiv({ cls: "vt-verb-pattern-ex", text: p.example });
      }
      if (related.length) {
        el.createDiv({ cls: "vt-verb-section", text: t("learn.verb.related") });
        const chips = el.createDiv({ cls: "vt-verb-related" });
        const index = new WordIndex(this.plugin.store.entries);
        for (const r of related) {
          // A similar expression that's already in the list opens its card.
          const known = index.find(r.phrase);
          const chip = wordChip(chips, this.plugin, known && known.id !== e.id ? known : undefined, "vt-verb-related-chip");
          chip.createSpan({ text: r.phrase });
          if (r.zh) chip.createSpan({ cls: "vt-verb-related-zh", text: r.zh });
        }
      }
      if (!busy) {
        const actions = el.createDiv({ cls: "vt-verb-actions" });
        const regen = learnButton(actions, {
          label: t("learn.verb.regenerate"),
          icon: "refresh-cw",
          onClick: () => void this.generate(e),
        });
        const status = this.plugin.ai.status();
        if (status !== "ready") {
          regen.disabled = true;
          const offline = status === "offline";
          actions.appendChild(
            inlineNote({ tone: offline ? "offline" : "info", text: t(offline ? "learn.ai.offline" : "learn.ai.body") })
          );
        }
      }
      return;
    }

    if (busy) return;
    if (renderLearnAiGate(el, this.plugin)) return;
    el.appendChild(
      emptyState({
        icon: "sparkles",
        title: t("learn.verb.empty.title", { word: e.word }),
        body: t("learn.verb.empty.body"),
        action: { label: t("learn.verb.generate"), icon: "sparkles", onClick: () => void this.generate(e) },
      })
    );
  }

  private async generate(e: VocabEntry): Promise<void> {
    if (this.plugin.verbs.isBusy(e.id)) return;
    this.errors.delete(e.id);
    try {
      await this.plugin.verbs.generate(e);
    } catch (err) {
      if (!isAbort(err)) {
        console.error("Vocab Tracker: verb usage failed", err);
        this.errors.set(e.id, learnErrorText(err));
      }
    }
    // verb:busy already redrew; draw once more for the error.
    this.render();
  }
}

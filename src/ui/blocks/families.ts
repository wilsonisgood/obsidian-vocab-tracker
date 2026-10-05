import { MarkdownRenderChild, Menu, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import type { FamilyCandidate } from "../../services/learn/FamilyService";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import {
  checkedNewWords,
  familiesWith,
  familyTitle,
  familyTree,
  MemberLookup,
  parseFamiliesParams,
  pickSelected,
  reviewView,
  type FamiliesParams,
  type FamilyTreeView,
  type ReviewView,
} from "./familiesModel";
import { joinWords, lt } from "./learnText";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate } from "./learnUi";

// ── vocab-families code block (規劃書 06 §7.2, §9.6; 設計稿 L5、W3) ──
//
//   ```vocab-families
//   topic: kitchenware      # family to open first (optional)
//   word: glittery          # word-page mode: only its families (optional)
//   ```
//
// Saved families draw as a tree (L5) without needing AI. 「找字族」 /
// 「重新分群」 ask the AI for candidates and show them for review (W3);
// nothing is stored until the learner saves, and ticked new words go
// through the dictionary before entering the vocab list (FamilyService).

export function renderFamilies(
  plugin: VocabTrackerPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new FamiliesBlock(el, plugin, parseFamiliesParams(source)));
}

interface Review {
  candidates: FamilyCandidate[];
  // Lower-cased words ticked for adding.
  checked: Set<string>;
  // 重新分群: saving replaces the AI families.
  replace: boolean;
}

class FamiliesBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private loaded = false;
  private disposed = false;
  private selectedId: string | undefined;
  private review: Review | null = null;
  private generating: AbortController | null = null;
  private saving = false;
  private error: string | null = null;
  // Suggested words being added (「點一下加入」), so a double tap adds once.
  private adding = new Set<string>();

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: FamiliesParams
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-families"] });
    guardReadingClicks(this, this.root);

    const redraw = () => this.render();
    this.register(this.plugin.learn.events.on("family:upsert", redraw));
    this.register(this.plugin.learn.events.on("learn:reloaded", redraw));
    // Known / suggested depends on the vocab list.
    this.register(this.plugin.store.events.on("data:changed", redraw));

    this.render();
    void this.plugin.families.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.render();
    });
  }

  onunload(): void {
    this.disposed = true;
    if (this.generating) this.plugin.families.stop();
  }

  // ── Data ──────────────────────────────────────────────────────

  private wordEntry(lookup: MemberLookup): VocabEntry | undefined {
    return this.params.word ? lookup.entry({ word: this.params.word }) : undefined;
  }

  private shownFamilies(entry: VocabEntry | undefined): Family[] {
    const all = this.plugin.families.families();
    return entry ? familiesWith(all, entry) : all;
  }

  // ── Actions ───────────────────────────────────────────────────

  private async generate(replace: boolean, seed?: VocabEntry): Promise<void> {
    if (this.generating) return;
    const ctrl = (this.generating = new AbortController());
    this.error = null;
    this.review = null;
    this.render();
    try {
      const candidates = await this.plugin.families.generate({
        seedEntryIds: seed ? [seed.id] : undefined,
        signal: ctrl.signal,
      });
      if (this.disposed) return;
      if (!candidates.length) this.error = lt("learn.family.noneFound");
      else this.review = { candidates, checked: new Set(), replace };
    } catch (e) {
      if (this.disposed) return;
      if (!isAbort(e)) {
        console.error("Vocab Tracker: family generation failed", e);
        this.error = learnErrorText(e);
      }
    } finally {
      if (this.generating === ctrl) this.generating = null;
      if (!this.disposed) this.render();
    }
  }

  private stop(): void {
    this.generating?.abort();
    this.plugin.families.stop();
  }

  private async save(addWords: string[]): Promise<void> {
    const review = this.review;
    if (!review || this.saving) return;
    this.saving = true;
    this.render();
    try {
      const { families, added } = await this.plugin.families.save(review.candidates, {
        addWords,
        replace: review.replace,
      });
      if (this.disposed) return;
      this.review = null;
      this.selectedId = families[0]?.id ?? this.selectedId;
      new Notice(lt("learn.family.saved", { families: families.length, words: added.length }));
    } catch (e) {
      console.error("Vocab Tracker: saving families failed", e);
      new Notice(learnErrorText(e));
    } finally {
      this.saving = false;
      if (!this.disposed) this.render();
    }
  }

  private async addSuggested(familyId: string, word: string): Promise<void> {
    const k = `${familyId}\u0000${word.toLowerCase()}`;
    if (this.adding.has(k)) return;
    this.adding.add(k);
    this.render();
    try {
      const entry = await this.plugin.families.addSuggested(familyId, word);
      if (entry) new Notice(lt("learn.family.added", { word: entry.word }));
    } catch (e) {
      console.error("Vocab Tracker: adding a family word failed", e);
      new Notice(learnErrorText(e));
    } finally {
      this.adding.delete(k);
      if (!this.disposed) this.render();
    }
  }

  private remove(f: Family): void {
    this.plugin.families.remove(f.id);
    if (this.selectedId === f.id) this.selectedId = undefined;
    new Notice(lt("learn.family.deleted", { name: f.label || f.topic }));
  }

  // ── Render ────────────────────────────────────────────────────

  private render(): void {
    const root = this.root;
    root.empty();
    if (!this.loaded) {
      root.createDiv({ cls: "vt-learn-loading", text: lt("learn.loading") });
      return;
    }

    const lookup = new MemberLookup(this.plugin.store.entries);
    const entry = this.wordEntry(lookup);
    if (this.params.word && !entry) {
      root.appendChild(emptyState({ icon: "git-fork", title: lt("learn.notFound", { word: this.params.word }) }));
      return;
    }

    const families = this.shownFamilies(entry);
    this.selectedId = pickSelected(families, this.selectedId, this.params.topic);

    if (families.length && !this.review) this.renderToolbar(families, entry);
    if (!entry && !this.review && !this.generating && this.plugin.families.needsRegroup()) {
      const note = root.createDiv({ cls: "vt-fam-regroup-note" });
      note.appendChild(inlineNote({ tone: "info", icon: "refresh-cw", text: lt("learn.family.regroup.hint") }));
      learnButton(note, { label: lt("learn.family.regroup"), icon: "refresh-cw", onClick: () => void this.generate(true) });
    }

    if (this.generating) return this.renderGenerating();
    if (this.error) {
      const box = root.createDiv({ cls: "vt-learn-error" });
      box.appendChild(inlineNote({ tone: "error", text: this.error }));
      learnButton(box, { label: lt("learn.retry"), icon: "rotate-ccw", onClick: () => void this.generate(false, entry) });
    }
    if (this.review) return this.renderReview(this.review, lookup);

    const selected = families.find((f) => f.id === this.selectedId);
    if (selected) return this.renderTree(selected, familyTree(selected, lookup));

    // No families yet.
    const empty = root.createDiv({ cls: "vt-fam-empty" });
    const title = entry
      ? lt("learn.family.word.empty.title", { word: entry.word })
      : lt("learn.family.empty.title");
    if (renderLearnAiGate(empty, this.plugin)) return;
    empty.appendChild(
      emptyState({
        icon: "git-fork",
        title,
        body: lt("learn.family.empty.body"),
        action: { label: lt("learn.family.generate"), icon: "sparkles", onClick: () => void this.generate(false, entry) },
      })
    );
  }

  // Family chips + 重新分群 (L5) / 找字族 (word page).
  private renderToolbar(families: Family[], entry: VocabEntry | undefined): void {
    const bar = this.root.createDiv({ cls: "vt-fam-toolbar" });
    for (const f of families) {
      const chip = bar.createEl("button", { cls: "vt-fam-tab", text: familyTitle(f) });
      chip.toggleClass("is-active", f.id === this.selectedId);
      chip.setAttr("aria-pressed", String(f.id === this.selectedId));
      chip.addEventListener("click", () => {
        this.selectedId = f.id;
        this.error = null;
        this.render();
      });
    }
    const ready = this.plugin.ai.status() === "ready";
    const btn = learnButton(bar, {
      label: lt(entry ? "learn.family.generate" : "learn.family.regroup"),
      icon: entry ? "sparkles" : "refresh-cw",
      ghost: true,
      onClick: () => void this.generate(!entry, entry),
    });
    btn.addClass("vt-fam-toolbar-action");
    btn.disabled = !ready;
    if (!ready) btn.title = lt(this.plugin.ai.status() === "offline" ? "learn.ai.offline" : "learn.ai.body");
  }

  private renderGenerating(): void {
    const box = this.root.createDiv({ cls: "vt-learn-busy" });
    const line = box.createDiv({ cls: "vt-learn-busy-text" });
    setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
    line.createSpan({ text: lt("learn.family.generating") });
    learnButton(box, { label: lt("learn.stop"), icon: "square", onClick: () => this.stop() });
  }

  // ── L5 tree ───────────────────────────────────────────────────

  private renderTree(f: Family, view: FamilyTreeView): void {
    const tree = this.root.createDiv({ cls: "vt-fam-tree" });
    const head = tree.createDiv({ cls: "vt-fam-root" });
    setIcon(head.createSpan({ cls: "vt-fam-root-icon" }), "git-fork");
    head.createSpan({ text: view.title });
    const more = head.createEl("button", { cls: "vt-fam-root-more clickable-icon" });
    setIcon(more, "more-horizontal");
    more.setAttr("aria-label", lt("learn.family.more"));
    more.addEventListener("click", (e) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle(lt("learn.family.delete"))
          .setIcon("trash-2")
          .onClick(() => this.remove(f))
      );
      menu.showAtMouseEvent(e);
    });

    tree.createDiv({ cls: "vt-fam-stem" });
    const cols = tree.createDiv({ cls: "vt-fam-cols" });
    for (const col of view.columns) {
      const c = cols.createDiv({ cls: "vt-fam-col" });
      c.createDiv({ cls: "vt-fam-col-stem" });
      c.createDiv({ cls: "vt-fam-group", text: col.label });
      c.createDiv({ cls: "vt-fam-col-stem is-short" });
      const list = c.createDiv({ cls: "vt-fam-chips" });
      for (const chip of col.chips) {
        if (chip.known) {
          const el = list.createSpan({ cls: "vt-fam-chip is-known" });
          el.createSpan({ cls: "vt-fam-chip-word", text: chip.word });
          if (chip.zh) el.createSpan({ cls: "vt-fam-chip-zh", text: chip.zh });
          continue;
        }
        const busy = this.adding.has(`${f.id}\u0000${chip.word.toLowerCase()}`);
        const el = list.createEl("button", { cls: "vt-fam-chip is-suggested" });
        el.createSpan({ cls: "vt-fam-chip-word", text: chip.word });
        if (chip.zh) el.createSpan({ cls: "vt-fam-chip-zh", text: chip.zh });
        setIcon(el.createSpan({ cls: "vt-fam-chip-icon" }), busy ? "loader" : "plus");
        el.disabled = busy;
        el.setAttr("aria-label", lt("learn.family.add", { word: chip.word }));
        el.addEventListener("click", () => void this.addSuggested(f.id, chip.word));
      }
    }

    const legend = this.root.createDiv({ cls: "vt-fam-legend" });
    const known = legend.createSpan({ cls: "vt-fam-legend-item" });
    known.createSpan({ cls: "vt-fam-chip is-known is-mini", text: lt("learn.family.known") });
    known.createSpan({ text: lt("learn.family.legend.known") });
    if (view.suggestedCount) {
      const sug = legend.createSpan({ cls: "vt-fam-legend-item" });
      setIcon(sug.createSpan({ cls: "vt-fam-chip is-suggested is-mini" }), "plus");
      sug.createSpan({ text: lt("learn.family.legend.suggested") });
    }
    if (view.seeds.length) {
      legend.createSpan({ cls: "vt-fam-legend-item", text: lt("learn.family.legend.seeds", { words: joinWords(view.seeds) }) });
    }
  }

  // ── W3 review ─────────────────────────────────────────────────

  private renderReview(review: Review, lookup: MemberLookup): void {
    const view: ReviewView = reviewView(review.candidates, lookup);
    const box = this.root.createDiv({ cls: "vt-fam-review" });
    const head = box.createDiv({ cls: "vt-fam-review-head" });
    setIcon(head.createSpan({ cls: "vt-fam-review-icon" }), "sparkles");
    head.createSpan({ text: lt("learn.family.found", { families: view.familyCount, words: view.newWordCount }) });

    for (const card of view.cards) {
      const el = box.createDiv({ cls: "vt-fam-card" });
      const title = card.from.length
        ? `${card.title} · ${lt("learn.family.from", { words: joinWords(card.from) })}`
        : card.title;
      el.createDiv({ cls: "vt-fam-card-title", text: title });
      for (const row of card.rows) {
        const line = el.createEl("label", { cls: "vt-fam-row" });
        if (row.known) {
          line.addClass("is-known");
          line.createSpan({ cls: "vt-fam-row-tag", text: lt("learn.family.known") });
        } else {
          const cb = line.createEl("input", { cls: "vt-fam-row-check", type: "checkbox" });
          cb.checked = review.checked.has(row.key);
          cb.disabled = this.saving;
          cb.addEventListener("change", () => {
            if (cb.checked) review.checked.add(row.key);
            else review.checked.delete(row.key);
            this.render();
          });
        }
        line.createSpan({ cls: "vt-fam-row-word", text: row.word });
        line.createSpan({ cls: "vt-fam-row-zh", text: row.zh });
      }
    }

    const toAdd = checkedNewWords(view, review.checked);
    const actions = box.createDiv({ cls: "vt-fam-review-actions" });
    const discard = learnButton(actions, {
      label: lt("learn.family.discard"),
      onClick: () => {
        this.review = null;
        this.render();
      },
    });
    const only = learnButton(actions, { label: lt("learn.family.saveOnly"), onClick: () => void this.save([]) });
    const add = learnButton(actions, {
      label: lt("learn.family.saveAdd", { n: toAdd.length }),
      icon: "plus",
      cta: true,
      onClick: () => void this.save(toAdd),
    });
    for (const b of [discard, only, add]) b.disabled = this.saving;
    add.disabled = this.saving || !toAdd.length;

    if (review.replace) box.createDiv({ cls: "vt-fam-review-note", text: lt("learn.family.regroup.note") });
    if (view.newWordCount) {
      box.createDiv({
        cls: "vt-fam-review-note",
        text: lt("learn.family.addNote", { topics: joinWords(view.cards.map((c) => c.topic)) }),
      });
    }
  }
}

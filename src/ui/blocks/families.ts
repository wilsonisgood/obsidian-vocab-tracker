import { Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import { defaultEmoji } from "../../core/model/wordMeta";
import type { FamilyCandidate } from "../../services/learn/FamilyService";
import { GalaxyDetail, type GalaxyDetailActions, type GalaxyDetailModel } from "../galaxy/GalaxyDetail";
import { GalaxyGraph } from "../galaxy/GalaxyGraph";
import { buildGalaxyModel, galaxyNodeId, type GalaxyLookup, type GalaxyModel } from "../galaxy/galaxyModel";
import { GALAXY_VIEW_TYPE } from "../galaxy/GalaxyView";
import {
  buildGalaxyCard,
  buildTopics,
  detailRows,
  resolveAddWord,
  type GalaxyCardData,
  type GalaxyTopic,
  type GalaxyViewMode,
} from "../galaxy/galaxyView.model";
import { aiErrorBox } from "../kit/aiDebug";
import { datesText } from "../kit/dates";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { segmented } from "../kit/segmented";
import {
  onFamilyFocus,
  familiesWith,
  familyTitle,
  familyTree,
  MemberLookup,
  parseFamiliesParams,
  pickSelected,
  takeFamilyFocus,
  type FamiliesParams,
  type FamilyFocus,
  type FamilyTreeView,
} from "./familiesModel";
import { joinWords, t } from "../../core/i18n";
import { guardReadingClicks, isAbort, learnButton, learnErrorText, renderLearnAiGate, wordChip } from "./learnUi";

// ── vocab-families code block (規劃書 06 §7.2, §9.6, 09 §6.2; 設計稿 L5、W3、
// Galaxy) ──
//
//   ```vocab-families
//   topic: kitchenware      # family to open first (optional)
//   word: glittery          # word-page mode: only its families (optional)
//   ```
//
// Saved families draw as a force-graph 「星系」 by default (A1) — a topic
// list, a small toolbar (✨ AI 還有哪些／只看已學／重新置中／展開／檢視切換)
// and a graph｜detail split (GalaxyGraph + GalaxyDetail, both GA/GB's own
// files). 「清單」 switches to the original tree (renderTree, below —
// unchanged). 「找字族」/「重新分群」 move into the galaxy toolbar's ⋯ menu;
// everything about how a candidate gets saved (no review screen, 1005 回饋:
// 「審核清單沒什麼用處」) is unchanged either way.

const SVG_NS = "http://www.w3.org/2000/svg";

// Obsidian's own `createSvg()` DOM extension isn't polyfilled by this
// repo's fake-DOM test harness (tests/perf/support/dom.ts) — plain
// createElementNS works the same in both the real app and vitest.
function svgNode<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string>,
  cls?: string
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (cls) el.setAttribute("class", cls);
  parent.appendChild(el);
  return el;
}

export function renderFamilies(
  plugin: VocabTrackerPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new FamiliesBlock(el, plugin, parseFamiliesParams(source), ctx.sourcePath));
}

class FamiliesBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private loaded = false;
  private disposed = false;
  private selectedId: string | undefined;
  private generating: AbortController | null = null;
  // The failure and what was thrown (an unreadable answer carries the
  // prompt and raw output for the debug box).
  private error: { text: string; cause?: unknown } | null = null;
  // The member to highlight (came from its word page).
  private focusEntryId: string | undefined;
  // Suggested words being added (「點一下加入」), so a double tap adds once.
  // Shared key scheme (`${familyId}\u0000${word.toLowerCase()}`) between the
  // tree's chips and the galaxy's ＋ nodes.
  private adding = new Set<string>();
  // Each member's zh gloss is AI text, rendered as Markdown (1006 #22); a
  // fresh scope per tree render drops the previous one's listeners (same
  // lifecycle as trivia.ts's favorites list / verbs.ts's patterns).
  private markdownScope: Component | null = null;

  // ── Galaxy (09 §6.1/§6.2, A1/A3-A7) ─────────────────────────────
  // View mode is block-instance memory only (not persisted) — A1 defaults
  // every fresh block to 星系.
  private viewMode: GalaxyViewMode = "galaxy";
  private onlyKnown = false;
  // Selected node id (entryId, or `w:<word>` for a suggestion) — null means
  // the detail panel shows the topic's learned-word list instead of a card.
  private galaxySelected: string | null = null;
  private galaxyInitialized = false;
  private galaxyFresh = new Set<string>();
  private galaxyExpandCtrl = new Map<string, AbortController>();
  // The live graph/detail instance (and the family it belongs to) — kept
  // across re-renders of the *same* topic so an unrelated redraw (a
  // background wordMeta write, another word's like toggle…) never resets
  // pan/zoom/node positions. A topic switch or leaving galaxy mode tears it
  // down and the next render starts fresh.
  private galaxyGraph: GalaxyGraph | null = null;
  private galaxyDetail: GalaxyDetail | null = null;
  private galaxySvgEl: SVGSVGElement | null = null;
  private galaxyDetailHost: HTMLElement | null = null;
  private galaxyGraphFamilyId: string | null = null;
  private lastGalaxyModel: GalaxyModel | null = null;

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: FamiliesParams,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-families"] });
    guardReadingClicks(this, this.root);
    // 「來源：字族樹 …」 from a word page (whole-tree blocks only: a
    // word-page block shows that word's families anyway).
    if (!this.params.word) {
      const focus = takeFamilyFocus();
      if (focus) {
        this.selectedId = focus.familyId;
        this.focusEntryId = focus.entryId;
        if (focus.entryId) {
          this.galaxySelected = focus.entryId;
          this.galaxyInitialized = true;
        }
      }
      this.register(onFamilyFocus((f) => this.focus(f)));
    }

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
    for (const ctrl of this.galaxyExpandCtrl.values()) ctrl.abort();
    this.destroyGalaxyGraph();
  }

  private focus(focus: FamilyFocus): void {
    if (this.disposed) return;
    takeFamilyFocus();
    this.selectedId = focus.familyId;
    this.focusEntryId = focus.entryId;
    if (focus.entryId) {
      this.galaxySelected = focus.entryId;
      this.galaxyInitialized = true;
    }
    this.render();
    this.root.scrollIntoView({ block: "start", behavior: "smooth" });
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

  // AI 結果直接存成字族 (1005 回饋: 審核清單移除) — nothing is shown for
  // review first; a candidate's not-yet-learned members land in the tree
  // as plain text, and the learner adds them one at a time from there
  // (addSuggested, below) instead of ticking a batch up front.
  private async generate(replace: boolean, seed?: VocabEntry): Promise<void> {
    if (this.generating) return;
    const ctrl = (this.generating = new AbortController());
    this.error = null;
    this.render();
    try {
      const candidates = await this.plugin.families.generate({
        seedEntryIds: seed ? [seed.id] : undefined,
        signal: ctrl.signal,
      });
      if (this.disposed) return;
      if (!candidates.length) this.error = { text: t("learn.family.noneFound") };
      else await this.save(candidates, replace);
    } catch (e) {
      if (this.disposed) return;
      if (!isAbort(e)) {
        console.error("Vocab Tracker: family generation failed", e);
        this.error = { text: learnErrorText(e), cause: e };
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

  private async save(candidates: FamilyCandidate[], replace: boolean): Promise<void> {
    try {
      const { families } = await this.plugin.families.save(candidates, { replace });
      if (this.disposed) return;
      this.selectedId = families[0]?.id ?? this.selectedId;
      new Notice(t("learn.family.saved", { families: families.length }));
    } catch (e) {
      console.error("Vocab Tracker: saving families failed", e);
      new Notice(learnErrorText(e));
    }
  }

  private async addSuggested(familyId: string, word: string): Promise<void> {
    const k = `${familyId}\u0000${word.toLowerCase()}`;
    if (this.adding.has(k)) return;
    this.adding.add(k);
    this.render();
    try {
      const entry = await this.plugin.families.addSuggested(familyId, word);
      if (entry) new Notice(t("learn.family.added", { word: entry.word }));
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
    new Notice(t("learn.family.deleted", { name: f.label || f.topic }));
  }

  // ── Render ────────────────────────────────────────────────────

  private render(): void {
    const root = this.root;
    // Detach (not destroy) the live galaxy graph/detail before wiping the
    // DOM below, so re-rendering the *same* topic in galaxy mode (an
    // unrelated store event, toggling 只看已學, an expand finishing…) can
    // re-attach them instead of tearing down the force simulation.
    const keepGalaxy = this.viewMode === "galaxy" && !!this.galaxyGraph && !!this.galaxySvgEl && !!this.galaxyDetailHost;
    if (keepGalaxy) {
      this.galaxySvgEl!.remove();
      this.galaxyDetailHost!.remove();
    } else {
      this.destroyGalaxyGraph();
    }
    root.empty();
    if (this.markdownScope) {
      this.removeChild(this.markdownScope);
      this.markdownScope = null;
    }
    if (!this.loaded) {
      root.createDiv({ cls: "vt-learn-loading", text: t("learn.loading") });
      return;
    }

    const lookup = new MemberLookup(this.plugin.store.entries);
    const entry = this.wordEntry(lookup);
    if (this.params.word && !entry) {
      root.appendChild(emptyState({ icon: "git-fork", title: t("learn.notFound", { word: this.params.word }) }));
      return;
    }

    const families = this.shownFamilies(entry);
    this.selectedId = pickSelected(families, this.selectedId, this.params.topic);
    // word: 模式預設選取那個字 (09 §6.2) — only once, so collapsing the
    // card later doesn't keep snapping back to it.
    if (!this.galaxyInitialized) {
      this.galaxyInitialized = true;
      if (entry) this.galaxySelected = entry.id;
    }

    if (families.length && this.viewMode === "list") this.renderToolbar(families, entry);
    if (!entry && !this.generating && this.plugin.families.needsRegroup()) {
      const note = root.createDiv({ cls: "vt-fam-regroup-note" });
      note.appendChild(inlineNote({ tone: "info", icon: "refresh-cw", text: t("learn.family.regroup.hint") }));
      learnButton(note, { label: t("learn.family.regroup"), icon: "refresh-cw", onClick: () => void this.generate(true) });
    }

    if (this.generating) return this.renderGenerating();
    if (this.error) {
      const box = root.createDiv({ cls: "vt-learn-error" });
      box.appendChild(aiErrorBox({ text: this.error.text, error: this.error.cause }));
      learnButton(box, { label: t("learn.retry"), icon: "rotate-ccw", onClick: () => void this.generate(false, entry) });
    }

    const selected = families.find((f) => f.id === this.selectedId);
    if (selected) {
      if (this.viewMode === "list") return this.renderTree(selected, familyTree(selected, lookup, { focusEntryId: this.focusEntryId }), lookup);
      return this.renderGalaxySection(selected, families, entry, lookup);
    }

    // No families yet.
    const empty = root.createDiv({ cls: "vt-fam-empty" });
    const title = entry
      ? t("learn.family.word.empty.title", { word: entry.word })
      : t("learn.family.empty.title");
    if (renderLearnAiGate(empty, this.plugin)) return;
    empty.appendChild(
      emptyState({
        icon: "git-fork",
        title,
        body: t("learn.family.empty.body"),
        action: { label: t("learn.family.generate"), icon: "sparkles", onClick: () => void this.generate(false, entry) },
      })
    );
  }

  // Family chips + 重新分群 (L5) / 找字族 (word page) — 清單模式專用，不變；
  // 星系模式用主題清單＋⋯選單取代這一排 (renderGalaxyToolbar 下方)。
  private renderToolbar(families: Family[], entry: VocabEntry | undefined): void {
    const bar = this.root.createDiv({ cls: "vt-fam-toolbar" });
    for (const f of families) {
      const chip = bar.createEl("button", { cls: "vt-fam-tab", text: familyTitle(f) });
      chip.toggleClass("is-active", f.id === this.selectedId);
      chip.setAttr("aria-pressed", String(f.id === this.selectedId));
      chip.addEventListener("click", () => {
        this.selectedId = f.id;
        this.focusEntryId = undefined;
        this.error = null;
        this.render();
      });
    }
    const ready = this.plugin.ai.status() === "ready";
    const btn = learnButton(bar, {
      label: t(entry ? "learn.family.generate" : "learn.family.regroup"),
      icon: entry ? "sparkles" : "refresh-cw",
      ghost: true,
      onClick: () => void this.generate(!entry, entry),
    });
    btn.addClass("vt-fam-toolbar-action");
    btn.disabled = !ready;
    if (!ready) btn.title = t(this.plugin.ai.status() === "offline" ? "learn.ai.offline" : "learn.ai.body");
    this.renderModeSwitch(bar);
  }

  private renderModeSwitch(bar: HTMLElement): void {
    segmented<GalaxyViewMode>(bar, {
      ariaLabel: t("galaxy.viewAria"),
      value: this.viewMode,
      options: [
        { value: "galaxy", label: t("galaxy.mode.galaxy") },
        { value: "list", label: t("galaxy.mode.list") },
      ],
      onChange: (v) => {
        if (v === this.viewMode) return;
        this.viewMode = v;
        this.render();
      },
    });
  }

  private renderGenerating(): void {
    const box = this.root.createDiv({ cls: "vt-learn-busy" });
    const line = box.createDiv({ cls: "vt-learn-busy-text" });
    setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
    line.createSpan({ text: t("learn.family.generating") });
    learnButton(box, { label: t("learn.stop"), icon: "square", onClick: () => this.stop() });
  }

  // ── L5 tree (清單模式 — 不變) ─────────────────────────────────────

  private renderTree(f: Family, view: FamilyTreeView, lookup: MemberLookup): void {
    const scope = (this.markdownScope = this.addChild(new Component()));
    const tree = this.root.createDiv({ cls: "vt-fam-tree" });
    const head = tree.createDiv({ cls: "vt-fam-root" });
    setIcon(head.createSpan({ cls: "vt-fam-root-icon" }), "git-fork");
    head.createSpan({ text: view.title });
    const more = head.createEl("button", { cls: "vt-fam-root-more clickable-icon" });
    setIcon(more, "more-horizontal");
    more.setAttr("aria-label", t("learn.family.more"));
    more.addEventListener("click", (e) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle(t("learn.family.delete"))
          .setIcon("trash-2")
          .onClick(() => this.remove(f))
      );
      menu.showAtMouseEvent(e);
    });

    const dates = datesText(view.dates);
    if (dates) tree.createDiv({ cls: "vt-fam-dates", text: dates });
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
          // Opens the word's card in the sidebar.
          const entry = chip.entryId ? lookup.byEntryId(chip.entryId) : undefined;
          const el = wordChip(list, this.plugin, entry, ["vt-fam-chip", "is-known", ...(chip.focus ? ["is-focus"] : [])]);
          el.createSpan({ cls: "vt-fam-chip-word", text: chip.word });
          if (chip.zh) {
            const zh = el.createSpan({ cls: "vt-fam-chip-zh" });
            void MarkdownRenderer.render(this.plugin.app, chip.zh, zh, this.sourcePath, scope);
          }
          continue;
        }
        const busy = this.adding.has(`${f.id}\u0000${chip.word.toLowerCase()}`);
        const el = list.createEl("button", { cls: "vt-fam-chip is-suggested" });
        el.createSpan({ cls: "vt-fam-chip-word", text: chip.word });
        if (chip.zh) {
          const zh = el.createSpan({ cls: "vt-fam-chip-zh" });
          void MarkdownRenderer.render(this.plugin.app, chip.zh, zh, this.sourcePath, scope);
        }
        setIcon(el.createSpan({ cls: "vt-fam-chip-icon" }), busy ? "loader" : "plus");
        el.disabled = busy;
        el.setAttr("aria-label", t("learn.family.add", { word: chip.word }));
        el.addEventListener("click", () => void this.addSuggested(f.id, chip.word));
      }
    }

    const legend = this.root.createDiv({ cls: "vt-fam-legend" });
    const known = legend.createSpan({ cls: "vt-fam-legend-item" });
    known.createSpan({ cls: "vt-fam-chip is-known is-mini", text: t("learn.family.known") });
    known.createSpan({ text: t("learn.family.legend.known") });
    if (view.suggestedCount) {
      const sug = legend.createSpan({ cls: "vt-fam-legend-item" });
      setIcon(sug.createSpan({ cls: "vt-fam-chip is-suggested is-mini" }), "plus");
      sug.createSpan({ text: t("learn.family.legend.suggested") });
    }
    if (view.seeds.length) {
      legend.createSpan({ cls: "vt-fam-legend-item", text: t("learn.family.legend.seeds", { words: joinWords(view.seeds) }) });
    }
  }

  // ── Galaxy (星系模式, 09 §6.1/§6.2) ───────────────────────────────

  private galaxyLookup(lookup: MemberLookup): GalaxyLookup {
    return {
      entry: (m) => lookup.entry(m),
      emoji: (m, e) => (e ? this.plugin.emoji.emojiOf(e) : m.emoji || defaultEmoji("")),
      isKnown: (e) => this.plugin.families.isKnown(e),
    };
  }

  private renderGalaxySection(selected: Family, families: Family[], entry: VocabEntry | undefined, lookup: MemberLookup): void {
    const gxLookup = this.galaxyLookup(lookup);
    const shell = this.root.createDiv({ cls: "vt-gx-shell" });
    const bench = shell.createDiv({ cls: "vt-gx-bench" });

    const topicsEl = bench.createDiv({ cls: "vt-gx-topics" });
    for (const topic of buildTopics(families, gxLookup)) this.renderTopicButton(topicsEl, topic, topic.id === selected.id);

    const stage = bench.createDiv({ cls: "vt-gx-stage" });
    this.renderGalaxyToolbar(stage, selected, entry);
    const graphHost = stage.createDiv({ cls: "vt-gx-graph" });

    const detailParent = bench.createDiv({ cls: "vt-gx-detail-host" });

    const sameFamily = this.galaxyGraphFamilyId === selected.id && this.galaxyGraph && this.galaxySvgEl && this.galaxyDetailHost;
    if (sameFamily) {
      graphHost.appendChild(this.galaxySvgEl!);
      detailParent.appendChild(this.galaxyDetailHost!);
      const model = buildGalaxyModel(selected, gxLookup, { onlyKnown: this.onlyKnown, fresh: this.galaxyFresh });
      this.lastGalaxyModel = model;
      this.galaxyGraph!.setData(model, { recenter: false });
      if (this.galaxySelected) this.galaxyGraph!.select(this.galaxySelected);
      else this.renderGalaxyDetail(model);
      return;
    }

    // Different (or first) topic for this block instance: a fresh graph +
    // detail bound to the new elements (any previous instance was already
    // destroyed above, in render()).
    const svgEl = svgNode(graphHost, "svg", { role: "group", "aria-label": t("galaxy.graphAriaLabel", { topic: familyTitle(selected) }) }, "vt-gx-svg");
    this.galaxyDetail = new GalaxyDetail(detailParent);
    const mobile = document.body.hasClass("is-mobile");
    const graph = new GalaxyGraph(svgEl, {
      embedded: true,
      mobile,
      onSelect: (id) => {
        this.galaxySelected = id;
        if (this.lastGalaxyModel) this.renderGalaxyDetail(this.lastGalaxyModel);
      },
      onAdd: (id) => void this.galaxyAdd(selected.id, id),
    });
    this.galaxyGraph = graph;
    this.galaxySvgEl = svgEl;
    this.galaxyDetailHost = detailParent;
    this.galaxyGraphFamilyId = selected.id;

    const model = buildGalaxyModel(selected, gxLookup, { onlyKnown: this.onlyKnown, fresh: this.galaxyFresh });
    this.lastGalaxyModel = model;
    graph.setData(model, { recenter: true });
    if (this.galaxySelected) graph.select(this.galaxySelected);
    else this.renderGalaxyDetail(model);
  }

  private renderGalaxyDetail(model: GalaxyModel): void {
    const detail = this.galaxyDetail;
    if (!detail) return;
    const rows = detailRows(model);
    let card: GalaxyCardData | null = null;
    if (this.galaxySelected) {
      const entry = this.plugin.store.entries.find((e) => e.id === this.galaxySelected);
      if (entry) {
        const emoji = this.plugin.emoji.emojiOf(entry);
        const breakdown = this.plugin.learn.wordMeta(entry.id)?.breakdown;
        card = buildGalaxyCard(entry, emoji, breakdown);
      }
    }
    const detailModel: GalaxyDetailModel = { counts: model.counts, rows, selected: card };
    const actions: GalaxyDetailActions = {
      onSelectRow: (entryId) => this.galaxyGraph?.select(entryId),
      onCollapse: () => this.galaxyGraph?.select(null),
      onReview: (entryId) => {
        const e = this.plugin.store.entries.find((x) => x.id === entryId);
        if (e) this.plugin.reviewWord(e);
      },
      onOpenWordPage: (entryId) => void this.plugin.openWordPage(entryId),
      onOpenAi: (entryId) => void this.plugin.surfaces.openWordCard(entryId, "ai"),
    };
    detail.render(detailModel, actions);
  }

  private renderTopicButton(container: HTMLElement, topic: GalaxyTopic, active: boolean): void {
    const btn = container.createEl("button", { cls: "vt-gx-topic", attr: { type: "button" } });
    btn.setAttr("aria-pressed", String(active));
    btn.toggleClass("is-active", active);
    btn.createSpan({ cls: "vt-gx-topic-em", text: topic.emoji });
    const info = btn.createDiv({ cls: "vt-gx-topic-info" });
    info.createDiv({ cls: "vt-gx-topic-name", text: topic.topic });
    info.createDiv({ cls: "vt-gx-topic-zh", text: topic.label });
    const ct = btn.createDiv({ cls: "vt-gx-topic-ct" });
    ct.createSpan({ text: t("galaxy.topicCounts", { known: topic.known, unknown: topic.unknown }) });
    const svg = svgNode(ct, "svg", { viewBox: "0 0 74 30", "aria-hidden": "true" }, "vt-gx-topic-thumb");
    for (const p of topic.points) {
      svgNode(svg, "line", { x1: "37", y1: "15", x2: String(p.x), y2: String(p.y) }, "vt-gx-topic-line");
    }
    for (const p of topic.points) {
      svgNode(svg, "circle", { cx: String(p.x), cy: String(p.y), r: "3" }, p.known ? "vt-gx-topic-dot is-known" : "vt-gx-topic-dot");
    }
    svgNode(svg, "circle", { cx: "37", cy: "15", r: "4.5" }, "vt-gx-topic-hub");
    btn.addEventListener("click", () => {
      if (active) return;
      this.selectedId = topic.id;
      this.galaxySelected = null;
      this.focusEntryId = undefined;
      this.render();
    });
  }

  private renderGalaxyToolbar(stage: HTMLElement, selected: Family, entry: VocabEntry | undefined): void {
    const bar = stage.createDiv({ cls: "vt-gx-toolbar" });
    const expanding = this.galaxyExpandCtrl.has(selected.id);
    const aiBtn = bar.createEl("button", { cls: ["vt-gx-pill", "is-ai"], attr: { type: "button" }, text: expanding ? t("galaxy.stop") : t("galaxy.aiExpand", { label: selected.topic }) });
    aiBtn.disabled = !expanding && this.plugin.ai.status() !== "ready";
    aiBtn.addEventListener("click", () => this.toggleExpand(selected));

    const knownBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: t("galaxy.onlyKnown") });
    knownBtn.setAttr("aria-pressed", String(this.onlyKnown));
    knownBtn.toggleClass("is-active", this.onlyKnown);
    knownBtn.addEventListener("click", () => {
      this.onlyKnown = !this.onlyKnown;
      this.render();
    });

    const recenterBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: t("galaxy.recenter") });
    recenterBtn.addEventListener("click", () => this.galaxyGraph?.recenter());

    const expandFullBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: t("galaxy.expandFull") });
    expandFullBtn.addEventListener("click", () => {
      void this.plugin.app.workspace.getLeaf("tab").setViewState({
        type: GALAXY_VIEW_TYPE,
        active: true,
        state: { familyId: selected.id },
      });
    });

    this.renderModeSwitch(bar);

    const more = bar.createEl("button", { cls: "vt-gx-pill clickable-icon", attr: { type: "button", "aria-label": t("galaxy.more") } });
    setIcon(more, "more-horizontal");
    more.addEventListener("click", (e) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle(t(entry ? "learn.family.generate" : "learn.family.regroup"))
          .setIcon(entry ? "sparkles" : "refresh-cw")
          .onClick(() => void this.generate(!entry, entry))
      );
      menu.showAtMouseEvent(e);
    });
  }

  private toggleExpand(family: Family): void {
    const existing = this.galaxyExpandCtrl.get(family.id);
    if (existing) {
      this.plugin.families.stopExpand(family.id);
      return;
    }
    const ctrl = new AbortController();
    this.galaxyExpandCtrl.set(family.id, ctrl);
    this.render();
    this.plugin.families
      .expand(family.id, ctrl.signal)
      .then((added) => {
        if (this.disposed) return;
        if (!added.length) {
          new Notice(t("galaxy.noMoreSuggestions"));
          return;
        }
        if (this.onlyKnown) this.onlyKnown = false;
        for (const m of added) this.galaxyFresh.add(galaxyNodeId(m));
        new Notice(t("galaxy.expandFound", { n: added.length, words: joinWords(added.map((m) => m.word)) }));
      })
      .catch((e) => {
        if (this.disposed || isAbort(e)) return;
        console.error("Vocab Tracker: galaxy expand failed", e);
        new Notice(learnErrorText(e));
      })
      .finally(() => {
        this.galaxyExpandCtrl.delete(family.id);
        if (!this.disposed) this.render();
      });
  }

  private async galaxyAdd(familyId: string, nodeId: string): Promise<void> {
    const family = this.plugin.families.families().find((f) => f.id === familyId);
    const word = family && resolveAddWord(nodeId, family);
    if (!word) return;
    const key = `${familyId}\u0000${word.toLowerCase()}`;
    if (this.adding.has(key)) return;
    this.adding.add(key);
    try {
      const entry = await this.plugin.families.addSuggested(familyId, word);
      if (entry) {
        new Notice(t("galaxy.addedWord", { word: entry.word }));
        this.galaxySelected = entry.id;
        this.galaxyFresh.delete(nodeId);
      }
    } catch (e) {
      console.error("Vocab Tracker: adding a galaxy word failed", e);
      new Notice(learnErrorText(e));
    } finally {
      this.adding.delete(key);
      if (!this.disposed) this.render();
    }
  }

  private destroyGalaxyGraph(): void {
    this.galaxyGraph?.destroy();
    this.galaxyGraph = null;
    this.galaxyDetail = null;
    this.galaxySvgEl = null;
    this.galaxyDetailHost = null;
    this.galaxyGraphFamilyId = null;
    this.lastGalaxyModel = null;
  }
}

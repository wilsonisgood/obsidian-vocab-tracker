import { Component, MarkdownRenderChild, MarkdownRenderer, Menu, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import { defaultEmoji } from "../../core/model/wordMeta";
import type { FamilyCandidate } from "../../services/learn/FamilyService";
import { GalaxyGraph } from "../galaxy/GalaxyGraph";
import { buildGalaxyModel, galaxyNodeId, heartAction, heartState, type GalaxyLookup, type GalaxyModel } from "../galaxy/galaxyModel";
import { familiesPageGroups, familyGroupKey, familyIdOfGroupKey } from "../galaxy/familiesPage";
import { buildTopics, resolveAddWord, type GalaxyTopic, type GalaxyViewMode } from "../galaxy/galaxyView.model";
import type { PageContext, PageWord } from "../page/pageContext";
import { unlikeEntry } from "../word/likeAction";
import { actionNotice } from "../mobile/actionNotice";
import { galaxyFillHeight } from "../galaxy/galaxyHeight";
import { aiErrorBox } from "../kit/aiDebug";
import { datesText } from "../kit/dates";
import { dragScroll } from "../kit/dragScroll";
import { emptyState } from "../kit/emptyState";
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

// ── vocab-families code block (規劃書 06 §7.2, §9.6, 09 §6.2, 10 §2; 設計稿
// L5、W3、Galaxy) ──
//
//   ```vocab-families
//   topic: kitchenware      # family to open first (optional)
//   word: glittery          # word-page mode: only its families (optional)
//   ```
//
// Saved families draw as a force-graph 「星系」 by default (A1) — a topic
// row, a small toolbar (✨ 再一批／星系｜清單／重新置中／🔄 重新分群，一列
// 可左右拖，1009 #14：⋯ 選單拿掉，全攤平成第一層的 pill) and the graph,
// stacked vertically (1007-2 #4/#5; the old topic/graph/detail 3-col grid
// and GalaxyDetail panel are gone — #7). 「清單」 switches to the original
// tree (renderTree, below — unchanged). 「找字族」/「重新分群」 live directly
// in the galaxy toolbar now; everything about how a candidate gets saved (no
// review screen, 1005 回饋: 「審核清單沒什麼用處」) is unchanged either way.
//
// Opening 字族樹.md itself is a full-screen galaxy (#6, GalaxyView.ts +
// galaxyOpen.ts) that just embeds this same block (`opts.fullscreen`).
// Clicking an already-learned node opens the sidebar word card instead of
// a detail panel (#7/#10); the whole-tree block (not a word-page one) also
// publishes its topics/words to `plugin.pageContext` for the sidebar's
// 「本篇」 section (#8/#14).

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

export interface FamiliesBlockOpts {
  // 全畫面星系 (GalaxyView.ts, 1007-2 #6)：圖高 35vh 而不是 210px；
  // GalaxyGraph 也因此拿到 `embedded: false`，恢復可拖曳平移縮放 (1009
  // #12)。「開啟 Markdown 原始檔」已整個拿掉 (1009 #14)。
  fullscreen?: boolean;
}

// 1010 #G2 新字串（整合時搬進 i18n）。
const GALAXY_NOTICE_MS = 5000;

export class FamiliesBlock extends MarkdownRenderChild {
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
  // tree's chips and the galaxy's heart on a not-yet-in-library node (1009
  // #8: tapping an empty ♡ there adds-and-likes in one go).
  private adding = new Set<string>();
  // Each member's zh gloss is AI text, rendered as Markdown (1006 #22); a
  // fresh scope per tree render drops the previous one's listeners (same
  // lifecycle as trivia.ts's favorites list / verbs.ts's patterns).
  private markdownScope: Component | null = null;

  // ── Galaxy (09 §6.1/§6.2, A1/A3-A7, 10 §2 #4-#8) ────────────────
  // View mode is block-instance memory only (not persisted) — A1 defaults
  // every fresh block to 星系.
  private viewMode: GalaxyViewMode = "galaxy";
  // Selected node id (entryId, or `w:<word>` for a suggestion). #7: no more
  // detail panel — clicking a node (not its heart) opens the sidebar card
  // when it's in the library, or flashes it in the sidebar's 「本篇」 when
  // it's a plain suggestion (openSelectedKnownNode, 1009 #8); this field
  // otherwise just drives the visual selection ring and the
  // sidebar→page handoff (#14).
  private galaxySelected: string | null = null;
  private galaxyInitialized = false;
  private galaxyFresh = new Set<string>();
  private galaxyExpandCtrl = new Map<string, AbortController>();
  // Last families/lookup handed to publishPageContext — kept so
  // openSelectedKnownNode can re-publish with `focusWord` set (1009 #8)
  // without re-deriving them outside render().
  private pageContextFamilies: Family[] | null = null;
  private pageContextLookup: MemberLookup | null = null;
  // The live graph instance (and the family it belongs to) — kept across
  // re-renders of the *same* topic so an unrelated redraw (a background
  // wordMeta write, another word's like toggle…) never resets pan/zoom/node
  // positions. A topic switch or leaving galaxy mode tears it down and the
  // next render starts fresh.
  private galaxyGraph: GalaxyGraph | null = null;
  private galaxySvgEl: SVGSVGElement | null = null;
  private galaxyGraphFamilyId: string | null = null;
  private lastGalaxyModel: GalaxyModel | null = null;

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: FamiliesParams,
    private sourcePath: string,
    private opts: FamiliesBlockOpts = {}
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-families"] });
    if (this.opts.fullscreen) this.root.addClass("vt-gx-fullscreen");
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
    this.viewportObserver?.disconnect();
    if (this.generating) this.plugin.families.stop();
    for (const ctrl of this.galaxyExpandCtrl.values()) ctrl.abort();
    this.destroyGalaxyGraph();
    this.plugin.pageContext.clear(this);
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
    const keepGalaxy = this.viewMode === "galaxy" && !!this.galaxyGraph && !!this.galaxySvgEl;
    if (keepGalaxy) {
      this.galaxySvgEl!.remove();
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

    // Publish to the sidebar's 「本篇」 (1007-2 #8/#14) — whole-tree blocks
    // on 字族樹.md only; a word-page block (`params.word` set) or one in the
    // learner's own notes has no business owning the sidebar's page mode.
    if (!this.params.word && this.sourcePath === this.plugin.files.entryFilePath("families")) {
      this.publishPageContext(families, lookup);
    }

    if (families.length && this.viewMode === "list") this.renderToolbar(families, entry);

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

    // 主題列 (#4) — 一條橫列，超出往右拖；只留 emoji／英文／中文。
    const topicsEl = bench.createDiv({ cls: "vt-gx-topics" });
    this.register(dragScroll(topicsEl));
    for (const topic of buildTopics(families)) this.renderTopicButton(topicsEl, topic, topic.id === selected.id);

    const stage = bench.createDiv({ cls: "vt-gx-stage" });
    this.renderGalaxyToolbar(stage, selected, entry);
    const graphHost = stage.createDiv({ cls: "vt-gx-graph" });
    this.fitGalaxyHeight(graphHost);

    // #7：拿掉詳情卡 — 已學節點改成直接開側欄卡片 (openSelectedKnownNode)，
    // 所以這裡不再需要 detail host／GalaxyDetail 實例。
    const sameFamily = this.galaxyGraphFamilyId === selected.id && this.galaxyGraph && this.galaxySvgEl;
    if (sameFamily) {
      graphHost.appendChild(this.galaxySvgEl!);
      const model = buildGalaxyModel(selected, gxLookup, { onlyKnown: false, fresh: this.galaxyFresh });
      this.lastGalaxyModel = model;
      this.galaxyGraph!.setData(model, { recenter: false });
      if (this.galaxySelected) this.galaxyGraph!.select(this.galaxySelected, { silent: true });
      return;
    }

    // Different (or first) topic for this block instance: a fresh graph
    // bound to the new element (any previous instance was already
    // destroyed above, in render()).
    const svgEl = svgNode(graphHost, "svg", { role: "group", "aria-label": t("galaxy.graphAriaLabel", { topic: familyTitle(selected) }) }, "vt-gx-svg");
    const mobile = document.body.hasClass("is-mobile");
    // 全畫面 (字族樹.md) 不是 embedded — 恢復可拖曳平移縮放 (1009 #12)；嵌在
    // 筆記裡的 code block 才是 embedded（手機上放寬成單指拖節點／雙指平移縮
    // 放，見 GalaxyGraph/galaxyModel 的 zoomFilter）。
    const graph = new GalaxyGraph(svgEl, {
      embedded: !this.opts.fullscreen,
      mobile,
      onSelect: (id) => {
        this.galaxySelected = id;
        this.openSelectedKnownNode(id);
      },
      onToggleLike: (id) => void this.galaxyToggleLike(selected.id, id),
    });
    this.galaxyGraph = graph;
    this.galaxySvgEl = svgEl;
    this.galaxyGraphFamilyId = selected.id;

    const model = buildGalaxyModel(selected, gxLookup, { onlyKnown: false, fresh: this.galaxyFresh });
    this.lastGalaxyModel = model;
    graph.setData(model, { recenter: true });
    if (this.galaxySelected) graph.select(this.galaxySelected, { silent: true });
  }

  // 1010 #G1：嵌入時把窗戶高度撐到可視區底部（最少 400px）。用「捲到頂時」
  // 的位置算（scrollTop 加回去），捲動不會變；容器 resize 時重算。全畫面不套用。
  private fitGalaxyHeight(host: HTMLElement): void {
    if (this.opts.fullscreen) return;
    const scroller = (host.closest(".markdown-preview-view") ?? host.closest(".view-content")) as HTMLElement | null;
    let top: number;
    let bottom: number;
    if (scroller) {
      top = host.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      bottom = scroller.clientHeight;
    } else {
      top = host.getBoundingClientRect().top + window.scrollY;
      bottom = window.innerHeight;
    }
    const h = galaxyFillHeight(bottom - 16, top);
    host.style.height = `${h}px`;
    host.style.minHeight = `${h}px`;
    this.observeViewport(scroller);
  }

  private viewportObserver: ResizeObserver | null = null;
  private viewportEl: HTMLElement | null = null;
  private observeViewport(scroller: HTMLElement | null): void {
    const el = scroller ?? null;
    if (el === this.viewportEl && this.viewportObserver) return;
    this.viewportObserver?.disconnect();
    this.viewportEl = el;
    if (typeof ResizeObserver !== "function") return;
    const redo = () => {
      const host = this.root?.querySelector<HTMLElement>(".vt-gx-graph");
      if (host && !this.disposed) this.fitGalaxyHeight(host);
    };
    this.viewportObserver = new ResizeObserver(redo);
    if (el) this.viewportObserver.observe(el);
    else this.viewportObserver.observe(document.body);
  }

  // 點節點本身（不是點愛心）(1007-2 #7/#10, 1009 #8)：單字庫裡有的字（不論
  // 有沒有 like）展開側欄單字卡；建議字（不在庫）沒有卡可開，改成通知側欄
  // 「本篇」捲到那一列並閃一下。節點本身維持選取樣式（GalaxyGraph 自己管）。
  private openSelectedKnownNode(id: string | null): void {
    if (!id) return;
    const node = this.lastGalaxyModel?.nodes.find((n) => n.id === id);
    if (!node || node.kind === "hub" || node.kind === "group") return;
    if (node.inLibrary && node.entryId) {
      void this.plugin.surfaces.openWordCard(node.entryId, "data");
      return;
    }
    if (this.pageContextFamilies && this.pageContextLookup) {
      // Publish once without focusWord first so clicking the same suggested
      // node again still changes the sig and re-flashes the sidebar row.
      this.publishPageContext(this.pageContextFamilies, this.pageContextLookup);
      this.publishPageContext(this.pageContextFamilies, this.pageContextLookup, node.word.toLowerCase());
    }
  }

  // 節點右上角的愛心 (1009 #8)：不在庫 → 加入並 like；在庫沒 like → like；
  // 已 like → 取消 like（unlikeEntry，沒有考試標籤的字會被刪掉，可復原）。
  private async galaxyToggleLike(familyId: string, nodeId: string): Promise<void> {
    const node = this.lastGalaxyModel?.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const action = heartAction(heartState(node));
    if (action === "add") {
      const family = this.plugin.families.families().find((f) => f.id === familyId);
      const word = family && resolveAddWord(nodeId, family);
      if (!word) return;
      const key = `${familyId}\u0000${word.toLowerCase()}`;
      if (this.adding.has(key)) return;
      this.adding.add(key);
      try {
        const entry = await this.plugin.families.addSuggested(familyId, word);
        if (entry) {
          // 1010 #G2: node stays highlighted (render re-selects silently),
          // but the word card only opens when the notice is tapped.
          const entryId = entry.id;
          const openCard = () => void this.plugin.surfaces.openWordCard(entryId, "data");
          actionNotice(t("galaxy.addedWord", { word: entry.word }), [{ label: t("galaxy.openWord"), run: openCard }], GALAXY_NOTICE_MS, openCard);
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
      return;
    }
    if (!node.entryId) return;
    const entry = this.plugin.store.entries.find((e) => e.id === node.entryId);
    if (!entry) return;
    if (action === "like") void this.plugin.store.setLiked(entry, true);
    else unlikeEntry(this.plugin, entry, GALAXY_NOTICE_MS);
  }

  // #11：emoji 在左，右邊英文（上）／中文（下）兩行 — 兩個 span 包進一個直
  // 排的容器，CSS（vt-gx-topic-text）負責疊成兩行。
  private renderTopicButton(container: HTMLElement, topic: GalaxyTopic, active: boolean): void {
    const btn = container.createEl("button", { cls: "vt-gx-topic", attr: { type: "button" } });
    btn.setAttr("aria-pressed", String(active));
    btn.toggleClass("is-active", active);
    btn.createSpan({ cls: "vt-gx-topic-em", text: topic.emoji });
    const text = btn.createDiv({ cls: "vt-gx-topic-text" });
    text.createSpan({ cls: "vt-gx-topic-name", text: topic.topic });
    text.createSpan({ cls: "vt-gx-topic-zh", text: topic.label });
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
    this.register(dragScroll(bar));
    const expanding = this.galaxyExpandCtrl.has(selected.id);
    const aiBtn = bar.createEl("button", { cls: ["vt-gx-pill", "is-ai"], attr: { type: "button" }, text: expanding ? t("galaxy.stop") : t("galaxy.aiExpand") });
    aiBtn.disabled = !expanding && this.plugin.ai.status() !== "ready";
    aiBtn.addEventListener("click", () => this.toggleExpand(selected));

    this.renderModeSwitch(bar);

    const recenterBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: t("galaxy.recenter") });
    recenterBtn.addEventListener("click", () => this.galaxyGraph?.recenter());

    // #14：⋯ 選單整個拿掉，「重新分群」／「找字族」直接攤平成同一列的
    // pill（跟 renderToolbar 的清單模式按鈕一樣用 ai.status() 擋）；「開啟
    // Markdown 原始檔」整個刪掉（galaxyOpen 的 vtRaw 繞道留著不用管）。
    const ready = this.plugin.ai.status() === "ready";
    const regenBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: t(entry ? "learn.family.generate" : "learn.family.regroup") });
    regenBtn.disabled = !ready;
    if (!ready) regenBtn.title = t(this.plugin.ai.status() === "offline" ? "learn.ai.offline" : "learn.ai.body");
    regenBtn.addEventListener("click", () => void this.generate(!entry, entry));
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

  private destroyGalaxyGraph(): void {
    this.galaxyGraph?.destroy();
    this.galaxyGraph = null;
    this.galaxySvgEl = null;
    this.galaxyGraphFamilyId = null;
    this.lastGalaxyModel = null;
  }

  // ── 頁面 ↔ 側欄 (1007-2 #8/#10/#14, PageContextHub) ────────────────

  // focusWord (1009 #8): 星系點了一個建議字節點（不在單字庫，沒有卡可開）
  // 時由 openSelectedKnownNode 帶上，請側欄捲到那一列並閃一下；平常的
  // render() 重新 publish 不帶這個欄位。
  private publishPageContext(families: Family[], lookup: MemberLookup, focusWord?: string): void {
    this.pageContextFamilies = families;
    this.pageContextLookup = lookup;
    const gxLookup = this.galaxyLookup(lookup);
    const ctx: PageContext = {
      kind: "families",
      sourcePath: this.sourcePath,
      groups: familiesPageGroups(families, gxLookup),
      activeGroupKey: this.selectedId ? familyGroupKey(this.selectedId) : null,
      focusWord,
      selectWord: (groupKey, w) => this.selectWord(groupKey, w),
      addWord: (groupKey, w) => this.addWord(groupKey, w),
    };
    this.plugin.pageContext.publish(this, ctx);
  }

  // 側欄點「本篇」分類裡的字 (#14)：換到那個主題、星系選取並置中那個節點；
  // 清單模式只換主題＋highlight（跟「來源：字族樹…」的 focus 同一招）。
  private selectWord(groupKey: string, w: PageWord): void {
    this.selectedId = familyIdOfGroupKey(groupKey);
    if (this.viewMode === "list") {
      this.focusEntryId = w.entryId;
      this.render();
      return;
    }
    this.galaxySelected = w.entryId ?? null;
    this.focusEntryId = undefined;
    this.render();
    if (w.entryId) this.galaxyGraph?.focusNode(w.entryId);
  }

  // 側欄灰色建議字的 ＋ (#8)：加入並 like；addSuggested 已經處理「在庫沒
  // like → 只 like」，正常流程一定回傳 entry——查一次單字庫只是防呆。
  private async addWord(groupKey: string, w: PageWord): Promise<VocabEntry | undefined> {
    const familyId = familyIdOfGroupKey(groupKey);
    const entry = await this.plugin.families.addSuggested(familyId, w.word);
    if (entry) return entry;
    const k = w.word.trim().toLowerCase();
    return this.plugin.store.entries.find((e) => !e.deletedAt && e.word.trim().toLowerCase() === k);
  }
}

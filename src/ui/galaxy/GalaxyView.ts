import { ItemView, Notice, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { defaultEmoji } from "../../core/model/wordMeta";
import { MemberLookup } from "../blocks/familiesModel";
import { isAbort, learnErrorText } from "../blocks/learnUi";
import { GalaxyDetail, type GalaxyDetailActions, type GalaxyDetailModel } from "./GalaxyDetail";
import { GalaxyGraph } from "./GalaxyGraph";
import { buildGalaxyModel, galaxyNodeId, type GalaxyLookup, type GalaxyModel } from "./galaxyModel";
import { buildGalaxyCard, buildTopics, detailRows, L, resolveAddWord, type GalaxyCardData, type GalaxyTopic } from "./galaxyView.model";

// Full-screen Galaxy (規劃書 09 §6.1 「GalaxyView」, w9-rules.md「GB」) — the
// 「展開」 button in the embedded vocab-families block opens one of these
// (workspace.getLeaf("tab").setViewState) when a reading-view code block is
// too small, or the learner just wants more room. Same content as the
// embedded galaxy section (topic list → toolbar → graph｜detail), minus the
// 清單 toggle and the 找字族/重新分群 menu, which only make sense inside the
// note's own block.

const SVG_NS = "http://www.w3.org/2000/svg";

// Same reasoning as families.ts's svgNode(): Obsidian's `createSvg()`
// extension isn't polyfilled by this repo's fake-DOM test harness.
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

export const GALAXY_VIEW_TYPE = "vocab-galaxy-view";

export interface GalaxyViewState {
  familyId: string;
}

export class GalaxyView extends ItemView {
  private familyId: string;
  private onlyKnown = false;
  private selected: string | null = null;
  private fresh = new Set<string>();
  private adding = new Set<string>();
  private expandCtrl: AbortController | null = null;
  private graph: GalaxyGraph | null = null;
  private detail: GalaxyDetail | null = null;
  private lastModel: GalaxyModel | null = null;
  private disposed = false;

  constructor(leaf: WorkspaceLeaf, private plugin: VocabTrackerPlugin, familyId = "") {
    super(leaf);
    this.familyId = familyId;
  }

  getViewType(): string {
    return GALAXY_VIEW_TYPE;
  }

  getDisplayText(): string {
    const f = this.plugin.families.families().find((x) => x.id === this.familyId);
    return f ? `${f.topic} ${f.label}`.trim() : "Word Galaxy";
  }

  getIcon(): string {
    return "orbit";
  }

  getState(): Record<string, unknown> {
    return { familyId: this.familyId };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (state && typeof state === "object" && "familyId" in (state as Record<string, unknown>)) {
      this.familyId = String((state as Record<string, unknown>).familyId ?? "");
    }
    this.render();
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    await this.plugin.families.ensureLoaded();
    const redraw = () => {
      if (!this.disposed) this.render();
    };
    this.register(this.plugin.learn.events.on("family:upsert", redraw));
    this.register(this.plugin.learn.events.on("learn:reloaded", redraw));
    this.register(this.plugin.store.events.on("data:changed", redraw));
    this.render();
  }

  async onClose(): Promise<void> {
    this.disposed = true;
    this.expandCtrl?.abort();
    this.graph?.destroy();
    this.graph = null;
    this.detail = null;
  }

  // ── Render ────────────────────────────────────────────────────

  private lookup(): GalaxyLookup {
    const member = new MemberLookup(this.plugin.store.entries);
    return {
      entry: (m) => member.entry(m),
      emoji: (m, e) => (e ? this.plugin.emoji.emojiOf(e) : m.emoji || defaultEmoji("")),
      isKnown: (e) => this.plugin.families.isKnown(e),
    };
  }

  private render(): void {
    const container = this.contentEl;
    // The graph is always rebuilt here (a fresh ItemView content pass has
    // no persistent host elements to reattach, unlike the embedded block) —
    // see families.ts for why that one keeps its instance across redraws.
    this.graph?.destroy();
    this.graph = null;
    this.detail = null;
    container.empty();
    container.addClass("vt-gx-fullscreen");

    const families = this.plugin.families.families();
    const selected = families.find((f) => f.id === this.familyId);
    if (!selected) {
      container.createDiv({ cls: "vt-gx-empty", text: "找不到這個字族。" });
      return;
    }

    const lookup = this.lookup();
    const shell = container.createDiv({ cls: "vt-gx-shell" });
    const bench = shell.createDiv({ cls: "vt-gx-bench" });

    const topicsEl = bench.createDiv({ cls: "vt-gx-topics" });
    for (const topic of buildTopics(families, lookup)) this.renderTopicButton(topicsEl, topic, topic.id === selected.id);

    const stage = bench.createDiv({ cls: "vt-gx-stage" });
    this.renderToolbar(stage, selected);
    const graphHost = stage.createDiv({ cls: "vt-gx-graph" });
    const detailParent = bench.createDiv({ cls: "vt-gx-detail-host" });

    const svgEl = svgNode(graphHost, "svg", { role: "group", "aria-label": L.graphAriaLabel(selected.topic) }, "vt-gx-svg");
    this.detail = new GalaxyDetail(detailParent);
    const mobile = document.body.hasClass("is-mobile");
    const graph = new GalaxyGraph(svgEl, {
      embedded: false,
      mobile,
      onSelect: (id) => {
        this.selected = id;
        if (this.lastModel) this.renderDetail(this.lastModel);
      },
      onAdd: (id) => void this.add(selected.id, id),
    });
    this.graph = graph;

    const model = buildGalaxyModel(selected, lookup, { onlyKnown: this.onlyKnown, fresh: this.fresh });
    this.lastModel = model;
    graph.setData(model, { recenter: true });
    if (this.selected) graph.select(this.selected);
    else this.renderDetail(model);
  }

  private renderDetail(model: GalaxyModel): void {
    const detail = this.detail;
    if (!detail) return;
    const rows = detailRows(model);
    let card: GalaxyCardData | null = null;
    if (this.selected) {
      const entry = this.plugin.store.entries.find((e) => e.id === this.selected);
      if (entry) card = buildGalaxyCard(entry, this.plugin.emoji.emojiOf(entry), this.plugin.learn.wordMeta(entry.id)?.breakdown);
    }
    const detailModel: GalaxyDetailModel = { counts: model.counts, rows, selected: card };
    const actions: GalaxyDetailActions = {
      onSelectRow: (entryId) => this.graph?.select(entryId),
      onCollapse: () => this.graph?.select(null),
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
    ct.createSpan({ text: L.topicCounts(topic.known, topic.unknown) });
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
      this.familyId = topic.id;
      this.selected = null;
      this.render();
    });
  }

  private renderToolbar(stage: HTMLElement, selected: { id: string; topic: string }): void {
    const bar = stage.createDiv({ cls: "vt-gx-toolbar" });
    const expanding = !!this.expandCtrl;
    const aiBtn = bar.createEl("button", { cls: ["vt-gx-pill", "is-ai"], attr: { type: "button" }, text: expanding ? L.stop : L.aiExpand(selected.topic) });
    aiBtn.disabled = !expanding && this.plugin.ai.status() !== "ready";
    aiBtn.addEventListener("click", () => this.toggleExpand(selected.id));

    const knownBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: L.onlyKnown });
    knownBtn.setAttr("aria-pressed", String(this.onlyKnown));
    knownBtn.toggleClass("is-active", this.onlyKnown);
    knownBtn.addEventListener("click", () => {
      this.onlyKnown = !this.onlyKnown;
      this.render();
    });

    const recenterBtn = bar.createEl("button", { cls: "vt-gx-pill", attr: { type: "button" }, text: L.recenter });
    recenterBtn.addEventListener("click", () => this.graph?.recenter());
  }

  private toggleExpand(familyId: string): void {
    if (this.expandCtrl) {
      this.plugin.families.stopExpand(familyId);
      return;
    }
    const ctrl = new AbortController();
    this.expandCtrl = ctrl;
    this.render();
    this.plugin.families
      .expand(familyId, ctrl.signal)
      .then((added) => {
        if (this.disposed) return;
        if (!added.length) {
          new Notice(L.noMoreSuggestions);
          return;
        }
        if (this.onlyKnown) this.onlyKnown = false;
        for (const m of added) this.fresh.add(galaxyNodeId(m));
        new Notice(L.expandFound(added.map((m) => m.word)));
      })
      .catch((e) => {
        if (this.disposed || isAbort(e)) return;
        console.error("Vocab Tracker: galaxy expand failed", e);
        new Notice(learnErrorText(e));
      })
      .finally(() => {
        this.expandCtrl = null;
        if (!this.disposed) this.render();
      });
  }

  private async add(familyId: string, nodeId: string): Promise<void> {
    const family = this.plugin.families.families().find((f) => f.id === familyId);
    const word = family && resolveAddWord(nodeId, family);
    if (!word) return;
    const key = `${familyId}\u0000${word.toLowerCase()}`;
    if (this.adding.has(key)) return;
    this.adding.add(key);
    try {
      const entry = await this.plugin.families.addSuggested(familyId, word);
      if (entry) {
        new Notice(L.addedWord(entry.word));
        this.selected = entry.id;
        this.fresh.delete(nodeId);
      }
    } catch (e) {
      console.error("Vocab Tracker: adding a galaxy word failed", e);
      new Notice(learnErrorText(e));
    } finally {
      this.adding.delete(key);
      if (!this.disposed) this.render();
    }
  }
}

import { drag } from "d3-drag";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import type { Selection } from "d3-selection";
// Side-effect import: patches Selection.prototype.transition (used by
// recenter()'s zoom-identity animation). d3-transition exports a
// `transition()` factory too, but nothing here calls it directly — the
// selection method is what we need.
import "d3-transition";
import { zoom, zoomIdentity, zoomTransform } from "d3-zoom";
import type { ZoomBehavior } from "d3-zoom";

import type { GalaxyModel, GalaxyNode } from "./galaxyModel";
import { zoomFilter } from "./galaxyModel";

// d3-force mutates GalaxyNode in place (adds x/y/vx/vy/fx/fy) — see
// SimNode. Links start as plain {source,target} strings (GalaxyLink) and
// forceLink resolves them to SimNode references in place once bound.
interface SimNode extends GalaxyNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode>;

const HUB_R = 44;
const NODE_R = 31;
const GROUP_R = 18;
const RECENTER_MS = 350;
// ResizeObserver only re-lays-out on a width change bigger than this (決定
// 7) — avoids thrashing the simulation on every sub-pixel reflow.
const RESIZE_THRESHOLD = 40;

function radiusOf(d: GalaxyNode): number {
  return d.kind === "hub" ? HUB_R : d.kind === "group" ? GROUP_R : NODE_R;
}

function asNode(x: SimNode | string | number): SimNode {
  // By the time forceLink's distance accessor (or our own tick handler)
  // runs, d3-force has already resolved link.source/target from the id
  // string to the node object — see d3-force's ForceLink.initialize().
  return x as SimNode;
}

export interface GalaxyGraphOpts {
  // Rendered inside a reading-view code block vs. the full-screen
  // GalaxyView (A6). Gates zoomFilter and whether drag is attached at all.
  embedded: boolean;
  // body.is-mobile (A6): embedded+mobile is view-only, no pan/zoom/drag.
  mobile: boolean;
  onSelect(id: string | null): void;
  onAdd(id: string): void;
}

// Galaxy force graph (規劃書 09 §6.1, 決定 7-8). Pure d3 + SVG — takes a
// GalaxyModel (from galaxyModel.ts) and draws/animates it; doesn't touch
// obsidian or fetch data itself. See w9-rules.md for the constructor/method
// contract shared with the block that will eventually wire this up.
export class GalaxyGraph {
  private readonly svgEl: SVGSVGElement;
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly root: Selection<SVGGElement, unknown, null, undefined>;
  private readonly gLinks: Selection<SVGGElement, unknown, null, undefined>;
  private readonly gNodes: Selection<SVGGElement, unknown, null, undefined>;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  // Absent in environments without ResizeObserver (09 整合事項 GB 小修 —
  // this repo's fake-DOM smoke test, tests/metrics/noApiKey.test.ts,
  // exercises every non-AI block including vocab-families and has no
  // polyfill for it). Resize-triggered recenter() just doesn't happen
  // there; everything else about the graph still works.
  private readonly resizeObserver: ResizeObserver | null;
  private readonly reduceMotion: boolean;
  private readonly opts: GalaxyGraphOpts;

  private sim: Simulation<SimNode, SimLink> | null = null;
  private selected: string | null = null;
  private width = 600;
  private height = 470;
  // Last model drawn, so the parameterless recenter() (resize / "reset
  // view" button) can redraw with opts.recenter without the caller having
  // to keep a GalaxyModel around itself.
  private lastModel: GalaxyModel | null = null;

  constructor(svg: SVGSVGElement, opts: GalaxyGraphOpts) {
    this.svgEl = svg;
    this.opts = opts;
    this.reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.svg = select(svg);
    this.root = this.svg.append("g").attr("class", "vt-gx-root");
    this.gLinks = this.root.append("g").attr("class", "vt-gx-links");
    this.gNodes = this.root.append("g").attr("class", "vt-gx-nodes");

    // .is-pannable 關掉 svg{touch-action:none}（決定 7/A6）：mobile+embedded
    // 時瀏覽器該保留原生捲動，不要被 SVG 吃掉觸控事件。
    this.svg.classed("vt-gx-svg", true).classed("is-pannable", !(opts.mobile && opts.embedded));

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.6])
      // An explicit extent (09 整合事項 GB 小修): our <svg> never carries a
      // `viewBox` or SVG width/height attributes (it's sized by CSS), so
      // d3-zoom's own defaultExtent() would have to introspect
      // width.baseVal/viewBox.baseVal — which plain DOM (and this repo's
      // fake-DOM smoke test, tests/metrics/noApiKey.test.ts) doesn't give
      // it. measure() keeps width/height current.
      .extent(() => [
        [0, 0],
        [this.width, this.height],
      ])
      .filter((ev: Event) => zoomFilter(ev as unknown as { type: string; ctrlKey: boolean; metaKey: boolean; touches?: number; button?: number }, { embedded: opts.embedded, mobile: opts.mobile }))
      .on("zoom", (ev) => this.root.attr("transform", ev.transform.toString()));
    this.svg.call(this.zoomBehavior).on("dblclick.zoom", null);

    this.svg.on("click", (ev: MouseEvent) => {
      if (ev.target === svg) this.select(null);
    });

    this.resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            const w = svg.getBoundingClientRect().width;
            if (Math.abs(w - this.width) > RESIZE_THRESHOLD) this.recenter();
          })
        : null;
    this.resizeObserver?.observe(svg);
  }

  private measure(): void {
    const r = this.svgEl.getBoundingClientRect();
    this.width = r.width || this.width;
    this.height = r.height || this.height;
  }

  setData(model: GalaxyModel, opts?: { recenter?: boolean }): void {
    const recenter = opts?.recenter ?? false;
    this.lastModel = model;
    this.measure();

    const old = new Map<string, SimNode>((this.sim?.nodes() ?? []).map((n) => [n.id, n]));
    const nodes: SimNode[] = model.nodes.map((n) => {
      const node = { ...n } as SimNode;
      if (!recenter) {
        const prev = old.get(n.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
        }
      }
      return node;
    });
    const links: SimLink[] = model.links.map((l) => ({ source: l.source, target: l.target }));

    const hub = nodes.find((n) => n.kind === "hub");
    if (hub) {
      hub.fx = this.width / 2;
      hub.fy = this.height / 2 + 10;
    }

    if (this.sim) this.sim.stop();
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (asNode(l.target).kind === "known" ? 118 : 150))
          .strength(0.9),
      )
      .force("charge", forceManyBody().strength(-420))
      .force(
        "collide",
        forceCollide<SimNode>((d) => (d.kind === "hub" ? 62 : 46)),
      )
      .force("x", forceX<SimNode>(this.width / 2).strength(0.03))
      .force("y", forceY<SimNode>(this.height / 2).strength(0.05))
      .on("tick", () => this.tick());
    this.sim = sim;

    this.renderLinks(links);
    this.renderNodes(nodes);
    this.mark();

    if (this.reduceMotion) {
      // 決定 7：少動畫就同步把模擬跑完，畫一次最終佈局，不跑逐格動畫。
      sim.stop();
      sim.tick(300);
      this.tick();
    }

    if (recenter) {
      if (this.reduceMotion) {
        this.svg.call(this.zoomBehavior.transform, zoomIdentity);
      } else {
        this.svg.transition().duration(RECENTER_MS).call(this.zoomBehavior.transform, zoomIdentity);
      }
    }
  }

  private renderLinks(links: SimLink[]): void {
    const sel = this.gLinks.selectAll<SVGLineElement, SimLink>("line.vt-gx-link").data(links, (d) => {
      const t = d.target;
      return typeof t === "object" ? t.id : String(t);
    });
    sel.exit().remove();
    sel.enter().append("line").attr("class", "vt-gx-link");
  }

  private renderNodes(nodes: SimNode[]): void {
    const sel = this.gNodes.selectAll<SVGGElement, SimNode>("g.vt-gx-node").data(nodes, (d) => d.id);
    sel.exit().remove();

    const entered = sel
      .enter()
      .append("g")
      .attr("class", "vt-gx-node")
      .attr("tabindex", 0)
      .attr("role", "button");
    entered.append("circle").attr("class", "vt-gx-halo");
    entered.append("text").attr("class", "vt-gx-emo");
    entered.append("text").attr("class", "vt-gx-w");
    entered.append("text").attr("class", "vt-gx-z");
    const plus = entered
      .filter((d) => d.kind === "unknown")
      .append("g")
      .attr("class", "vt-gx-plus")
      .attr("tabindex", 0)
      .attr("role", "button");
    plus.append("circle").attr("r", 13);
    plus.append("text").text("+");

    const merged = entered.merge(sel);

    merged
      .on("click", (ev: MouseEvent, d) => {
        ev.stopPropagation();
        this.select(d.kind === "hub" ? null : d.id);
      })
      .on("keydown", (ev: KeyboardEvent, d) => {
        if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          this.select(d.kind === "hub" ? null : d.id);
        }
      });

    if (!(this.opts.mobile && this.opts.embedded)) {
      merged.call(
        drag<SVGGElement, SimNode>()
          .on("start", (ev, d) => {
            if (!ev.active) this.sim?.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) this.sim?.alphaTarget(0);
            if (d.kind !== "hub") {
              d.fx = null;
              d.fy = null;
            }
          }),
      );
    }

    const onAdd = this.opts.onAdd;
    this.gNodes.selectAll<SVGGElement, SimNode>("g.vt-gx-node").each(function (d) {
      const g = select(this);
      const r = radiusOf(d);
      g.select<SVGCircleElement>(".vt-gx-halo").attr("r", r);
      g.select<SVGTextElement>(".vt-gx-emo").text(d.emoji);
      g.select<SVGTextElement>(".vt-gx-w").attr("y", r + 17).text(d.word);
      g.select<SVGTextElement>(".vt-gx-z").attr("y", r + 32).text(d.zh);
      g.select<SVGGElement>(".vt-gx-plus")
        .attr("transform", `translate(${r * 0.74},${-r * 0.74})`)
        .attr("aria-label", `把 ${d.word} 加入單字庫`)
        .on("click", (ev: MouseEvent) => {
          ev.stopPropagation();
          onAdd(d.id);
        })
        .on("keydown", (ev: KeyboardEvent) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            ev.stopPropagation();
            onAdd(d.id);
          }
        });
    });
  }

  private mark(): void {
    this.gNodes
      .selectAll<SVGGElement, SimNode>("g.vt-gx-node")
      .attr("class", (d) => {
        const sel = this.selected === d.id && d.kind !== "hub" ? " vt-gx-sel" : "";
        const fresh = d.fresh ? " vt-gx-fresh" : "";
        return `vt-gx-node vt-gx-${d.kind}${fresh}${sel}`;
      })
      .attr("aria-label", (d) => d.ariaLabel);
  }

  private tick(): void {
    this.gLinks
      .selectAll<SVGLineElement, SimLink>("line.vt-gx-link")
      .attr("x1", (d) => asNode(d.source).x ?? 0)
      .attr("y1", (d) => asNode(d.source).y ?? 0)
      .attr("x2", (d) => asNode(d.target).x ?? 0)
      .attr("y2", (d) => asNode(d.target).y ?? 0);
    this.gNodes.selectAll<SVGGElement, SimNode>("g.vt-gx-node").attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  // Selects a node (null = clear, e.g. clicking the background). Selecting
  // an unknown word also moves focus to its ＋ button (原型 select()),
  // since that's the only action available on an unlearned node.
  select(id: string | null): void {
    this.selected = id;
    this.mark();
    this.opts.onSelect(id);
    if (id === null) return;
    const node = this.sim?.nodes().find((n) => n.id === id);
    if (node && node.kind === "unknown") {
      const plus = this.gNodes
        .selectAll<SVGGElement, SimNode>("g.vt-gx-node")
        .filter((n) => n.id === id)
        .select<SVGGElement>(".vt-gx-plus")
        .node();
      plus?.focus({ preventScroll: true });
    }
  }

  // Re-centers the current data (resize past the threshold, or a "reset
  // view" button) — resets node positions and animates the zoom transform
  // back to identity. A no-op before the first setData().
  recenter(): void {
    if (!this.lastModel) return;
    this.setData(this.lastModel, { recenter: true });
  }

  // Pans (keeping the current zoom scale) so the given node sits at the
  // view's center — side-bar → page handoff (1007-2 #14: 側欄點本篇分類裡
  // 的字，星系選取並置中那個節點). A no-op for an unknown id or before the
  // first setData(); d3-force assigns every node an initial x/y as soon as
  // forceSimulation(nodes) runs (setData, above), so this reads a position
  // that's always already set, even before the first tick.
  focusNode(id: string): void {
    const node = this.sim?.nodes().find((n) => n.id === id);
    if (!node || node.x === undefined || node.y === undefined) return;
    const current = zoomTransform(this.svgEl);
    const transform = zoomIdentity.translate(this.width / 2 - node.x * current.k, this.height / 2 - node.y * current.k).scale(current.k);
    if (this.reduceMotion) this.svg.call(this.zoomBehavior.transform, transform);
    else this.svg.transition().duration(RECENTER_MS).call(this.zoomBehavior.transform, transform);
  }

  destroy(): void {
    this.sim?.stop();
    this.sim = null;
    this.resizeObserver?.disconnect();
  }
}

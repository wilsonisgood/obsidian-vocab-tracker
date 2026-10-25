import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { parseRadarSource, radarLayout, type RadarAxis } from "../../core/learner/radar";

const NS = "http://www.w3.org/2000/svg";

function svgEl(parent: Element, tag: string, attrs: Record<string, string | number>, cls?: string): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (cls) el.setAttribute("class", cls);
  parent.appendChild(el);
  return el as SVGElement;
}

export function drawRadar(host: HTMLElement, axes: readonly RadarAxis[]): void {
  const box = host.createDiv({ cls: "vt-report-radar" });
  const L = radarLayout(axes);
  const svg = svgEl(box, "svg", { viewBox: `0 0 ${L.size} ${L.size}`, role: "img", "aria-label": axes.map((a) => a.name).join("、") }, "vt-radar-svg");
  for (const ring of L.rings) svgEl(svg, "polygon", { points: ring }, "vt-radar-ring");
  L.spokes.forEach((s, i) => svgEl(svg, "line", { x1: L.cx, y1: L.cy, x2: s.x, y2: s.y }, axes[i].clear ? "vt-radar-spoke" : "vt-radar-spoke is-unclear"));
  svgEl(svg, "polygon", { points: L.polygon }, "vt-radar-area");
  L.vertices.forEach((v) => v.clear && svgEl(svg, "circle", { cx: v.x, cy: v.y, r: 2.5 }, "vt-radar-dot"));
  for (const l of L.labels) {
    const text = svgEl(svg, "text", { x: l.x, y: l.y, "text-anchor": l.anchor }, l.clear ? "vt-radar-label" : "vt-radar-label is-unclear");
    text.textContent = l.text;
  }
  const hints = axes.filter((a) => !a.clear && a.hint);
  if (hints.length) {
    const list = box.createDiv({ cls: "vt-radar-hints" });
    for (const a of hints) list.createDiv({ text: `${a.name}？${a.hint}` });
  }
}

// ```vocab-report-radar\n{"axes":[{"name":"文法","value":0.8,"clear":true}]}\n```
export function renderReportRadar(_plugin: VocabTrackerPlugin, source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
  const axes = parseRadarSource(source);
  if (!axes) {
    el.createDiv({ cls: "vt-radar-bad", text: t("report.radar.bad") });
    return;
  }
  drawRadar(el, axes);
}

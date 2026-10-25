import type { MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { parseTiersSource, tierSegments, type TierCount, type TierKey } from "../../core/learner/vocabTiers";

// ```vocab-report-tiers\n{"asked":{"A1":1,…},"mature":{…}}\n```
// Two stacked proportion bars: A1 → C2 light to dark in the accent colour;
// "?" (no level known) is grey. Hover shows "B1 · 6 字"; a tap does too.

const TIER_ALPHA: Record<TierKey, number> = { A1: 0.22, A2: 0.38, B1: 0.54, B2: 0.7, C1: 0.85, C2: 1, "?": 0 };
const TIER_ORDER: readonly TierKey[] = ["A1", "A2", "B1", "B2", "C1", "C2", "?"];

function paint(el: HTMLElement, tier: TierKey): void {
  if (tier === "?") el.addClass("is-unknown");
  else el.style.setProperty("--vt-tier-alpha", `${Math.round(TIER_ALPHA[tier] * 100)}%`);
}

function bar(host: HTMLElement, label: string, counts: TierCount, tip: HTMLElement): void {
  const segs = tierSegments(counts);
  if (!segs.length) return;
  const row = host.createDiv({ cls: "vt-tiers-row" });
  row.createDiv({ cls: "vt-tiers-label", text: label });
  const track = row.createDiv({ cls: "vt-tiers-bar" });
  for (const s of segs) {
    const text = t("report.tiers.tip", { tier: s.tier === "?" ? t("report.tiers.unknown") : s.tier, n: s.count });
    const seg = track.createDiv({ cls: "vt-tiers-seg", attr: { title: text, "aria-label": text } });
    seg.style.width = `${s.percent}%`;
    paint(seg, s.tier);
    // Touch has no hover: a tap writes the same text under the bars.
    seg.addEventListener("click", () => tip.setText(text));
  }
}

export function renderReportTiers(_plugin: VocabTrackerPlugin, source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
  const bars = parseTiersSource(source);
  if (!bars) {
    el.createDiv({ cls: "vt-radar-bad", text: t("report.tiers.bad") });
    return;
  }
  const host = el.createDiv({ cls: "vt-report-tiers" });
  const barsBox = host.createDiv({ cls: "vt-tiers-bars" });
  const tip = host.createDiv({ cls: "vt-tiers-tip" });
  bar(barsBox, t("report.tiers.asked"), bars.asked, tip);
  bar(barsBox, t("report.tiers.mature"), bars.mature, tip);
  const legend = host.createDiv({ cls: "vt-tiers-legend" });
  const used = TIER_ORDER.filter((k) => bars.asked[k] > 0 || bars.mature[k] > 0);
  for (const k of used) {
    const item = legend.createSpan({ cls: "vt-tiers-key" });
    const dot = item.createSpan({ cls: "vt-tiers-dot" });
    paint(dot, k);
    item.createSpan({ text: k === "?" ? t("report.tiers.unknown") : k });
  }
}

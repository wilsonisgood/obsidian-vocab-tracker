import { MarkdownRenderChild, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { analyzeAsk, analyzeButtonKey, analyzeNoticeKey, parseAnalyzeKey, reviewNoticeKey } from "./reportCardState";

// ReportService, as far as these buttons need it.
export interface ReportAnalyzeHost {
  pathOf(key: string): string;
  isAnalyzing(key: string): boolean;
  onChange(cb: () => void): () => void;
  analyze(key: string, opts?: { withPrevious?: boolean }): Promise<"written" | "busy" | "missing" | "no-ai" | "failed">;
  pendingAnalysis(key: string): string[];
  review(scope: "month" | "quarter"): Promise<{ result: "written" | "busy" | "empty" | "no-ai" | "failed"; path?: string }>;
}

// The three buttons shared by the report note's block and the dashboard
// card: 詳細分析 (→ 重新分析 once `analyzed` is in the frontmatter),
// 回顧這個月, 回顧這一季.
export function drawAnalyzeButtons(plugin: VocabTrackerPlugin, svc: ReportAnalyzeHost, host: HTMLElement, key: string, redraw: () => void): void {
  const file = plugin.app.vault.getAbstractFileByPath(svc.pathOf(key));
  const fm = file ? plugin.app.metadataCache.getCache(file.path)?.frontmatter : undefined;
  const analyzing = svc.isAnalyzing(key);
  const row = host.createDiv({ cls: "vt-report-analyze" });

  const run = row.createEl("button", { cls: "vt-dash-report-btn", text: t(analyzeButtonKey(analyzing, !!fm?.analyzed)) });
  run.disabled = analyzing;
  const start = (opts?: { withPrevious?: boolean }) => {
    run.disabled = true;
    run.setText(t("report.analyze.running"));
    host.querySelector(".vt-report-analyze-ask")?.remove();
    void svc.analyze(key, opts).then((r) => {
      new Notice(t(analyzeNoticeKey(r), { key }));
      redraw();
    });
  };
  run.onclick = () => {
    // Earlier weeks nobody analysed: ask first (a line under the buttons, no modal).
    const ask = analyzeAsk(svc.pendingAnalysis(key));
    if (!ask) return start();
    host.querySelector(".vt-report-analyze-ask")?.remove();
    const box = host.createDiv({ cls: "vt-report-analyze-ask" });
    box.createDiv({ cls: "vt-report-analyze-ask-text", text: t("report.analyze.pending", { weeks: ask.weeks }) });
    const only = box.createEl("button", { cls: "vt-dash-report-btn", text: t("report.analyze.onlyThis") });
    only.onclick = () => start({ withPrevious: false });
    const both = box.createEl("button", { cls: "vt-dash-report-btn mod-cta", text: t("report.analyze.withPrev", { n: String(ask.n) }) });
    both.onclick = () => start({ withPrevious: true });
  };

  for (const scope of ["month", "quarter"] as const) {
    const b = row.createEl("button", { cls: "vt-dash-report-btn", text: t(scope === "month" ? "report.review.month" : "report.review.quarter") });
    b.onclick = () => {
      b.disabled = true;
      b.setText(t("report.analyze.running"));
      void svc.review(scope).then((r) => {
        new Notice(t(reviewNoticeKey(r.result), { path: r.path ?? "" }));
        if (r.result === "written" && r.path) void plugin.app.workspace.openLinkText(r.path, "", false);
        redraw();
      });
    };
  }
}

// ```vocab-report-analyze\nkey: 2026-W43\n``` — written at the end of every
// weekly report note.
export function renderReportAnalyze(plugin: VocabTrackerPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const svc: ReportAnalyzeHost | undefined = plugin.report;
  if (!svc) return;
  const key = parseAnalyzeKey(source);
  const box = el.createDiv({ cls: "vt-report-analyze-block" });
  if (!key) {
    box.createDiv({ cls: "vt-dash-report-reason", text: t("report.analyze.badKey") });
    return;
  }
  const child = new MarkdownRenderChild(box);
  ctx.addChild(child);
  let alive = true;
  child.register(() => (alive = false));
  const draw = () => {
    if (!alive) return;
    box.empty();
    drawAnalyzeButtons(plugin, svc, box, key, draw);
  };
  draw();
  child.register(svc.onChange(draw));
  // The frontmatter `analyzed` shows up once the metadata cache catches up.
  child.registerEvent(plugin.app.metadataCache.on("changed", (f) => f.path === svc.pathOf(key) && draw()));
}

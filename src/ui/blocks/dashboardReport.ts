import { MarkdownRenderChild, Notice, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { previousWeek } from "../../core/learner/period";
import type { CefrLevel } from "../../core/model/settings";
import { drawAnalyzeButtons, type ReportAnalyzeHost } from "./reportAnalyze";
import { applyLevelOffer, reasonKey, writeButtonKey, type ReportCardLatest, type ReportStatus } from "./reportCardState";

// ReportService, as far as this card needs it.
export interface ReportCardHost extends ReportAnalyzeHost {
  status(): ReportStatus;
  onChange(cb: () => void): () => void;
  today(): string;
  pathOf(key: string): string;
  write(key: string, opts?: { overwrite?: boolean }): Promise<"written" | "exists" | "busy" | "empty" | "failed">;
  latest(): Promise<ReportCardLatest | null>;
}

// 「學習報告」卡片 (第二十波): the newest report (key link + headline), plus
// 產生上週報告 and, when the report suggests it, 把程度改成 X.
export function renderReportCard(plugin: VocabTrackerPlugin, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const svc: ReportCardHost | undefined = plugin.report;
  // A test harness without the service: no card.
  if (!svc) return;
  const card = el.createDiv({ cls: "vt-dash-report" });
  const child = new MarkdownRenderChild(card);
  ctx.addChild(child);
  let alive = true;
  child.register(() => (alive = false));

  const draw = async () => {
    const latest = await svc.latest();
    if (!alive) return;
    card.empty();
    card.createDiv({ cls: "vt-dash-report-title", text: t("dashboard.report.title") });
    const status = svc.status();
    if (latest) {
      const link = card.createEl("a", { cls: "vt-dash-report-link", text: latest.key });
      link.onclick = (ev) => {
        ev.preventDefault();
        void plugin.app.workspace.openLinkText(latest.path, "", false);
      };
      card.createDiv({ cls: "vt-dash-report-line", text: latest.headline });
    } else {
      card.createDiv({ cls: "vt-dash-report-line", text: t("dashboard.report.none") });
    }
    const reason = reasonKey(status);
    if (reason) card.createDiv({ cls: "vt-dash-report-reason", text: t(reason) });

    const key = previousWeek(svc.today()).key;
    const exists = plugin.app.vault.getAbstractFileByPath(svc.pathOf(key)) !== null;
    const btn = card.createEl("button", { cls: "vt-dash-report-btn", text: t(writeButtonKey(status, exists)) });
    btn.disabled = status === "writing";
    btn.onclick = () => {
      void svc.write(key, { overwrite: exists }).then((r) => {
        if (r === "written") new Notice(t("dashboard.report.written", { key }));
        else if (r === "empty") new Notice(t("dashboard.report.empty"));
      });
    };

    if (latest) drawAnalyzeButtons(plugin, svc, card, latest.key, () => void draw());

    const level = applyLevelOffer(latest, plugin.store.settings.learner.level);
    if (level) {
      const apply = card.createEl("button", { cls: "vt-dash-report-btn", text: t("dashboard.report.applyLevel", { level }) });
      apply.onclick = () => {
        void plugin.store
          .updateSettings((s) => {
            s.learner.level = level as CefrLevel;
          })
          .then(() => {
            new Notice(t("dashboard.report.levelApplied", { level }));
            void draw();
          });
      };
    }
  };

  void draw();
  child.register(svc.onChange(() => void draw()));
}

import type { CefrLevel } from "../../core/model/settings";
import type { I18nKey } from "../../core/i18n";

// Pure state of the dashboard 學習報告 card (第二十波), kept out of the
// obsidian-bound renderer so it can be unit-tested.
export type ReportStatus = "idle" | "writing" | "off" | "failed";

export interface ReportCardLatest {
  key: string;
  path: string;
  verdict: "up" | "keep" | "down" | "insufficient";
  suggestedLevel?: CefrLevel;
  headline: string;
}

// The 「把程度改成 X」 button: only for an up/down verdict that names a level
// different from the learner's current one.
export function applyLevelOffer(latest: ReportCardLatest | null, currentLevel: CefrLevel | ""): CefrLevel | null {
  if (!latest || !latest.suggestedLevel) return null;
  if (latest.verdict !== "up" && latest.verdict !== "down") return null;
  return latest.suggestedLevel === currentLevel ? null : latest.suggestedLevel;
}

export function writeButtonKey(status: ReportStatus, existsLastWeek: boolean): I18nKey {
  if (status === "writing") return "dashboard.report.writing";
  return existsLastWeek ? "dashboard.report.rewrite" : "dashboard.report.write";
}

export function reasonKey(status: ReportStatus): I18nKey | null {
  return status === "off" ? "dashboard.report.off" : status === "failed" ? "dashboard.report.failed" : null;
}

// ── 詳細分析／回顧 buttons (第二十一波 R4) ──

// The `vocab-report-analyze` block body: `key: 2026-W43`.
export function parseAnalyzeKey(source: string): string | null {
  for (const raw of source.split(/\r?\n/)) {
    const m = /^\s*key\s*:\s*(\d{4}-W\d{1,2})\s*$/i.exec(raw);
    if (m) return m[1].replace(/-W(\d)$/, "-W0$1");
  }
  return null;
}

export function analyzeButtonKey(analyzing: boolean, analyzed: boolean): I18nKey {
  if (analyzing) return "report.analyze.running";
  return analyzed ? "report.analyze.rerun" : "report.analyze.run";
}

export function analyzeNoticeKey(result: "written" | "busy" | "missing" | "no-ai" | "failed"): I18nKey {
  switch (result) {
    case "written":
      return "report.analyze.done";
    case "busy":
      return "report.analyze.busy";
    case "missing":
      return "report.analyze.missing";
    case "no-ai":
      return "report.analyze.noAi";
    default:
      return "report.analyze.failed";
  }
}

export function reviewNoticeKey(result: "written" | "busy" | "empty" | "no-ai" | "failed"): I18nKey {
  switch (result) {
    case "written":
      return "report.review.done";
    case "busy":
      return "report.analyze.busy";
    case "empty":
      return "report.review.empty";
    case "no-ai":
      return "report.analyze.noAi";
    default:
      return "report.analyze.failed";
  }
}

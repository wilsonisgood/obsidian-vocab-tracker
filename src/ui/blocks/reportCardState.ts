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

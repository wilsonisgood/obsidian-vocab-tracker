import { getLocale, t, type I18nKey } from "../../core/i18n";
import { isMastered, mistakeGroups, objectiveStats, startDifficulty, type MistakeGroup } from "../../core/grammar/progress";
import { topicById } from "../../core/grammar/catalog";
import type {
  ErrorTag,
  GrammarAttempt,
  GrammarQuestion,
  GrammarStage,
  GrammarTopic,
  GrammarTopicStatus,
} from "../../core/model/grammar";
import type { CefrLevel } from "../../core/model/settings";
import { errorTagLabel } from "../grammar/labels";
import { parseBlockParams } from "./params";

// View-models for the vocab-grammar map and topic blocks (第十五波 M, 1013
// §3.1/§3.2). Pure — no "obsidian" import — so it's unit-tested. The
// strings are in core/i18n (grammar.map.*, grammar.topic.*); stage and
// error-tag names come from ui/grammar/labels.ts.

// ── Stages ───────────────────────────────────────────────────────

export const STAGES: readonly GrammarStage[] = [1, 2, 3];

// Rule 3: 1–3 基礎, 4–6 中級, 7–9 進階.
export function stageOfDifficulty(difficulty: number): GrammarStage {
  return difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 1;
}

// The stage the map opens on: where the learner's CEFR level starts.
export function defaultStage(level: CefrLevel | ""): GrammarStage {
  return stageOfDifficulty(startDifficulty(level));
}

export interface MapParams {
  stage?: GrammarStage;
}

// ```vocab-grammar\nstage: 2\n```: opens on that stage (1–3, or 基礎／中級／進階).
export function parseMapParams(source: string): MapParams {
  const raw = (parseBlockParams(source).stage ?? "").trim().toLowerCase();
  if (!raw) return {};
  const byName: Record<string, GrammarStage> = {
    基礎: 1, basic: 1, 中級: 2, intermediate: 2, 進階: 3, advanced: 3,
  };
  const n = byName[raw] ?? Number(raw);
  return n === 1 || n === 2 || n === 3 ? { stage: n } : {};
}

// ── Map rows ─────────────────────────────────────────────────────

export interface MapRow {
  topic: GrammarTopic;
  status: GrammarTopicStatus;
  // 「已掌握」, 「學習中 2/3」…
  statusText: string;
  // Prerequisites the learner hasn't started (only for a topic of their own
  // that's still new). A hint — the row stays clickable (1013 §3.1).
  lockedBy: GrammarTopic[];
}

export function statusLabel(status: GrammarTopicStatus): string {
  return t(`grammar.map.status.${status}` as I18nKey);
}

// Objectives that reached mastery / all objectives, for 「學習中 2/3」.
export function objectivesReached(topic: GrammarTopic, attempts: readonly GrammarAttempt[]): { reached: number; total: number } {
  const stats = objectiveStats(topic, attempts);
  return { reached: stats.filter((s) => isMastered([s])).length, total: stats.length };
}

export function mapRows(
  stage: GrammarStage,
  topics: readonly GrammarTopic[],
  statusOf: (topicId: string) => GrammarTopicStatus,
  attempts: readonly GrammarAttempt[]
): MapRow[] {
  return topics
    .filter((t) => t.stage === stage)
    .sort((a, b) => a.order - b.order)
    .map((topic) => {
      const status = statusOf(topic.id);
      let statusText = statusLabel(status);
      if (status === "learning") {
        const { reached, total } = objectivesReached(topic, attempts);
        statusText = `${statusText} ${reached}/${total}`;
      }
      const lockedBy =
        status === "new"
          ? topic.prerequisites
              .map((id) => topicById(id))
              .filter((p): p is GrammarTopic => !!p && statusOf(p.id) === "new")
          : [];
      return { topic, status, statusText, lockedBy };
    });
}

export function lockedTooltip(lockedBy: readonly GrammarTopic[]): string {
  return t("grammar.map.locked", { list: lockedBy.map((t) => t.title).join(getLocale() === "zh-TW" ? "、" : ", ") });
}

// ── Mistakes ─────────────────────────────────────────────────────

export interface MistakeEntry {
  errorTag: ErrorTag;
  label: string;
  count: number;
  // The topic with most of the group's questions: where 「重做這組」 goes
  // (first version; P's practice block takes `mode: mistakes` later).
  topicId: string;
}

// Most questions in the group win; a tie goes to the topic of the newest
// mistake (groups list newest first).
export function topicOfGroup(group: MistakeGroup): string {
  const counts = new Map<string, number>();
  for (const { question } of group.items) counts.set(question.topicId, (counts.get(question.topicId) ?? 0) + 1);
  let best = group.items[0]?.question.topicId ?? "";
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  return best;
}

export function mistakeEntries(questions: readonly GrammarQuestion[], attempts: readonly GrammarAttempt[]): MistakeEntry[] {
  return mistakeGroups(questions, attempts).map((g) => ({
    errorTag: g.errorTag,
    label: errorTagLabel(g.errorTag),
    count: g.items.length,
    topicId: topicOfGroup(g),
  }));
}

export function mistakeTotal(entries: readonly MistakeEntry[]): number {
  return entries.reduce((n, e) => n + e.count, 0);
}

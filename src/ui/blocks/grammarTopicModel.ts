import { t, type I18nKey } from "../../core/i18n";
import { topicById } from "../../core/grammar/catalog";
import { isMastered, objectiveStats } from "../../core/grammar/progress";
import type { GrammarAttempt, GrammarSighting, GrammarTopic } from "../../core/model/grammar";
import { isGrammarPageError, type GrammarPageErrorCode } from "../../services/grammar/topicPage";
import { stageLabel } from "../grammar/labels";
import { parseBlockParams } from "./params";

// View-models for the vocab-grammar-topic block (第十五波 M, 1013 §3.2).
// Pure — see grammarMapModel.ts.

export interface TopicParams {
  id?: string;
}

// ```vocab-grammar-topic\nid: present-perfect-vs-past\n```
export function parseTopicParams(source: string): TopicParams {
  const p = parseBlockParams(source);
  const id = (p.id ?? p.topic ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return id ? { id } : {};
}

// 「基礎 · 難度 2」.
export function topicMeta(topic: GrammarTopic): { stage: string; difficulty: string } {
  return { stage: stageLabel(topic.stage), difficulty: t("grammar.topic.difficulty", { n: topic.difficulty }) };
}

// ── Objectives ───────────────────────────────────────────────────

export type ObjectiveState = "none" | "partial" | "done";

export interface ObjectiveRow {
  id: string;
  text: string;
  state: ObjectiveState;
  // 「4/6」 (correct/answered), or 「–」 before the first answer.
  score: string;
}

export function objectiveRows(topic: GrammarTopic, attempts: readonly GrammarAttempt[]): ObjectiveRow[] {
  const stats = objectiveStats(topic, attempts);
  return topic.objectives.map((o) => {
    const s = stats.find((x) => x.objectiveId === o.id);
    const answered = s?.answered ?? 0;
    const state: ObjectiveState = !s || answered === 0 ? "none" : isMastered([s]) ? "done" : "partial";
    return { id: o.id, text: o.text, state, score: answered ? `${s?.correct ?? 0}/${answered}` : "–" };
  });
}

// ── Sightings ────────────────────────────────────────────────────

export const SIGHTING_LIMIT = 5;
export const SNAPSHOT_CHARS = 120;

// The paragraph as one line: line breaks folded, a trailing ^block-id gone,
// cut at `max` characters.
export function clipSnapshot(text: string, max = SNAPSHOT_CHARS): string {
  const flat = text.replace(/\s+/g, " ").replace(/\s*\^[\w-]+$/, "").trim();
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max).join("").trimEnd()}…` : flat;
}

// 「eng/A Wrinkle in Time.md」 → 「A Wrinkle in Time」.
export function noteName(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.md$/i, "");
}

export interface SightingRow {
  key: string;
  path: string;
  note: string;
  snapshot: string;
}

// The newest sightings of one topic (the input is already newest first).
export function sightingRows(sightings: readonly GrammarSighting[], topicId: string, limit = SIGHTING_LIMIT): SightingRow[] {
  return sightings
    .filter((s) => s.topicId === topicId)
    .slice(0, limit)
    .map((s) => ({ key: `${s.threadId}:${s.turnId}`, path: s.path, note: noteName(s.path), snapshot: clipSnapshot(s.snapshot) }));
}

// ── Related topics ───────────────────────────────────────────────

export type ChipKind = "prerequisite" | "related";

export interface TopicChip {
  topic: GrammarTopic;
  kind: ChipKind;
  label: string;
}

// Prerequisites first, then related; a topic listed in both appears once
// (as a prerequisite); ids the catalog doesn't know are dropped.
export function topicChips(topic: GrammarTopic): TopicChip[] {
  const out: TopicChip[] = [];
  const seen = new Set<string>([topic.id]);
  const add = (ids: readonly string[], kind: ChipKind) => {
    for (const id of ids) {
      const found = topicById(id);
      if (!found || seen.has(id)) continue;
      seen.add(id);
      out.push({ topic: found, kind, label: t(kind === "prerequisite" ? "grammar.topic.kind.prerequisite" : "grammar.topic.kind.related") });
    }
  };
  add(topic.prerequisites, "prerequisite");
  add(topic.related, "related");
  return out;
}

// ── Explanation errors ───────────────────────────────────────────

const PAGE_ERROR_KEY = {
  "not-empty": "grammar.topic.err.notEmpty",
  "no-section": "grammar.topic.err.noSection",
  "empty-text": "grammar.topic.err.empty",
} as const satisfies Record<GrammarPageErrorCode, I18nKey>;

// What the page says when writing the explanation failed; null for an error
// that isn't GrammarPages' own (the AI's, shown with the shared wording).
export function pageErrorText(e: unknown): string | null {
  return isGrammarPageError(e) ? t(PAGE_ERROR_KEY[e.code]) : null;
}

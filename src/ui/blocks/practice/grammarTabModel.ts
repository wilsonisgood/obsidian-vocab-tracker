import { joinWords, t as tr, type I18nKey } from "../../../core/i18n";
import { GRAMMAR_TOPICS, topicById } from "../../../core/grammar/catalog";
import type { ErrorTag, GrammarStage } from "../../../core/model/grammar";
import type { CefrLevel } from "../../../core/model/settings";
import { errorTagLabel, stageLabel } from "../../grammar/labels";
import {
  parseGrammarFilter,
  type GrammarFilter,
  type GrammarQuestionLike,
} from "../../grammar/practiceTypes";
import { defaultStage, STAGES } from "../grammarMapModel";
import { selectedLabels, type FilterGroup, type FilterValue, type QuickPick } from "./filterBarModel";
import type { PlayerQuestion } from "./playerTypes";

// Pure logic of the 文法 practice tab (第十六波 H): the filter bar's value
// ⇄ GrammarFilter, quick picks, GrammarQuestion → PlayerQuestion, and the
// mistake groups. No DOM, so it's unit-tested.

export const SIGHTING_DAYS = 7;
export const REFILL_THRESHOLD = 4;

// ── Filter ⇄ chip value ─────────────────────────────────────────

export function filterToValue(f: GrammarFilter): FilterValue {
  const v: FilterValue = {};
  if (f.stages.length > 0) v.stage = f.stages.map(String);
  if (f.topics.length > 0) v.topic = [...f.topics];
  return v;
}

// The chips' value back to a filter. Topics outside the chosen stages (the
// stage chip changed under them) are dropped; with no stage chosen the
// topic list is the starting stage's.
export function valueToFilter(v: FilterValue, level: CefrLevel | ""): GrammarFilter {
  const stages = (v.stage ?? []).map(Number).filter((n): n is 1 | 2 | 3 => n === 1 || n === 2 || n === 3);
  const f = parseGrammarFilter({ stages, topics: v.topic ?? [] });
  const shown = new Set(shownStages(f, level));
  f.topics = f.topics.filter((id) => {
    const t = topicById(id);
    return !!t && shown.has(t.stage);
  });
  return f;
}

// The stages whose topics the 主題 chips list.
export function shownStages(f: GrammarFilter, level: CefrLevel | ""): GrammarStage[] {
  return f.stages.length > 0 ? f.stages : [defaultStage(level)];
}

export function grammarGroups(f: GrammarFilter, level: CefrLevel | ""): FilterGroup[] {
  const stages = new Set(shownStages(f, level));
  return [
    {
      id: "stage",
      label: tr("practice.grammar.stage"),
      multi: false,
      options: STAGES.map((s) => ({ id: String(s), label: stageLabel(s) })),
    },
    {
      id: "topic",
      label: tr("practice.grammar.topic"),
      multi: true,
      options: GRAMMAR_TOPICS.filter((t) => stages.has(t.stage)).map((t) => ({ id: t.id, label: t.title })),
    },
  ];
}

// 「基礎 · 現在完成式、過去簡單式」; no topic chosen reads 「基礎 · 全部主題」.
export function grammarSummary(f: GrammarFilter, level: CefrLevel | ""): string {
  const groups = grammarGroups(f, level);
  const v = filterToValue(f);
  const stage = groups[0];
  const stageText = f.stages.length > 0 ? joinWords(selectedLabels(v, stage)) : stageLabel(defaultStage(level));
  const topics = f.topics.length > 0 ? joinWords(selectedLabels(v, groups[1])) : tr("practice.grammar.allTopics");
  return `${stageText} · ${topics}`;
}

// ── Quick picks ─────────────────────────────────────────────────

// A filter covering exactly these topics (stages = the stages they sit in).
export function filterForTopics(ids: readonly string[]): GrammarFilter {
  const topics = [...new Set(ids)].filter((id) => !!topicById(id));
  const stages = [...new Set(topics.map((id) => topicById(id)!.stage))].sort();
  return { stages, topics };
}

// 本週讀到的: topic ids of sightings in the last SIGHTING_DAYS days.
export function recentSightingTopics(
  sightings: readonly { topicId: string; at: string }[],
  now: Date,
  days = SIGHTING_DAYS
): string[] {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  return [...new Set(sightings.filter((s) => Date.parse(s.at) >= since).map((s) => s.topicId))];
}

export interface QuickSources {
  weekTopics: string[];
  dueTopics: string[];
  weakTopics: string[];
}

// Only picks that would select something are offered.
export function grammarQuickPicks(src: QuickSources, level: CefrLevel | ""): QuickPick[] {
  void level;
  const pick = (id: string, label: I18nKey, ids: string[]): QuickPick[] =>
    filterForTopics(ids).topics.length > 0
      ? [{ id, label: tr(label), apply: () => filterToValue(filterForTopics(ids)) }]
      : [];
  return [
    ...pick("week", "practice.grammar.quickWeek", src.weekTopics),
    ...pick("due", "practice.grammar.quickDue", src.dueTopics),
    ...pick("weak", "practice.grammar.quickWeak", src.weakTopics),
  ];
}

// The reroute used by the topic page, map and sidebar: the filter that
// practices one topic. Null for an unknown topic.
export function topicFilter(topicId: string): GrammarFilter | null {
  const t = topicById(topicId);
  return t ? { stages: [t.stage], topics: [t.id] } : null;
}

export interface PracticeRoute {
  setGrammarFilter?(f: GrammarFilter): void;
  openPractice?(track: "grammar"): void;
}

// Sets the grammar filter to the topic and opens the 文法 tab. False when
// the host didn't wire it (callers fall back to the old behaviour).
export function routeToPractice(route: PracticeRoute, topicId: string): boolean {
  const f = topicFilter(topicId);
  if (!f || !route.setGrammarFilter || !route.openPractice) return false;
  route.setGrammarFilter(f);
  route.openPractice("grammar");
  return true;
}

// ── GrammarQuestion → PlayerQuestion ────────────────────────────

const BLANK = /_{3,}/;

// choice and find-error only; blank / rewrite / translate (and anything
// malformed) give null — the tab skips those (fixed decision 1).
export function toPlayerQuestion(q: GrammarQuestionLike): PlayerQuestion | null {
  if (q.type !== "choice" && q.type !== "find-error") return null;
  const opts = [...new Set((q.options ?? []).filter((o) => o.trim() !== ""))];
  if (opts.length < 2 || !opts.includes(q.answer)) return null;
  const topic = topicById(q.topicId);
  const sc = q.scenario;
  const base = {
    id: q.id,
    ...(sc ? { scenarioId: sc.id, scene: sc.scene } : {}),
    ...(sc?.lead && sc.lead.length > 0 ? { lead: sc.lead.map((l) => ({ ...(l.speaker ? { speaker: l.speaker } : {}), text: l.text })) } : {}),
    ...(sc?.speaker ? { speaker: sc.speaker } : {}),
    options: opts.map((o) => ({ id: o, text: o })),
    answerId: q.answer,
    explanation: q.explanation,
    ...(q.distractors && Object.keys(q.distractors).length > 0 ? { optionNotes: q.distractors } : {}),
    ...(q.sentenceZh ? { sentenceZh: q.sentenceZh } : {}),
    tag: topic ? `${tr("practice.grammar.tag")} · ${topic.title}` : tr("practice.grammar.tag"),
  };
  if (q.type === "choice") {
    if ((q.stem.match(/_{3,}/g) ?? []).length !== 1) return null;
    return { ...base, kind: "choice", text: q.stem.replace(BLANK, "____") };
  }
  const fixed = q.accepted?.[0];
  const answered = fixed && q.stem.includes(q.answer) ? q.stem.replace(q.answer, fixed) : undefined;
  return { ...base, kind: "find-error", text: q.stem, ...(answered ? { answered } : {}) };
}

// ── Mistake groups ──────────────────────────────────────────────

export interface MistakeGroupView {
  errorTag: ErrorTag;
  label: string;
  questions: GrammarQuestionLike[];
  // The topic holding most of the group's questions (ties: the newest).
  topicId: string;
}

// api.mistakeQuestions() is newest first. Biggest group first; ties keep the
// order the groups first appear in. Questions the player can't show are
// left out.
export function groupMistakes(questions: readonly GrammarQuestionLike[]): MistakeGroupView[] {
  const groups = new Map<ErrorTag, GrammarQuestionLike[]>();
  for (const q of questions) {
    if (!toPlayerQuestion(q)) continue;
    const l = groups.get(q.errorTag);
    if (l) l.push(q);
    else groups.set(q.errorTag, [q]);
  }
  return [...groups.entries()]
    .map(([errorTag, qs]) => ({ errorTag, label: errorTagLabel(errorTag), questions: qs, topicId: topicOfQuestions(qs) }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

export function topicOfQuestions(qs: readonly GrammarQuestionLike[]): string {
  const counts = new Map<string, number>();
  for (const q of qs) counts.set(q.topicId, (counts.get(q.topicId) ?? 0) + 1);
  let best = qs[0]?.topicId ?? "";
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  return best;
}

export function mistakeCount(groups: readonly MistakeGroupView[]): number {
  return groups.reduce((n, g) => n + g.questions.length, 0);
}

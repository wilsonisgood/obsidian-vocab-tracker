import { t } from "../../../core/i18n";
import type { PracticeQuestion } from "../../../core/model/practice";
import { senseById } from "../../../core/poly/catalog";
import type { PlayerQuestion } from "./playerTypes";

// PracticeQuestion (learner shard) → PlayerQuestion (第十七波 Q; 常用字, 單字
// 情境 and 混合 all show their pools through this).

export interface QuestionLabels {
  // Title of a grammar topic, for 「文法 · <主題>」.
  topicTitle?(topicId: string): string;
}

export function questionTag(q: PracticeQuestion, labels: QuestionLabels = {}): string {
  switch (q.focus.kind) {
    case "sense":
      return `${t("practice.poly.tag")} · ${senseById(q.focus.id)?.word ?? q.focus.id.split(".")[0]}`;
    case "word":
      // 1031: no word after it — in a 選字 question the word is the answer.
      return t("practice.poly.tagWord");
    case "grammar-objective": {
      const title = labels.topicTitle?.(q.focus.id.split("/")[0]);
      return title ? `${t("practice.grammar.tag")} · ${title}` : t("practice.grammar.tag");
    }
    case "paragraph":
      return `${t("practice.para.tag")} · ${q.scenario.scene}`;
  }
}

// 💡 hints (fixed decision 3): only 常用字 which-sense questions, only the
// wrong options, each with that sense's 判斷線索.
export function questionHints(q: PracticeQuestion): Record<string, string> | undefined {
  if (q.track !== "poly" || q.kind !== "which-sense") return undefined;
  const hints: Record<string, string> = {};
  for (const o of q.options) {
    if (o.id === q.answerId) continue;
    const cue = senseById(o.id)?.cue;
    if (cue) hints[o.id] = cue;
  }
  return Object.keys(hints).length > 0 ? hints : undefined;
}

export function toPlayerQuestion(q: PracticeQuestion, labels: QuestionLabels = {}): PlayerQuestion {
  const sc = q.scenario;
  const hints = questionHints(q);
  return {
    id: q.id,
    scenarioId: sc.id,
    scene: sc.scene,
    ...(sc.lead && sc.lead.length > 0
      ? { lead: sc.lead.map((l) => ({ ...(l.speaker ? { speaker: l.speaker } : {}), text: l.text })) }
      : {}),
    ...(sc.speaker ? { speaker: sc.speaker } : {}),
    kind: q.kind,
    text: q.text,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    answerId: q.answerId,
    explanation: q.explanation,
    ...(q.optionNotes && Object.keys(q.optionNotes).length > 0 ? { optionNotes: q.optionNotes } : {}),
    ...(q.sentenceZh ? { sentenceZh: q.sentenceZh } : {}),
    ...(hints ? { hints } : {}),
    tag: questionTag(q, labels),
  };
}

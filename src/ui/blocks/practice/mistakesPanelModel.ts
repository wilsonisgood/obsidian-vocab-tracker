import { t, type I18nKey } from "../../../core/i18n";
import { ERROR_TAGS } from "../../../core/model/grammar";
import { PARAPHRASE_ERROR_TAGS } from "../../../services/ai/tasks/paraphrase";
import { POLY_ERROR_TAGS, VOCAB_ERROR_TAGS } from "../../../services/ai/tasks/practiceScenario";
import type { PracticeKind, PracticeQuestion } from "../../../core/model/practice";
import { errorTagLabel } from "../../grammar/labels";
import type { ErrorTag } from "../../../core/model/grammar";

// Pure logic of the shared 錯題區 panel (第十七波 Q): group the open
// mistakes of the scenario tracks by errorTag.

export interface PracticeMistakeGroup {
  // errorTag, or `kind:<kind>` when the question has none.
  key: string;
  label: string;
  questions: PracticeQuestion[];
}

export function mistakeKey(q: PracticeQuestion): string {
  return q.errorTag ? q.errorTag : `kind:${q.kind}`;
}

const KIND_LABEL: Record<PracticeKind, I18nKey> = {
  "which-sense": "practice.mistakes.kind.which-sense",
  "pick-word": "practice.mistakes.kind.pick-word",
  "same-sense": "practice.mistakes.kind.same-sense",
  choice: "practice.mistakes.kind.choice",
  "find-error": "practice.mistakes.kind.find-error",
  paraphrase: "practice.mistakes.kind.paraphrase",
};

// S's lists (practiceScenario task): the tags the scenario AI may put on a miss.
const POLY_TAGS: readonly string[] = [
  ...new Set<string>([...POLY_ERROR_TAGS, ...VOCAB_ERROR_TAGS, ...PARAPHRASE_ERROR_TAGS]),
];

// 中文標籤: grammar tags use the shared grammar names, the 常用字 tags a
// small table here, a question without a tag its kind, anything else the
// raw tag.
export function mistakeLabel(key: string): string {
  if (key.startsWith("kind:")) return t(KIND_LABEL[key.slice(5) as PracticeKind] ?? "practice.mistakes.kind.other");
  if (POLY_TAGS.includes(key)) return t(`practice.mistakes.tag.${key}` as I18nKey);
  if ((ERROR_TAGS as readonly string[]).includes(key)) return errorTagLabel(key as ErrorTag);
  return key;
}

// `questions` is newest mistake first. Biggest group first; ties keep the
// order the groups first appear in.
export function groupPracticeMistakes(questions: readonly PracticeQuestion[]): PracticeMistakeGroup[] {
  const groups = new Map<string, PracticeQuestion[]>();
  for (const q of questions) {
    const key = mistakeKey(q);
    const l = groups.get(key);
    if (l) l.push(q);
    else groups.set(key, [q]);
  }
  return [...groups.entries()]
    .map(([key, qs]) => ({ key, label: mistakeLabel(key), questions: qs }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

export function practiceMistakeCount(groups: readonly PracticeMistakeGroup[]): number {
  return groups.reduce((n, g) => n + g.questions.length, 0);
}

export const MISTAKE_LINE_MAX = 60;

// One line of the expanded group list (第十八波 R): the question sentence
// without [[ ]] marks, cut to `max` characters.
export function mistakeLine(text: string, max = MISTAKE_LINE_MAX): string {
  const flat = text.replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

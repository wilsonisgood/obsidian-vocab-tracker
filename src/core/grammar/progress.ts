import type {
  ErrorTag,
  GrammarAttempt,
  GrammarProgress,
  GrammarQuestion,
  GrammarTopic,
  GrammarTopicStatus,
} from "../model/grammar";
import { ERROR_TAGS } from "../model/grammar";
import type { CefrLevel } from "../model/settings";

// Pure progress math for grammar learning (wave 15 rules 3 and 5). Status
// is always derived from attempts + srs, never stored.

export const RECENT_WINDOW = 5;
export const MASTERY_MIN_ANSWERED = 3;
export const MASTERY_MIN_RECENT_CORRECT = 4;

// Where a learner of this CEFR level starts (rule 3). Unset = from the beginning.
export function startDifficulty(level: CefrLevel | ""): number {
  switch (level) {
    case "B1":
      return 4;
    case "B2":
      return 5;
    case "C1":
      return 7;
    case "C2":
      return 8;
    default:
      return 1;
  }
}

export interface ObjectiveStat {
  objectiveId: string;
  answered: number;
  correct: number;
  // Over the latest RECENT_WINDOW attempts.
  recentCorrect: number;
  recentCount: number;
}

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function byTime(a: GrammarAttempt, b: GrammarAttempt): number {
  return ms(a.at) - ms(b.at);
}

export function objectiveStats(topic: GrammarTopic, attempts: readonly GrammarAttempt[]): ObjectiveStat[] {
  const mine = attempts.filter((a) => a.topicId === topic.id).sort(byTime);
  return topic.objectives.map((o) => {
    const list = mine.filter((a) => a.objectiveId === o.id);
    const recent = list.slice(-RECENT_WINDOW);
    return {
      objectiveId: o.id,
      answered: list.length,
      correct: list.filter((a) => a.correct).length,
      recentCorrect: recent.filter((a) => a.correct).length,
      recentCount: recent.length,
    };
  });
}

export function isMastered(stats: readonly ObjectiveStat[]): boolean {
  return (
    stats.length > 0 &&
    stats.every((s) => s.answered >= MASTERY_MIN_ANSWERED && s.recentCorrect >= MASTERY_MIN_RECENT_CORRECT)
  );
}

// due beats mastered/learning; `due` needs an srs card, which only the
// review wave (R) writes, so before that it never shows up.
export function topicStatus(
  topic: GrammarTopic,
  attempts: readonly GrammarAttempt[],
  progress: GrammarProgress | undefined,
  now: Date
): GrammarTopicStatus {
  if (progress?.srs && ms(progress.srs.due) <= now.getTime()) return "due";
  if (!attempts.some((a) => a.topicId === topic.id)) return "new";
  return isMastered(objectiveStats(topic, attempts)) ? "mastered" : "learning";
}

// Statuses for a whole list in one pass (groups attempts by topic first).
export function topicStatuses(
  topics: readonly GrammarTopic[],
  attempts: readonly GrammarAttempt[],
  progressOf: (topicId: string) => GrammarProgress | undefined,
  now: Date
): Map<string, GrammarTopicStatus> {
  const byTopic = new Map<string, GrammarAttempt[]>();
  for (const a of attempts) {
    const l = byTopic.get(a.topicId);
    if (l) l.push(a);
    else byTopic.set(a.topicId, [a]);
  }
  const out = new Map<string, GrammarTopicStatus>();
  for (const t of topics) out.set(t.id, topicStatus(t, byTopic.get(t.id) ?? [], progressOf(t.id), now));
  return out;
}

function bySequence(a: GrammarTopic, b: GrammarTopic): number {
  return a.stage - b.stage || a.order - b.order;
}

// The next topic to suggest: first (stage, order) topic at or above the
// learner's starting difficulty that isn't mastered and whose prerequisites
// have all been touched. A prerequisite below the starting difficulty
// counts as known (a B2 learner never did the basics in-app). Falls back
// to the first topic in progress; undefined when there's nothing left.
export function recommendNext(
  topics: readonly GrammarTopic[],
  statusOf: (topicId: string) => GrammarTopicStatus,
  level: CefrLevel | ""
): GrammarTopic | undefined {
  const start = startDifficulty(level);
  const sorted = [...topics].sort(bySequence);
  const byId = new Map(sorted.map((t) => [t.id, t]));
  const prereqOk = (t: GrammarTopic) =>
    t.prerequisites.every((id) => {
      const p = byId.get(id);
      return !p || p.difficulty < start || statusOf(id) !== "new";
    });
  const next = sorted.find((t) => t.difficulty >= start && statusOf(t.id) !== "mastered" && prereqOk(t));
  if (next) return next;
  return sorted.find((t) => statusOf(t.id) === "learning");
}

// Topics whose review is due, earliest due first.
export function dueTopics(
  topics: readonly GrammarTopic[],
  progressOf: (topicId: string) => GrammarProgress | undefined,
  now: Date
): GrammarTopic[] {
  const due: { topic: GrammarTopic; at: number }[] = [];
  for (const topic of topics) {
    const srs = progressOf(topic.id)?.srs;
    if (srs && ms(srs.due) <= now.getTime()) due.push({ topic, at: ms(srs.due) });
  }
  return due.sort((a, b) => a.at - b.at).map((d) => d.topic);
}

export interface MistakeItem {
  question: GrammarQuestion;
  // The latest attempt on it (always a wrong one).
  attempt: GrammarAttempt;
}

export interface MistakeGroup {
  errorTag: ErrorTag;
  // Newest first.
  items: MistakeItem[];
}

// Questions whose most recent attempt was wrong and that haven't been
// retired, grouped by error tag. Biggest group first (ties follow the
// ERROR_TAGS order); inside a group, the latest mistake first.
export function mistakeGroups(
  questions: readonly GrammarQuestion[],
  attempts: readonly GrammarAttempt[]
): MistakeGroup[] {
  const latest = new Map<string, GrammarAttempt>();
  for (const a of attempts) {
    const prev = latest.get(a.questionId);
    if (!prev || ms(a.at) >= ms(prev.at)) latest.set(a.questionId, a);
  }
  const groups = new Map<ErrorTag, MistakeItem[]>();
  for (const q of questions) {
    if (q.retiredAt || q.deletedAt) continue;
    const a = latest.get(q.id);
    if (!a || a.correct) continue;
    const l = groups.get(q.errorTag);
    if (l) l.push({ question: q, attempt: a });
    else groups.set(q.errorTag, [{ question: q, attempt: a }]);
  }
  return [...groups.entries()]
    .map(([errorTag, items]) => ({ errorTag, items: items.sort((x, y) => ms(y.attempt.at) - ms(x.attempt.at)) }))
    .sort((x, y) => y.items.length - x.items.length || ERROR_TAGS.indexOf(x.errorTag) - ERROR_TAGS.indexOf(y.errorTag));
}

// Topic ids the learner has already worked on (learning, mastered or due) —
// the `known_grammar` the question-writing prompt gets.
export function knownTopicIds(
  topics: readonly GrammarTopic[],
  statusOf: (topicId: string) => GrammarTopicStatus
): string[] {
  return topics.filter((t) => statusOf(t.id) !== "new").map((t) => t.id);
}

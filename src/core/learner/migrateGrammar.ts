import type { GrammarAttempt, GrammarQuestion } from "../model/grammar";
import type { LearnEvent, MistakeItem, PoolItem } from "../model/learner";
import { addToPool } from "../practice/pool";

// One-time move of the wave-15 grammar history into the learner layer
// (規劃書 12 §1). Deterministic ids (`g:${attempt.id}`, `grammar:${qid}`) make
// a re-run harmless. Pure.

export interface GrammarMigration {
  events: LearnEvent[];
  mistakes: MistakeItem[];
  pool: PoolItem[];
}

const created = (q: GrammarQuestion): number => {
  const t = Date.parse(q.createdAt ?? "");
  return Number.isNaN(t) ? 0 : t;
};

export function migrateGrammar(
  questions: readonly GrammarQuestion[],
  attempts: readonly GrammarAttempt[],
  now: Date,
  existingPool: readonly PoolItem[] = []
): GrammarMigration {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const events: LearnEvent[] = sorted.map((a) => {
    const e: LearnEvent = {
      id: `g:${a.id}`,
      at: a.at,
      track: "grammar",
      focus: { kind: "grammar-objective", id: `${a.topicId}/${a.objectiveId}` },
      result: a.correct ? "correct" : "wrong",
      given: a.given,
      questionId: a.questionId,
    };
    const tag = qById.get(a.questionId)?.errorTag;
    if (!a.correct && tag) e.errorTag = tag;
    return e;
  });

  const byQuestion = new Map<string, GrammarAttempt[]>();
  for (const a of sorted) {
    const list = byQuestion.get(a.questionId);
    if (list) list.push(a);
    else byQuestion.set(a.questionId, [a]);
  }

  const usable = questions.filter((q) => !q.retiredAt && !q.deletedAt);

  const mistakes: MistakeItem[] = [];
  for (const q of usable) {
    const list = byQuestion.get(q.id);
    if (!list || list[list.length - 1].correct) continue;
    const wrongs = list.filter((a) => !a.correct);
    mistakes.push({
      id: `grammar:${q.id}`,
      track: "grammar",
      questionId: q.id,
      focus: { kind: "grammar-objective", id: `${q.topicId}/${q.objectiveId}` },
      addedAt: wrongs[0].at,
      lastWrongAt: wrongs[wrongs.length - 1].at,
      updatedAt: wrongs[wrongs.length - 1].at,
    });
  }

  const fresh = usable
    .filter((q) => !byQuestion.has(q.id))
    .sort((a, b) => created(a) - created(b))
    .map((q) => ({ questionId: q.id }));
  const pool = addToPool(existingPool, "grammar", fresh, now);

  return { events, mistakes, pool };
}

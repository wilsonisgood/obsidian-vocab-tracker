import type { ErrorTag, GrammarAttempt, GrammarQuestion } from "../model/grammar";
import { canGradeLocally } from "./grading";
import { mistakeGroups } from "./progress";

// Which questions a practice round asks, and in what order (wave 15 P,
// 1013 §3.3). Pure and deterministic: the same bank and attempts give the
// same round, so "再練一輪" simply moves on to what has gone stale.

export const DEFAULT_SESSION_SIZE = 8;
// The same objective this many times in a row is too many.
export const MAX_SAME_OBJECTIVE_RUN = 2;

export interface SessionOptions {
  size?: number;
  mode: "learn" | "mistakes";
  // Learn mode: only this learning goal.
  objectiveId?: string;
  // Mistakes mode: only this error tag.
  errorTag?: ErrorTag;
}

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

// Takes the list in priority order but never lets one objective fill more
// than MAX_SAME_OBJECTIVE_RUN consecutive places: the first candidate that
// doesn't break the run goes next, and if all of them would, the first one
// does (a topic with one objective can't do better).
export function spreadObjectives(ordered: readonly GrammarQuestion[], size: number): GrammarQuestion[] {
  const rest = [...ordered];
  const out: GrammarQuestion[] = [];
  while (out.length < size && rest.length) {
    const tail = out.slice(-MAX_SAME_OBJECTIVE_RUN);
    const runs = (q: GrammarQuestion) =>
      tail.length === MAX_SAME_OBJECTIVE_RUN && tail.every((t) => t.objectiveId === q.objectiveId);
    const i = rest.findIndex((q) => !runs(q));
    out.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

function askable(pool: readonly GrammarQuestion[]): GrammarQuestion[] {
  return pool.filter((q) => !q.retiredAt && !q.deletedAt && canGradeLocally(q));
}

export function buildSession(
  pool: readonly GrammarQuestion[],
  attempts: readonly GrammarAttempt[],
  opts: SessionOptions
): GrammarQuestion[] {
  const size = Math.max(0, Math.floor(opts.size ?? DEFAULT_SESSION_SIZE));
  const live = askable(pool);

  if (opts.mode === "mistakes") {
    const groups = mistakeGroups(live, attempts).filter((g) => !opts.errorTag || g.errorTag === opts.errorTag);
    return spreadObjectives(
      groups.flatMap((g) => g.items.map((i) => i.question)),
      size
    );
  }

  const candidates = opts.objectiveId ? live.filter((q) => q.objectiveId === opts.objectiveId) : live;
  const latest = new Map<string, GrammarAttempt>();
  for (const a of attempts) {
    const prev = latest.get(a.questionId);
    if (!prev || ms(a.at) >= ms(prev.at)) latest.set(a.questionId, a);
  }
  const fresh: GrammarQuestion[] = [];
  const missed: GrammarQuestion[] = [];
  const rest: GrammarQuestion[] = [];
  for (const q of candidates) {
    const a = latest.get(q.id);
    if (!a) fresh.push(q);
    else if (!a.correct) missed.push(q);
    else rest.push(q);
  }
  const at = (q: GrammarQuestion) => ms(latest.get(q.id)?.at);
  // Never asked first (oldest in the bank first), then the latest misses
  // (most recent first), then whatever hasn't been seen for longest.
  fresh.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  missed.sort((a, b) => at(b) - at(a));
  rest.sort((a, b) => at(a) - at(b));
  return spreadObjectives([...fresh, ...missed, ...rest], size);
}

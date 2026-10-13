import { normalizeErrorTag, GRAMMAR_QUESTION_TYPES } from "../../core/model/grammar";
import type {
  GrammarAttempt,
  GrammarProgress,
  GrammarQuestion,
  GrammarQuestionType,
  GrammarShard,
} from "../../core/model/grammar";
import { dropOldTombstones, mergeRecords } from "../learn/learnMerge";

export { dropOldTombstones };

// Multi-device merge for store/grammar.json (wave 15 rule 8). Questions and
// progress follow the learn.json rule (same id → newer updatedAt, then
// higher rev, then local). Attempts are append-only, so they are simply
// unioned by id and kept in time order. Pure, so it's tested without storage.

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

export function emptyGrammarShard(): GrammarShard {
  return { questions: [], attempts: [], progress: [] };
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function normalizeQuestion(raw: unknown): GrammarQuestion | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.topicId) || !str(raw.objectiveId)) return null;
  if (typeof raw.stem !== "string" || typeof raw.answer !== "string") return null;
  const type = GRAMMAR_QUESTION_TYPES.includes(raw.type as GrammarQuestionType) ? (raw.type as GrammarQuestionType) : null;
  if (!type) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  const q: GrammarQuestion = {
    ...(raw as unknown as GrammarQuestion),
    type,
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
    errorTag: normalizeErrorTag(raw.errorTag),
  };
  const options = strings(raw.options);
  if (options) q.options = options;
  else delete q.options;
  const accepted = strings(raw.accepted);
  if (accepted) q.accepted = accepted;
  else delete q.accepted;
  if (!isObj(raw.distractors)) delete q.distractors;
  return q;
}

function normalizeAttempt(raw: unknown): GrammarAttempt | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.questionId) || !str(raw.topicId) || !str(raw.objectiveId)) return null;
  if (!str(raw.at) || Number.isNaN(Date.parse(raw.at))) return null;
  return {
    id: raw.id,
    questionId: raw.questionId,
    topicId: raw.topicId,
    objectiveId: raw.objectiveId,
    at: raw.at,
    correct: raw.correct === true,
    given: typeof raw.given === "string" ? raw.given : "",
  };
}

function normalizeProgress(raw: unknown): GrammarProgress | null {
  if (!isObj(raw) || !str(raw.id)) return null;
  const p = { ...(raw as unknown as GrammarProgress) };
  if (!isObj(p.srs)) delete p.srs;
  return p;
}

function normList<T>(raw: unknown, one: (r: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const r of raw) {
    const v = one(r);
    if (v) out.push(v);
  }
  return out;
}

// A half-synced or hand-edited file may miss arrays or hold junk rows;
// unusable rows are dropped, never thrown on.
export function normalizeGrammarShard(raw: unknown): GrammarShard {
  const s = isObj(raw) ? raw : {};
  return {
    questions: normList(s.questions, normalizeQuestion),
    attempts: normList(s.attempts, normalizeAttempt),
    progress: normList(s.progress, normalizeProgress),
  };
}

export function sortAttempts(list: GrammarAttempt[]): GrammarAttempt[] {
  return list.sort((a, b) => ms(a.at) - ms(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mergeGrammar(local: GrammarShard, remote: GrammarShard): GrammarShard {
  return {
    questions: mergeRecords(local.questions, remote.questions),
    // An attempt never changes once written: the local copy stands.
    attempts: sortAttempts(mergeRecords(local.attempts, remote.attempts, (l) => l)),
    progress: mergeRecords(local.progress, remote.progress),
  };
}

// What a merge can change, for deciding whether to write the union back.
export function grammarFingerprint(shard: GrammarShard): string {
  const recs = (kind: string, list: readonly { id: string; updatedAt?: string; rev?: number; deletedAt?: string }[]) =>
    list.map((r) => `${kind}|${r.id}|${r.updatedAt ?? ""}|${r.rev ?? 0}|${r.deletedAt ?? ""}`);
  return [...recs("q", shard.questions), ...recs("a", shard.attempts), ...recs("p", shard.progress)].sort().join("\n");
}

export function pruneGrammar(shard: GrammarShard, now: number): GrammarShard {
  return {
    questions: dropOldTombstones(shard.questions, now),
    attempts: shard.attempts,
    progress: dropOldTombstones(shard.progress, now),
  };
}

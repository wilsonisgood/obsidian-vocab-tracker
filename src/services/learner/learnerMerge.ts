import { FOCUS_KINDS, LEARN_RESULTS, TRACKS } from "../../core/model/learner";
import type {
  FocusRef,
  LearnEvent,
  LearnerShard,
  MistakeItem,
  PoolItem,
  PoolRemoveReason,
  Track,
  TrackFilter,
} from "../../core/model/learner";
import { mergeRecords } from "../learn/learnMerge";

// Multi-device merge for store/learner.json (規劃書 12 §1). Events are
// append-only: unioned by id, the local copy standing. Pool, mistakes and
// filters follow the learn.json rule (same id → newer updatedAt wins), so a
// removal tombstone is not resurrected by an older copy. Pure.

const DAY_MS = 86_400_000;
export const POOL_TOMBSTONE_TTL_MS = 30 * DAY_MS;
export const MISTAKE_RESOLVED_TTL_MS = 90 * DAY_MS;
export const EVENT_TTL_MS = 365 * DAY_MS;

function ms(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : 0;
  return Number.isNaN(t) ? 0 : t;
}

export function emptyLearnerShard(): LearnerShard {
  return { events: [], pool: [], mistakes: [], filters: [], meta: {} };
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => str(v) && !Number.isNaN(Date.parse(v));
const isTrack = (v: unknown): v is Track => TRACKS.includes(v as Track);
const REASONS: readonly PoolRemoveReason[] = ["answered", "skipped", "retired", "filtered"];

function focusOf(raw: unknown): FocusRef | null {
  if (!isObj(raw) || !str(raw.id) || !FOCUS_KINDS.includes(raw.kind as FocusRef["kind"])) return null;
  return { kind: raw.kind as FocusRef["kind"], id: raw.id };
}

function normalizeEvent(raw: unknown): LearnEvent | null {
  if (!isObj(raw) || !str(raw.id) || !isIso(raw.at) || !isTrack(raw.track)) return null;
  const focus = focusOf(raw.focus);
  if (!focus || !LEARN_RESULTS.includes(raw.result as LearnEvent["result"])) return null;
  const e: LearnEvent = { id: raw.id, at: raw.at, track: raw.track, focus, result: raw.result as LearnEvent["result"] };
  if (typeof raw.given === "string") e.given = raw.given;
  if (str(raw.errorTag)) e.errorTag = raw.errorTag;
  if (str(raw.questionId)) e.questionId = raw.questionId;
  return e;
}

function normalizePool(raw: unknown): PoolItem | null {
  if (!isObj(raw) || !str(raw.id) || !isTrack(raw.track) || !str(raw.questionId)) return null;
  if (!isIso(raw.addedAt)) return null;
  const p: PoolItem = {
    id: raw.id,
    track: raw.track,
    questionId: raw.questionId,
    seq: typeof raw.seq === "number" && Number.isFinite(raw.seq) ? raw.seq : 0,
    addedAt: raw.addedAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.addedAt,
  };
  if (str(raw.scenarioId)) p.scenarioId = raw.scenarioId;
  if (isIso(raw.removedAt)) {
    p.removedAt = raw.removedAt;
    p.removeReason = REASONS.includes(raw.removeReason as PoolRemoveReason) ? (raw.removeReason as PoolRemoveReason) : "answered";
  }
  return p;
}

function normalizeMistake(raw: unknown): MistakeItem | null {
  if (!isObj(raw) || !str(raw.id) || !isTrack(raw.track) || !str(raw.questionId)) return null;
  const focus = focusOf(raw.focus);
  if (!focus || !isIso(raw.lastWrongAt)) return null;
  const addedAt = isIso(raw.addedAt) ? raw.addedAt : raw.lastWrongAt;
  const m: MistakeItem = {
    id: raw.id,
    track: raw.track,
    questionId: raw.questionId,
    focus,
    addedAt,
    lastWrongAt: raw.lastWrongAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.lastWrongAt,
  };
  if (isIso(raw.resolvedAt)) m.resolvedAt = raw.resolvedAt;
  return m;
}

function normalizeFilter(raw: unknown): TrackFilter | null {
  if (!isObj(raw) || !isTrack(raw.id)) return null;
  return { id: raw.id, value: raw.value, updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : "" };
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

export function normalizeLearnerShard(raw: unknown): LearnerShard {
  const s = isObj(raw) ? raw : {};
  const meta = isObj(s.meta) && isIso(s.meta.grammarMigratedAt) ? { grammarMigratedAt: s.meta.grammarMigratedAt } : {};
  return {
    events: sortEvents(normList(s.events, normalizeEvent)),
    pool: normList(s.pool, normalizePool),
    mistakes: normList(s.mistakes, normalizeMistake),
    filters: normList(s.filters, normalizeFilter),
    meta,
  };
}

export function sortEvents(list: LearnEvent[]): LearnEvent[] {
  return list.sort((a, b) => ms(a.at) - ms(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mergeLearner(local: LearnerShard, remote: LearnerShard): LearnerShard {
  const a = local.meta.grammarMigratedAt;
  const b = remote.meta.grammarMigratedAt;
  const migrated = a && b ? (ms(a) <= ms(b) ? a : b) : a ?? b;
  return {
    events: sortEvents(mergeRecords(local.events, remote.events, (l) => l)),
    pool: mergeRecords(local.pool, remote.pool),
    mistakes: mergeRecords(local.mistakes, remote.mistakes),
    filters: mergeRecords(local.filters, remote.filters),
    meta: migrated ? { grammarMigratedAt: migrated } : {},
  };
}

// What a merge can change, for deciding whether to write the union back.
export function learnerFingerprint(shard: LearnerShard): string {
  const rows: string[] = [`m|${shard.meta.grammarMigratedAt ?? ""}`];
  for (const e of shard.events) rows.push(`e|${e.id}`);
  for (const p of shard.pool) rows.push(`p|${p.id}|${p.updatedAt}|${p.removedAt ?? ""}`);
  for (const m of shard.mistakes) rows.push(`x|${m.id}|${m.updatedAt}|${m.resolvedAt ?? ""}`);
  for (const f of shard.filters) rows.push(`f|${f.id}|${f.updatedAt}`);
  return rows.sort().join("\n");
}

export function pruneLearner(shard: LearnerShard, now: number): LearnerShard {
  return {
    events: shard.events.filter((e) => now - ms(e.at) < EVENT_TTL_MS),
    pool: shard.pool.filter((p) => !p.removedAt || now - ms(p.removedAt) < POOL_TOMBSTONE_TTL_MS),
    mistakes: shard.mistakes.filter((m) => !m.resolvedAt || now - ms(m.resolvedAt) < MISTAKE_RESOLVED_TTL_MS),
    filters: shard.filters,
    meta: shard.meta,
  };
}

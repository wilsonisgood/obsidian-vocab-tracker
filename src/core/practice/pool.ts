import type { PoolItem, PoolRemoveReason, Track } from "../model/learner";

// Waiting-question pool (規劃書 12 §1): at most POOL_SIZE live questions per
// track, refilled when REFILL_AT or fewer remain. Removed items stay as
// tombstones so the same question never re-enters.

export const POOL_SIZE = 10;
export const REFILL_AT = 4;

export function livePool(items: readonly PoolItem[], track: Track): PoolItem[] {
  return items.filter((i) => i.track === track && !i.removedAt).sort((a, b) => a.seq - b.seq);
}

export function needsRefill(items: readonly PoolItem[], track: Track): boolean {
  return livePool(items, track).length <= REFILL_AT;
}

export function poolRoom(items: readonly PoolItem[], track: Track): number {
  return Math.max(0, POOL_SIZE - livePool(items, track).length);
}

// Returns only the newly created items (the caller stores them). Questions
// already in the pool — removed ones included — are skipped, and anything
// beyond the room left is dropped.
export function addToPool(
  items: readonly PoolItem[],
  track: Track,
  add: readonly { questionId: string; scenarioId?: string }[],
  now: Date
): PoolItem[] {
  const seen = new Set(items.filter((i) => i.track === track).map((i) => i.questionId));
  let seq = items.reduce((m, i) => (i.track === track ? Math.max(m, i.seq) : m), 0);
  let room = poolRoom(items, track);
  const iso = now.toISOString();
  const out: PoolItem[] = [];
  for (const a of add) {
    if (room <= 0) break;
    if (seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    room--;
    const item: PoolItem = {
      id: `${track}:${a.questionId}`,
      track,
      questionId: a.questionId,
      seq: ++seq,
      addedAt: iso,
      updatedAt: iso,
    };
    if (a.scenarioId) item.scenarioId = a.scenarioId;
    out.push(item);
  }
  return out;
}

export function removeFromPool(item: PoolItem, reason: PoolRemoveReason, now: Date): PoolItem {
  const iso = now.toISOString();
  return { ...item, removedAt: iso, removeReason: reason, updatedAt: iso };
}

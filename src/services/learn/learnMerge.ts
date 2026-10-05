import type { Record_ } from "../../core/model/entry";
import { familyScope, type Family } from "../../core/model/family";
import type { TriviaItem } from "../../core/model/trivia";

// Multi-device merge for store/learn.json (規劃書 06 §4.3): records are
// unioned by id; the same id keeps the copy with the newer updatedAt, and
// on a tie the higher rev (then the local copy). A tombstone (deletedAt) is
// a record like any other, so a delete and a concurrent edit resolve by
// whichever happened later. Pure, so it's unit-tested without storage.

export interface LearnShard {
  families: Family[];
  trivia: TriviaItem[];
}

type Rec = Record_ & { id: string };

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function pickNewer<T extends Rec>(local: T, remote: T): T {
  const l = ms(local.updatedAt);
  const r = ms(remote.updatedAt);
  if (l !== r) return r > l ? remote : local;
  return (remote.rev ?? 0) > (local.rev ?? 0) ? remote : local;
}

export function mergeRecords<T extends Rec>(
  local: readonly T[],
  remote: readonly T[],
  pick: (local: T, remote: T) => T = pickNewer
): T[] {
  const byId = new Map<string, T>();
  const order: string[] = [];
  for (const rec of local) {
    if (!byId.has(rec.id)) order.push(rec.id);
    byId.set(rec.id, rec);
  }
  for (const rec of remote) {
    const mine = byId.get(rec.id);
    if (!mine) order.push(rec.id);
    byId.set(rec.id, mine ? pick(mine, rec) : rec);
  }
  return order.map((id) => byId.get(id) as T);
}

// Newer copy wins, with one exception: 重新分群 on one device only deletes
// families it sees as whole-list groupings. If another device meanwhile
// turned that family into a "word" family (a 找字族 result merged into
// it), the regroup's tombstone loses to the live copy even when it's
// newer — the regroup never meant to remove a word-page family.
export function pickFamily(local: Family, remote: Family): Family {
  const winner = pickNewer(local, remote);
  const other = winner === local ? remote : local;
  if (winner.deletedAt && winner.deletedBy === "regroup" && !other.deletedAt && familyScope(other) === "word") {
    return other;
  }
  return winner;
}

// Tombstones are purged 30 days after the delete — by then every device
// has had the chance to sync the deletedAt (same window as entries).
export function dropOldTombstones<T extends Rec>(records: readonly T[], now: number): T[] {
  return records.filter((r) => !r.deletedAt || now - ms(r.deletedAt) < TOMBSTONE_TTL_MS);
}

export function emptyLearnShard(): LearnShard {
  return { families: [], trivia: [] };
}

// A half-synced or hand-edited file may be missing either array.
export function normalizeLearnShard(raw: unknown): LearnShard {
  const s = (raw ?? {}) as Partial<LearnShard>;
  return {
    families: Array.isArray(s.families) ? s.families : [],
    trivia: Array.isArray(s.trivia) ? s.trivia : [],
  };
}

export function mergeLearn(local: LearnShard, remote: LearnShard): LearnShard {
  return {
    families: mergeRecords(local.families, remote.families, pickFamily),
    trivia: mergeRecords(local.trivia, remote.trivia),
  };
}

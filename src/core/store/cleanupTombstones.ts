import type { VocabData } from "../model/entry";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Permanently drops tombstones (soft-deleted entries) past the merge
// window — once every device has had a chance to see the deletedAt and
// merge it, there's no reason to keep carrying the dead record around.
// Returns the same object when nothing changed, so callers can skip an
// unnecessary write-back.
export function cleanupTombstones(data: VocabData, now: number = Date.now()): VocabData {
  const entries = data.entries.filter((e) => {
    if (!e.deletedAt) return true;
    return now - new Date(e.deletedAt).getTime() < THIRTY_DAYS_MS;
  });
  if (entries.length === data.entries.length) return data;
  return { ...data, entries };
}

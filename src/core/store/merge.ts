import type { VocabData, VocabEntry } from "../model/entry";

// Entries without updatedAt (shouldn't happen once everything goes through
// VocabStore, but migrated/partial data might) sort as oldest so a properly
// stamped entry on the other side always wins over an unknown-age one.
function updatedAtMs(entry: VocabEntry): number {
  return entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
}

function pickNewer(a: VocabEntry, b: VocabEntry): VocabEntry {
  const aMs = updatedAtMs(a);
  const bMs = updatedAtMs(b);
  if (aMs !== bMs) return aMs > bMs ? a : b;
  return (a.rev ?? 0) >= (b.rev ?? 0) ? a : b;
}

// Union of entries by id; a tombstone (deletedAt set) is just a record like
// any other here — it wins or loses on updatedAt/rev same as an edit, so a
// delete and a concurrent edit resolve by whichever actually happened more
// recently instead of "delete always wins" or "delete always loses".
export function merge(local: VocabData, remote: VocabData): VocabData {
  const byId = new Map<string, VocabEntry>();
  const order: string[] = [];

  for (const entry of local.entries) {
    byId.set(entry.id, entry);
    order.push(entry.id);
  }
  for (const entry of remote.entries) {
    const existing = byId.get(entry.id);
    if (!existing) order.push(entry.id);
    byId.set(entry.id, existing ? pickNewer(existing, entry) : entry);
  }

  return {
    schemaVersion: 2,
    settings: local.settings ?? remote.settings ?? { schemaVersion: 2 },
    entries: order.map((id) => byId.get(id) as VocabEntry),
  };
}

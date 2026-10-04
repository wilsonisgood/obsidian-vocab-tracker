import type { VocabData, VocabEntry } from "../model/entry";
import type { PluginSettings } from "../model/settings";

// Settings are one record (not a collection), so they merge whole: the
// object stamped more recently wins. Ties and unstamped objects keep the
// local side — the pre-M3 behaviour, when settings held nothing editable.
function pickNewerSettings(local?: PluginSettings, remote?: PluginSettings): PluginSettings {
  if (!local) return remote ?? { schemaVersion: 2 };
  if (!remote) return local;
  const l = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const r = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
  return r > l ? remote : local;
}

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
    settings: pickNewerSettings(local.settings, remote.settings),
    entries: order.map((id) => byId.get(id) as VocabEntry),
  };
}

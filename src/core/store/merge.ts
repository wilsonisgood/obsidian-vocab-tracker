import type { VocabData, VocabEntry } from "../model/entry";
import { SETTINGS_SECTIONS, type PluginSettings, type SectionStamp } from "../model/settings";

// Missing or unparseable stamps count as oldest.
function stampMs(iso: string | undefined): number {
  const ms = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(ms) ? 0 : ms;
}

// One section, compared as a whole (wordlists.tags included — no per-tag
// merging). A stamped copy beats an unstamped one; when neither copy is
// stamped (settings written before per-section stamps existed) we fall back
// to the old whole-object rule and follow the newer top-level updatedAt.
// Ties keep local.
function pickSection(local: unknown, remote: unknown, remoteNewerOverall: boolean): unknown {
  const l = (local as SectionStamp | undefined)?.updatedAt;
  const r = (remote as SectionStamp | undefined)?.updatedAt;
  if (!l && !r) return remoteNewerOverall ? (remote ?? local) : (local ?? remote);
  return stampMs(r) > stampMs(l) ? remote : local;
}

// Settings merge section by section (ui, ai, learner, srs, wordlists), so a
// Mac editing flashcard settings and an iPhone editing AI settings both
// survive. Everything outside those sections (schemaVersion, keys from a
// newer plugin version) comes from whichever side has the newer top-level
// updatedAt — which is also the merged updatedAt.
function mergeSettings(local?: PluginSettings, remote?: PluginSettings): PluginSettings {
  if (!local) return remote ?? { schemaVersion: 2 };
  if (!remote) return local;
  const remoteNewer = stampMs(remote.updatedAt) > stampMs(local.updatedAt);
  const out: Record<string, unknown> = { ...(remoteNewer ? remote : local) };
  for (const key of SETTINGS_SECTIONS) {
    const picked = pickSection(local[key], remote[key], remoteNewer);
    if (picked === undefined) delete out[key];
    else out[key] = picked;
  }
  return out as unknown as PluginSettings;
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
    settings: mergeSettings(local.settings, remote.settings),
    entries: order.map((id) => byId.get(id) as VocabEntry),
  };
}

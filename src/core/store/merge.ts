import type { VocabData, VocabEntry } from "../model/entry";
import {
  SETTINGS_SECTIONS,
  legacyStamp,
  sectionFingerprint,
  stampMs,
  type PluginSettings,
  type SectionStamp,
} from "../model/settings";

// Old-version edit time of a copy, if any (see legacyStamp).
type Legacy = ReturnType<typeof legacyStamp>;

// One section, compared as a whole (wordlists.tags included — no per-tag
// merging):
// - same content → keep the copy with the newer stamp;
// - otherwise each copy's effective time is its own stamp (missing = oldest),
//   raised to the old-version edit time when its side has one, and the newer
//   wins. A copy that only won thanks to that raise keeps it as its own
//   stamp, so the old version's edit stays newer after later merges;
// - a missing section never beats a present one;
// - equal effective times (e.g. both copies unstamped, with no old-version
//   edit on either side) go to the side with the newer top-level stamp —
//   the copy edited more recently, as under the old whole-object rule — and
//   only then to the larger fingerprint, so both devices converge without
//   the values themselves deciding whose settings survive.
function pickSection(
  local: unknown,
  remote: unknown,
  localLegacy: Legacy,
  remoteLegacy: Legacy,
  lTop: number,
  rTop: number
): unknown {
  const lOwn = stampMs((local as SectionStamp | undefined)?.updatedAt);
  const rOwn = stampMs((remote as SectionStamp | undefined)?.updatedAt);
  const lf = sectionFingerprint(local);
  const rf = sectionFingerprint(remote);
  if (lf === rf) return rOwn > lOwn ? remote : local;

  const effective = (section: unknown, own: number, legacy: Legacy) =>
    section === undefined ? -1 : Math.max(own, legacy?.ms ?? 0);
  const l = effective(local, lOwn, localLegacy);
  const r = effective(remote, rOwn, remoteLegacy);
  const remoteWins = l !== r ? r > l : lTop !== rTop ? rTop > lTop : rf > lf;
  const [winner, eff, own, legacy] = remoteWins ? [remote, r, rOwn, remoteLegacy] : [local, l, lOwn, localLegacy];
  return legacy && eff > own ? { ...(winner as object), updatedAt: legacy.iso } : winner;
}

// Everything outside the known sections, for breaking a top-level tie.
function restFingerprint(s: PluginSettings): string {
  const rest: Record<string, unknown> = { ...s };
  for (const key of SETTINGS_SECTIONS) delete rest[key];
  return sectionFingerprint(rest);
}

// Settings merge section by section (ui, ai, learner, srs, wordlists, files), so a
// Mac editing flashcard settings and an iPhone editing AI settings both
// survive. Everything outside those sections (schemaVersion, keys from a
// newer plugin version) comes from whichever side has the newer top-level
// updatedAt — which is also the merged updatedAt.
function mergeSettings(local?: PluginSettings, remote?: PluginSettings): PluginSettings {
  if (!local) return remote ?? { schemaVersion: 2 };
  if (!remote) return local;
  const l = stampMs(local.updatedAt);
  const r = stampMs(remote.updatedAt);
  const remoteNewer = l !== r ? r > l : restFingerprint(remote) > restFingerprint(local);
  const out: Record<string, unknown> = { ...(remoteNewer ? remote : local) };
  const localLegacy = legacyStamp(local);
  const remoteLegacy = legacyStamp(remote);
  for (const key of SETTINGS_SECTIONS) {
    const picked = pickSection(local[key], remote[key], localLegacy, remoteLegacy, l, r);
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

import type { VocabDataV1, VocabEntryV1 } from "../model/schemaV1";
import type { VocabData, VocabEntry } from "../model/entry";
import { nowIso } from "../nowIso";

// `added` is nowStamp()'s local-time "YYYY-MM-DD HH:mm:ss" (no timezone).
// New Date() doesn't parse that form reliably across engines, so rewrite it
// to a form Date() does parse ("YYYY-MM-DDTHH:mm:ss", interpreted as local
// time) before converting to ISO/UTC for the new createdAt field.
function parseAddedAt(added: string): string {
  const d = new Date(added.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}

function migrateEntry(entry: VocabEntryV1): VocabEntry {
  const createdAt = entry.added ? parseAddedAt(entry.added) : nowIso();
  return {
    ...entry,
    lang: "en",
    createdAt,
    updatedAt: createdAt,
    rev: 0,
  };
}

// Pure and idempotent in the sense that matters for migrate() in index.ts:
// its output always carries schemaVersion: 2, so index.ts never runs this
// twice on the same data. Running it directly on the same v1 input twice
// yields the same shape (modulo nowIso() fallback when `added` is missing).
export function migrateV1ToV2(raw: VocabDataV1): VocabData {
  return {
    schemaVersion: 2,
    settings: { schemaVersion: 2 },
    entries: raw.entries.map(migrateEntry),
  };
}

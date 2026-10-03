import type { VocabData } from "../model/entry";
import type { VocabDataV1 } from "../model/schemaV1";
import { migrateV1ToV2 } from "./v1-to-v2";

export interface MigrationResult {
  data: VocabData;
  // Whether this call actually ran a migration — callers use this to decide
  // whether a pre-migration backup needs writing.
  migrated: boolean;
}

function isSchemaV2(raw: unknown): raw is VocabData {
  return !!raw && typeof raw === "object" && (raw as Partial<VocabData>).schemaVersion === 2;
}

// Idempotent: data already carrying schemaVersion: 2 is passed through
// untouched, so calling this repeatedly on disk-persisted output never
// re-migrates or re-backs-up.
export function migrate(raw: unknown): MigrationResult {
  if (!raw) {
    return { data: { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] }, migrated: false };
  }
  if (isSchemaV2(raw)) return { data: raw, migrated: false };
  return { data: migrateV1ToV2(raw as VocabDataV1), migrated: true };
}

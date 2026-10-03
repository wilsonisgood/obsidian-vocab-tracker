export interface VocabSource {
  path: string;
  line: number;
}

// Common fields added in M1 (schema v2) so core/store/merge.ts can resolve
// multi-device conflicts by recency instead of "last write wins" clobbering
// the other device's edits. Optional: data read before migration, or an
// entry built by code that hasn't been switched to VocabStore's stamping
// methods yet, may not have these populated — migrate() and VocabStore
// always set real values, everything else should treat them as unknown-old.
export interface Record_ {
  createdAt?: string;
  updatedAt?: string;
  // Soft-delete marker (tombstone) instead of removing the entry, so a
  // delete on one device can be merged against an edit on another instead
  // of just disappearing or reappearing depending on write order.
  deletedAt?: string;
  rev?: number;
}

export interface VocabEntry extends Record_ {
  id: string;
  word: string;
  // Reserved for future non-English support (see 規劃書 06 §1.2); every
  // entry is "en" today.
  lang?: "en";
  // Free-form, comma-separated level/exam tags (e.g. "多益中級, 托福高級")
  // — a word can carry several at once, unlike the old single CEFR select.
  level: string;
  synonyms: string;
  antonyms: string;
  example: string;
  definition: string;
  definitionZh: string;
  phonetic: string;
  audio?: string;
  partOfSpeech: string;
  grammar: string;
  source: VocabSource | null;
  added: string;
  lastReviewed: string;
  reviews: number;
}

export interface VocabData {
  schemaVersion?: 2;
  settings?: { schemaVersion: 2 };
  entries: VocabEntry[];
}

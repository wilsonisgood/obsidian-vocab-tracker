// Frozen snapshot of the pre-M1 data shape (no schemaVersion, no Record_
// fields). Only used as the input type for core/migrations/v1-to-v2.ts — do
// not evolve this file when VocabEntry/VocabData change, it must keep
// matching whatever is actually sitting in old users' data.json.
export interface VocabSourceV1 {
  path: string;
  line: number;
}

export interface VocabEntryV1 {
  id: string;
  word: string;
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
  source: VocabSourceV1 | null;
  added: string;
  lastReviewed: string;
  reviews: number;
}

export interface VocabDataV1 {
  entries: VocabEntryV1[];
}

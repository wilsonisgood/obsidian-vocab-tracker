export interface VocabSource {
  path: string;
  line: number;
}

export interface VocabEntry {
  id: string;
  word: string;
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
  entries: VocabEntry[];
}

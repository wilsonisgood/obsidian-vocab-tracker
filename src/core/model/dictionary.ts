export interface DictionaryResult {
  phonetic: string;
  audio: string;
  partOfSpeech: string;
  definition: string;
  definitionZh: string;
  // See VocabEntry.formOf / sensesZh (1010-2 A1/A2). "" when none.
  formOf?: string;
  sensesZh?: string;
  synonyms: string[];
  antonyms: string[];
}

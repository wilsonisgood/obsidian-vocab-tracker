import type { VocabEntry } from "../../core/model/entry";

// Did the dictionary give this word anything? Any of these non-blank counts;
// 筆記 (grammar) and 程度 (level) are the learner's own and don't. When false
// the word page hides Info entirely and keeps only 筆記 (wave 12 C).
export type DictionaryFields = Partial<
  Pick<VocabEntry, "definition" | "definitionZh" | "phonetic" | "partOfSpeech" | "synonyms" | "antonyms" | "example">
>;

export function hasDictionaryData(entry: DictionaryFields): boolean {
  return [
    entry.definition,
    entry.definitionZh,
    entry.phonetic,
    entry.partOfSpeech,
    entry.synonyms,
    entry.antonyms,
    entry.example,
  ].some((v) => typeof v === "string" && v.trim() !== "");
}

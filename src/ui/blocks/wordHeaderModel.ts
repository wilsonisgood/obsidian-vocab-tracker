import type { VocabEntry } from "../../core/model/entry";

// Did the dictionary give this word anything? Any of these non-blank counts;
// 筆記 (grammar) and 程度 (level) are the learner's own and don't. When false
// the word page keeps only 筆記 plus a 「查字典」 button (wave 12 C, 1010-2 W).
export type DictionaryFields = Partial<
  Pick<VocabEntry, "definition" | "definitionZh" | "phonetic" | "partOfSpeech" | "synonyms" | "antonyms" | "example" | "formOf" | "sensesZh" | "level">
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
    entry.sensesZh,
  ].some((v) => typeof v === "string" && v.trim() !== "");
}

export type InfoKey = "phonetic" | "partOfSpeech" | "synonyms" | "antonyms" | "example" | "level";
export const INFO_KEYS: readonly InfoKey[] = ["phonetic", "partOfSpeech", "synonyms", "antonyms", "example", "level"];

function filled(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

// "n. 壓力、應力；v. 強調" → one line per part of speech (split on ；/;).
export function senseLines(sensesZh: string | undefined): string[] {
  if (!filled(sensesZh)) return [];
  return sensesZh
    .split(/[；;]/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

export interface HeaderVisibility {
  formOf: string | null; // muted small label above the definition
  definition: boolean;
  definitionZh: boolean;
  infoRows: InfoKey[]; // only the ones with a value, in display order
  senses: string[]; // 詞義 rows
  showInfo: boolean; // is there anything for the Info fold
  showLookup: boolean; // no dictionary data at all → offer 查字典
}

// 1010-2 W #2: whether or not the dictionary was ever queried, show only
// fields that have a value. 筆記 is always shown (not decided here).
export function headerVisibility(entry: DictionaryFields): HeaderVisibility {
  const infoRows = INFO_KEYS.filter((k) => filled(entry[k]));
  const senses = senseLines(entry.sensesZh);
  return {
    formOf: filled(entry.formOf) ? entry.formOf.trim() : null,
    definition: filled(entry.definition),
    definitionZh: filled(entry.definitionZh),
    infoRows,
    senses,
    showInfo: infoRows.length > 0 || senses.length > 0,
    showLookup: !hasDictionaryData(entry),
  };
}

import type { VocabEntry } from "../../core/model/entry";
import type { DictionaryResult } from "../../core/model/dictionary";
import { isFormOfSentence } from "../../core/store/needsEnrich";

export interface RefreshDictionary {
  fetchDictionary(word: string): Promise<DictionaryResult>;
  translateToZhTW(text: string): Promise<string>;
}

// 1010-2 A3: re-fetch a word an older version looked up. Only overwrites
// what is provably machine output — definitionZh when it still equals the
// translation of the definition, definition when it is a form-of sentence.
// Always writes sensesZh (the "looked up by the new version" marker).
// Returns false (nothing touched) when the fetch fails, to retry next start.
export async function refreshStaleDictionary(entry: VocabEntry, dictionary: RefreshDictionary): Promise<boolean> {
  let data: DictionaryResult;
  try {
    data = await dictionary.fetchDictionary(entry.word);
  } catch {
    return false;
  }
  const oldDefinition = entry.definition ?? "";
  const oldZh = (entry.definitionZh ?? "").trim();
  let zhIsMachine = false;
  if (oldDefinition.trim()) {
    zhIsMachine = oldZh === (await dictionary.translateToZhTW(oldDefinition)).trim();
  }
  if (zhIsMachine && data.definitionZh) entry.definitionZh = data.definitionZh;
  if (isFormOfSentence(oldDefinition) && data.definition) {
    entry.definition = data.definition;
    if (data.formOf && !entry.formOf) entry.formOf = data.formOf;
  }
  entry.sensesZh = data.sensesZh ?? "";
  return true;
}

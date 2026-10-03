import type { HttpPort } from "../../core/ports";
import type { DictionaryResult } from "../../core/model/dictionary";
import { errorMessage } from "../../core/errorMessage";
import { fetchWiktionaryDefinition } from "./sources/wiktionary";
import { fetchDatamuseDefinition, fetchDatamuseRelated } from "./sources/datamuse";
import { translateWithGoogle } from "./translate/google";
import { translateWithMyMemory } from "./translate/mymemory";

export class DictionaryService {
  constructor(private http: HttpPort) {}

  // Wiktionary first, Datamuse as fallback for the definition; Datamuse
  // always supplies synonyms/antonyms. All three requests run concurrently.
  async fetchDictionary(word: string): Promise<DictionaryResult> {
    const w = word.toLowerCase();

    const defPromise = this.fetchDefinition(w);
    const synPromise = fetchDatamuseRelated(this.http, w, "rel_syn");
    const antPromise = fetchDatamuseRelated(this.http, w, "rel_ant");

    const { definition, partOfSpeech } = await defPromise;
    const definitionZh = await this.translateToZhTW(definition);
    const synonyms = await synPromise;
    const antonyms = await antPromise;

    return { phonetic: "", audio: "", partOfSpeech, definition, definitionZh, synonyms, antonyms };
  }

  // Translation is a bonus — failure here must not sink the definition
  // fetch, so it soft-fails to "".
  async translateToZhTW(text: string): Promise<string> {
    if (!text) return "";
    try {
      return await translateWithGoogle(this.http, text);
    } catch (primaryErr) {
      try {
        return await translateWithMyMemory(this.http, text);
      } catch (fallbackErr) {
        console.error("Vocab Tracker: translation failed", primaryErr, fallbackErr);
        return "";
      }
    }
  }

  private async fetchDefinition(w: string): Promise<{ definition: string; partOfSpeech: string }> {
    try {
      return await fetchWiktionaryDefinition(this.http, w);
    } catch (primaryErr) {
      try {
        return await fetchDatamuseDefinition(this.http, w);
      } catch (fallbackErr) {
        throw new Error(
          `${errorMessage(primaryErr)}; fallback also failed: ${errorMessage(fallbackErr)}`,
          { cause: fallbackErr }
        );
      }
    }
  }
}

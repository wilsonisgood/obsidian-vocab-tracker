import type { HttpPort } from "../../core/ports";
import { DictionaryError, combinedKind } from "./errors";
import type { DictionaryResult } from "../../core/model/dictionary";
import { errorMessage } from "../../core/errorMessage";
import { fetchWiktionaryDefinition } from "./sources/wiktionary";
import { fetchDatamuseDefinition, fetchDatamuseRelated } from "./sources/datamuse";
import { translateWithGoogle, translateWithGoogleSenses } from "./translate/google";
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

    const found = await defPromise;
    let { definition, partOfSpeech } = found;
    // 1010-2 A1: "plural of stress" → define the lemma, keep the form-of
    // sentence as formOf. Lemma lookup failing keeps the sentence.
    let formOf = "";
    if (found.baseForm && found.baseForm.toLowerCase() !== w) {
      try {
        const base = await fetchWiktionaryDefinition(this.http, found.baseForm.toLowerCase());
        formOf = definition;
        definition = base.definition;
        partOfSpeech = base.partOfSpeech;
      } catch {
        // keep the form-of sentence as the definition
      }
    }
    // 1010-2: translate the word itself (attic → 閣樓, scudded → its
    // meaning) — translating the long definition gave wordy, pointless
    // glosses. Falls back to the definition when Google echoes the word.
    const { text: wordZh, sensesZh } = await this.translateWordWithSenses(w);
    const definitionZh =
      wordZh && wordZh.trim().toLowerCase() !== w ? wordZh : await this.translateToZhTW(definition);
    const synonyms = await synPromise;
    const antonyms = await antPromise;

    return { phonetic: "", audio: "", partOfSpeech, definition, definitionZh, synonyms, antonyms, formOf, sensesZh };
  }

  // Google with the dt=bd senses; MyMemory fallback has none ("").
  private async translateWordWithSenses(w: string): Promise<{ text: string; sensesZh: string }> {
    try {
      return await translateWithGoogleSenses(this.http, w);
    } catch {
      return { text: await this.translateToZhTW(w), sensesZh: "" };
    }
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

  private async fetchDefinition(w: string): Promise<{ definition: string; partOfSpeech: string; baseForm?: string }> {
    try {
      return await fetchWiktionaryDefinition(this.http, w);
    } catch (primaryErr) {
      try {
        return await fetchDatamuseDefinition(this.http, w);
      } catch (fallbackErr) {
        throw new DictionaryError(
          combinedKind(primaryErr, fallbackErr),
          `${errorMessage(primaryErr)}; fallback also failed: ${errorMessage(fallbackErr)}`,
          { cause: fallbackErr }
        );
      }
    }
  }
}

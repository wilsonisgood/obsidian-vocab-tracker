import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";

const POS_MAP: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "",
};

interface DatamuseDefinitionEntry {
  defs?: string[];
}

interface DatamuseRelatedEntry {
  word: string;
}

// Fallback definition source when Wiktionary doesn't have the word.
export async function fetchDatamuseDefinition(
  http: HttpPort,
  w: string
): Promise<{ definition: string; partOfSpeech: string }> {
  let res;
  try {
    res = await http.get(`https://api.datamuse.com/words?sp=${http.encodeQueryParam(w)}&md=d&max=1`);
  } catch (e) {
    throw new Error(`Datamuse request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`Datamuse API returned HTTP ${res.status}`);

  let arr: DatamuseDefinitionEntry[];
  try {
    arr = res.json as DatamuseDefinitionEntry[];
  } catch (e) {
    throw new Error("couldn't parse Datamuse response", { cause: e });
  }
  const defs = Array.isArray(arr) && Array.isArray(arr[0]?.defs) ? arr[0].defs! : [];
  if (defs.length === 0) throw new Error(`"${w}" not found in dictionary`);

  const [posTag, definition] = defs[0].split("\t");
  const partOfSpeech = POS_MAP[posTag] ?? posTag ?? "";

  return { definition: (definition || "").trim(), partOfSpeech };
}

// Soft-fails to [] — missing synonyms/antonyms shouldn't sink the whole fetch.
export async function fetchDatamuseRelated(
  http: HttpPort,
  w: string,
  rel: "rel_syn" | "rel_ant"
): Promise<string[]> {
  try {
    const res = await http.get(`https://api.datamuse.com/words?${rel}=${http.encodeQueryParam(w)}&max=8`);
    const json = res.json as DatamuseRelatedEntry[];
    if (res.status !== 200 || !Array.isArray(json)) return [];
    return json.map((entry) => entry.word);
  } catch {
    return [];
  }
}

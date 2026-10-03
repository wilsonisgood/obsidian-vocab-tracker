import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";

interface WiktionaryEntry {
  partOfSpeech?: string;
  definitions?: { definition?: string }[];
}
interface WiktionaryResponse {
  en?: WiktionaryEntry[];
}

// Wiktionary's REST API sits behind Wikimedia's global CDN (fast + reliable
// worldwide, incl. mobile networks); it doesn't return synonyms/antonyms,
// those come from Datamuse.
export async function fetchWiktionaryDefinition(
  http: HttpPort,
  w: string
): Promise<{ definition: string; partOfSpeech: string }> {
  let res;
  try {
    res = await http.get(`https://en.wiktionary.org/api/rest_v1/page/definition/${http.encodeQueryParam(w)}`);
  } catch (e) {
    throw new Error(`Wiktionary request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status === 404) throw new Error(`"${w}" not found in dictionary`);
  if (res.status !== 200) throw new Error(`Wiktionary API returned HTTP ${res.status}`);

  let data: WiktionaryResponse;
  try {
    data = res.json as WiktionaryResponse;
  } catch (e) {
    throw new Error("couldn't parse Wiktionary response", { cause: e });
  }
  const entries = Array.isArray(data?.en) ? data.en : [];
  const entry = entries.find((en) => en.definitions?.[0]?.definition);
  if (!entry) throw new Error(`"${w}" not found in dictionary`);

  const rawDefinition = entry.definitions?.[0]?.definition || "";
  const definition = rawDefinition.replace(/<[^>]+>/g, "").trim();
  const partOfSpeech = (entry.partOfSpeech || "").toLowerCase();

  return { definition, partOfSpeech };
}

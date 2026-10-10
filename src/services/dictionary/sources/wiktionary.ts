import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";

interface WiktionaryEntry {
  partOfSpeech?: string;
  definitions?: { definition?: string }[];
}
interface WiktionaryResponse {
  en?: WiktionaryEntry[];
}

// Entries that are never what a learner means: "run" / "see" / "set" open
// with an ISO 639 language-code Symbol entry.
const SKIPPED_POS = new Set(["symbol", "proper noun", "letter"]);

interface Sense {
  partOfSpeech: string;
  definition: string;
  // A {{lb}} label (dialectal, obsolete, slang…) on the sense itself. The
  // REST API blanks the label text, so only its presence is known.
  labeled: boolean;
}

// One raw sense → plain text. Nested <ol>/<ul> sub-senses are dropped —
// the API repeats each of them as its own following definition anyway.
// null for a blank sense or a category header that isn't a definition
// itself ("fine": <i>Senses referring to subjective quality.</i>).
function parseSense(partOfSpeech: string, html: string): Sense | null {
  const cleaned = html.replace(/<style[\s\S]*?<\/style>/g, "");
  const listAt = cleaned.search(/<(ol|ul|dl)[\s>]/);
  const head = (listAt === -1 ? cleaned : cleaned.slice(0, listAt)).trim();
  if (/^<i>[\s\S]*<\/i>$/.test(head) || /^<span class="use-with-mention"[^>]*>[^<]*<\/span>$/.test(head)) return null;
  const definition = toText(head);
  if (!definition) return null;
  return { partOfSpeech, definition, labeled: head.includes("usage-label-sense") };
}

function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:])/g, "$1")
    .trim();
}

// Each entry's first real sense, in page order. A blank first sense is a
// sub-sense header ("people", "time") — skip to the next, not the next
// entry; a "…:" one ("go": "To move, either physically or in an abstract
// sense:") is completed by the sense after it. An entry whose only sense is labeled is a niche homograph
// ("made" → dialectal "maggot", ahead of "past of make"), so it loses to
// any other entry.
export function pickWiktionarySense(entries: WiktionaryEntry[]): Sense | null {
  const firsts: { sense: Sense; niche: boolean }[] = [];
  for (const entry of entries) {
    const pos = (entry.partOfSpeech || "").toLowerCase();
    if (SKIPPED_POS.has(pos)) continue;
    const senses = (entry.definitions || [])
      .map((d) => parseSense(pos, d.definition || ""))
      .filter((s): s is Sense => s !== null);
    if (senses.length === 0) continue;
    let sense = senses[0];
    if (sense.definition.endsWith(":") && senses[1]) {
      sense = { ...sense, definition: `${sense.definition} ${senses[1].definition}` };
    }
    firsts.push({ sense, niche: senses.length === 1 && sense.labeled });
  }
  return (firsts.find((f) => !f.niche) ?? firsts[0])?.sense ?? null;
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
  const sense = pickWiktionarySense(Array.isArray(data?.en) ? data.en : []);
  if (!sense) throw new Error(`"${w}" not found in dictionary`);

  return { definition: sense.definition, partOfSpeech: sense.partOfSpeech };
}

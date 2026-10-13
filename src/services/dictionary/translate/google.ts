import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";
import { looksLikeValidTranslation } from "./validate";

type GoogleTranslateResponse = [[string, string][], ([string, unknown[]] | null)[] | null];

const POS_ABBR: Record<string, string> = {
  noun: "n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  preposition: "prep.",
  conjunction: "conj.",
  pronoun: "pron.",
  interjection: "interj.",
};

// Google's dt=bd dictionary block → "n. 壓力、應力、重音；v. 強調、注重"
// (1010-2 A2). Up to 3 words per part of speech, Google's own order.
// "" when there is no dictionary block (data[1] is null for e.g. "scudded").
export function formatSensesZh(dict: unknown): string {
  if (!Array.isArray(dict)) return "";
  const parts: string[] = [];
  for (const item of dict) {
    if (!Array.isArray(item) || typeof item[0] !== "string" || !Array.isArray(item[1])) continue;
    const words = (item[1] as unknown[]).filter((w): w is string => typeof w === "string" && w.trim() !== "").slice(0, 3);
    if (words.length === 0) continue;
    const pos = item[0].toLowerCase();
    parts.push(`${POS_ABBR[pos] ?? item[0]} ${words.join("、")}`);
  }
  return parts.join("；");
}

// Google's unofficial endpoint: no key, best quality, converts to
// Traditional automatically.
export async function translateWithGoogle(http: HttpPort, text: string): Promise<string> {
  return (await googleTranslate(http, text, false)).text;
}

// Same call plus dt=bd: also returns the per-part-of-speech senses.
export async function translateWithGoogleSenses(
  http: HttpPort,
  text: string
): Promise<{ text: string; sensesZh: string }> {
  return googleTranslate(http, text, true);
}

async function googleTranslate(
  http: HttpPort,
  text: string,
  withSenses: boolean
): Promise<{ text: string; sensesZh: string }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t${withSenses ? "&dt=bd" : ""}&q=${http.encodeQueryParam(text)}`;
  let res;
  try {
    res = await http.get(url);
  } catch (e) {
    throw new Error(`Google Translate request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`Google Translate returned HTTP ${res.status}`);

  let data: GoogleTranslateResponse;
  try {
    data = res.json as GoogleTranslateResponse;
  } catch (e) {
    throw new Error("couldn't parse Google Translate response", { cause: e });
  }
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  const translated = segments.map((seg) => seg?.[0] || "").join("");
  if (!looksLikeValidTranslation(translated)) throw new Error("empty or corrupted translation");
  return { text: translated, sensesZh: withSenses ? formatSensesZh(data?.[1]) : "" };
}

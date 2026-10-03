import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";
import { looksLikeValidTranslation } from "./validate";

type GoogleTranslateResponse = [[string, string][]];

// Google's unofficial endpoint: no key, best quality, converts to
// Traditional automatically.
export async function translateWithGoogle(http: HttpPort, text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${http.encodeQueryParam(text)}`;
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
  return translated;
}

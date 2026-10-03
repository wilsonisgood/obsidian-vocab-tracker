import type { HttpPort } from "../../../core/ports";
import { errorMessage } from "../../../core/errorMessage";
import { looksLikeValidTranslation } from "./validate";

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
}

// The sanctioned free-tier fallback when Google's endpoint fails.
export async function translateWithMyMemory(http: HttpPort, text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${http.encodeQueryParam(text)}&langpair=en|zh-TW`;
  let res;
  try {
    res = await http.get(url);
  } catch (e) {
    throw new Error(`MyMemory request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`MyMemory returned HTTP ${res.status}`);

  let data: MyMemoryResponse;
  try {
    data = res.json as MyMemoryResponse;
  } catch (e) {
    throw new Error("couldn't parse MyMemory response", { cause: e });
  }
  const translated = data?.responseData?.translatedText || "";
  if (!looksLikeValidTranslation(translated)) throw new Error("empty or corrupted translation");
  return translated;
}

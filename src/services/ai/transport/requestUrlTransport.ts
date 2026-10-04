import type { RawHttpRequest, RequestPort } from "../../../core/ports";
import { AiError } from "../errors";
import type { AiTransport, TransportResponse } from "./types";

// Non-streaming fallback through Obsidian's requestUrl, which isn't subject
// to CORS (needed for Ollama without OLLAMA_ORIGINS, and some iOS WebViews).
// requestUrl can't be cancelled, so abort is emulated: the caller gets an
// "aborted" rejection right away and the late response is discarded.
export class RequestUrlTransport implements AiTransport {
  constructor(private port: RequestPort) {}

  async send(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse> {
    if (signal.aborted) throw new AiError("aborted");

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new AiError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const res = await Promise.race([this.port.request(req), aborted]);
      const headers = lowerKeys(res.headers);
      return {
        status: res.status,
        header: (n) => headers[n.toLowerCase()] ?? null,
        headers,
        chunks: once(res.text),
        mode: "requestUrl",
      };
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = v;
  return out;
}

async function* once(text: string): AsyncGenerator<string> {
  yield text;
}

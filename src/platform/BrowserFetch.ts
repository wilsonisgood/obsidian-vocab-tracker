import type { FetchPort, FetchResponse, RawHttpRequest } from "../core/ports";

// Streaming transport for AI requests. window.fetch is subject to CORS in
// Obsidian; when it fails with a TypeError, services/ai falls back to
// requestUrl (ObsidianRequest) for that provider on this device.
export class BrowserFetch implements FetchPort {
  async fetch(req: RawHttpRequest, signal: AbortSignal): Promise<FetchResponse> {
    const res = await window.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
    });
    return {
      status: res.status,
      header: (name) => res.headers.get(name),
      headers: Object.fromEntries(res.headers.entries()),
      chunks: readChunks(res),
    };
  }
}

async function* readChunks(res: Response): AsyncGenerator<string> {
  if (!res.body) {
    yield await res.text();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // stream: true keeps a multi-byte character split across chunks
      // (common with CJK answers) from turning into U+FFFD.
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    // Runs when the consumer stops early (terminal SSE event, abort):
    // close the connection instead of leaving it to drain.
    reader.cancel().catch(() => undefined);
  }
}

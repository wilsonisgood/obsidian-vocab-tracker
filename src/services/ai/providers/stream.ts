import { AiError, classifyHttpError } from "../errors";
import { parseSse, type SseEvent } from "../transport/sse";
import { readAll, type TransportResponse } from "../transport/types";

// Shared response plumbing for both providers: turn a non-2xx into an
// AiError, then hand the body to either an SSE event handler or a JSON
// handler depending on what the server actually sent (some
// OpenAI-compatible servers ignore `stream: true` and answer with JSON).

export async function throwIfHttpError(res: TransportResponse): Promise<void> {
  if (res.status >= 200 && res.status < 300) return;
  const body = await readAll(res.chunks).catch(() => "");
  throw classifyHttpError(res.status, body, res.header("retry-after"));
}

export async function consumeBody(
  res: TransportResponse,
  signal: AbortSignal,
  onEvent: (ev: SseEvent) => boolean | void,
  onJson: (json: unknown) => void
): Promise<void> {
  const contentType = res.header("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const text = await readAll(res.chunks);
      onJson(parseJson(text));
      return;
    }
    for await (const ev of parseSse(res.chunks)) {
      if (signal.aborted) throw new AiError("aborted");
      // Handler returns true once it has seen the terminal event, so a
      // keep-alive connection that never closes doesn't hang the request.
      if (onEvent(ev) === true) return;
    }
  } catch (e) {
    if (signal.aborted) throw new AiError("aborted", undefined, { cause: e });
    if (e instanceof AiError) throw e;
    // A dropped connection mid-stream surfaces as a TypeError from the reader.
    throw new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new AiError("bad_output", "Response body is not valid JSON", { cause: e });
  }
}

// Structured output for providers without native JSON-schema support: the
// model was asked for bare JSON, but often wraps it in a ```json fence or a
// sentence anyway. Take the outermost {...} or [...] and parse that.
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new AiError("bad_output", "No JSON found in model output");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new AiError("bad_output", "Unterminated JSON in model output");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (e) {
    throw new AiError("bad_output", "Model output is not valid JSON", { cause: e });
  }
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

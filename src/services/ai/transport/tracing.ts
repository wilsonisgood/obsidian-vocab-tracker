import type { RawHttpRequest } from "../../../core/ports";
import type { AiTransport, TransportMode, TransportResponse } from "./types";

// Records the raw HTTP exchange so 測試連線 can show exactly what was sent
// and what came back — the error code alone ("bad_request") rarely says
// why, e.g. Gemini answers a bad key with a 400 instead of a 401.

export interface HttpTrace {
  request: RawHttpRequest;
  response?: {
    status: number;
    mode: TransportMode;
    headers: Record<string, string>;
    // Grows as the consumer reads the body.
    body: string;
  };
  // Set when no HTTP response arrived (network / CORS / abort).
  error?: string;
  ms?: number;
}

const SECRET_HEADERS = new Set(["authorization", "x-api-key", "x-goog-api-key", "api-key"]);
// The body isn't needed in full to diagnose anything; a streamed answer
// can't get past this with the test's small max_tokens anyway.
export const MAX_BODY_CHARS = 20_000;

// Keeps enough of the key to tell which one was used (and spot stray
// whitespace or a truncated paste) without putting the whole secret on
// screen, where it would end up in screenshots.
export function maskSecret(value: string): string {
  const m = /^(Bearer\s+)?(.*)$/is.exec(value);
  const prefix = m?.[1] ?? "";
  const secret = m?.[2] ?? value;
  const shown = secret.length <= 12 ? "…" : `${secret.slice(0, 6)}…${secret.slice(-4)}`;
  return `${prefix}${shown} [${secret.length}]`;
}

export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? maskSecret(v) : v;
  return out;
}

export class TracingTransport implements AiTransport {
  constructor(
    private inner: AiTransport,
    readonly traces: HttpTrace[],
    private now: () => number = Date.now
  ) {}

  async send(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse> {
    const trace: HttpTrace = { request: { ...req, headers: maskHeaders(req.headers) } };
    this.traces.push(trace);
    const started = this.now();
    let res: TransportResponse;
    try {
      res = await this.inner.send(req, signal);
    } catch (e) {
      trace.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      trace.ms = this.now() - started;
      throw e;
    }
    trace.ms = this.now() - started;
    const recorded = { status: res.status, mode: res.mode, headers: res.headers ?? {}, body: "" };
    trace.response = recorded;
    return { ...res, chunks: tee(res.chunks, recorded) };
  }
}

async function* tee(chunks: AsyncIterable<string>, into: { body: string }): AsyncGenerator<string> {
  for await (const c of chunks) {
    if (into.body.length < MAX_BODY_CHARS) into.body += c.slice(0, MAX_BODY_CHARS - into.body.length);
    yield c;
  }
}

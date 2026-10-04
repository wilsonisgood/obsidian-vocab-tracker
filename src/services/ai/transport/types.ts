import type { RawHttpRequest } from "../../../core/ports";

export type TransportMode = "fetch" | "requestUrl";

export interface TransportResponse {
  readonly status: number;
  header(name: string): string | null;
  // Body text. fetch yields chunks as they arrive; requestUrl yields the
  // whole body once — providers parse both with the same SSE parser.
  readonly chunks: AsyncIterable<string>;
  // Which transport actually answered, so the UI can say "回答中…" instead
  // of showing a streaming cursor when the fallback is in use.
  readonly mode: TransportMode;
}

export interface AiTransport {
  send(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse>;
}

export async function readAll(chunks: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const c of chunks) out += c;
  return out;
}

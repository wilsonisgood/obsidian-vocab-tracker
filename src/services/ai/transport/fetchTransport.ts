import type { FetchPort, RawHttpRequest } from "../../../core/ports";
import type { AiTransport, TransportResponse } from "./types";

// Streaming transport (desktop and most mobile WebViews). Errors are passed
// through untouched: a TypeError here is exactly the "never got an HTTP
// response" signal fallbackTransport keys off, so wrapping it would lose it.
export class FetchTransport implements AiTransport {
  constructor(private port: FetchPort) {}

  async send(req: RawHttpRequest, signal: AbortSignal): Promise<TransportResponse> {
    const res = await this.port.fetch(req, signal);
    return { status: res.status, header: (n) => res.header(n), chunks: res.chunks, mode: "fetch" };
  }
}

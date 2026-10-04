import { readFileSync } from "node:fs";
import type { DeviceStatePort, NetworkPort, RawHttpRequest, SecretPort, StoragePort } from "../../../src/core/ports";
import type { AiTransport, TransportMode, TransportResponse } from "../../../src/services/ai/transport/types";

export function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/sse/${name}`, import.meta.url), "utf8");
}

// Splits text into fixed-size chunks — chunkSize 1 exercises every possible
// split point, including inside "data:" and in the middle of a CRLF.
export function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function* iter(parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}

export function response(
  body: string,
  opts: { status?: number; headers?: Record<string, string>; chunkSize?: number; mode?: TransportMode } = {}
): TransportResponse {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? { "content-type": "text/event-stream" })) headers[k.toLowerCase()] = v;
  return {
    status: opts.status ?? 200,
    header: (n) => headers[n.toLowerCase()] ?? null,
    chunks: iter(opts.chunkSize ? chunk(body, opts.chunkSize) : [body]),
    mode: opts.mode ?? "fetch",
  };
}

export function errorResponse(status: number, json: unknown, headers: Record<string, string> = {}): TransportResponse {
  return response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });
}

export class FakeTransport implements AiTransport {
  requests: RawHttpRequest[] = [];
  constructor(private handler: (req: RawHttpRequest, n: number) => TransportResponse | Promise<TransportResponse>) {}

  async send(req: RawHttpRequest): Promise<TransportResponse> {
    this.requests.push(req);
    return this.handler(req, this.requests.length - 1);
  }

  body(i = 0): Record<string, unknown> {
    return JSON.parse(this.requests[i].body ?? "{}");
  }
}

export class MemoryStorage implements StoragePort {
  shards = new Map<string, unknown>();
  writes = 0;
  async readShard<T>(name: string): Promise<T | null> {
    const v = this.shards.get(name);
    return v === undefined ? null : (structuredClone(v) as T);
  }
  async writeShard<T>(name: string, data: T): Promise<void> {
    this.writes++;
    this.shards.set(name, structuredClone(data));
  }
  async backup(): Promise<void> {}
}

export class MemoryDevice implements DeviceStatePort {
  map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string | null): void {
    if (value === null) this.map.delete(key);
    else this.map.set(key, value);
  }
}

export class MemorySecrets implements SecretPort {
  map = new Map<string, string>();
  constructor(public available = true) {}
  get(id: string): string | null {
    return this.map.get(id) ?? null;
  }
  set(id: string, value: string): void {
    this.map.set(id, value);
  }
}

export class FakeNetwork implements NetworkPort {
  online = true;
  isOnline(): boolean {
    return this.online;
  }
}

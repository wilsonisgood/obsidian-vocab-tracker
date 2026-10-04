export interface HttpResponse {
  readonly status: number;
  // Lazily parsed by the implementation (mirrors Obsidian's requestUrl),
  // so JSON-parse failures throw where callers already expect them.
  readonly json: unknown;
}

// Abstracts the Obsidian requestUrl transport so services/** never import
// "obsidian" directly.
export interface HttpPort {
  // Obsidian mobile's requestUrl (iOS/Android) mangles query params that
  // arrive pre-percent-encoded — the transport layer re-processes the URL
  // and strips/duplicates the encoding, so "%20" ends up sent to the server
  // literally instead of as a space (matches ionic-team/capacitor#7523).
  // Desktop's requestUrl has no such bug and needs the encoding, so only
  // mobile skips it and leaves escaping to the native request layer.
  encodeQueryParam(text: string): string;
  get(url: string): Promise<HttpResponse>;
}

// Abstracts the plugin's on-disk data so core/** never imports "obsidian".
// One file per shard (regulation 06 §4.2: "data" today, "threads"/"learn"/
// etc. land with the milestones that actually write them) — adding a shard
// later is a new readShard/writeShard call, not an interface change.
export interface StoragePort {
  readShard<T>(name: string): Promise<T | null>;
  writeShard<T>(name: string, data: T): Promise<void>;
  // Writes `data` (the pre-migration raw shard) somewhere recoverable,
  // called once right before a migration's first write-back.
  backup(name: string, data: unknown): Promise<void>;
}

// ─── AI transport (規劃書 06 §6.2) ─────────────────────────────────────────

export interface RawHttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

// Streaming HTTP (window.fetch). The body arrives as already-decoded text
// chunks so services never touch ReadableStream/TextDecoder directly — that
// keeps fakes in tests trivial (an array of strings).
export interface FetchResponse {
  readonly status: number;
  header(name: string): string | null;
  readonly chunks: AsyncIterable<string>;
}

export interface FetchPort {
  // Rejects with a TypeError when the request never got an HTTP response
  // (CORS block, DNS failure, offline) — the same contract as window.fetch,
  // which is what the transport's fallback decision keys off.
  fetch(req: RawHttpRequest, signal: AbortSignal): Promise<FetchResponse>;
}

// Non-streaming HTTP that bypasses CORS (Obsidian's requestUrl). The whole
// body is buffered, so callers get one string instead of chunks.
export interface RequestPort {
  request(req: RawHttpRequest): Promise<{ status: number; headers: Record<string, string>; text: string }>;
}

// Per-device key/value state that must NOT travel with vault sync (e.g.
// "this iPhone needs the requestUrl fallback"). Backed by Obsidian's
// localStorage wrapper, which is scoped to vault + device.
export interface DeviceStatePort {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

// Obsidian's SecretStorage (1.11.4+). `available` is false on older apps,
// in which case keys fall back to plugin data (see services/ai/keys.ts).
export interface SecretPort {
  readonly available: boolean;
  get(id: string): string | null;
  set(id: string, value: string): void;
}

export interface NetworkPort {
  isOnline(): boolean;
}

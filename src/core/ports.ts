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
  // Every response header, only for the 測試連線 trace. Optional so test
  // fakes can skip it.
  readonly headers?: Record<string, string>;
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

// Read-only access to notes in the vault (source paragraphs for AI
// context). Null when the note no longer exists.
export interface NoteReaderPort {
  read(path: string): Promise<string | null>;
}

// Word list files in a vault folder (規劃書 03 §3.2). `list` returns the
// files directly or nested under `folder`; `read` their text.
export interface WordlistFile {
  path: string;
  // File name without extension — the default tag.
  basename: string;
}

export interface WordlistSourcePort {
  list(folder: string): WordlistFile[];
  read(path: string): Promise<string | null>;
}

// Vault access for paragraph anchors (規劃書 06 §5.1). The Obsidian
// implementation lives in platform/ObsidianVault.ts.

export interface ParagraphVaultPort extends NoteReaderPort {
  // Atomic read-modify-write of a note — Obsidian's `vault.process(file,
  // fn)`. `fn` receives the note's current text and returns the new text;
  // whatever it throws rejects the call and leaves the note untouched.
  // Rejects when the note doesn't exist. Resolves to the text written.
  process(path: string, fn: (content: string) => string): Promise<string>;
  // True when any note in the vault already has a block with this id
  // (`metadataCache.getFileCache(f)?.blocks?.[id]` over the markdown
  // files). The note being edited is also checked against its fresh text
  // inside `process`, so a stale cache can't cause a duplicate there.
  blockIdTaken(id: string): boolean;
}

// "block": write ` ^vt-xxxxxx` into the note the first time a paragraph
// is discussed. "hash": never touch the note (設定「不要修改我的筆記」) —
// the anchor is the paragraph's text hash and breaks when the text changes.
export type AnchorMode = "block" | "hash";

// Markdown files in the vault, implemented by platform/ObsidianVault.ts.
export interface VaultPort {
  exists(path: string): boolean;
  // Creates the file, and any missing parent folders. Rejects when the
  // file already exists (never overwrites).
  create(path: string, content: string): Promise<void>;
  // Atomic read-modify-write of an existing file (Obsidian's
  // vault.process): `fn` gets the current text and returns the new text.
  process(path: string, fn: (text: string) => string): Promise<void>;
  // Moves a file, keeping links to it updated (fileManager.renameFile).
  rename(from: string, to: string): Promise<void>;
  // A note whose frontmatter has `vocab-tracker: <kind>` and
  // `vocab-tracker-id: <id>` — finds a word page the user renamed or moved
  // (規劃書 06 §4.6). Null when there's none. Compare the id as a string:
  // YAML may have parsed an unquoted numeric id as a number.
  findManaged(kind: string, id: string): string | null;
}

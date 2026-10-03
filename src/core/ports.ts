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

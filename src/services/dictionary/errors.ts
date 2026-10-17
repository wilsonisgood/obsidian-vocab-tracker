// Why a dictionary lookup failed, so the notice can say something useful
// (1017: on an iPhone behind a Wi-Fi that intercepts HTTPS, the raw
// "TLS錯誤…; fallback also failed: 此伺服器的憑證無效…" told the user nothing).
//
// "network": no HTTP response at all (offline, TLS/certificate failure,
// timeout) — worth retrying on another network. "notFound": the
// dictionary answered and doesn't have the word. "other": anything else.
export type DictionaryErrorKind = "network" | "notFound" | "other";

export class DictionaryError extends Error {
  constructor(
    public kind: DictionaryErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "DictionaryError";
  }
}

export function dictionaryErrorKind(e: unknown): DictionaryErrorKind {
  return e instanceof DictionaryError ? e.kind : "other";
}

// The primary and fallback sources both failed: a word one of them doesn't
// know is "notFound"; it's "network" only when neither could be reached.
export function combinedKind(a: unknown, b: unknown): DictionaryErrorKind {
  const ka = dictionaryErrorKind(a);
  const kb = dictionaryErrorKind(b);
  if (ka === "notFound" || kb === "notFound") return "notFound";
  if (ka === "network" && kb === "network") return "network";
  return "other";
}

// Safety net for the mobile encoding bug (see platform/ObsidianHttp.ts) and
// for providers that return an HTTP 200 with an English error string instead
// of throwing: reject anything that still looks like raw percent-encoding or
// is obviously not a translation, so callers fall back instead of showing
// garbage like "%20act %20of %20putting".
export function looksLikeValidTranslation(s: string): boolean {
  return s.length > 0 && !/%[0-9A-Fa-f]{2}/.test(s);
}

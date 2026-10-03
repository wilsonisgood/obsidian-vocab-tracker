// Separate from nowStamp() (which is local-time, display-only): merge.ts
// compares updatedAt as strings, and a local-time string's lexical order
// breaks across devices in different timezones. ISO 8601 (UTC) sorts
// correctly regardless of where it was written.
export function nowIso(): string {
  return new Date().toISOString();
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "=" is included in the boundary set so this never matches *inside* an
// already-highlighted ==word==.
export function buildWordRe(word: string): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9'=\\-])${escapeRe(word)}(?![A-Za-z0-9'=\\-])`,
    "gi"
  );
}

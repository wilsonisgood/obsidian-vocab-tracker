// 1010 #I1/#T3: the sheet's definitions take one line by default and grow
// to at most two; anything longer is cut with "…" until tapped. The DOM
// measures scrollHeight and the computed line-height, this decides.
export const DEFINITION_MAX_LINES = 2;

export function definitionClamp(
  scrollHeight: number,
  lineHeightPx: number
): { lines: 1 | 2; truncated: boolean } {
  if (!(lineHeightPx > 0) || !(scrollHeight > 0)) return { lines: 1, truncated: false };
  // Small tolerance so sub-pixel rounding never counts as an extra line.
  const needed = Math.ceil(scrollHeight / lineHeightPx - 0.05);
  return {
    lines: needed > 1 ? 2 : 1,
    truncated: needed > DEFINITION_MAX_LINES,
  };
}

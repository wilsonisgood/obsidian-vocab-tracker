import { isAnchorable, noteSections } from "../anchors/sections";

// The ¶ number of the paragraph holding `line` (0-based) in a note, as in
// W1's 「出自 Taylor_Swift_NYU ¶12」: 1-based, counting only the sections
// discussions can anchor to (paragraphs, lists, blockquotes — §5.1), so it
// matches the numbering of the paragraphs a reader would point at.
// Null when the line isn't inside such a section (a heading, code, past
// the end).
export function paragraphNumber(markdown: string, line: number): number | null {
  let n = 0;
  for (const s of noteSections(markdown)) {
    if (!isAnchorable(s.type)) continue;
    n++;
    if (line >= s.lineStart && line <= s.lineEnd) return n;
    if (s.lineStart > line) return null;
  }
  return null;
}

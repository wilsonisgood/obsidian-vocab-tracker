// Splits a markdown note into paragraphs for AI context (規劃書 06 §6.4) and
// for ¶ numbering (paragraphInput.ts, paragraphRows.ts). Blank lines
// separate paragraphs; YAML frontmatter is dropped (it's metadata, not
// article text). Headings and fenced code are always their own span, even
// without a blank line before them, so a heading immediately followed by
// a list doesn't merge into it (使用者回饋: a real article has
// `### 1. 標題\n* item…` with no blank line between). A long list splits
// into one span per top-level item, same rule and same line math as
// services/anchors/sections.ts's noteSections — core/text/listItems.ts is
// shared by both so a discussion's anchor and this module's ¶ numbers
// agree on exactly where one list item ends and the next begins.

import { LIST_MARKER_RE, shouldSplitList, splitListItems } from "./listItems";

export interface ParagraphSpan {
  text: string;
  // 0-based line numbers in the original note (frontmatter included), so
  // they match VocabEntry.source.line.
  lineStart: number;
  lineEnd: number;
}

const HEADING_RE = /^#{1,6}(\s|$)/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

export function splitParagraphSpans(markdown: string): ParagraphSpan[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }

  const out: ParagraphSpan[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const block = lines.slice(start, end + 1);
    if (LIST_MARKER_RE.test(block[0]) && shouldSplitList(block)) {
      for (const item of splitListItems(block, start)) out.push(item);
    } else {
      out.push({ text: block.join("\n"), lineStart: start, lineEnd: end });
    }
    start = -1;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flush(i - 1);
      const marker = fence[1];
      let end = i + 1;
      while (end < lines.length && !lines[end].trimStart().startsWith(marker)) end++;
      end = Math.min(end, lines.length - 1);
      out.push({ text: lines.slice(i, end + 1).join("\n"), lineStart: i, lineEnd: end });
      i = end;
      continue;
    }
    if (line.trim() === "") {
      flush(i - 1);
      continue;
    }
    if (HEADING_RE.test(line)) {
      flush(i - 1);
      out.push({ text: line, lineStart: i, lineEnd: i });
      continue;
    }
    if (start < 0) start = i;
  }
  flush(lines.length - 1);
  return out;
}

export function splitParagraphs(markdown: string): string[] {
  return splitParagraphSpans(markdown).map((p) => p.text);
}

// The paragraph containing `line` (0-based), with its 0-based index — the
// ¶ number shown to the user is index + 1. Null when the line is blank,
// inside the frontmatter, or past the end.
export function paragraphAtLine(markdown: string, line: number): { index: number; text: string } | null {
  const spans = splitParagraphSpans(markdown);
  const index = spans.findIndex((p) => line >= p.lineStart && line <= p.lineEnd);
  return index < 0 ? null : { index, text: spans[index].text };
}

// Paragraph text as the reader sees it, for prompts: drops this plugin's
// ==highlight== marks around tracked words and a trailing ^block-id.
export function plainParagraph(text: string): string {
  return text.replace(/==([^=\n]+)==/g, "$1").replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").trim();
}

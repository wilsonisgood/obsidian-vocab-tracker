// Splits a markdown note into paragraphs for AI context (規劃書 06 §6.4).
// Blank lines separate paragraphs, except inside fenced code blocks; YAML
// frontmatter is dropped (it's metadata, not article text). Headings stay
// as their own paragraph so ¶ numbers line up with what the reader sees.

export interface ParagraphSpan {
  text: string;
  // 0-based line numbers in the original note (frontmatter included), so
  // they match VocabEntry.source.line.
  lineStart: number;
  lineEnd: number;
}

export function splitParagraphSpans(markdown: string): ParagraphSpan[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }

  const out: ParagraphSpan[] = [];
  let start = -1;
  let inFence = false;
  const flush = (end: number) => {
    if (start < 0) return;
    const text = lines.slice(start, end + 1).join("\n").trim();
    if (text) out.push({ text, lineStart: start, lineEnd: end });
    start = -1;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush(i - 1);
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

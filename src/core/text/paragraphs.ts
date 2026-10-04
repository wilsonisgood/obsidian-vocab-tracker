// Splits a markdown note into paragraphs for AI context (規劃書 06 §6.4).
// Blank lines separate paragraphs, except inside fenced code blocks; YAML
// frontmatter is dropped (it's metadata, not article text). Headings stay
// as their own paragraph so ¶ numbers line up with what the reader sees.
export function splitParagraphs(markdown: string): string[] {
  let text = markdown.replace(/\r\n?/g, "\n");
  const fm = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  if (fm) text = text.slice(fm[0].length);

  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    const p = current.join("\n").trim();
    if (p) out.push(p);
    current = [];
  };

  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return out;
}

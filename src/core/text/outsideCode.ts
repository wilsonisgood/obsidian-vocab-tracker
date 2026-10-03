// ── ==Highlight== helpers, skipping code spans and fences ──────

export function replaceOutsideCode(content: string, re: RegExp, repl: string): string {
  const lines = content.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines[i] = lines[i].replace(
      /(`[^`]*`)|([^`]+)/g,
      (_m, code, text) => (code != null ? code : text.replace(re, repl))
    );
  }
  return lines.join("\n");
}

export function wrapOutsideCode(content: string, re: RegExp): string {
  return replaceOutsideCode(content, re, "==$&==");
}

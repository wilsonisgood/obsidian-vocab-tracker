export function extractSentence(text: string, start: number, end: number, node: Node | null): string {
  let s = start;
  let e = end;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  if (e < text.length && /[.!?]/.test(text[e])) e++;

  const sentence = text.slice(s, e).trim();

  if ((s > 0 || e < text.length) && node && node.parentElement) {
    return sentence;
  }

  const block =
    node &&
    node.parentElement &&
    node.parentElement.closest("p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6");
  if (block) {
    const full = (block.textContent || "").replace(/\s+/g, " ").trim();
    if (full.length <= 400) return full;
  }
  return sentence;
}

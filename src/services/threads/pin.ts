// 釘選到文法提示 (規劃書 06 M4): an answer pinned into the entry's grammar
// note, minus the 「你問的是：…」 scope line — that line only makes sense
// inside the conversation.

const SCOPE_LINE_RE = /^\s*你問的是[:：][^\n]*\n+/;

export function pinText(answer: string): string {
  return answer.replace(SCOPE_LINE_RE, "").trim();
}

export function addPin(grammar: string, text: string): string {
  const current = grammar.trim();
  if (current.includes(text)) return current;
  return current ? `${current}\n\n${text}` : text;
}

// Removes the pinned text if it's still there verbatim; a note the user
// has since edited by hand is left alone.
export function removePin(grammar: string, text: string): string {
  const i = grammar.indexOf(text);
  if (i < 0) return grammar;
  return (grammar.slice(0, i) + grammar.slice(i + text.length)).replace(/\n{3,}/g, "\n\n").trim();
}

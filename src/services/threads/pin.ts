// 釘選到文法提示 (規劃書 06 M4): an answer pinned into the entry's grammar
// note, minus the lines that only make sense inside the conversation: the
// 「你選取的文字裡（似乎）沒有 X，…」 reminder (word tasks v3, always first)
// and then the 「你問的是：…」 scope line. Otherwise they'd be sent back as
// 學習者的筆記 in every later word prompt. Leading Markdown emphasis or a
// quote marker is tolerated; any wording after 你選取的文字 is.

const LEAD = String.raw`^\s*(?:[>*_]+\s*)?`;
const SELECTION_NOTICE_RE = new RegExp(`${LEAD}你選取的文字[^\\n]*(?:\\n+|$)`);
const SCOPE_LINE_RE = new RegExp(`${LEAD}你問的是[:：][^\\n]*\\n+`);

export function pinText(answer: string): string {
  return answer.replace(SELECTION_NOTICE_RE, "").replace(SCOPE_LINE_RE, "").trim();
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

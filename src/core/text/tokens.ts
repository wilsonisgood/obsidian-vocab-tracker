// Rough token estimate without shipping a tokenizer: English averages ~4
// characters per token, CJK about one character per token. Only used for
// coarse decisions (truncate a long article? estimate usage when a server
// doesn't report it) — never for anything billed or exact.
const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

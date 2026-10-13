import { topicById } from "./catalog";

// The grammar trailer (wave 15 rule 7): the last line of a 文法解析
// answer, `<!-- vt-grammar: id1, id2 -->`, naming the catalog topics the
// text used. It's machine data — anything that shows or exports turn.content
// strips it first.

const MARKER = "<!--vt-grammar:";

// Tolerant of spacing, case and a comma-less/empty list. Global so strip
// removes every copy; parse only reads the last one.
export const GRAMMAR_TRAILER_RE = /<!--\s*vt-grammar\s*:([^>]*?)-->/gi;

function defaultKnown(id: string): boolean {
  return topicById(id) !== undefined;
}

// Ids from the last trailer in `content`, de-duplicated, in order, kept only
// when `isKnown` accepts them (default: the built-in catalog).
export function parseGrammarTrailer(content: string, isKnown: (id: string) => boolean = defaultKnown): string[] {
  let last: RegExpExecArray | null = null;
  const re = new RegExp(GRAMMAR_TRAILER_RE.source, "gi");
  for (let m = re.exec(content); m; m = re.exec(content)) last = m;
  if (!last) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of last[1].split(/[,，、;；\n]/)) {
    const id = raw.trim().toLowerCase();
    if (!id || seen.has(id) || !isKnown(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// True for the unfinished start of a trailer a stream is still writing:
// `<!-`, `<!-- vt-gram`, `<!-- vt-grammar: a, b` (no closing `-->` yet).
function isPartialTrailer(tail: string): boolean {
  const compact = tail.toLowerCase().replace(/\s+/g, "");
  if (compact.length < 3 || !compact.startsWith("<!-")) return false;
  return MARKER.startsWith(compact) || compact.startsWith(MARKER);
}

// Removes every complete trailer, plus a half-written one at the very end
// (while the answer is still streaming), and trims what's left.
export function stripGrammarTrailer(content: string): string {
  let out = content.replace(GRAMMAR_TRAILER_RE, "");
  const cut = out.lastIndexOf("<!-");
  if (cut !== -1 && !out.slice(cut).includes("-->") && isPartialTrailer(out.slice(cut))) out = out.slice(0, cut);
  return out.trimEnd();
}

export function formatGrammarTrailer(ids: readonly string[]): string {
  return ids.length === 0 ? "" : `<!-- vt-grammar: ${ids.join(", ")} -->`;
}

// Obsidian block references (`^id` at the end of a block's last line) for
// paragraph anchors (規劃書 06 §5.1). The ids this plugin writes are
// `vt-` + 6 base36 characters.

export const VT_BLOCK_PREFIX = "vt-";
export const VT_BLOCK_ID_RE = /^vt-[0-9a-z]{6}$/;

// Obsidian's block id syntax: letters, digits and dashes after a caret,
// at the very end of the line and preceded by whitespace (or alone on the
// line, which Obsidian accepts after lists/quotes/tables).
const TRAILING_RE = /(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*\r?$/;

function lines(markdown: string): string[] {
  return markdown.split("\n");
}

// The block id at the end of `text` (a line, or a whole block whose last
// line carries it). Null when there is none.
export function trailingBlockId(text: string): string | null {
  const last = text.replace(/\s+$/, "");
  const m = TRAILING_RE.exec(last);
  return m ? m[1] : null;
}

// Every block id in a note.
export function blockIdsIn(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of lines(markdown)) {
    const id = trailingBlockId(line);
    if (id) out.add(id);
  }
  return out;
}

// 0-based line that ends with `^id`, or -1.
export function findBlockLine(markdown: string, id: string): number {
  const all = lines(markdown);
  for (let i = 0; i < all.length; i++) if (trailingBlockId(all[i]) === id) return i;
  return -1;
}

// A fresh `vt-xxxxxx` id that `taken` doesn't know. 36^6 ≈ 2.2 billion
// ids, so a retry is already rare; the cap only guards a broken `random`.
export function newBlockId(taken: (id: string) => boolean, random: () => number = Math.random, maxTries = 100): string {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    let id = VT_BLOCK_PREFIX;
    for (let i = 0; i < 6; i++) id += Math.min(35, Math.floor(random() * 36)).toString(36);
    if (!taken(id)) return id;
  }
  throw new Error("Couldn't find an unused block id");
}

// `markdown` with ` ^id` appended to the end of 0-based `line`, keeping
// the line's own CRLF ending. Trailing spaces on that line are dropped
// first (a hard line break at a block's end means nothing).
export function withBlockId(markdown: string, line: number, id: string): string {
  const all = lines(markdown);
  if (line < 0 || line >= all.length) throw new RangeError(`line ${line} out of range (0..${all.length - 1})`);
  const cr = all[line].endsWith("\r");
  const body = (cr ? all[line].slice(0, -1) : all[line]).replace(/[ \t]+$/, "");
  all[line] = `${body} ^${id}${cr ? "\r" : ""}`;
  return all.join("\n");
}

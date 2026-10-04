import { yamlValue } from "./renderers/common";

// Reads and edits the YAML frontmatter of an exported note, line by line.
// Only top-level `key: value` lines are understood — all the exports ever
// write. Edits change the lines of the given keys and nothing else: the
// rest of the frontmatter and the whole body are left byte for byte.
//
// Pure string functions, run inside VaultPort.process.

interface Located {
  // Offsets of the frontmatter's content, between the "---" lines.
  start: number;
  end: number;
}

// A byte order mark some editors (Windows Notepad) put at the start.
const BOM = "\ufeff";

function bomLength(text: string): number {
  return text.startsWith(BOM) ? BOM.length : 0;
}

function locate(text: string): Located | null {
  const bom = bomLength(text);
  const open = /^---[ \t]*\r?\n/.exec(text.slice(bom));
  if (!open) return null;
  const close = /^(?:---|\.\.\.)[ \t]*$/gm;
  close.lastIndex = bom + open[0].length;
  const m = close.exec(text);
  return m ? { start: bom + open[0].length, end: m.index } : null;
}

const LINE = /^([\w-]+):[ \t]*(.*?)[ \t]*$/;

function unquote(raw: string): string {
  if (raw.startsWith('"')) {
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v === "string") return v;
    } catch {
      // Not JSON after all: keep it as written.
    }
    return raw;
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

// Lines with their line breaks, so joining them gives back the text.
function lines(text: string): string[] {
  return text.split(/(?<=\n)/).filter((l) => l !== "");
}

// The frontmatter's top-level fields as strings, or null when the note has
// no frontmatter.
export function readFrontmatter(text: string): Record<string, string> | null {
  const at = locate(text);
  if (!at) return null;
  const out: Record<string, string> = {};
  for (const line of lines(text.slice(at.start, at.end))) {
    const m = LINE.exec(line.replace(/\r?\n$/, ""));
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

export interface FrontmatterEdit {
  // Add the keys that aren't there yet (default: only replace).
  add?: boolean;
  // Added keys go right after this key's line, else at the end.
  after?: string;
  // With `add`: a note without frontmatter gets one, holding just
  // `fields`, inserted at the very top (after a BOM). Otherwise such a
  // note is returned unchanged.
  create?: boolean;
}

// Sets `fields` in the frontmatter.
export function editFrontmatter(text: string, fields: Record<string, string>, opts: FrontmatterEdit = {}): string {
  const at = locate(text);
  if (!at) {
    if (!opts.add || !opts.create) return text;
    const eol = /\r\n/.exec(text)?.[0] ?? "\n";
    const head = ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${yamlValue(v)}`), "---", ""].join(eol);
    const bom = bomLength(text);
    return text.slice(0, bom) + head + text.slice(bom);
  }
  const body = lines(text.slice(at.start, at.end));
  const eol = /\r\n/.test(text.slice(0, at.start)) ? "\r\n" : "\n";
  const done = new Set<string>();
  const out: string[] = [];
  let insertAt = -1;
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const key = LINE.exec(line.replace(/\r?\n$/, ""))?.[1];
    if (key !== undefined && key in fields && !done.has(key)) {
      done.add(key);
      out.push(`${key}: ${yamlValue(fields[key])}${/\r?\n$/.exec(line)?.[0] ?? eol}`);
      // A value continued on indented lines (a block list) is replaced too.
      while (i + 1 < body.length && /^([ \t]|- )/.test(body[i + 1])) i++;
    } else {
      out.push(line);
    }
    if (key !== undefined && key === opts.after) insertAt = out.length;
  }
  if (opts.add) {
    const added = Object.keys(fields)
      .filter((k) => !done.has(k))
      .map((k) => `${k}: ${yamlValue(fields[k])}${eol}`);
    // Every line before the closing "---" ends with a break, so lines can
    // go in anywhere.
    out.splice(insertAt < 0 ? out.length : insertAt, 0, ...added);
  }
  return text.slice(0, at.start) + out.join("") + text.slice(at.end);
}

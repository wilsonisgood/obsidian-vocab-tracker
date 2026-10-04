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

function locate(text: string): Located | null {
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (!open) return null;
  const close = /^(?:---|\.\.\.)[ \t]*$/gm;
  close.lastIndex = open[0].length;
  const m = close.exec(text);
  return m ? { start: open[0].length, end: m.index } : null;
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
}

// Sets `fields` in the frontmatter. A note without frontmatter is returned
// unchanged — this never adds one.
export function editFrontmatter(text: string, fields: Record<string, string>, opts: FrontmatterEdit = {}): string {
  const at = locate(text);
  if (!at) return text;
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

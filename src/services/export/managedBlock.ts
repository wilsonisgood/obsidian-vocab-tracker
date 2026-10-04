// Managed blocks (規劃書 06 §8.2): exported notes are split into sections
// wrapped in
//
//   %% vt:begin <name> %%
//   …generated…
//   %% vt:end <name> %%
//
// and an export only ever replaces the lines *between* a pair of markers.
// Everything else in the file — frontmatter, the user's own notes, even
// the marker lines themselves — is copied through byte for byte. When a
// section's markers are gone (or only half of them are left), the section
// is appended at the end of the file instead; nothing is overwritten.
//
// Pure string functions, no I/O: ExportService runs them inside
// vault.process so the read-modify-write is atomic.

export interface ManagedSection {
  name: string;
  // Markdown between the markers, without a trailing newline.
  body: string;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function checkName(name: string): void {
  if (!NAME_RE.test(name)) throw new Error(`Invalid managed block name: ${JSON.stringify(name)}`);
}

export function beginMarker(name: string): string {
  checkName(name);
  return `%% vt:begin ${name} %%`;
}

export function endMarker(name: string): string {
  checkName(name);
  return `%% vt:end ${name} %%`;
}

// A marker must be a line of its own (surrounding whitespace allowed), so
// prose that merely mentions "%% vt:begin x %%" mid-sentence never counts.
const MARKER_LINE = /^[ \t]*%%[ \t]*vt:(begin|end)[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*%%[ \t]*$/;

interface Line {
  start: number;
  // Index just past the line's text, before its line break.
  textEnd: number;
  // Index just past the line break (== textEnd on the last line).
  end: number;
  eol: string;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf("\n", start);
    if (nl < 0) {
      out.push({ start, textEnd: text.length, end: text.length, eol: "" });
      break;
    }
    const cr = nl > start && text[nl - 1] === "\r";
    out.push({ start, textEnd: cr ? nl - 1 : nl, end: nl + 1, eol: cr ? "\r\n" : "\n" });
    start = nl + 1;
  }
  return out;
}

function markerOf(text: string, line: Line): { kind: "begin" | "end"; name: string } | null {
  // A byte-order mark at the very start belongs to the file, not the line.
  const m = MARKER_LINE.exec(text.slice(line.start, line.textEnd).replace(/^\uFEFF/, ""));
  return m ? { kind: m[1] as "begin" | "end", name: m[2] } : null;
}

export interface BlockRange {
  // Offset where the generated content starts (just past the begin line).
  contentStart: number;
  // Offset of the end marker line (the content ends right before it).
  contentEnd: number;
  // The line break the begin marker line uses — reused for the content.
  eol: string;
}

// Finds the section's block. Pairs each end marker with the closest begin
// marker above it, so a stray begin left over from a deleted section can
// never stretch a block over the user's text:
//
//   begin x  ← orphan (its end was deleted), ignored
//   my notes
//   begin x  ← appended later; this one pairs with the end below
//   …
//   end x
//
// End markers with no begin above them are ignored. Only the first
// complete pair counts; later duplicates are left alone.
export function findManagedBlock(text: string, name: string): BlockRange | null {
  checkName(name);
  const all = lines(text);
  let open: Line | null = null;
  for (const line of all) {
    const marker = markerOf(text, line);
    if (!marker || marker.name !== name) continue;
    if (marker.kind === "begin") {
      open = line;
    } else if (open) {
      return { contentStart: open.end, contentEnd: line.start, eol: open.eol };
    }
  }
  return null;
}

// The body's own lines, re-joined with the file's line break. A body line
// that would itself parse as a marker is escaped, so generated content
// (e.g. an AI answer quoting this file) can't fake or close a block.
function bodyLines(body: string): string[] {
  if (body === "") return [];
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (MARKER_LINE.test(l) ? l.replace("%%", "\\%%") : l));
}

function detectEol(text: string): string {
  const nl = text.indexOf("\n");
  return nl > 0 && text[nl - 1] === "\r" ? "\r\n" : "\n";
}

export function renderSection(section: ManagedSection, eol = "\n"): string {
  return [beginMarker(section.name), ...bodyLines(section.body), endMarker(section.name)].join(eol);
}

// Replaces one section's content, or appends the whole section at the end
// of the file when its markers are missing.
export function replaceManagedBlock(text: string, section: ManagedSection): string {
  const range = findManagedBlock(text, section.name);
  if (range) {
    const body = bodyLines(section.body);
    const content = body.length ? body.join(range.eol) + range.eol : "";
    if (text.slice(range.contentStart, range.contentEnd) === content) return text;
    return text.slice(0, range.contentStart) + content + text.slice(range.contentEnd);
  }
  return appendSection(text, section);
}

// Appends after everything that's there, separated by one blank line.
// Only ever adds characters at the end: the original text stays a prefix
// of the result.
function appendSection(text: string, section: ManagedSection): string {
  const eol = detectEol(text);
  let sep = "";
  if (text !== "") {
    if (!text.endsWith("\n")) sep = eol + eol;
    else if (!/(\r?\n)[ \t]*\r?\n$/.test(text)) sep = eol;
  }
  return text + sep + renderSection(section, eol) + eol;
}

export function applyManagedBlocks(text: string, sections: readonly ManagedSection[]): string {
  let out = text;
  for (const section of sections) out = replaceManagedBlock(out, section);
  return out;
}

// A brand-new file: `head` (frontmatter, code blocks…), then each section,
// then `tail` (e.g. the hint above the user's own notes).
export function buildManagedFile(head: string, sections: readonly ManagedSection[], tail = ""): string {
  const parts = [head.replace(/\n+$/, ""), ...sections.map((s) => renderSection(s)), tail.replace(/\n+$/, "")];
  return parts.filter((p) => p !== "").join("\n\n") + "\n";
}

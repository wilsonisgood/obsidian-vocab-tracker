// Diary body segmentation (1016 #14, A17 rules). Pure.

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "vs", "e.g", "i.e", "prof", "jr", "sr"]);
const BREAK_RE = /([.?!]+)([)"'”’\]]*)\s+(?=[A-Z0-9"“‘'([])/g;
const SHORT_WORDS = 8;
const HEADING_WORDS = 7;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isAbbreviation(before: string): boolean {
  const token = /[^\s"“‘'([]*$/.exec(before)?.[0] ?? "";
  if (!token) return false;
  if (/^[A-Z]$/.test(token)) return true; // J.
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(token)) return true; // U.S.
  return ABBREVIATIONS.has(token.toLowerCase());
}

export function splitSentences(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  for (const m of t.matchAll(BREAK_RE)) {
    const idx = m.index ?? 0;
    if (m[1] === "." && isAbbreviation(t.slice(start, idx))) continue;
    out.push(t.slice(start, idx + m[1].length + m[2].length));
    start = idx + m[0].length;
  }
  if (start < t.length) out.push(t.slice(start));
  return out;
}

export function segmentParagraph(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const s of splitSentences(text)) {
    buf = buf ? `${buf} ${s}` : s;
    if (wordCount(buf) > SHORT_WORDS) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) {
    if (out.length) out[out.length - 1] += ` ${buf}`;
    else out.push(buf);
  }
  return out;
}

function headingOf(first: string): string {
  const plain = first.replace(/\[\[|\]\]|\*\*|__|==|`|\*/g, "").replace(/\s+/g, " ").trim();
  const words = plain.split(" ").filter(Boolean);
  if (words.length <= HEADING_WORDS) return words.join(" ");
  return `${words.slice(0, HEADING_WORDS).join(" ").replace(/[,;:]+$/, "")}…`;
}

// One `##` section per AI paragraph; each segment is its own md paragraph.
export function renderDiaryBody(paragraphs: string[]): string {
  const sections: string[] = [];
  for (const p of paragraphs) {
    const segs = segmentParagraph(p);
    if (!segs.length) continue;
    sections.push([`## ${headingOf(segs[0])}`, ...segs].join("\n\n"));
  }
  return sections.join("\n\n");
}

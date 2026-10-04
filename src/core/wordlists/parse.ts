// Parses a user-supplied word list (規劃書 03 §3.2): one file in the
// vault's wordlist folder = one tag. Lists come from all over (exam-prep
// PDFs pasted into a note, CSV exports, Markdown checklists), so each line
// is read leniently — the first English word wins and whatever follows it
// (part of speech, phonetics, Chinese meaning…) is ignored.

export interface ParsedWordlist {
  // From frontmatter `tag:`, overriding the filename-derived tag.
  tag?: string;
  // Lowercased, de-duplicated, in file order.
  words: string[];
}

// "exam-TOEFL" → "exam/TOEFL" (first "-" becomes the nesting slash, the
// same shape as Obsidian's nested tags); a name without "-" is used as-is.
export function tagFromBasename(basename: string): string {
  const name = basename.trim();
  const i = name.indexOf("-");
  return i > 0 && i < name.length - 1 ? `${name.slice(0, i)}/${name.slice(i + 1)}` : name;
}

// What the UI shows for a tag: its last segment ("exam/TOEFL" → "TOEFL").
export function tagLabel(tag: string): string {
  return tag.slice(tag.lastIndexOf("/") + 1);
}

// Part-of-speech abbreviations that commonly follow the headword
// ("abandon v. 放棄"), so "abandon v" isn't mistaken for a two-word phrase.
const POS = new Set([
  "n", "v", "vt", "vi", "adj", "adv", "a", "ad", "prep", "conj", "pron",
  "int", "interj", "art", "num", "aux", "pl", "phr",
]);

const ENGLISH_RUN = /^[A-Za-z][A-Za-z'-]*(?:[ \t]+[A-Za-z][A-Za-z'-]*)*/;

function headword(line: string): string | null {
  let s = line.trim();
  if (!s || s.startsWith("#") || s.startsWith("//")) return null;
  // Table separator rows ("|---|---|").
  if (/^\|?[\s:|-]+$/.test(s)) return null;

  s = s
    .replace(/^[-*+]\s+(\[.\]\s+)?/, "") // list item / checkbox
    .replace(/^\d+[.)、]\s*/, "") // numbered list
    .replace(/^[|\s[*_`"']+/, ""); // table cell, [[link]], **bold**, quotes
  // CSV / TSV / table row: only the first column is the word.
  s = s.split(/[,\t|;]/)[0];

  const m = ENGLISH_RUN.exec(s);
  if (!m) return null;
  const parts = m[0].split(/[ \t]+/);
  // Multi-word phrases ("take off") aren't matched in v1; a trailing POS
  // abbreviation doesn't make it a phrase.
  if (parts.length > 1 && !POS.has(parts[1].toLowerCase())) return null;

  const word = parts[0].replace(/^['-]+|['-]+$/g, "").toLowerCase();
  return word.length > 1 || word === "a" || word === "i" ? word : null;
}

export function parseWordlist(content: string): ParsedWordlist {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let tag: string | undefined;

  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, j) => j > 0 && l.trim() === "---");
    if (close > 0) {
      for (const l of lines.slice(1, close)) {
        const m = /^tag\s*:\s*["']?#?([^"']+?)["']?\s*$/.exec(l.trim());
        if (m) tag = m[1];
      }
      i = close + 1;
    }
  }

  const seen = new Set<string>();
  const words: string[] = [];
  let inFence = false;
  for (; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const w = headword(lines[i]);
    if (w && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  return { tag, words };
}

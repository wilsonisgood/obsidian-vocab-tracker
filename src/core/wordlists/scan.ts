// Word segmentation + per-note statistics for exam-word highlighting.
// Pure functions over strings so both the reading-view highlighter (DOM
// text nodes) and the background note scan (raw markdown) share one
// definition of "a word".

import { extractSentence } from "../text/sentence";
import type { WordMatch } from "./WordlistIndex";

export type Lookup = (word: string) => readonly string[];
export type Matcher = (word: string) => WordMatch | null;

export type Segment = string | { word: string; tags: readonly string[] };

const WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

// Splits text into plain runs and list hits. Returns null when nothing in
// the text is in a list, so callers can leave the DOM node untouched.
export function segmentText(text: string, lookup: Lookup): Segment[] | null {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const tags = lookup(m[0]);
    if (tags.length === 0) continue;
    const i = m.index!;
    if (i > last) out.push(text.slice(last, i));
    out.push({ word: m[0], tags });
    last = i + m[0].length;
  }
  if (out.length === 0) return null;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface TagStats {
  // Distinct list entries ("analyze" and "analyzed" count once).
  unique: number;
  // Every occurrence.
  count: number;
}

// One list entry found in the note, at its first occurrence.
export interface ScanHit {
  word: string;
  tags: readonly string[];
  // 0-based line in the note (frontmatter included), like VocabSource.line.
  line: number;
  sentence: string;
}

export interface ScanResult {
  // Distinct English words in the note — the denominator for "42 of 380".
  uniqueWords: number;
  byTag: Record<string, TagStats>;
  // In order of first appearance.
  hits: ScanHit[];
}

// The note's lines with everything that never shows up as readable prose
// blanked out: frontmatter, code, link/embed targets, URLs, HTML tags,
// %%comments%%. Same line count as the note, so indexes are line numbers.
export function proseLines(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, j) => j > 0 && l.trim() === "---");
    if (close > 0) {
      for (; i <= close; i++) out.push("");
    }
  }
  let inFence = false;
  let inComment = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    if (inFence) {
      out.push("");
      continue;
    }
    let s = line;
    // %% block comments may span lines.
    if (inComment) {
      const end = s.indexOf("%%");
      if (end < 0) {
        out.push("");
        continue;
      }
      s = s.slice(end + 2);
      inComment = false;
    }
    s = s.replace(/%%.*?%%/g, " ");
    const open = s.indexOf("%%");
    if (open >= 0) {
      s = s.slice(0, open);
      inComment = true;
    }
    s = s
      .replace(/`[^`]*`/g, " ")
      .replace(/!?\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_m, target: string, alias: string) => alias || target)
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/\bhttps?:\/\/\S+/g, " ")
      .replace(/<[^>]+>/g, " ");
    out.push(s);
  }
  return out;
}

// Accumulates statistics over chunks of prose so a long note can be
// scanned a slice at a time without blocking the UI.
export class ScanAccumulator {
  private seen = new Set<string>();
  private seenByTag = new Map<string, Set<string>>();
  private counts = new Map<string, number>();
  private hits = new Map<string, ScanHit>();

  constructor(private match: Matcher) {}

  // `line` is the text's line number in the note, recorded on each word's
  // first occurrence.
  add(text: string, line = 0): void {
    for (const m of text.matchAll(WORD_RE)) {
      this.seen.add(m[0].toLowerCase());
      const hit = this.match(m[0]);
      if (!hit) continue;
      if (!this.hits.has(hit.base)) {
        const start = m.index!;
        const sentence = extractSentence(text, start, start + m[0].length, null);
        this.hits.set(hit.base, { word: hit.base, tags: hit.tags, line, sentence });
      }
      for (const tag of hit.tags) {
        let set = this.seenByTag.get(tag);
        if (!set) this.seenByTag.set(tag, (set = new Set()));
        set.add(hit.base);
        this.counts.set(tag, (this.counts.get(tag) ?? 0) + 1);
      }
    }
  }

  result(): ScanResult {
    const byTag: Record<string, TagStats> = {};
    for (const [tag, set] of this.seenByTag) {
      byTag[tag] = { unique: set.size, count: this.counts.get(tag) ?? 0 };
    }
    return { uniqueWords: this.seen.size, byTag, hits: [...this.hits.values()] };
  }
}

export function scanMarkdown(markdown: string, match: Matcher): ScanResult {
  const acc = new ScanAccumulator(match);
  proseLines(markdown).forEach((line, i) => acc.add(line, i));
  return acc.result();
}

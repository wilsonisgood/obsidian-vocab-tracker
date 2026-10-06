// A note split into blocks the way Obsidian's metadataCache `sections`
// does (blank-line separated; headings, fenced code and frontmatter are
// their own blocks), so the text of a block here matches what reading
// mode's `ctx.getSectionInfo(el)` covers. Used to find an anchor's
// paragraph again (規劃書 06 §5.1); the metadataCache itself isn't used
// because it lags behind a `vault.process` write.
//
// A long list (§5.1 feedback — core/text/listItems.ts) splits into one
// "list" section per top-level item instead of staying one block, so a
// discussion anchors to a single item, not everything under its heading.

import { LIST_MARKER_RE, listItemOwnEndIndex, shouldSplitList, splitListItems } from "../../core/text/listItems";

export type SectionType = "paragraph" | "list" | "blockquote" | "callout" | "heading" | "code" | "table" | "thematicBreak";

export interface NoteSection {
  type: SectionType;
  // 0-based, inclusive.
  lineStart: number;
  lineEnd: number;
  text: string;
}

// Only these get discussion anchors; headings, code, tables and the inside
// of callouts are skipped for now (§5.1).
export const ANCHORABLE: ReadonlySet<SectionType> = new Set<SectionType>(["paragraph", "list", "blockquote"]);

export function isAnchorable(type: SectionType | string): boolean {
  return ANCHORABLE.has(type as SectionType);
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HEADING_RE = /^#{1,6}(\s|$)/;
const LIST_RE = LIST_MARKER_RE;
const BREAK_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;

function classify(lines: string[]): SectionType {
  const first = lines[0];
  if (/^\s*>\s*\[!/.test(first)) return "callout";
  if (/^\s*>/.test(first)) return "blockquote";
  if (LIST_RE.test(first)) return "list";
  if (lines.length === 1 && BREAK_RE.test(first)) return "thematicBreak";
  if (lines.length >= 2 && /^\s*\|/.test(first) && /^\s*\|?\s*:?-+/.test(lines[1])) return "table";
  return "paragraph";
}

export function noteSections(markdown: string): NoteSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: NoteSection[] = [];
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }

  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const block = lines.slice(start, end + 1);
    const type = classify(block);
    if (type === "list" && shouldSplitList(block)) {
      for (const item of splitListItems(block, start)) out.push({ type: "list", ...item });
    } else {
      out.push({ type, lineStart: start, lineEnd: end, text: block.join("\n") });
    }
    start = -1;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flush(i - 1);
      const marker = fence[1];
      let end = i + 1;
      while (end < lines.length && !lines[end].trimStart().startsWith(marker)) end++;
      end = Math.min(end, lines.length - 1);
      out.push({ type: "code", lineStart: i, lineEnd: end, text: lines.slice(i, end + 1).join("\n") });
      i = end;
      continue;
    }
    if (line.trim() === "") {
      flush(i - 1);
      continue;
    }
    if (HEADING_RE.test(line)) {
      flush(i - 1);
      out.push({ type: "heading", lineStart: i, lineEnd: i, text: line });
      continue;
    }
    if (start < 0) start = i;
  }
  flush(lines.length - 1);
  return out;
}

// Lines lineStart..lineEnd of a note — what a reading-mode section covers
// (getSectionInfo gives the whole note's text plus the line range).
export function sectionText(markdown: string, lineStart: number, lineEnd: number): string {
  return markdown.replace(/\r\n?/g, "\n").split("\n").slice(lineStart, lineEnd + 1).join("\n");
}

export function sectionAt(sections: readonly NoteSection[], line: number): NoteSection | undefined {
  return sections.find((s) => line >= s.lineStart && line <= s.lineEnd);
}

// Where a list item's own `^id` belongs, and the text to check for one it
// already has: the item's own leading line(s), never a nested sub-item
// under it (listItemOwnEndIndex — §5.1 feedback point 3). Any other
// section type keeps using its last line, as before.
export function ownBlockIdLine(section: Pick<NoteSection, "type" | "text" | "lineStart" | "lineEnd">): number {
  if (section.type !== "list") return section.lineEnd;
  return section.lineStart + listItemOwnEndIndex(section.text.split("\n"));
}

export function ownBlockIdText(section: Pick<NoteSection, "type" | "text" | "lineStart">): string {
  if (section.type !== "list") return section.text;
  const lines = section.text.split("\n");
  return lines.slice(0, listItemOwnEndIndex(lines) + 1).join("\n");
}

// Groups adjacent "list" sections that are contiguous in the note (no gap
// between one item's lineEnd and the next item's lineStart) back into the
// single block they were split from — the shape a pre-split discussion's
// anchor (block id or hash) was made against. Compatibility fallback for
// §5.1 feedback point 5: a hash anchor made when a long list was still one
// section no longer matches any single post-split item, so a lookup falls
// back to this before giving up on the paragraph. Each group is reported
// against its first item (`對到 list 的第一個...項`, not "missing-paragraph").
export function mergedListSections(sections: readonly NoteSection[]): { section: NoteSection; text: string }[] {
  const out: { section: NoteSection; text: string }[] = [];
  let i = 0;
  while (i < sections.length) {
    if (sections[i].type !== "list") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sections.length && sections[j + 1].type === "list" && sections[j + 1].lineStart === sections[j].lineEnd + 1) j++;
    if (j > i) out.push({ section: sections[i], text: sections.slice(i, j + 1).map((s) => s.text).join("\n") });
    i = j + 1;
  }
  return out;
}

// Splits a markdown list block into its top-level items (使用者回饋: a real
// article — Taylor_Swift_NYU_Speech_Transcript.md — has sections shaped
// like a heading followed by a handful of `* [[00:00:09](url)] …` items,
// each 200–900 characters. Obsidian's metadataCache (and this plugin's
// noteSections, which mimics it) treats the whole run of list lines as one
// "list" section, so one discussion thread ended up covering three
// unrelated items. core/text/paragraphs.ts (AI context, ¶ numbering) and
// services/anchors/sections.ts (discussion anchors, reading-mode ✦) both
// need a long list to split into one unit per top-level item — this module
// holds that rule so both apply exactly the same line math.
//
// Short lists (a few words each, like the file's own opening three-line
// list) stay one block: splitting every bullet point would make tiny,
// not-worth-discussing anchors.

export interface ListItemSpan {
  // 0-based, inclusive, absolute line numbers.
  lineStart: number;
  lineEnd: number;
  text: string;
}

// A list splits into one unit per top-level item when any single item's
// text is at least this long, …
export const LIST_ITEM_SPLIT_CHARS = 120;
// … or when the list has no item that long but is still at least this
// long in total (many medium items adding up to one big block).
export const LIST_TOTAL_SPLIT_CHARS = 480;
// Lengths above are measured after stripLinkUrls (a link's address isn't
// content the learner reads).

// A top-level or nested list marker: `-`, `*`, `+`, `1.` or `1)`.
export const LIST_MARKER_RE = /^\s*([-*+]|\d+[.)])\s/;

export function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

// Drops the "(url)" part of a markdown link so a long link address
// doesn't count toward the split thresholds, e.g.
// "[[00:00:09](https://youtu.be/xyz)] Hi" → "[[00:00:09] Hi". Rough but
// good enough for a character-count heuristic.
export function stripLinkUrls(text: string): string {
  return text.replace(/\]\([^)\n]*\)/g, "]");
}

export function visibleLength(text: string): number {
  return stripLinkUrls(text).length;
}

// Splits a list's lines (already isolated — e.g. by noteSections — to a
// contiguous run of non-blank lines whose first line is a list marker)
// into its top-level items. A line starts a new item when it's itself a
// list marker at or above the first item's indentation; anything more
// indented — a nested sub-item, or a wrapped continuation line — stays
// part of the item above it.
export function splitListItems(lines: readonly string[], absoluteStart: number): ListItemSpan[] {
  const indent = indentOf(lines[0]);
  const items: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const startsItem = indentOf(lines[i]) <= indent && LIST_MARKER_RE.test(lines[i]);
    if (startsItem || !items.length) items.push({ start: i, end: i });
    else items[items.length - 1].end = i;
  }
  return items.map((it) => ({
    lineStart: absoluteStart + it.start,
    lineEnd: absoluteStart + it.end,
    text: lines.slice(it.start, it.end + 1).join("\n"),
  }));
}

// Whether a list block should split into its top-level items instead of
// staying one anchorable unit (see module comment for the thresholds).
export function shouldSplitList(lines: readonly string[]): boolean {
  const items = splitListItems(lines, 0);
  if (items.some((it) => visibleLength(it.text) >= LIST_ITEM_SPLIT_CHARS)) return true;
  return visibleLength(lines.join("\n")) >= LIST_TOTAL_SPLIT_CHARS;
}

// Within one already-split top-level item's lines, the 0-based (relative)
// index of the last line that belongs to the item's own leading text —
// i.e. before any nested sub-item starts. Obsidian attaches a list item's
// block id (` ^id`) to the end of that item itself; putting it after a
// nested sub-item would attach the id to the sub-item instead (規劃書 06
// §5.1 feedback point 3). An item with no nested sub-item (the common
// case — every item in the Taylor Swift transcript is one line) just
// returns its last line.
export function listItemOwnEndIndex(lines: readonly string[]): number {
  const indent = indentOf(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (indentOf(lines[i]) > indent && LIST_MARKER_RE.test(lines[i])) return i - 1;
  }
  return lines.length - 1;
}

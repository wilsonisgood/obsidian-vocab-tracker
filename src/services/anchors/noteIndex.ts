import { trailingBlockId } from "../../core/text/blockId";
import { paragraphHash } from "../../core/text/hash";
import { isAnchorable, noteSections, sectionAt, type NoteSection } from "./sections";

// One note's sections plus lookup tables for resolving many anchors
// against the same text (規劃書 06 M8 perf): the sidebar's 「段落討論」
// list resolves every thread of a note in one go, and doing the split,
// the block-id line scan and the section hashing once per thread made a
// 300-section note with 60 discussions cost ~25 ms. Built once per note
// text and reused while the text is unchanged.

export interface NoteIndex {
  readonly content: string;
  readonly sections: readonly NoteSection[];
  // Section holding the line that ends with `^id` (first such line, like
  // findBlockLine).
  sectionOfBlock(id: string): NoteSection | undefined;
  // First anchorable section whose paragraphHash is `hash`.
  sectionOfHash(hash: string): NoteSection | undefined;
}

class Index implements NoteIndex {
  readonly sections: readonly NoteSection[];
  private blockLines: Map<string, number> | null = null;
  private hashes: Map<string, NoteSection> | null = null;

  constructor(readonly content: string) {
    this.sections = noteSections(content);
  }

  sectionOfBlock(id: string): NoteSection | undefined {
    if (!this.blockLines) {
      const map = new Map<string, number>();
      const lines = this.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Cheap pre-check: a block id needs a caret on the line.
        if (!lines[i].includes("^")) continue;
        const found = trailingBlockId(lines[i]);
        if (found && !map.has(found)) map.set(found, i);
      }
      this.blockLines = map;
    }
    const line = this.blockLines.get(id);
    return line === undefined ? undefined : sectionAt(this.sections, line);
  }

  sectionOfHash(hash: string): NoteSection | undefined {
    if (!this.hashes) {
      const map = new Map<string, NoteSection>();
      for (const s of this.sections) {
        if (!isAnchorable(s.type)) continue;
        const h = paragraphHash(s.text);
        if (!map.has(h)) map.set(h, s);
      }
      this.hashes = map;
    }
    return this.hashes.get(hash);
  }
}

// The last note indexed. One entry is enough: callers resolve a batch of
// anchors against one note at a time.
let last: Index | null = null;

export function noteIndex(content: string): NoteIndex {
  if (last?.content !== content) last = new Index(content);
  return last;
}

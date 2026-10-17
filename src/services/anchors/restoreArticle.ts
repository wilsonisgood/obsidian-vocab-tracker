import { blockIdsIn, trailingBlockId, withBlockId } from "../../core/text/blockId";
import { paragraphHash } from "../../core/text/hash";
import { wrapOutsideCode } from "../../core/text/outsideCode";
import { buildWordRe } from "../../core/text/wordRe";
import { isAnchorable, noteSections, ownBlockIdLine, ownBlockIdText } from "./sections";

// 1017: an article deleted and loaded again (Reading Feed writes it back to
// the same path) comes back as the plain original — without the ^vt ids our
// discussions were anchored to and without the ==word== highlights. The
// discussions and words still point at the path, so the note is put back
// the way they expect: each missing ^vt id goes back onto the paragraph
// whose text hash the discussion was made against, and each word saved
// from this article is highlighted again (normalizeParagraph ignores both,
// so neither changes a paragraph's hash).

export interface RestoreAnchor {
  blockId?: string;
  hash: string;
}

export interface RestoreResult {
  content: string;
  // Discussions whose ^vt id was written back.
  rebound: number;
  // Words that got at least one highlight back.
  highlighted: number;
}

export function restoreArticle(content: string, anchors: readonly RestoreAnchor[], words: readonly string[]): RestoreResult {
  let out = content;
  let rebound = 0;
  const present = blockIdsIn(out);
  for (const a of anchors) {
    if (!a.blockId || present.has(a.blockId)) continue;
    // Re-split each time: the previous write changed a section's text.
    const section = noteSections(out).find(
      (s) => isAnchorable(s.type) && paragraphHash(s.text) === a.hash && !trailingBlockId(ownBlockIdText(s))
    );
    if (!section) continue;
    out = withBlockId(out, ownBlockIdLine(section), a.blockId);
    present.add(a.blockId);
    rebound++;
  }

  let highlighted = 0;
  for (const word of new Set(words.map((w) => w.toLowerCase()))) {
    const next = wrapOutsideCode(out, buildWordRe(word));
    if (next === out) continue;
    out = next;
    highlighted++;
  }
  return { content: out, rebound, highlighted };
}

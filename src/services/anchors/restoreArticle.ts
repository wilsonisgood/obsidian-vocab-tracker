import { blockIdsIn, trailingBlockId, withBlockId } from "../../core/text/blockId";
import { normalizeParagraph, paragraphHash } from "../../core/text/hash";
import { wrapOutsideCode } from "../../core/text/outsideCode";
import { buildWordRe } from "../../core/text/wordRe";
import { isAnchorable, noteSections, ownBlockIdLine, ownBlockIdText, type NoteSection } from "./sections";

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
  // plainParagraph() of the paragraph when the discussion started.
  snapshot?: string;
}

export interface RestoreResult {
  content: string;
  // Discussions whose ^vt id was written back.
  rebound: number;
  // Words that got at least one highlight back.
  highlighted: number;
}

// Text compared when the hash doesn't match: without %%comments%% (Reading
// Feed's %%rf:<seconds>%% timestamps), highlights and block ids.
function bare(text: string): string {
  return normalizeParagraph(text.replace(/%%[\s\S]*?%%/g, " "));
}

// Shortest paragraph start trusted to identify where an old paragraph begins.
const MIN_PREFIX = 20;

// Reading Feed's rf-schema 2 (2026-10-14) re-cuts a talk into sentence-sized
// paragraphs with their own timestamps, so a paragraph from a note loaded
// before that is several paragraphs in the same note loaded again — no
// hash matches. The discussion goes to the first of them: the paragraph
// the old one starts with.
function firstPiece(sections: readonly NoteSection[], snapshot: string): NoteSection | undefined {
  const want = bare(snapshot);
  if (!want) return undefined;
  return sections.find((s) => {
    const have = bare(s.text);
    return have === want || (have.length >= MIN_PREFIX && want.startsWith(have));
  });
}

export function restoreArticle(content: string, anchors: readonly RestoreAnchor[], words: readonly string[]): RestoreResult {
  let out = content;
  let rebound = 0;
  const present = blockIdsIn(out);
  for (const a of anchors) {
    if (!a.blockId || present.has(a.blockId)) continue;
    // Re-split each time: the previous write changed a section's text.
    const free = noteSections(out).filter((s) => isAnchorable(s.type) && !trailingBlockId(ownBlockIdText(s)));
    const section = free.find((s) => paragraphHash(s.text) === a.hash) ?? (a.snapshot ? firstPiece(free, a.snapshot) : undefined);
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

// For a note that's already there (loaded again before restoring existed):
// only what was clearly lost wholesale — every ^vt id gone, or not one
// saved word highlighted. A note where some survive was edited by hand,
// and is left alone.
export function lostParts(
  content: string,
  anchors: readonly RestoreAnchor[],
  words: readonly string[]
): { anchors: RestoreAnchor[]; words: string[] } {
  const ids = anchors.filter((a) => a.blockId);
  const present = blockIdsIn(content);
  const idsLost = ids.length > 0 && ids.every((a) => !present.has(a.blockId as string));
  const marked = (w: string) => new RegExp(`==${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}==`, "i").test(content);
  const wordsLost = words.length > 0 && !words.some(marked);
  return { anchors: idsLost ? ids : [], words: wordsLost ? [...words] : [] };
}

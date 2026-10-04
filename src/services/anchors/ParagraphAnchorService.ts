import type { Anchor } from "../../core/model/thread";
import { blockIdsIn, findBlockLine, newBlockId, trailingBlockId, withBlockId } from "../../core/text/blockId";
import { normalizeParagraph, paragraphHash } from "../../core/text/hash";
import { plainParagraph } from "../../core/text/paragraphs";
import type { AnchorMode, ParagraphVaultPort } from "./ports";
import { isAnchorable, noteSections, sectionAt, sectionText, type NoteSection } from "./sections";

// Paragraph anchors (規劃書 06 §5.1). The first question about a paragraph
// pins it with a block id written at the end of its last line (` ^vt-…`);
// in hash mode the note is never touched and the paragraph is found again
// by the hash of its normalized text. Resolution order: block id → hash →
// orphan.

export type ParagraphAnchor = Extract<Anchor, { kind: "paragraph" }>;

// A reading-mode section as the UI saw it: `ctx.sourcePath` plus
// `getSectionInfo(el)`'s line range (0-based, inclusive) and the text of
// those lines (sections.ts `sectionText`).
export interface SectionRef {
  path: string;
  lineStart: number;
  lineEnd: number;
  text: string;
}

export type AnchorResolution =
  | {
      status: "found";
      via: "blockId" | "hash";
      section: NoteSection;
      // The whole note, for building the prompt's article context.
      content: string;
      // The paragraph's text no longer matches the snapshot taken when the
      // discussion started — the thread shows 「原文已修改」.
      edited: boolean;
    }
  | { status: "orphan"; reason: "missing-file" | "missing-paragraph" };

export class AnchorError extends Error {
  constructor(
    public code: "missing-file" | "missing-paragraph" | "not-anchorable",
    message?: string
  ) {
    super(message ?? code);
    this.name = "AnchorError";
  }
}

export interface ParagraphAnchorDeps {
  vault: ParagraphVaultPort;
  // Read on every create, so a settings change applies right away.
  mode: () => AnchorMode;
  random?: () => number;
}

// Finds the paragraph a SectionRef points at in `content`. The note may
// have changed since the UI rendered (synced edit, typing in another
// pane), so the line range is only trusted when its text still matches;
// otherwise the same paragraph is searched for by hash.
export function locateSection(content: string, ref: Pick<SectionRef, "lineStart" | "lineEnd" | "text">): NoteSection | null {
  const sections = noteSections(content);
  const want = normalizeParagraph(ref.text);
  const atRange = sectionText(content, ref.lineStart, ref.lineEnd);
  if (normalizeParagraph(atRange) === want) {
    const s = sectionAt(sections, ref.lineEnd);
    if (s && s.lineStart === ref.lineStart && s.lineEnd === ref.lineEnd) return s;
    // The UI's range is authoritative when it still holds the same text
    // even if our splitter would have drawn the block differently.
    return { type: s?.type ?? "paragraph", lineStart: ref.lineStart, lineEnd: ref.lineEnd, text: atRange };
  }
  const hash = paragraphHash(ref.text);
  return sections.find((s) => isAnchorable(s.type) && paragraphHash(s.text) === hash) ?? null;
}

// Pure resolution against a note's text (blockId → hash → orphan).
export function resolveIn(content: string, anchor: ParagraphAnchor): AnchorResolution {
  const sections = noteSections(content);
  const found = (via: "blockId" | "hash", section: NoteSection): AnchorResolution => ({
    status: "found",
    via,
    section,
    content,
    edited: normalizeParagraph(section.text) !== normalizeParagraph(anchor.snapshot),
  });
  if (anchor.blockId) {
    const line = findBlockLine(content, anchor.blockId);
    const section = line >= 0 ? sectionAt(sections, line) : undefined;
    if (section) return found("blockId", section);
  }
  const bySnapshot = sections.find((s) => isAnchorable(s.type) && paragraphHash(s.text) === anchor.hash);
  if (bySnapshot) return found("hash", bySnapshot);
  return { status: "orphan", reason: "missing-paragraph" };
}

export class ParagraphAnchorService {
  private random: () => number;

  constructor(private deps: ParagraphAnchorDeps) {
    this.random = deps.random ?? Math.random;
  }

  // Anchors a paragraph for a new discussion. In block mode this writes
  // ` ^vt-xxxxxx` at the end of the paragraph's last line through
  // vault.process (atomic). A paragraph that already ends in a block id
  // (the user's own, or one we wrote earlier) reuses it and writes
  // nothing. If the write can't be done — the paragraph moved or vanished
  // between render and write, or the vault refused — the anchor falls back
  // to hash mode rather than failing the question.
  async create(ref: SectionRef): Promise<ParagraphAnchor> {
    const content = await this.deps.vault.read(ref.path);
    if (content === null) throw new AnchorError("missing-file", `Note not found: ${ref.path}`);
    const section = locateSection(content, ref);
    if (!section) throw new AnchorError("missing-paragraph");
    if (!isAnchorable(section.type)) throw new AnchorError("not-anchorable", `Can't anchor a ${section.type}`);

    const base: ParagraphAnchor = {
      kind: "paragraph",
      path: ref.path,
      hash: paragraphHash(section.text),
      snapshot: plainParagraph(section.text),
    };
    const existing = trailingBlockId(section.text);
    if (existing) return { ...base, blockId: existing };
    if (this.deps.mode() === "hash") return base;

    try {
      const blockId = await this.writeBlockId(ref.path, section);
      return { ...base, blockId };
    } catch (e) {
      console.warn("Vocab Tracker: couldn't write a block id, using a text hash instead", e);
      return base;
    }
  }

  private async writeBlockId(path: string, section: NoteSection): Promise<string> {
    let id = "";
    await this.deps.vault.process(path, (current) => {
      // Re-locate inside the atomic callback: `current` is the text being
      // written over, which may differ from what create() read.
      const target = locateSection(current, section);
      if (!target) throw new AnchorError("missing-paragraph");
      const already = trailingBlockId(target.text);
      if (already) {
        id = already;
        return current;
      }
      const inNote = blockIdsIn(current);
      id = newBlockId((x) => inNote.has(x) || this.deps.vault.blockIdTaken(x), this.random);
      return withBlockId(current, target.lineEnd, id);
    });
    return id;
  }

  // Where the anchored paragraph is now, or why it can't be found.
  async resolve(anchor: ParagraphAnchor): Promise<AnchorResolution> {
    let content: string | null;
    try {
      content = await this.deps.vault.read(anchor.path);
    } catch {
      content = null;
    }
    if (content === null) return { status: "orphan", reason: "missing-file" };
    return resolveIn(content, anchor);
  }
}

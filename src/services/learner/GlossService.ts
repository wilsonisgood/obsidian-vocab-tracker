import { glossCandidates, glossOf, noteGlosses, type NoteGloss } from "../../core/learner/gloss";
import { basenameOf } from "../../core/learner/reading";
import type { GlossWord, ParagraphGloss } from "../../core/model/learner";
import type { CefrLevel } from "../../core/model/settings";
import type { Anchor } from "../../core/model/thread";
import type { VocabEntry } from "../../core/model/entry";
import type { NoteReaderPort } from "../../core/ports";
import { paragraphHash } from "../../core/text/hash";
import { paragraphAtLine, plainParagraph, splitParagraphSpans } from "../../core/text/paragraphs";
import type { CefrTier } from "../../core/wordlists/cefr";
import { paragraphGloss, parseGloss } from "../ai/tasks/gloss";
import { structuredJson } from "../ai/tasks/family";
import type { LearnAi } from "../learn/ports";

// 語境意思 (1030 #3): after a discussion of a paragraph — or of a word,
// whose source paragraph is used — the paragraph's words above the
// learner's level are glossed once (paragraph.gloss, fast tier) and kept in
// learner.json by the paragraph's text hash. A paragraph that already has a
// gloss is never glossed again, whatever discussion triggers it.

export interface GlossStorePort {
  ensureLoaded(): Promise<void>;
  gloss(id: string): ParagraphGloss | undefined;
  glosses(): readonly ParagraphGloss[];
  upsertGloss(g: ParagraphGloss): void;
  wordCefr(): ReadonlyMap<string, CefrTier>;
}

export interface GlossServiceDeps {
  ai: LearnAi;
  learner: GlossStorePort;
  notes: NoteReaderPort;
  level(): CefrLevel | "";
  entry(id: string): Pick<VocabEntry, "source"> | undefined;
  // The paragraph's current text (block id → hash), or null when it's gone.
  paragraphText(anchor: Extract<Anchor, { kind: "paragraph" }>): Promise<string | null>;
  // AI on and set up; without it nothing is sent.
  aiReady(): boolean;
  clock?: () => Date;
}

export class GlossService {
  private inflight = new Set<string>();
  private clock: () => Date;

  constructor(private deps: GlossServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // ThreadService's onDiscussed: only discussions that got an answer.
  async afterDiscussion(anchor: Anchor, ok: boolean): Promise<void> {
    if (!ok) return;
    try {
      if (anchor.kind === "paragraph") {
        const text = await this.deps.paragraphText(anchor);
        if (text) await this.glossParagraph(anchor.path, text);
      } else if (anchor.kind === "word") {
        const src = this.deps.entry(anchor.entryId)?.source;
        if (!src?.path) return;
        const content = await this.deps.notes.read(src.path);
        const hit = content === null ? null : paragraphAtLine(content, src.line);
        if (hit) await this.glossParagraph(src.path, hit.text);
      }
    } catch (e) {
      console.error("Vocab Tracker: couldn't gloss the paragraph", e);
    }
  }

  // Resolves once the paragraph has a gloss (or the attempt failed).
  async glossParagraph(path: string, text: string): Promise<void> {
    const id = paragraphHash(text);
    if (this.inflight.has(id) || !this.deps.aiReady()) return;
    this.inflight.add(id);
    try {
      await this.deps.learner.ensureLoaded();
      if (this.deps.learner.gloss(id)) return;
      const words = glossCandidates(text, this.deps.level(), this.deps.learner.wordCefr());
      let glossed: GlossWord[] = [];
      if (words.length) {
        const input = { title: basenameOf(path), paragraph: plainParagraph(text), words };
        const r = await this.deps.ai.run(paragraphGloss, input, { threadId: `gloss:${id}` });
        glossed = parseGloss(structuredJson(r), words).map((it) => {
          const g: GlossWord = { w: it.word, zh: it.zh, en: it.en };
          if (it.pos) g.pos = it.pos;
          return g;
        });
      }
      this.deps.learner.upsertGloss({ id, path, words: glossed, at: this.clock().toISOString() });
    } finally {
      this.inflight.delete(id);
    }
  }

  // The glossed words of a note's current paragraphs.
  forNote(markdown: string): Map<string, NoteGloss> {
    const glosses = this.deps.learner.glosses();
    if (!glosses.length) return new Map();
    return noteGlosses(glosses, splitParagraphSpans(markdown).map((p) => paragraphHash(p.text)));
  }

  // Every gloss of a word across notes (word detail page), newest first.
  allFor(word: string): { path: string; gloss: GlossWord; at: string }[] {
    const out: { path: string; gloss: GlossWord; at: string }[] = [];
    for (const g of this.deps.learner.glosses()) {
      const hit = glossOf(noteGlosses([g], [g.id]), word);
      if (hit) out.push({ path: g.path, gloss: hit, at: g.at });
    }
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
}

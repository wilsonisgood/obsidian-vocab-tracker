import type { VocabEntry } from "../../core/model/entry";
import type { Family } from "../../core/model/family";
import type { Thread } from "../../core/model/thread";
import type { TriviaItem } from "../../core/model/trivia";
import { usagesOf, type VerbFavorite } from "../../core/model/usage";
import type { NoteReaderPort } from "../../core/ports";
import { resolveIn, type ParagraphAnchor } from "../anchors/ParagraphAnchorService";
import { paragraphNumber } from "../files/paragraphNumber";
import type { ExportDataPort, ParagraphThread } from "./ports";

// ExportDataPort over the plugin's stores: the vocab list (VocabStore),
// threads.json (ThreadService) and learn.json (LearnStore). Everything is
// read when ExportService writes, never cached here.

export interface ExportDataSources {
  // Live (not soft-deleted) entries — VocabStore.entries.
  entries(): readonly VocabEntry[];
  threads: {
    ensureLoaded(): Promise<void>;
    wordThread(entryId: string): Thread | undefined;
    paragraphThreads(path?: string): Thread[];
  };
  learn: {
    ensureLoaded(): Promise<void>;
    families(): Family[];
    trivia(): TriviaItem[];
    // LearnStore has it; optional so older wiring still type-checks.
    verbFavorites?(): VerbFavorite[];
  };
  notes: NoteReaderPort;
}

// 0-based index of the paragraph the anchor points at today, counted the
// way the word page header numbers ¶ (paragraphNumber: paragraphs, lists
// and blockquotes only), so 「出自 X ¶12」 and the .ai.md's 「¶12」 agree.
// Null when the paragraph (or the note) can't be found any more.
export function paragraphIndexOf(content: string | null, anchor: ParagraphAnchor): number | null {
  if (content === null) return null;
  const found = resolveIn(content, anchor);
  if (found.status !== "found") return null;
  const n = paragraphNumber(content, found.section.lineStart);
  return n === null ? null : n - 1;
}

export function createExportData(src: ExportDataSources): ExportDataPort {
  const entry = (id: string) => src.entries().find((e) => e.id === id && !e.deletedAt);
  return {
    async ready() {
      await Promise.all([src.threads.ensureLoaded(), src.learn.ensureLoaded()]);
    },
    entry,
    entries: () => src.entries().filter((e) => !e.deletedAt),
    wordThread: (entryId) => src.threads.wordThread(entryId),
    async paragraphThreads(path): Promise<ParagraphThread[]> {
      const threads = src.threads.paragraphThreads(path).filter((th) => !th.deletedAt && th.anchor.kind === "paragraph");
      if (!threads.length) return [];
      let content: string | null;
      try {
        content = await src.notes.read(path);
      } catch {
        content = null;
      }
      return threads.map((thread) => ({ thread, index: paragraphIndexOf(content, thread.anchor as ParagraphAnchor) }));
    },
    families: () => src.learn.families().filter((f) => !f.deletedAt),
    // Wave 8 U1 (1006-2 #21): usage is per pos now; the word page's usage
    // export (ExportVerbFavorite/ExportUsage, services/export/types.ts)
    // is still verb-only this wave — U2 owns the per-pos export.
    usage: (entryId) => {
      const e = entry(entryId);
      return e && usagesOf(e).v;
    },
    trivia: () => src.learn.trivia().filter((t) => !t.deletedAt),
    verbFavorites: () => (src.learn.verbFavorites?.() ?? []).filter((v) => !v.deletedAt),
  };
}

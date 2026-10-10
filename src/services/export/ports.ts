import type { VocabEntry } from "../../core/model/entry";
import type { WordBreakdown } from "../../core/model/morpheme";
import type { Thread } from "../../core/model/thread";
import type { PosKey } from "../../core/model/usage";
import type { ExportFamily, ExportTrivia, ExportUsage, ExportVerbFavorite } from "./types";

// Data ExportService reads; the vault itself is VaultPort in core/ports.ts.

export interface ParagraphThread {
  thread: Thread;
  // 0-based paragraph index in the note today; null when the paragraph
  // can't be found any more (orphaned). Resolved by ParagraphAnchorService.
  index: number | null;
}

// What the exports are made from. Implemented at integration by a small
// adapter over VocabStore, ThreadService, ParagraphAnchorService and the
// learn services; read at write time, so an export always reflects the
// latest data rather than whatever it was when the change was announced.
export interface ExportDataPort {
  // Resolves once lazily loaded shards (threads.json, learn.json) are in.
  ready?(): Promise<void>;
  // Live (not soft-deleted) entries only.
  entry(id: string): VocabEntry | undefined;
  entries(): readonly VocabEntry[];
  wordThread(entryId: string): Thread | undefined;
  // Live paragraph threads anchored to this note.
  paragraphThreads(path: string): Promise<ParagraphThread[]>;
  families(): readonly ExportFamily[];
  // This entry's usage blocks, by part of speech (1006-2 #19 #21).
  usages(entryId: string): Partial<Record<PosKey, ExportUsage>>;
  // Saved (favourited) trivia.
  trivia(): readonly ExportTrivia[];
  // Saved usage favorites (用法收藏), any part of speech. Optional:
  // without it no page shows a usage as saved.
  verbFavorites?(): readonly ExportVerbFavorite[];
  // This word's DNA breakdown (09 §7.1, 決定 1 — wordMeta, off
  // VocabEntry). Optional: without it the word page's「## 字根」section
  // is simply left out.
  wordBreakdown?(entryId: string): WordBreakdown | undefined;
}

// Where exports go. Folders are vault paths without a trailing slash.
export interface ExportFolders {
  words: string;
  threads: string;
  triviaFile: string;
}

export const DEFAULT_EXPORT_FOLDERS: ExportFolders = {
  words: "vocab-list/單字",
  threads: "vocab-list/討論串",
  triviaFile: "vocab-list/Eureka.md",
};

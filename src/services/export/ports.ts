import type { VocabEntry } from "../../core/model/entry";
import type { Thread } from "../../core/model/thread";
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
  usage(entryId: string): ExportUsage | undefined;
  // Saved (favourited) trivia.
  trivia(): readonly ExportTrivia[];
  // Saved verb usages (動詞用法收藏). Optional: without it no page
  // shows a usage as saved.
  verbFavorites?(): readonly ExportVerbFavorite[];
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
  triviaFile: "vocab-list/冷知識.md",
};

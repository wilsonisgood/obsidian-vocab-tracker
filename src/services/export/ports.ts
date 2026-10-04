import type { VocabEntry } from "../../core/model/entry";
import type { Thread } from "../../core/model/thread";
import type { ExportFamily, ExportTrivia, ExportUsage } from "./types";

// Ports used by ExportService. Kept here until integration, when VaultPort
// moves to core/ports.ts next to the others (規劃書 07 §2 rule 3).

// Markdown files in the vault, implemented by platform/ObsidianVault.ts.
export interface VaultPort {
  exists(path: string): boolean;
  // Creates the file, and any missing parent folders. Rejects when the
  // file already exists (never overwrites).
  create(path: string, content: string): Promise<void>;
  // Atomic read-modify-write of an existing file (Obsidian's
  // vault.process): `fn` gets the current text and returns the new text.
  process(path: string, fn: (text: string) => string): Promise<void>;
  // Moves a file, keeping links to it updated (fileManager.renameFile).
  rename(from: string, to: string): Promise<void>;
  // A note whose frontmatter has `vocab-tracker: <kind>` and
  // `vocab-tracker-id: <id>` — finds a word page the user renamed or moved
  // (規劃書 06 §4.6). Null when there's none. Compare the id as a string:
  // YAML may have parsed an unquoted numeric id as a number.
  findManaged(kind: string, id: string): string | null;
}

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

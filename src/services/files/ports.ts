import type { VaultPort } from "../../core/ports";
import type { CreateMode } from "../export/ExportService";

// What EntryFilesService needs from the outside. To be moved into
// core/ports.ts at integration (規劃書 07 §2 rule 3).

// The vault, plus a way to wait until findManaged is reliable.
export interface FilesVaultPort extends Pick<VaultPort, "exists" | "create" | "rename" | "findManaged"> {
  // Resolves once the metadata cache has finished its first index
  // (ObsidianVault.ready). Optional so test fakes can skip it.
  ready?(): Promise<void>;
}

// Remembers which entry files were already created once, so one the user
// deleted on purpose isn't brought back at the next startup. Shared
// between devices (it travels with the plugin's data).
export interface SeedRecordPort {
  seeded(): Promise<ReadonlySet<string>>;
  markSeeded(ids: readonly string[]): Promise<void>;
}

// The parts of ExportService the file bookkeeping drives.
export interface FilesExportPort {
  // The article's .ai.md follows it (id, source and name).
  renameArticle(oldPath: string, newPath: string): Promise<void>;
  // Re-render the article's .ai.md (e.g. its paragraphs are orphaned now).
  articleChanged(articlePath: string, create?: CreateMode): void;
  // Creates the word page if needed and returns its path.
  openWordPage(entryId: string): Promise<string | null>;
  // Re-render the saved list in 冷知識.md.
  triviaChanged?(): void;
}

// Paragraph anchors' note paths (ThreadService.renameParagraphPath), which
// must move before the .ai.md is re-rendered for the new path.
export interface ParagraphPathsPort {
  renameParagraphPath(oldPath: string, newPath: string): Promise<number>;
}

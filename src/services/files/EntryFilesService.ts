import { joinPath } from "../../core/text/slug";
import type { ExportFolders } from "../export/ports";
import {
  ENTRY_FILE_KIND,
  ENTRY_FILES,
  entryFileDef,
  entryFilePath,
  planEntryRenames,
  renderEntryFile,
  type EntryFileId,
} from "./entryFiles";
import type { FilesExportPort, FilesVaultPort, ParagraphPathsPort, SeedRecordPort } from "../../core/ports";
import { filesPaths, inFolderPath, resolveFilesSettings, type FilesPaths, type FilesSettings } from "./settings";

// The plugin's notes as files (規劃書 06 §8.3, §4.6):
//
// - Entry files (Card.md, Galaxy.md, Usage.md, Eureka.md, DNA.md): created only
//   when missing, never overwritten. Found by their frontmatter id first,
//   so a file the user renamed or moved is still the one used; then at
//   the configured folder (an older file without an id is adopted as is).
//   At startup only files never created before are made (SeedRecordPort):
//   one the user deleted stays deleted until they open it again.
// - Word pages: only created when they have a discussion / saved trivia
//   (ExportService decides) or the user opens one (openWordPage).
// - Article renamed → its paragraph anchors, then its .ai.md, follow.
//   Article deleted → its discussions stay, shown as orphaned; nothing
//   is deleted.
//
// Never writes inside a file that exists: everything here is create,
// rename or a hand-off to ExportService, which only touches managed blocks.

// Where entry files lived before M6 made the folder configurable.
export const LEGACY_FOLDER = "vocab-list";

export interface EntryFilesDeps {
  vault: FilesVaultPort;
  // The raw `settings.files` (read on every call, so changes apply now).
  settings?: () => Partial<FilesSettings> | null | undefined;
  seeds?: SeedRecordPort;
  export?: FilesExportPort;
  paragraphs?: ParagraphPathsPort;
  // Notes whose renames/deletes concern discussions. Default: Markdown
  // outside the plugin's folder, except .ai.md.
  isArticle?: (path: string) => boolean;
}

export class EntryFilesService {
  // Entry file id → the ensure() in progress, so two quick calls create once.
  private pending = new Map<EntryFileId, Promise<string>>();

  constructor(private deps: EntryFilesDeps) {}

  // ── Paths ────────────────────────────────────────────────────────────

  settings(): FilesSettings {
    return resolveFilesSettings(this.deps.settings?.());
  }

  paths(): FilesPaths {
    return filesPaths(this.settings());
  }

  // The folders ExportService writes to. Eureka.md is wherever the trivia
  // entry file is now, so the saved list lands in the file the user kept.
  exportFolders(): ExportFolders {
    const p = this.paths();
    return { words: p.words, threads: p.threads, triviaFile: this.entryFilePath("trivia") };
  }

  // The entry file as it is now: found by id, else where a new one goes.
  entryFilePath(id: EntryFileId): string {
    return this.deps.vault.findManaged(ENTRY_FILE_KIND, id) ?? entryFilePath(this.paths().folder, id);
  }

  isArticle(path: string): boolean {
    if (this.deps.isArticle) return this.deps.isArticle(path);
    return /\.md$/i.test(path) && !/\.ai\.md$/i.test(path) && !inFolderPath(path, this.paths().folder);
  }

  // ── Entry files ──────────────────────────────────────────────────────

  // The entry file's path, creating the file if there is none. Never
  // overwrites: a file at the path (with or without our id) is used as is.
  ensure(id: EntryFileId): Promise<string> {
    const running = this.pending.get(id);
    if (running) return running;
    const job = this.doEnsure(id).finally(() => this.pending.delete(id));
    this.pending.set(id, job);
    return job;
  }

  private async doEnsure(id: EntryFileId): Promise<string> {
    const { vault } = this.deps;
    await vault.ready?.();
    await this.migrateName(id);
    const found = vault.findManaged(ENTRY_FILE_KIND, id);
    if (found) return this.seeded(id, found);

    const path = entryFilePath(this.paths().folder, id);
    if (vault.exists(path)) return this.seeded(id, path);

    // An older file (before ids, at the old fixed folder) moves to the
    // configured folder instead of a new empty one appearing next to it,
    // as ensureVocabFile does with the old vault-root vocab-list.md.
    const legacy = entryFilePath(LEGACY_FOLDER, id);
    if (legacy !== path && vault.exists(legacy)) {
      await vault.rename(legacy, path);
      return this.seeded(id, path);
    }

    try {
      await vault.create(path, renderEntryFile(id));
    } catch (e) {
      // Appeared meanwhile (sync, another call): use it, don't overwrite.
      if (!vault.exists(path)) throw e;
      return this.seeded(id, path);
    }
    if (id === "trivia") this.deps.export?.triviaChanged?.();
    return this.seeded(id, path);
  }

  // A file still named after the pre-1010 default (單字卡.md…) becomes the
  // new name through a rename (links follow, content untouched). Found by
  // frontmatter id, else by the old name in the folder (an older file
  // without an id). A name the user chose, or a taken target, is skipped.
  private async migrateName(id: EntryFileId): Promise<void> {
    const { vault } = this.deps;
    const legacyName = `${entryFileDef(id).legacyName}.md`;
    const path =
      vault.findManaged(ENTRY_FILE_KIND, id) ??
      [joinPath(this.paths().folder, legacyName), joinPath(LEGACY_FOLDER, legacyName)].find((p) => vault.exists(p));
    if (!path) return;
    for (const [from, to] of planEntryRenames([{ id, path }], (p) => vault.exists(p))) {
      try {
        await vault.rename(from, to);
      } catch (e) {
        console.error(`Vocab Tracker: couldn't rename ${from}`, e);
      }
    }
  }

  private async seeded(id: EntryFileId, path: string): Promise<string> {
    try {
      await this.deps.seeds?.markSeeded([id]);
    } catch (e) {
      console.error("Vocab Tracker: couldn't record the entry file", e);
    }
    return path;
  }

  // Startup: creates the entry files that were never created before.
  // Resolves to the paths created (or adopted) this time.
  async ensureAll(): Promise<string[]> {
    await this.deps.vault.ready?.();
    // Existing files take the new names even when they were seeded long ago.
    for (const def of ENTRY_FILES) await this.migrateName(def.id);
    const done = (await this.deps.seeds?.seeded()) ?? new Set<string>();
    const out: string[] = [];
    for (const def of ENTRY_FILES) {
      if (done.has(def.id)) continue;
      try {
        out.push(await this.ensure(def.id));
      } catch (e) {
        console.error(`Vocab Tracker: couldn't create ${entryFileDef(def.id).name}.md`, e);
      }
    }
    return out;
  }

  // ── Word pages ───────────────────────────────────────────────────────

  // The 「單字頁」 button: the word's page, created now if needed.
  async openWordPage(entryId: string): Promise<string | null> {
    const exp = this.deps.export;
    if (!exp) return null;
    await this.deps.vault.ready?.();
    return exp.openWordPage(entryId);
  }

  // ── Renames and deletes (§4.6) ───────────────────────────────────────

  // Call from the vault's "rename" event. A folder rename moves the
  // paragraph anchors of every note under it; each note's .ai.md follows
  // on that note's own rename event (Obsidian fires one per file).
  async handleRename(oldPath: string, newPath: string, isFolder = false): Promise<void> {
    if (oldPath === newPath) return;
    if (isFolder) {
      await this.deps.paragraphs?.renameParagraphPath(oldPath, newPath);
      return;
    }
    if (!this.isArticle(oldPath)) return;
    // Anchors first: the .ai.md is rendered from the threads at newPath.
    await this.deps.paragraphs?.renameParagraphPath(oldPath, newPath);
    await this.deps.export?.renameArticle(oldPath, newPath);
  }

  // Call from the vault's "delete" event. Discussions are kept: the
  // article's .ai.md is re-rendered so its paragraphs show as orphaned,
  // and the sidebar offers 重新綁定 / 刪除 (§4.6). Nothing is deleted.
  handleDelete(path: string, isFolder = false): void {
    if (isFolder || !this.isArticle(path)) return;
    this.deps.export?.articleChanged(path, "never");
  }
}

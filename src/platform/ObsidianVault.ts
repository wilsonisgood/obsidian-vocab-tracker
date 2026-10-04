import { TFile, type App } from "obsidian";
import type { ParagraphVaultPort, VaultPort } from "../core/ports";

// The vault as the services see it (規劃書 06 §5.1 paragraph anchors, §8
// exports). Skeleton written before the second wave so tasks G and I can
// fill in their own methods without touching each other's:
//   G — process, blockIdTaken
//   I — exists, create, rename, findManaged, ready
// Methods still unimplemented throw, so a missing piece fails loudly.

const todo = (method: string, task: string): Error =>
  new Error(`ObsidianVault.${method} is not implemented yet (規劃書 07 task ${task})`);

export class ObsidianVault implements VaultPort, ParagraphVaultPort {
  constructor(private app: App) {}

  // ── shared ────────────────────────────────────────────────────────────

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.cachedRead(file) : null;
  }

  // ── task G ────────────────────────────────────────────────────────────

  // vault.process(file, fn). Rethrow whatever `fn` throws unchanged:
  // ExportService tells another article's .ai.md apart by the error's
  // class. Skip the write when `fn` returns the text unchanged (no mtime
  // bump, no sync churn). Rejects when the file doesn't exist. Needs
  // minAppVersion ≥ 1.1.0 in manifest.json.
  async process(_path: string, _fn: (text: string) => string): Promise<string> {
    throw todo("process", "G");
  }

  // Any markdown file whose metadataCache blocks already have this id.
  blockIdTaken(_id: string): boolean {
    throw todo("blockIdTaken", "G");
  }

  // ── task I ────────────────────────────────────────────────────────────

  exists(_path: string): boolean {
    throw todo("exists", "I");
  }

  // Creates missing parent folders; rejects when the file already exists.
  async create(_path: string, _content: string): Promise<void> {
    throw todo("create", "I");
  }

  // fileManager.renameFile, so links to the file follow it.
  async rename(_from: string, _to: string): Promise<void> {
    throw todo("rename", "I");
  }

  // Frontmatter `vocab-tracker: <kind>` + `vocab-tracker-id: <id>`, the id
  // compared as a string (also article paths for "ai-note"). Keep an index
  // updated from metadataCache changed / rename / delete rather than
  // scanning every file per call.
  findManaged(_kind: string, _id: string): string | null {
    throw todo("findManaged", "I");
  }

  // Resolves once metadataCache has finished its initial index, so
  // findManaged doesn't miss a moved word page or .ai.md at startup.
  async ready(): Promise<void> {
    throw todo("ready", "I");
  }
}

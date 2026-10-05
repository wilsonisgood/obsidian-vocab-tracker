import { normalizePath, TFile, type App } from "obsidian";
import type { WordlistFile, WordlistSourcePort } from "../core/ports";

// Plain text formats a word list may come in. Obsidian indexes every file
// in the vault (not only .md), so .txt/.csv exports show up in getFiles().
const EXTENSIONS = new Set(["md", "txt", "csv", "tsv"]);

export function inFolder(path: string, folder: string): boolean {
  return path.startsWith(normalizePath(folder) + "/");
}

export class ObsidianWordlists implements WordlistSourcePort {
  constructor(private app: App) {}

  list(folder: string): WordlistFile[] {
    return this.app.vault
      .getFiles()
      .filter((f) => EXTENSIONS.has(f.extension.toLowerCase()) && inFolder(f.path, folder))
      // "_notes.md", "README.md" etc. can sit beside the lists without
      // becoming a tag.
      .filter((f) => !f.basename.startsWith("_") && f.basename.toLowerCase() !== "readme")
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, basename: f.basename }));
  }

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.cachedRead(file) : null;
  }
}

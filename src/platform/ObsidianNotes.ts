import { TFile, type App } from "obsidian";
import type { NoteReaderPort } from "../core/ports";

export class ObsidianNotes implements NoteReaderPort {
  constructor(private app: App) {}

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? this.app.vault.cachedRead(file) : null;
  }
}

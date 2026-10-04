import type { StoragePort } from "../../core/ports";

interface ImportsShard {
  // note path → when its exam words were added to the vocab list.
  notes: Record<string, string>;
}

// Remembers which notes have already had their exam words auto-imported,
// so each note is imported once: words the user deletes afterwards don't
// come back on the next open (規劃書 03 §3.2 自動貼標).
export class NoteImports {
  private notes: Record<string, string> = {};

  constructor(private storage: StoragePort) {}

  async load(): Promise<void> {
    const disk = await this.storage.readShard<ImportsShard>("imports");
    // Union with whatever this session already recorded — a sync can only
    // add notes, never "un-import" one.
    this.notes = { ...(disk?.notes ?? {}), ...this.notes };
  }

  has(path: string): boolean {
    return path in this.notes;
  }

  async mark(path: string, at: string): Promise<void> {
    this.notes[path] = at;
    await this.save();
  }

  async forget(path: string): Promise<void> {
    if (!(path in this.notes)) return;
    delete this.notes[path];
    await this.save();
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!(oldPath in this.notes)) return;
    this.notes[newPath] = this.notes[oldPath];
    delete this.notes[oldPath];
    await this.save();
  }

  private save(): Promise<void> {
    return this.storage.writeShard<ImportsShard>("imports", { notes: this.notes });
  }
}

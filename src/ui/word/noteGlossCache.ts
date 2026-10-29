import type { NoteGloss } from "../../core/learner/gloss";

// 1030 #3: the active note's 語境意思, read once per note version. get() is
// synchronous for the row renderers: it returns null while the note is
// still being read, then tells the listeners so they can redraw.

export interface NoteGlossCacheDeps {
  read(path: string): Promise<string | null>;
  forNote(markdown: string): Map<string, NoteGloss>;
}

export class NoteGlossCache {
  private cur: { key: string; map: Map<string, NoteGloss> } | null = null;
  private loading: string | null = null;
  private version = 0;
  private listeners = new Set<(path: string) => void>();

  constructor(private deps: NoteGlossCacheDeps) {}

  get(path: string, mtime: number): Map<string, NoteGloss> | null {
    const key = `${path}\n${mtime}\n${this.version}`;
    if (this.cur?.key === key) return this.cur.map;
    if (this.loading !== key) void this.load(path, key);
    return null;
  }

  // A gloss was added or synced: everything is read again.
  invalidate(): void {
    this.version++;
    this.cur = null;
  }

  onReady(fn: (path: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async load(path: string, key: string): Promise<void> {
    this.loading = key;
    let text: string | null;
    try {
      text = await this.deps.read(path);
    } catch {
      text = null;
    }
    if (this.loading !== key) return;
    this.loading = null;
    const map = text === null ? new Map<string, NoteGloss>() : this.deps.forNote(text);
    this.cur = { key, map };
    if (map.size) for (const fn of this.listeners) fn(path);
  }
}

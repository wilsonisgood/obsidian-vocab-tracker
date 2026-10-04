import { blockIdsIn } from "../../../src/core/text/blockId";
import type { ParagraphVaultPort } from "../../../src/core/ports";

// In-memory vault: process() is atomic like Obsidian's vault.process, and
// blockIdTaken looks at every note (the metadataCache's view).
export class MemoryVault implements ParagraphVaultPort {
  files = new Map<string, string>();
  writes: string[] = [];
  // Simulates an edit that lands between create()'s read and its write.
  beforeProcess?: (path: string) => void;
  failProcess = false;

  constructor(files: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(files)) this.files.set(p, c);
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async process(path: string, fn: (content: string) => string): Promise<string> {
    this.beforeProcess?.(path);
    if (this.failProcess) throw new Error("vault is read-only");
    const current = this.files.get(path);
    if (current === undefined) throw new Error(`File not found: ${path}`);
    const next = fn(current);
    if (next !== current) {
      this.files.set(path, next);
      this.writes.push(path);
    }
    return next;
  }

  blockIdTaken(id: string): boolean {
    for (const content of this.files.values()) if (blockIdsIn(content).has(id)) return true;
    return false;
  }
}

// Random source that yields the given base36 ids in order (each id is 6
// characters → 6 draws).
export function idSource(...ids: string[]): () => number {
  const draws = ids.flatMap((id) => [...id].map((ch) => (parseInt(ch, 36) + 0.5) / 36));
  let i = 0;
  return () => draws[i++ % draws.length];
}

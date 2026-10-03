import type { VocabEntry } from "../model/entry";

// Scoped to VocabEntry.source.path only (exact match) — paragraph anchors,
// 單字/*.md and 討論串/*.ai.md from 規劃書 06 §4.6 don't exist yet (M5/M6),
// so this is the only "source note moved" bookkeeping M1 needs.
// Mutates matching entries in place and returns them, so the caller can
// stamp updatedAt/rev on exactly the ones that changed (via store.touch).
export function updateSourcePaths(
  entries: VocabEntry[],
  oldPath: string,
  newPath: string
): VocabEntry[] {
  const changed: VocabEntry[] = [];
  for (const entry of entries) {
    if (entry.source && entry.source.path === oldPath) {
      entry.source.path = newPath;
      changed.push(entry);
    }
  }
  return changed;
}

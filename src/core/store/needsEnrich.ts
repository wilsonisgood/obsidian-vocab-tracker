import type { VocabEntry } from "../model/entry";

// Live entries with no definition in either language — a dictionary fetch
// that never ran (Obsidian closed mid-queue) or failed (offline). Retried
// in the background at every startup.
export function entriesMissingDefinition(entries: readonly VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => !e.deletedAt && !e.definition?.trim() && !e.definitionZh?.trim());
}

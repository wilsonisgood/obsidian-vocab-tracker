import type { FocusRef, MistakeItem, Track } from "../model/learner";

// Shared mistake area (規劃書 12 §1): a wrong answer opens an item, one
// correct redo resolves it, a later wrong answer reopens the same item.

export function recordWrong(
  existing: MistakeItem | undefined,
  track: Track,
  questionId: string,
  focus: FocusRef,
  now: Date
): MistakeItem {
  const iso = now.toISOString();
  if (existing) {
    const reopened: MistakeItem = { ...existing, focus, lastWrongAt: iso, updatedAt: iso };
    delete reopened.resolvedAt;
    return reopened;
  }
  return { id: `${track}:${questionId}`, track, questionId, focus, addedAt: iso, lastWrongAt: iso, updatedAt: iso };
}

export function resolveMistake(item: MistakeItem, now: Date): MistakeItem {
  const iso = now.toISOString();
  return { ...item, resolvedAt: iso, updatedAt: iso };
}

export function openMistakes(items: readonly MistakeItem[], track?: Track): MistakeItem[] {
  return items
    .filter((m) => !m.resolvedAt && (track === undefined || m.track === track))
    .sort((a, b) => (a.lastWrongAt < b.lastWrongAt ? 1 : a.lastWrongAt > b.lastWrongAt ? -1 : 0));
}

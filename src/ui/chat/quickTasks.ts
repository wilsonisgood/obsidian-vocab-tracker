// Which quick-action buttons a ChatPanel shows. Pure.

export interface QuickTaskLike {
  id: string;
  label?: string;
}

// Default: every task of the surface that has a label. With `ids` (the host
// chose them), those, in that order, skipping ids that are unknown or unlabeled.
export function quickTasksToShow<T extends QuickTaskLike>(
  surfaceTasks: readonly T[],
  get: (id: string) => T | undefined,
  ids?: readonly string[]
): T[] {
  if (!ids) return surfaceTasks.filter((t) => !!t.label);
  const out: T[] = [];
  for (const id of ids) {
    const task = get(id);
    if (task?.label) out.push(task);
  }
  return out;
}

// The selection a question carries: none when the page opted out.
export function selectionToAttach(attach: boolean | undefined, selected: string | undefined): string | undefined {
  return attach === false ? undefined : selected;
}

// A button the host defines itself: shows `text`, sends `taskId` with `question`.
export interface QuickChip {
  text: string;
  taskId: string;
  question: string;
}
export type QuickItem = string | QuickChip;

export interface QuickButton {
  // Task label key (translated by the caller) or literal text.
  label: { key: string } | { text: string };
  taskId: string;
  question: string;
}

// The buttons for the host's list: a string is a task id (dropped when
// unknown or unlabeled), a chip is used as given.
export function resolveQuickItems(
  items: readonly QuickItem[],
  get: (id: string) => QuickTaskLike | undefined
): QuickButton[] {
  const out: QuickButton[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      out.push({ label: { text: item.text }, taskId: item.taskId, question: item.question });
      continue;
    }
    const task = get(item);
    if (task?.label) out.push({ label: { key: task.label }, taskId: task.id, question: "" });
  }
  return out;
}

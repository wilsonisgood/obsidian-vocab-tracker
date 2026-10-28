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

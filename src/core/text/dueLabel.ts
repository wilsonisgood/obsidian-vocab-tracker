// Compact next-review label for a word row (設計稿 L1: "今天" / "10/05").
// Anything due before tomorrow — including overdue cards — is "today",
// since that's when it'll show up in the review queue. Local calendar
// days, matching the queue's daily boundaries.
export type DueLabel = { kind: "today" } | { kind: "date"; text: string };

export function dueLabel(due: Date, now: Date): DueLabel {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due.getTime() < tomorrow.getTime()) return { kind: "today" };
  const p = (n: number) => String(n).padStart(2, "0");
  const md = `${p(due.getMonth() + 1)}/${p(due.getDate())}`;
  return {
    kind: "date",
    text: due.getFullYear() === now.getFullYear() ? md : `${due.getFullYear()}/${md}`,
  };
}

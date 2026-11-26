// 主題頁「練習這個概念」那一組題目的結算（純函式，方便測）。

export interface DockAnswer {
  id: string;
  correct: boolean;
}

// 同一題答了不止一次時只算第一次。
export function dockSummary(answers: readonly DockAnswer[]): { right: number; total: number } {
  const first = new Map<string, boolean>();
  for (const a of answers) if (!first.has(a.id)) first.set(a.id, a.correct);
  let right = 0;
  for (const c of first.values()) if (c) right++;
  return { right, total: first.size };
}

// Obsidian 的標題／清單收合 (getFoldInfo().folds)：from 是標題那一行，
// to 是被收起來的最後一行（行號跟編輯器一樣 0-based、含 frontmatter）。
// 定位單字前要把蓋住目標行的收合都打開，否則捲過去只會停在收合的標題上。

export interface FoldRange {
  from: number;
  to: number;
}

// 標題那一行本身看得到；它底下 (from, to] 的行才被藏起來。
export function hidesLine(fold: FoldRange, line: number): boolean {
  return fold.from < line && line <= fold.to;
}

// 留下沒蓋住 line 的收合；全部都沒蓋住時回 null（不用動）。
export function foldsRevealing<T extends FoldRange>(folds: readonly T[], line: number): T[] | null {
  const kept = folds.filter((f) => !hidesLine(f, line));
  return kept.length === folds.length ? null : kept;
}

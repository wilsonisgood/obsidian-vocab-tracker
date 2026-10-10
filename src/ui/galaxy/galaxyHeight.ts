// 1010 #G1 — 嵌在筆記裡的星系窗戶：從窗戶頂端一路延伸到可視區底部，最少 min。
// 兩個座標要在同一個座標系（頁面捲到頂時量的位置），所以捲動時不會變。
export const GALAXY_MIN_HEIGHT = 400;

export function galaxyFillHeight(viewportBottom: number, graphTop: number, min = GALAXY_MIN_HEIGHT): number {
  const space = viewportBottom - graphTop;
  if (!Number.isFinite(space) || space <= min) return min;
  return Math.floor(space);
}

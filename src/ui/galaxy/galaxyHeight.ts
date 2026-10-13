// 1010 #G1 — 嵌在筆記裡的星系窗戶：從窗戶頂端一路延伸到可視區底部，最少 min。
// 兩個座標要在同一個座標系（頁面捲到頂時量的位置），所以捲動時不會變。
export const GALAXY_MIN_HEIGHT = 400;

export function galaxyFillHeight(viewportBottom: number, graphTop: number, min = GALAXY_MIN_HEIGHT): number {
  const space = viewportBottom - graphTop;
  if (!Number.isFinite(space) || space <= min) return min;
  return Math.floor(space);
}

// 1010-2 W#4: the lowest line the window may reach, in viewport coordinates.
// The scroller's own bottom can sit *below* what the phone really shows (the
// mobile nav bar overlays it; the visual viewport is shorter), so take the
// smallest sane candidate — not just scroller.clientHeight.
export function galaxyViewBottom(candidates: ReadonlyArray<number | null | undefined>): number {
  const ok = candidates.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
  return ok.length ? Math.min(...ok) : 0;
}

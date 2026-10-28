// 學習夥伴的快速按鈕：第一個常駐，另外兩個位置從一組題目輪流顯示，
// 每一輪換兩個，依序循環。Pure.

export const ROTATION_SIZE = 2;
export const ROTATION_MS = 10_000;

// The `size` ids shown in round `round` (0-based, wraps around the pool).
export function rotationWindow<T>(pool: readonly T[], round: number, size = ROTATION_SIZE): T[] {
  if (!pool.length) return [];
  const n = Math.min(size, pool.length);
  const start = ((round * size) % pool.length + pool.length) % pool.length;
  return Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);
}

// Paused while the pointer rests on the buttons or the composer has focus.
export function rotationPaused(state: { hovering: boolean; composerFocused: boolean }): boolean {
  return state.hovering || state.composerFocused;
}

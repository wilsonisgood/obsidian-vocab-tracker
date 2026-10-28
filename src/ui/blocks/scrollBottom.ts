// 沉底按鈕: is the page scrolled to its end? Pure.

export const BOTTOM_TOLERANCE = 24;

export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number, tolerance = BOTTOM_TOLERANCE): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= tolerance;
}

// Nothing to scroll counts as being at the bottom.
export function showSinkButton(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight > clientHeight && !isAtBottom(scrollTop, clientHeight, scrollHeight);
}

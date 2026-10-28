// 沉底按鈕: is the page scrolled to its end? Pure.

export const BOTTOM_TOLERANCE = 24;

export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number, tolerance = BOTTOM_TOLERANCE): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= tolerance;
}

// Nothing to scroll counts as being at the bottom.
export function showSinkButton(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight > clientHeight && !isAtBottom(scrollTop, clientHeight, scrollHeight);
}

// ── 找捲動容器：code block 掛進 DOM 之前找不到，要等 ──

export const SINK_MAX_TRIES = 40;
export const SINK_RETRY_MS = 250;

export type SinkSearch = "setup" | "retry" | "giveup";

export function sinkSearch(found: boolean, attempt: number, maxTries = SINK_MAX_TRIES): SinkSearch {
  if (found) return "setup";
  return attempt + 1 < maxTries ? "retry" : "giveup";
}

// Reading view / Live Preview scroll areas first, else the nearest ancestor
// whose overflow-y scrolls.
export const SCROLLER_SELECTOR = ".markdown-reading-view .markdown-preview-view, .markdown-preview-view, .cm-scroller";

export function isScrollableOverflow(overflowY: string): boolean {
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

// ── 回答時跟著捲 ──

export const FOLLOW_GAP = 120;

// `gap`: how far below the visible area the composer's bottom edge is
// (≤ 0 means it is in view). Near the bottom → keep following the answer;
// someone who scrolled up is left alone.
export function shouldFollow(gap: number, threshold = FOLLOW_GAP): boolean {
  return gap < threshold;
}

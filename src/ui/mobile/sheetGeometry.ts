// The bottom sheet's gesture and keyboard math, kept pure so it's
// unit-tested (BottomSheet.ts does the DOM side). Sizes on screen are all
// in mobile.css; these are only gesture thresholds.

// A drag shorter than this is a tap.
export const TAP_SLOP_PX = 6;
// Dragging down past this share of the sheet's height closes it…
export const DISMISS_FRACTION = 0.3;
// …and so does a quick flick down, however short.
export const FLICK_PX_PER_MS = 0.6;
// Dragging up this far (or flicking up) makes the sheet tall.
export const EXPAND_PX = 48;

export type DragOutcome = "tap" | "close" | "expand" | "collapse" | "stay";

// How far the sheet follows the finger: 1:1 downwards, with resistance
// upwards (it can't move up, only grow — which happens on release).
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : dy / 4;
}

// `dy` > 0 is downwards; `velocity` in px/ms, > 0 downwards.
export function dragOutcome(dy: number, height: number, velocity: number, expanded: boolean): DragOutcome {
  if (Math.abs(dy) < TAP_SLOP_PX) return "tap";
  if (dy > 0) {
    const far = height > 0 && dy > height * DISMISS_FRACTION;
    if (far || velocity > FLICK_PX_PER_MS) {
      // A tall sheet first steps down to normal height, unless it's
      // dragged all the way.
      if (expanded && !(height > 0 && dy > height * 2 * DISMISS_FRACTION)) return "collapse";
      return "close";
    }
    return "stay";
  }
  if (!expanded && (-dy > EXPAND_PX || -velocity > FLICK_PX_PER_MS)) return "expand";
  return "stay";
}

export interface ViewportLike {
  height: number;
  offsetTop: number;
}

// How much of the layout viewport's bottom the on-screen keyboard covers.
// On iOS the keyboard shrinks the *visual* viewport; whether Obsidian also
// resizes the page varies, and when it does innerHeight shrinks with it and
// this comes out 0 — so the sheet is never lifted twice.
export function keyboardInset(innerHeight: number, vv: ViewportLike | null | undefined): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

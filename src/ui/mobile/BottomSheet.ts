import { setIcon } from "obsidian";
import { dragOffset, dragOutcome, keyboardInset, type ViewportLike } from "./sheetGeometry";

// A bottom sheet (design M1): a dimmed backdrop and a panel that slides up
// from the bottom edge, with a grab handle. Only the shell — WordSheet puts
// the word card / paragraph discussion inside `content`.
//
// - Closes on: a tap on the backdrop, the close button, Escape, or dragging
//   the handle down (gesture math in sheetGeometry.ts).
// - Dragging the handle up (or focusing an input) makes it tall.
// - The on-screen keyboard: the visual viewport's size goes into CSS
//   variables (--vt-sheet-kb, --vt-sheet-vh) so mobile.css can lift the
//   panel above the keyboard and cap its height to what's visible; the
//   focused input is then scrolled into view inside the panel.
// - Safe areas (home indicator, notch) are handled in mobile.css with
//   env(safe-area-inset-*).
// Every size lives in mobile.css; this file only sets classes and the
// measured values above.

// Matches the slide-out transition in mobile.css; the layer is detached
// once it's over.
const CLOSE_MS = 240;

export interface SheetViewport extends ViewportLike {
  addEventListener(type: "resize" | "scroll", fn: () => void): void;
  removeEventListener(type: "resize" | "scroll", fn: () => void): void;
}

// The parts of `window` the sheet uses (a fake in tests).
export interface SheetWindow {
  innerHeight: number;
  visualViewport?: SheetViewport | null;
  addEventListener(type: "keydown", fn: (e: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", fn: (e: KeyboardEvent) => void): void;
  requestAnimationFrame(fn: () => void): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface BottomSheetOptions {
  label: string;
  closeLabel: string;
  // Where the layer is attached (document.body).
  host?: HTMLElement;
  win?: SheetWindow;
  // After every close, whatever closed it.
  onClosed?(): void;
}

export const SHEET_OPEN_CLS = "is-open";
export const SHEET_EXPANDED_CLS = "is-expanded";
export const SHEET_DRAGGING_CLS = "is-dragging";

export class BottomSheet {
  readonly layer: HTMLElement;
  readonly panel: HTMLElement;
  readonly content: HTMLElement;
  private grab: HTMLElement;
  private host: HTMLElement;
  private win: SheetWindow;
  private shown = false;
  private expanded = false;
  private detachTimer: number | null = null;
  private drag: { pointerId: number; y: number; t: number; dy: number } | null = null;

  constructor(private opts: BottomSheetOptions) {
    this.host = opts.host ?? document.body;
    this.win = opts.win ?? (window as unknown as SheetWindow);

    const layer = (this.layer = createDiv({ cls: "vt-sheet-layer" }));
    const backdrop = layer.createDiv({ cls: "vt-sheet-backdrop" });
    backdrop.addEventListener("click", () => this.close());

    const panel = (this.panel = layer.createDiv({ cls: "vt-sheet" }));
    panel.setAttr("role", "dialog");
    panel.setAttr("aria-modal", "true");
    panel.setAttr("aria-label", opts.label);

    const grab = (this.grab = panel.createDiv({ cls: "vt-sheet-grabzone" }));
    grab.createDiv({ cls: "vt-sheet-grab" });
    const close = grab.createEl("button", { cls: "vt-sheet-close clickable-icon" });
    close.setAttr("aria-label", opts.closeLabel);
    setIcon(close, "x");
    close.addEventListener("click", () => this.close());

    grab.addEventListener("pointerdown", this.onPointerDown);
    grab.addEventListener("pointermove", this.onPointerMove);
    grab.addEventListener("pointerup", this.onPointerUp);
    grab.addEventListener("pointercancel", this.onPointerCancel);

    this.content = panel.createDiv({ cls: "vt-sheet-content" });
    // Typing needs the room: an input getting focus makes the sheet tall.
    panel.addEventListener("focusin", (e) => {
      if (isTextInput(e.target)) this.setExpanded(true);
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  get isExpanded(): boolean {
    return this.expanded;
  }

  setLabel(label: string): void {
    this.panel.setAttr("aria-label", label);
  }

  open(): void {
    if (this.shown) return;
    this.shown = true;
    if (this.detachTimer !== null) {
      this.win.clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
    if (this.layer.parentElement !== this.host) this.host.appendChild(this.layer);
    this.win.addEventListener("keydown", this.onKey);
    const vv = this.win.visualViewport;
    vv?.addEventListener("resize", this.onViewport);
    vv?.addEventListener("scroll", this.onViewport);
    this.onViewport();
    // Next frame, so the slide-in transition starts from off-screen.
    this.win.requestAnimationFrame(() => {
      if (this.shown) this.layer.addClass(SHEET_OPEN_CLS);
    });
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.endDrag();
    this.layer.removeClass(SHEET_OPEN_CLS);
    this.setExpanded(false);
    this.unlisten();
    this.detachTimer = this.win.setTimeout(() => {
      this.detachTimer = null;
      if (!this.shown) this.layer.detach();
    }, CLOSE_MS);
    this.opts.onClosed?.();
  }

  // Plugin unload: gone at once, no animation, no onClosed.
  destroy(): void {
    this.shown = false;
    this.unlisten();
    if (this.detachTimer !== null) this.win.clearTimeout(this.detachTimer);
    this.detachTimer = null;
    this.layer.detach();
  }

  setExpanded(on: boolean): void {
    this.expanded = on;
    this.layer.toggleClass(SHEET_EXPANDED_CLS, on);
  }

  private unlisten(): void {
    this.win.removeEventListener("keydown", this.onKey);
    const vv = this.win.visualViewport;
    vv?.removeEventListener("resize", this.onViewport);
    vv?.removeEventListener("scroll", this.onViewport);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      this.close();
    }
  };

  // Keyboard up/down (and the page scrolling under it): lift the panel
  // above the keyboard, then keep the focused input visible.
  private onViewport = (): void => {
    const vv = this.win.visualViewport;
    const inset = keyboardInset(this.win.innerHeight, vv);
    this.layer.style.setProperty("--vt-sheet-kb", `${inset}px`);
    if (vv) this.layer.style.setProperty("--vt-sheet-vh", `${Math.round(vv.height)}px`);
    this.layer.toggleClass("has-keyboard", inset > 0);
    const active = this.panel.ownerDocument?.activeElement as HTMLElement | null | undefined;
    if (inset > 0 && active && this.panel.contains(active)) active.scrollIntoView?.({ block: "nearest" });
  };

  // ── Dragging the handle ────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.(".vt-sheet-close")) return;
    this.drag = { pointerId: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
    this.grab.setPointerCapture?.(e.pointerId);
    this.layer.addClass(SHEET_DRAGGING_CLS);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.dy = e.clientY - d.y;
    this.layer.style.setProperty("--vt-sheet-drag", `${Math.round(dragOffset(d.dy))}px`);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = e.clientY - d.y;
    const ms = Math.max(1, e.timeStamp - d.t);
    this.endDrag();
    switch (dragOutcome(dy, this.panel.offsetHeight, dy / ms, this.expanded)) {
      case "tap":
        this.setExpanded(!this.expanded);
        break;
      case "close":
        this.close();
        break;
      case "expand":
        this.setExpanded(true);
        break;
      case "collapse":
        this.setExpanded(false);
        break;
      case "stay":
        break;
    }
  };

  private onPointerCancel = (): void => this.endDrag();

  private endDrag(): void {
    if (this.drag) this.grab.releasePointerCapture?.(this.drag.pointerId);
    this.drag = null;
    this.layer.removeClass(SHEET_DRAGGING_CLS);
    this.layer.style.removeProperty("--vt-sheet-drag");
  }
}

function isTextInput(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toUpperCase();
  return tag === "TEXTAREA" || tag === "INPUT" || !!el?.isContentEditable;
}

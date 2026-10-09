import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ setIcon: () => undefined }));

import { BottomSheet, SHEET_DRAGGING_CLS, SHEET_EXPANDED_CLS, SHEET_OPEN_CLS, type SheetWindow } from "../../../src/ui/mobile/BottomSheet";
import { FakeEl, FakeWindow, installGlobals, type FakeDocument } from "./fakeDom";

let doc: FakeDocument;
let body: FakeEl;
let win: FakeWindow;
let closed: number;

function makeSheet() {
  closed = 0;
  return new BottomSheet({
    label: "單字卡",
    closeLabel: "關閉",
    host: body as unknown as HTMLElement,
    win: win as unknown as SheetWindow,
    onClosed: () => closed++,
  });
}

const el = (x: HTMLElement) => x as unknown as FakeEl;

beforeEach(() => {
  doc = installGlobals();
  body = new FakeEl("BODY");
  body.ownerDocument = doc;
  win = new FakeWindow();
});

describe("BottomSheet open / close", () => {
  it("is built detached and attaches to the host on open", () => {
    const s = makeSheet();
    expect(el(s.layer).parentElement).toBeNull();
    s.open();
    expect(s.isOpen).toBe(true);
    expect(el(s.layer).parentElement).toBe(body);
    expect(el(s.layer).hasClass(SHEET_OPEN_CLS)).toBe(true);
    expect(el(s.panel).attrs).toMatchObject({ role: "dialog", "aria-modal": "true", "aria-label": "單字卡" });
  });

  it("a tap on the backdrop closes it; the layer detaches after the slide-out", () => {
    const s = makeSheet();
    s.open();
    el(s.layer).find("vt-sheet-backdrop")!.click();
    expect(s.isOpen).toBe(false);
    expect(closed).toBe(1);
    expect(el(s.layer).hasClass(SHEET_OPEN_CLS)).toBe(false);
    expect(el(s.layer).parentElement).toBe(body);
    win.runTimers();
    expect(el(s.layer).parentElement).toBeNull();
  });

  it("the close button and Escape close it", () => {
    const s = makeSheet();
    s.open();
    el(s.layer).find("vt-sheet-close")!.click();
    expect(s.isOpen).toBe(false);
    s.open();
    win.key("Escape");
    expect(s.isOpen).toBe(false);
    expect(closed).toBe(2);
  });

  it("stops listening for keys and the viewport once closed", () => {
    const s = makeSheet();
    s.open();
    expect(win.keyListeners).toHaveLength(1);
    expect(win.visualViewport.listeners.resize).toHaveLength(1);
    s.close();
    expect(win.keyListeners).toHaveLength(0);
    expect(win.visualViewport.listeners.resize).toHaveLength(0);
    s.close();
    expect(closed).toBe(1);
  });

  it("re-opening during the slide-out keeps the layer", () => {
    const s = makeSheet();
    s.open();
    s.close();
    s.open();
    win.runTimers();
    expect(el(s.layer).parentElement).toBe(body);
    expect(s.isOpen).toBe(true);
  });

  it("destroy() removes it at once, without onClosed", () => {
    const s = makeSheet();
    s.open();
    s.destroy();
    expect(el(s.layer).parentElement).toBeNull();
    expect(closed).toBe(0);
    expect(win.keyListeners).toHaveLength(0);
  });
});

describe("BottomSheet keyboard", () => {
  it("passes the keyboard inset and visible height to CSS", () => {
    const s = makeSheet();
    s.open();
    const style = el(s.layer).style;
    expect(style.getPropertyValue("--vt-sheet-kb")).toBe("0px");
    win.visualViewport.height = 508;
    win.visualViewport.fire("resize");
    expect(style.getPropertyValue("--vt-sheet-kb")).toBe("336px");
    expect(style.getPropertyValue("--vt-sheet-vh")).toBe("508px");
    expect(el(s.layer).hasClass("has-keyboard")).toBe(true);
  });

  it("an input getting focus makes the sheet tall, and stays visible above the keyboard", () => {
    const s = makeSheet();
    s.open();
    const input = el(s.content).createEl("textarea");
    input.dispatch("focusin");
    expect(s.isExpanded).toBe(true);
    expect(el(s.layer).hasClass(SHEET_EXPANDED_CLS)).toBe(true);
    doc.activeElement = input;
    win.visualViewport.height = 508;
    win.visualViewport.fire("resize");
    expect(input.scrolledIntoView).toBe(1);
  });

  it("Obsidian mobile: lifts on Capacitor's keyboard events, reveals the input once it's up", () => {
    const s = makeSheet();
    s.open();
    const style = el(s.layer).style;
    const input = el(s.content).createEl("textarea");
    doc.activeElement = input;
    // The visual viewport never moves here.
    win.fire("keyboardWillShow", { keyboardHeight: 336.4 });
    expect(style.getPropertyValue("--vt-sheet-kb")).toBe("0px");
    expect(style.getPropertyValue("--vt-sheet-kb-native")).toBe("336px");
    expect(el(s.layer).hasClass("has-keyboard")).toBe(true);
    expect(input.scrolledIntoView).toBe(0);
    win.fire("keyboardDidShow");
    expect(input.scrolledIntoView).toBe(1);
    // A viewport event meanwhile doesn't drop the class.
    win.visualViewport.fire("resize");
    expect(el(s.layer).hasClass("has-keyboard")).toBe(true);
    win.fire("keyboardWillHide");
    expect(style.getPropertyValue("--vt-sheet-kb-native")).toBe("");
    expect(el(s.layer).hasClass("has-keyboard")).toBe(false);
  });

  it("a keyboard event without a height still marks the keyboard up", () => {
    const s = makeSheet();
    s.open();
    win.fire("keyboardDidShow");
    expect(el(s.layer).hasClass("has-keyboard")).toBe(true);
    expect(el(s.layer).style.getPropertyValue("--vt-sheet-kb-native")).toBe("");
  });

  it("stops listening for Capacitor's keyboard events once closed, and forgets the keyboard", () => {
    const s = makeSheet();
    s.open();
    win.fire("keyboardWillShow", { keyboardHeight: 300 });
    s.close();
    for (const type of ["keyboardWillShow", "keyboardDidShow", "keyboardWillHide", "keyboardDidHide"]) {
      expect(win.listeners[type] ?? []).toHaveLength(0);
    }
    expect(el(s.layer).hasClass("has-keyboard")).toBe(false);
    expect(el(s.layer).style.getPropertyValue("--vt-sheet-kb-native")).toBe("");
  });

  it("TEMP probe: reports the measurements a second after a text input takes focus", () => {
    const probes: Record<string, unknown>[] = [];
    const s = new BottomSheet({
      label: "單字卡",
      closeLabel: "關閉",
      host: body as unknown as HTMLElement,
      win: win as unknown as SheetWindow,
      onKeyboardProbe: (p) => probes.push(p),
    });
    s.open();
    el(s.content).createEl("textarea").dispatch("focusin");
    win.fire("keyboardWillShow", { keyboardHeight: 336 });
    win.fire("keyboardDidShow");
    expect(probes).toHaveLength(0);
    win.runTimers();
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({
      innerHeight: 844,
      "visualViewport.height": 844,
      "keyboardWillShow keyboardHeight": 336,
      "keyboardDidShow count": 1,
      "has-keyboard": true,
    });
  });

  it("focus on a button doesn't expand it", () => {
    const s = makeSheet();
    s.open();
    el(s.content).createEl("button").dispatch("focusin");
    expect(s.isExpanded).toBe(false);
  });
});

describe("BottomSheet drag", () => {
  const drag = (s: BottomSheet, from: number, to: number, ms = 300) => {
    const grab = el(s.layer).find("vt-sheet-grabzone")!;
    grab.dispatch("pointerdown", { pointerId: 1, pointerType: "touch", clientY: from, timeStamp: 0 });
    grab.dispatch("pointermove", { pointerId: 1, clientY: (from + to) / 2 });
    const mid = el(s.layer).style.getPropertyValue("--vt-sheet-drag");
    const dragging = el(s.layer).hasClass(SHEET_DRAGGING_CLS);
    grab.dispatch("pointerup", { pointerId: 1, clientY: to, timeStamp: ms });
    return { mid, dragging };
  };

  it("follows the finger, then closes when dragged far enough down", () => {
    const s = makeSheet();
    s.open();
    el(s.panel).offsetHeight = 500;
    const { mid, dragging } = drag(s, 400, 600);
    expect(mid).toBe("100px");
    expect(dragging).toBe(true);
    expect(s.isOpen).toBe(false);
    expect(el(s.layer).hasClass(SHEET_DRAGGING_CLS)).toBe(false);
    expect(el(s.layer).style.getPropertyValue("--vt-sheet-drag")).toBe("");
  });

  it("snaps back after a short slow drag", () => {
    const s = makeSheet();
    s.open();
    el(s.panel).offsetHeight = 500;
    drag(s, 400, 450, 400);
    expect(s.isOpen).toBe(true);
  });

  it("dragging up makes it tall; tapping the handle toggles that", () => {
    const s = makeSheet();
    s.open();
    el(s.panel).offsetHeight = 500;
    drag(s, 400, 300);
    expect(s.isExpanded).toBe(true);
    drag(s, 400, 402);
    expect(s.isExpanded).toBe(false);
  });

  it("a press on the close button isn't a drag", () => {
    const s = makeSheet();
    s.open();
    const close = el(s.layer).find("vt-sheet-close")!;
    close.dispatch("pointerdown", { pointerId: 1, pointerType: "touch", clientY: 10, timeStamp: 0 });
    expect(el(s.layer).hasClass(SHEET_DRAGGING_CLS)).toBe(false);
  });

  it("closing resets an unfinished drag", () => {
    const s = makeSheet();
    s.open();
    const grab = el(s.layer).find("vt-sheet-grabzone")!;
    grab.dispatch("pointerdown", { pointerId: 1, pointerType: "touch", clientY: 0, timeStamp: 0 });
    grab.dispatch("pointermove", { pointerId: 1, clientY: 40 });
    win.key("Escape");
    expect(el(s.layer).hasClass(SHEET_DRAGGING_CLS)).toBe(false);
    expect(el(s.layer).style.getPropertyValue("--vt-sheet-drag")).toBe("");
  });
});

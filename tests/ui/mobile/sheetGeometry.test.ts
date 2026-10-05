import { describe, expect, it } from "vitest";
import { dragOffset, dragOutcome, keyboardInset } from "../../../src/ui/mobile/sheetGeometry";

describe("dragOutcome", () => {
  const H = 500;

  it("a tiny movement is a tap", () => {
    expect(dragOutcome(3, H, 0, false)).toBe("tap");
    expect(dragOutcome(-4, H, 0, true)).toBe("tap");
  });

  it("closes when dragged down past 30% of the height, or flicked down", () => {
    expect(dragOutcome(160, H, 0.1, false)).toBe("close");
    expect(dragOutcome(140, H, 0.1, false)).toBe("stay");
    expect(dragOutcome(40, H, 1.2, false)).toBe("close");
  });

  it("a tall sheet steps down to normal first, unless dragged far", () => {
    expect(dragOutcome(200, H, 0.1, true)).toBe("collapse");
    expect(dragOutcome(320, H, 0.1, true)).toBe("close");
  });

  it("dragging or flicking up makes it tall", () => {
    expect(dragOutcome(-60, H, -0.1, false)).toBe("expand");
    expect(dragOutcome(-20, H, -1, false)).toBe("expand");
    expect(dragOutcome(-20, H, -0.1, false)).toBe("stay");
    expect(dragOutcome(-200, H, -1, true)).toBe("stay");
  });

  it("an unmeasured sheet (height 0) still closes on a flick", () => {
    expect(dragOutcome(100, 0, 0.1, false)).toBe("stay");
    expect(dragOutcome(100, 0, 1, false)).toBe("close");
  });
});

describe("dragOffset", () => {
  it("follows the finger down, resists upwards", () => {
    expect(dragOffset(80)).toBe(80);
    expect(dragOffset(-80)).toBe(-20);
  });
});

describe("keyboardInset", () => {
  it("is what the keyboard covers below the visual viewport", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it("accounts for the page being panned up under the keyboard", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 100 })).toBe(236);
  });

  it("is 0 with no keyboard, no visualViewport, or when the page itself was resized", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(508, { height: 508, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(500, { height: 510, offsetTop: 0 })).toBe(0);
  });
});

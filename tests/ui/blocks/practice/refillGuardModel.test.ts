import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FILTER_REFILL_DELAY_MS,
  RefillController,
  gateAfterEnd,
  openGate,
  shouldRefill,
} from "../../../../src/ui/blocks/practice/refillGuardModel";

describe("shouldRefill", () => {
  const open = openGate();
  const paused = { paused: true };
  it("never above the threshold", () => {
    for (const c of ["mount", "answer", "filter", "manual"] as const) expect(shouldRefill(open, c, 5, 4)).toBe(false);
  });
  it("mount on an empty pool waits for the button; a part-filled pool tops up", () => {
    expect(shouldRefill(open, "mount", 0, 4)).toBe(false);
    expect(shouldRefill(open, "mount", 1, 4)).toBe(true);
    expect(shouldRefill(open, "mount", 4, 4)).toBe(true);
  });
  it("answering keeps topping up, even from empty", () => {
    expect(shouldRefill(open, "answer", 0, 4)).toBe(true);
    expect(shouldRefill(open, "answer", 3, 4)).toBe(true);
  });
  it("paused after a failure: only manual and filter go", () => {
    expect(shouldRefill(paused, "answer", 2, 4)).toBe(false);
    expect(shouldRefill(paused, "mount", 2, 4)).toBe(false);
    expect(shouldRefill(paused, "manual", 0, 4)).toBe(true);
    expect(shouldRefill(paused, "filter", 0, 4)).toBe(true);
  });
});

describe("gateAfterEnd", () => {
  it("a failure pauses, a clean end keeps the state", () => {
    expect(gateAfterEnd(openGate(), true).paused).toBe(true);
    expect(gateAfterEnd(openGate(), false).paused).toBe(false);
    expect(gateAfterEnd({ paused: true }, false).paused).toBe(true);
  });
});

describe("RefillController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(pool = { n: 0 }) {
    const signals: AbortSignal[] = [];
    const c = new RefillController({ poolSize: () => pool.n, threshold: 4, run: (s) => signals.push(s) });
    return { c, signals, pool };
  }

  it("mount on an empty pool does not run; manual does", () => {
    const { c, signals } = make();
    c.mount();
    expect(signals).toHaveLength(0);
    c.manual();
    expect(signals).toHaveLength(1);
  });

  it("filter changes debounce into one run and bump the scope version", () => {
    const { c, signals } = make();
    c.filterChanged();
    c.filterChanged();
    c.filterChanged();
    expect(c.scopeVersion).toBe(3);
    vi.advanceTimersByTime(FILTER_REFILL_DELAY_MS - 1);
    expect(signals).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(signals).toHaveLength(1);
  });

  it("a filter change aborts the request still running", () => {
    const { c, signals } = make({ n: 2 });
    c.afterAction();
    expect(signals[0].aborted).toBe(false);
    c.filterChanged();
    expect(signals[0].aborted).toBe(true);
    vi.advanceTimersByTime(FILTER_REFILL_DELAY_MS);
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);
  });

  it("after a failure answering does not retry; retry and filter change release it", () => {
    const { c, signals } = make({ n: 2 });
    c.afterAction();
    c.ended(true);
    expect(c.paused).toBe(true);
    c.afterAction();
    c.afterAction();
    expect(signals).toHaveLength(1);
    c.manual();
    expect(signals).toHaveLength(2);
    expect(c.paused).toBe(false);
    c.ended(true);
    c.filterChanged();
    expect(c.paused).toBe(false);
    vi.advanceTimersByTime(FILTER_REFILL_DELAY_MS);
    expect(signals).toHaveLength(3);
  });

  it("dispose cancels the pending timer and aborts", () => {
    const { c, signals } = make({ n: 2 });
    c.afterAction();
    c.filterChanged();
    c.dispose();
    vi.advanceTimersByTime(FILTER_REFILL_DELAY_MS);
    expect(signals).toHaveLength(1);
    c.manual();
    expect(signals).toHaveLength(1);
  });
});

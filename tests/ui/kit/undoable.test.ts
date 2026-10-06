import { describe, expect, it, vi, beforeEach } from "vitest";

// actionNotice is the real Notice-with-button primitive (src/ui/mobile/
// actionNotice.ts); mocked here the same way tests/ui/mobile/WordSheet
// mocks it — just record what runUndoable() asked it to show, Notice/
// obsidian never gets touched.
const notices: { text: string; actions: { label: string; run(): void }[]; durationMs?: number }[] = [];
vi.mock("../../../src/ui/mobile/actionNotice", () => ({
  actionNotice: (text: string, actions: { label: string; run(): void }[], durationMs?: number) => {
    notices.push({ text, actions, durationMs });
    return { hide: vi.fn() };
  },
}));

import { UndoableQueue, flushUndoables, runUndoable, type UndoScheduler } from "../../../src/ui/kit/undoable";

// A fake scheduler: setTimeout() just records the callback instead of
// actually waiting, so "time elapsing" is simulated by calling fireAll()
// (or fire() for one specific timer) — no real waiting, no vi.useFakeTimers().
function fakeScheduler() {
  let nextHandle = 0;
  const timers = new Map<number, () => void>();
  const scheduler: UndoScheduler = {
    setTimeout: (fn) => {
      const handle = nextHandle++;
      timers.set(handle, fn);
      return handle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  return {
    scheduler,
    pendingTimers: () => timers.size,
    fireAll: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
  };
}

describe("UndoableQueue", () => {
  it("runs apply() immediately", () => {
    const { scheduler } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const apply = vi.fn();

    queue.start({ apply, restore: vi.fn(), commit: vi.fn() });

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("commits once the timer fires, if restore wasn't called first", () => {
    const { scheduler, fireAll } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const commit = vi.fn();
    const restore = vi.fn();

    queue.start({ apply: () => "payload", restore, commit });
    fireAll();

    expect(commit).toHaveBeenCalledWith("payload");
    expect(restore).not.toHaveBeenCalled();
  });

  it("restore() cancels the timer and runs restore instead of commit", () => {
    const { scheduler, fireAll, pendingTimers } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const commit = vi.fn();
    const restore = vi.fn();

    const { restore: doRestore } = queue.start({ apply: () => "payload", restore, commit });
    doRestore();

    expect(restore).toHaveBeenCalledWith("payload");
    expect(pendingTimers()).toBe(0);

    // Even if the timer somehow still fired, commit must not run twice.
    fireAll();
    expect(commit).not.toHaveBeenCalled();
  });

  it("restore() after commit already ran is a no-op", () => {
    const { scheduler, fireAll } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const commit = vi.fn();
    const restore = vi.fn();

    const { restore: doRestore } = queue.start({ apply: () => undefined, restore, commit });
    fireAll();
    doRestore();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });

  it("calling restore() twice only restores once", () => {
    const { scheduler } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const restore = vi.fn();

    const { restore: doRestore } = queue.start({ apply: () => undefined, restore, commit: vi.fn() });
    doRestore();
    doRestore();

    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("keeps several pending actions independent of each other", () => {
    const { scheduler, fireAll } = fakeScheduler();
    const queue = new UndoableQueue(scheduler);
    const commitA = vi.fn();
    const commitB = vi.fn();
    const restoreB = vi.fn();

    queue.start({ apply: () => "a", restore: vi.fn(), commit: commitA });
    const { restore: restoreBFn } = queue.start({ apply: () => "b", restore: restoreB, commit: commitB });

    restoreBFn();
    fireAll();

    expect(commitA).toHaveBeenCalledWith("a");
    expect(commitB).not.toHaveBeenCalled();
    expect(restoreB).toHaveBeenCalledWith("b");
  });

  it("passes a per-call ms to the scheduler", () => {
    const { scheduler } = fakeScheduler();
    const setTimeoutSpy = vi.spyOn(scheduler, "setTimeout");
    const queue = new UndoableQueue(scheduler);

    queue.start({ apply: () => undefined, restore: vi.fn(), commit: vi.fn(), ms: 1234 });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
  });

  describe("flush", () => {
    it("commits every still-pending action immediately, without waiting for their timers", () => {
      const { scheduler } = fakeScheduler();
      const queue = new UndoableQueue(scheduler);
      const commitA = vi.fn();
      const commitB = vi.fn();

      queue.start({ apply: () => "a", restore: vi.fn(), commit: commitA });
      queue.start({ apply: () => "b", restore: vi.fn(), commit: commitB });

      queue.flush();

      expect(commitA).toHaveBeenCalledWith("a");
      expect(commitB).toHaveBeenCalledWith("b");
    });

    it("does not re-commit an action already restored", () => {
      const { scheduler } = fakeScheduler();
      const queue = new UndoableQueue(scheduler);
      const commit = vi.fn();

      const { restore } = queue.start({ apply: () => undefined, restore: vi.fn(), commit });
      restore();
      queue.flush();

      expect(commit).not.toHaveBeenCalled();
    });

    it("is a no-op when nothing is pending", () => {
      const { scheduler } = fakeScheduler();
      const queue = new UndoableQueue(scheduler);
      expect(() => queue.flush()).not.toThrow();
    });

    it("leaves the queue empty afterwards (size reflects it)", () => {
      const { scheduler } = fakeScheduler();
      const queue = new UndoableQueue(scheduler);
      queue.start({ apply: () => undefined, restore: vi.fn(), commit: vi.fn() });
      expect(queue.size).toBe(1);
      queue.flush();
      expect(queue.size).toBe(0);
    });
  });
});

// ── runUndoable()/flushUndoables(): thin UI wrapper over actionNotice ──
// These share one module-level queue (the same singleton real code uses),
// so each test flushes/restores its own action before finishing to avoid
// leaking a pending commit into the next test.
describe("runUndoable / flushUndoables", () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it("runs apply() right away and shows a Notice with an Undo action", () => {
    const apply = vi.fn();

    runUndoable({ message: "已刪除 glittery", apply, restore: vi.fn(), commit: vi.fn() });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toBe("已刪除 glittery");
    expect(notices[0].actions).toHaveLength(1);

    flushUndoables(); // clean up so this doesn't leak into the next test
  });

  it("clicking the notice's action restores instead of committing", () => {
    const commit = vi.fn();
    const restore = vi.fn();

    runUndoable({ message: "已刪除 glittery", apply: () => undefined, restore, commit });
    notices[notices.length - 1].actions[0].run();

    // Flushing afterwards must not re-run commit — it was already restored.
    flushUndoables();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("flushUndoables() commits a pending runUndoable() immediately", () => {
    const commit = vi.fn();

    runUndoable({ message: "已刪除這組問答", apply: () => "payload", restore: vi.fn(), commit });
    flushUndoables();

    expect(commit).toHaveBeenCalledWith("payload");
  });
});

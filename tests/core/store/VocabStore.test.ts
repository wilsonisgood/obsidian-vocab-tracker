import { describe, expect, it, vi } from "vitest";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { VocabData } from "../../../src/core/model/entry";

describe("VocabStore", () => {
  it("emits data:changed immediately but debounces the actual write", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);
      const onChanged = vi.fn();
      store.events.on("data:changed", onChanged);

      await store.save();
      expect(onChanged).toHaveBeenCalledWith(data);
      expect(persist).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith(data);
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces rapid saves within the debounce window into one write", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);

      await store.save();
      await vi.advanceTimersByTimeAsync(200);
      await store.save();
      await vi.advanceTimersByTimeAsync(200);
      await store.save();
      await vi.advanceTimersByTimeAsync(500);

      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush() forces a pending debounced write to land immediately", async () => {
    vi.useFakeTimers();
    try {
      const data: VocabData = { entries: [] };
      const persist = vi.fn().mockResolvedValue(undefined);
      const store = new VocabStore(data, persist);

      await store.save();
      expect(persist).not.toHaveBeenCalled();

      await store.flush();
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush() is a no-op (resolves) when there is nothing pending", async () => {
    const data: VocabData = { entries: [] };
    const persist = vi.fn().mockResolvedValue(undefined);
    const store = new VocabStore(data, persist);

    await expect(store.flush()).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("exposes the same object reference passed in, so external holders stay in sync", () => {
    const data: VocabData = { entries: [] };
    const store = new VocabStore(data, async () => {});
    expect(store.vocabData).toBe(data);
  });

  it("replace() swaps the underlying data and emits data:changed", () => {
    const store = new VocabStore({ entries: [] }, async () => {});
    const onChanged = vi.fn();
    store.events.on("data:changed", onChanged);

    const next: VocabData = { entries: [] };
    store.replace(next);

    expect(store.vocabData).toBe(next);
    expect(onChanged).toHaveBeenCalledWith(next);
  });
});

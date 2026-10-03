import { describe, expect, it, vi } from "vitest";
import { VocabStore } from "../../../src/core/store/VocabStore";
import type { VocabData } from "../../../src/core/model/entry";

describe("VocabStore", () => {
  it("persists through the injected callback and emits data:changed", async () => {
    const data: VocabData = { entries: [] };
    const persist = vi.fn().mockResolvedValue(undefined);
    const store = new VocabStore(data, persist);
    const onChanged = vi.fn();
    store.events.on("data:changed", onChanged);

    await store.save();

    expect(persist).toHaveBeenCalledWith(data);
    expect(onChanged).toHaveBeenCalledWith(data);
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

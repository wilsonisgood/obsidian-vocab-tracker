import { describe, expect, it, vi } from "vitest";
import type { ParagraphGloss } from "../../../src/core/model/learner";
import { paragraphHash } from "../../../src/core/text/hash";
import { GlossService, type GlossServiceDeps } from "../../../src/services/learner/GlossService";

const NOTE = "# Batteries\n\nSodium cells trade density for cost.\n\nThe second paragraph is here.\n";
const PARA = "Sodium cells trade density for cost.";

function make(over: Partial<GlossServiceDeps> = {}) {
  const store: ParagraphGloss[] = [];
  const run = vi.fn(async () => ({
    text: "",
    json: { items: [{ word: "trade", pos: "v.", zh: "拿…換取", en: "exchange" }, { word: "unasked", pos: "", zh: "x", en: "" }] },
    provider: "anthropic" as const,
    usage: { input: 0, output: 0 },
    stop: "end" as const,
    model: "m",
  }));
  const deps: GlossServiceDeps = {
    ai: { run, cancel: () => {} } as unknown as GlossServiceDeps["ai"],
    learner: {
      ensureLoaded: async () => {},
      gloss: (id) => store.find((g) => g.id === id),
      glosses: () => store,
      upsertGloss: (g) => {
        const i = store.findIndex((x) => x.id === g.id);
        if (i < 0) store.push(g);
        else store[i] = g;
      },
      wordCefr: () => new Map(),
    },
    notes: { read: async () => NOTE },
    level: () => "A2",
    entry: (id) => (id === "e1" ? { source: { path: "Batteries.md", line: 2 } } : undefined),
    paragraphText: async () => PARA,
    aiReady: () => true,
    clock: () => new Date("2026-10-30T00:00:00.000Z"),
    ...over,
  };
  return { service: new GlossService(deps), store, run };
}

describe("GlossService (1030 #3 語境意思)", () => {
  it("a paragraph discussion glosses the paragraph once, keeping only asked words", async () => {
    const { service, store, run } = make();
    await service.afterDiscussion({ kind: "paragraph", path: "Batteries.md", hash: "x", snapshot: PARA }, true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(store).toEqual([
      { id: paragraphHash(PARA), path: "Batteries.md", at: "2026-10-30T00:00:00.000Z", words: [{ w: "trade", pos: "v.", zh: "拿…換取", en: "exchange" }] },
    ]);
    // any later discussion of the same paragraph (here: a word in it) does nothing
    await service.afterDiscussion({ kind: "word", entryId: "e1" }, true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a word discussion glosses the word's source paragraph", async () => {
    const { service, store } = make();
    await service.afterDiscussion({ kind: "word", entryId: "e1" }, true);
    expect(store.map((g) => g.id)).toEqual([paragraphHash(PARA)]);
    expect(service.forNote(NOTE).get("trade")?.zh).toBe("拿…換取");
    expect(service.allFor("trade")).toMatchObject([{ path: "Batteries.md", gloss: { zh: "拿…換取" } }]);
  });

  it("does nothing for failed answers, with AI off, or for other threads", async () => {
    const { service, run } = make();
    await service.afterDiscussion({ kind: "word", entryId: "e1" }, false);
    await service.afterDiscussion({ kind: "buddy" } as never, true);
    expect(run).not.toHaveBeenCalled();
    const off = make({ aiReady: () => false });
    await off.service.afterDiscussion({ kind: "word", entryId: "e1" }, true);
    expect(off.run).not.toHaveBeenCalled();
  });

  it("a failed AI call stores nothing, so the next discussion tries again", async () => {
    const { service, store, run } = make();
    run.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await service.afterDiscussion({ kind: "word", entryId: "e1" }, true);
    expect(store).toEqual([]);
    await service.afterDiscussion({ kind: "word", entryId: "e1" }, true);
    expect(store).toHaveLength(1);
    err.mockRestore();
  });
});

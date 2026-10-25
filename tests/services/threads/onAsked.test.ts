import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { AskEvent } from "../../../src/core/model/learner";
import { VocabStore } from "../../../src/core/store/VocabStore";
import { AiError } from "../../../src/services/ai/errors";
import { ThreadService } from "../../../src/services/threads/ThreadService";
import { MemoryStorage } from "../ai/fakes";
import { FakeAi, result, type Script } from "./fakes";

function setup(script: Script) {
  const entry = { id: "e1", word: "glittery", source: { path: "a.md", line: 1 } } as VocabEntry;
  const store = new VocabStore({ entries: [entry] }, async () => {});
  const got: AskEvent[] = [];
  let n = 0;
  const threads = new ThreadService({
    storage: new MemoryStorage(), store, ai: new FakeAi(script), notes: { read: async () => "x" },
    newId: () => `id${++n}`, onAsked: (e) => got.push(e),
  });
  return { threads, got, entry: store.entries[0] };
}

describe("ThreadService onAsked", () => {
  it("reports a successful round", async () => {
    const { threads, got, entry } = setup(async () => result("ok"));
    await threads.askWord(entry, { taskId: "word.custom", question: "q?", selection: "sel" });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: "id1", surface: "word", taskId: "word.custom", entryId: "e1", custom: true, question: "q?", selection: "sel", ok: true });
    expect(threads.allThreads()).toHaveLength(1);
  });

  it("reports a failed round with ok=false", async () => {
    const { threads, got, entry } = setup(async () => {
      throw new AiError("network", "down");
    });
    await threads.askWord(entry, { taskId: "word.usage" });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ taskId: "word.usage", custom: false, ok: false });
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../../perf/support/obsidian"));

import { Component } from "obsidian";
import type { VocabEntry } from "../../../src/core/model/entry";
import { wordThreadId } from "../../../src/core/model/thread";
import { buildPreviewSend, type PreviewAskHost, type WordAiPreview } from "../../../src/ui/word/AiTab";
import { WordUi } from "../../../src/ui/word/wordUi";

// buildPreviewSend is the pure(-ish) heart of the AI tab's first-question
// promotion (1009-2 #1) — pulled out of renderWordAiTab so it's testable
// without a real ChatPanel/Obsidian Component (vitest: node, no DOM).

function fakeHost(entries: VocabEntry[]) {
  return {
    addWordToVocab: vi.fn(async (word: string) => {
      entries.push({ id: `real-${word}`, word, liked: true } as VocabEntry);
      return true;
    }),
    store: { entries, touch: vi.fn(async () => undefined) },
    threads: { askWord: vi.fn(async () => undefined) },
  } satisfies PreviewAskHost;
}

describe("buildPreviewSend (AI tab's first question on a preview card)", () => {
  it("promotes the draft, swaps the tab to the real entry's id, then asks", async () => {
    const entries: VocabEntry[] = [];
    const host = fakeHost(entries);
    const ui = new WordUi(new Component());
    const draftThreadId = wordThreadId("preview:apron");
    const preview: WordAiPreview = { ctx: { sentence: "an apron" }, dict: null, refresh: vi.fn() };

    const send = buildPreviewSend(host, "apron", draftThreadId, ui, preview);
    await send({ taskId: "word-custom", question: "what does this mean?" });

    expect(host.addWordToVocab).toHaveBeenCalledWith("apron", { sentence: "an apron" }, { reveal: false });
    const added = entries[0];
    expect(ui.tabs.get(added.id)).toBe("ai");
    expect(preview.refresh).toHaveBeenCalledTimes(1);
    expect(host.threads.askWord).toHaveBeenCalledWith(added, { taskId: "word-custom", question: "what does this mean?" });
  });

  it("hands the composer's focus from the draft thread to the real one", async () => {
    const entries: VocabEntry[] = [];
    const host = fakeHost(entries);
    const ui = new WordUi(new Component());
    const draftThreadId = wordThreadId("preview:apron");
    ui.chat.focused = draftThreadId;
    const preview: WordAiPreview = { ctx: {}, dict: null, refresh: vi.fn() };

    const send = buildPreviewSend(host, "apron", draftThreadId, ui, preview);
    await send({ taskId: "word-custom" });

    expect(ui.chat.focused).toBe(wordThreadId(entries[0].id));
  });

  it("leaves focus alone if it wasn't on the draft thread to begin with", async () => {
    const entries: VocabEntry[] = [];
    const host = fakeHost(entries);
    const ui = new WordUi(new Component());
    const draftThreadId = wordThreadId("preview:apron");
    ui.chat.focused = "something-else";
    const preview: WordAiPreview = { ctx: {}, dict: null, refresh: vi.fn() };

    const send = buildPreviewSend(host, "apron", draftThreadId, ui, preview);
    await send({ taskId: "word-custom" });

    expect(ui.chat.focused).toBe("something-else");
  });

  it("folds the preview's own dictionary data into the newly added entry", async () => {
    const entries: VocabEntry[] = [];
    const host = fakeHost(entries);
    const ui = new WordUi(new Component());
    const draftThreadId = wordThreadId("preview:apron");
    const preview: WordAiPreview = {
      ctx: {},
      dict: { phonetic: "", audio: "", partOfSpeech: "", definition: "a protective garment", definitionZh: "", synonyms: [], antonyms: [] },
      refresh: vi.fn(),
    };

    const send = buildPreviewSend(host, "apron", draftThreadId, ui, preview);
    await send({ taskId: "word-custom" });

    expect(entries[0].definition).toBe("a protective garment");
    expect(host.store.touch).toHaveBeenCalledWith(entries[0]);
  });
});

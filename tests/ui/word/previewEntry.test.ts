import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DictionaryResult } from "../../../src/core/model/dictionary";
import type { VocabEntry } from "../../../src/core/model/entry";
import {
  _resetPreviewDictionaryCache,
  draftEntry,
  loadPreviewDictionary,
  mergeDictionaryInto,
  previewEntryId,
  promotePreview,
  type PreviewHost,
} from "../../../src/ui/word/previewEntry";

function dict(overrides: Partial<DictionaryResult> = {}): DictionaryResult {
  return {
    phonetic: "/x/",
    audio: "a.mp3",
    partOfSpeech: "adj.",
    definition: "shiny",
    definitionZh: "閃亮的",
    synonyms: ["shiny", "sparkly"],
    antonyms: ["dull"],
    ...overrides,
  };
}

describe("draftEntry (1009-2 #1)", () => {
  it("builds an unliked, empty entry with a recognizable, stable id", () => {
    const e = draftEntry("Glittery");
    expect(e.id).toBe(previewEntryId("Glittery"));
    expect(e.id).toBe("preview:glittery");
    expect(e.liked).toBe(false);
    expect(e.word).toBe("Glittery");
    expect(e.definition).toBe("");
    expect(e.source).toBeNull();
  });

  it("the id is case-insensitive, so the same word always maps to one draft", () => {
    expect(previewEntryId("Apron")).toBe(previewEntryId("apron"));
  });
});

describe("mergeDictionaryInto (same empty-field-only rule as main.ts's enrichEntry)", () => {
  it("fills every empty field", () => {
    const e = draftEntry("apron");
    mergeDictionaryInto(e, dict());
    expect(e.definition).toBe("shiny");
    expect(e.definitionZh).toBe("閃亮的");
    expect(e.synonyms).toBe("shiny, sparkly");
    expect(e.antonyms).toBe("dull");
    expect(e.phonetic).toBe("/x/");
    expect(e.audio).toBe("a.mp3");
    expect(e.partOfSpeech).toBe("adj.");
  });

  it("never clobbers a field that already has something", () => {
    const e = draftEntry("apron");
    e.definition = "already there";
    mergeDictionaryInto(e, dict());
    expect(e.definition).toBe("already there");
  });
});

function fakeHost(entries: VocabEntry[] = []): PreviewHost & { addWordToVocab: ReturnType<typeof vi.fn>; touch: ReturnType<typeof vi.fn> } {
  const touch = vi.fn(async () => undefined);
  return {
    addWordToVocab: vi.fn(async (word: string) => {
      entries.push({ id: `real-${word}`, word, liked: true } as VocabEntry);
      return true;
    }),
    store: { entries, touch },
    touch,
  };
}

describe("promotePreview (♥ / the AI tab's first question — 1009-2 #1)", () => {
  it("adds the word for real (liked, reveal:false) and returns the new entry", async () => {
    const host = fakeHost();
    const entry = await promotePreview(host, "apron", { sentence: "wearing an apron" }, null);
    expect(host.addWordToVocab).toHaveBeenCalledWith("apron", { sentence: "wearing an apron" }, { reveal: false });
    expect(entry.id).toBe("real-apron");
  });

  it("folds the preview's own dictionary fetch into the new entry instead of losing it", async () => {
    const host = fakeHost();
    const entry = await promotePreview(host, "apron", {}, dict());
    expect(entry.definition).toBe("shiny");
    expect(host.touch).toHaveBeenCalledWith(entry);
  });

  it("with no dictionary result yet (still loading/failed), adds without touching", async () => {
    const host = fakeHost();
    await promotePreview(host, "apron", {}, null);
    expect(host.touch).not.toHaveBeenCalled();
  });

  it("matches the added entry case-insensitively", async () => {
    const entries: VocabEntry[] = [];
    const host = fakeHost(entries);
    // addWordToVocab here pushes the word as given; promotePreview must
    // still find it regardless of case.
    host.addWordToVocab = vi.fn(async () => {
      entries.push({ id: "real-Apron", word: "Apron", liked: true } as VocabEntry);
      return true;
    });
    const entry = await promotePreview(host, "apron", {}, null);
    expect(entry.id).toBe("real-Apron");
  });
});

describe("loadPreviewDictionary (session cache)", () => {
  beforeEach(() => _resetPreviewDictionaryCache());

  it("starts loading, then settles to ready and calls onSettled once", async () => {
    const source = { fetchDictionary: vi.fn(async () => dict()) };
    const onSettled = vi.fn();
    const first = loadPreviewDictionary(source, "apron", onSettled);
    expect(first.status).toBe("loading");
    await new Promise((r) => setTimeout(r, 0));
    expect(onSettled).toHaveBeenCalledTimes(1);
    const second = loadPreviewDictionary(source, "apron", vi.fn());
    expect(second.status).toBe("ready");
    expect(second.data).toEqual(dict());
    expect(source.fetchDictionary).toHaveBeenCalledTimes(1);
  });

  it("a second call for the same word (even mid-flight) never fetches again", () => {
    const source = { fetchDictionary: vi.fn(async () => dict()) };
    loadPreviewDictionary(source, "apron", vi.fn());
    loadPreviewDictionary(source, "APRON", vi.fn());
    loadPreviewDictionary(source, "apron", vi.fn());
    expect(source.fetchDictionary).toHaveBeenCalledTimes(1);
  });

  it("on failure, settles to error and keeps the error", async () => {
    const boom = new Error("network down");
    const source = { fetchDictionary: vi.fn(async () => { throw boom; }) };
    const onSettled = vi.fn();
    loadPreviewDictionary(source, "apron", onSettled);
    await new Promise((r) => setTimeout(r, 0));
    expect(onSettled).toHaveBeenCalledTimes(1);
    const state = loadPreviewDictionary(source, "apron", vi.fn());
    expect(state.status).toBe("error");
    expect(state.error).toBe(boom);
  });
});

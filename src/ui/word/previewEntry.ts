import type { VocabEntry } from "../../core/model/entry";
import type { DictionaryResult } from "../../core/model/dictionary";
import type { WordContext } from "../../core/model/word-context";

// 1009-2 #1: a word that's clicked but isn't in the vocab library yet now
// gets a preview card instead of the old 「加入單字庫」 banner/button — the
// exact same WordRow (mobile sheet + sidebar) a liked:false library word
// gets, built from a *draft* VocabEntry that's never written to the store.
// Everything here is pure/standalone so it's unit-testable without a DOM
// or Obsidian (vitest runs in node — AGENT.md §5a.2); WordRow.ts/AiTab.ts
// wire it to the ♥ click and the AI tab's first question.

export const PREVIEW_ID_PREFIX = "preview:";

export function previewEntryId(word: string): string {
  return `${PREVIEW_ID_PREFIX}${word.toLowerCase()}`;
}

// A throwaway entry just for renderVocabRow to draw — id is a stable,
// recognizable placeholder (never collides with a real entry's
// Date.now()-based id); every field starts empty, filled in by
// mergeDictionaryInto() once the preview's own dictionary fetch resolves.
export function draftEntry(word: string): VocabEntry {
  return {
    id: previewEntryId(word),
    word,
    liked: false,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
  };
}

// Same "only fill what's empty" rule as main.ts's enrichEntry() — shared
// here instead of called directly (enrichEntry touches the store, which a
// preview entry must never do before it's actually added, 規格 #1).
export function mergeDictionaryInto(entry: VocabEntry, data: DictionaryResult): void {
  if (!entry.phonetic) entry.phonetic = data.phonetic;
  if (!entry.audio) entry.audio = data.audio;
  if (!entry.partOfSpeech) entry.partOfSpeech = data.partOfSpeech;
  if (!entry.definition) entry.definition = data.definition;
  if (!entry.definitionZh) entry.definitionZh = data.definitionZh;
  if (!entry.synonyms) entry.synonyms = data.synonyms.join(", ");
  if (!entry.antonyms) entry.antonyms = data.antonyms.join(", ");
}

// What renderVocabRow/renderWordAiTab need to add a previewed word for
// real — a narrow slice of VocabTrackerPlugin (same pattern as
// rowModel.ts's FieldStore) so this stays importable from a plain vitest
// file, no Obsidian.
export interface PreviewHost {
  addWordToVocab(word: string, ctx: Partial<WordContext>, opts: { reveal?: boolean; enrich?: boolean }): Promise<boolean>;
  store: {
    entries: VocabEntry[];
    touch(entry: VocabEntry): Promise<unknown>;
  };
}

// ♥ on a preview card, or the AI tab's first question (規格 #1): adds the
// real entry the normal way (liked:true, same as any manual add — see
// main.ts's addWordToVocab) and folds in whatever the preview's own
// dictionary fetch already found, so it isn't thrown away and re-fetched
// (addWordToVocab's own background enrich is skipped when there is data).
export async function promotePreview(
  host: PreviewHost,
  word: string,
  ctx: Partial<WordContext>,
  dict: DictionaryResult | null
): Promise<VocabEntry> {
  await host.addWordToVocab(word, ctx, { reveal: false, enrich: dict ? false : undefined });
  const lower = word.toLowerCase();
  const entry = host.store.entries.find((e) => e.word.toLowerCase() === lower);
  if (!entry) throw new Error(`Vocab Tracker: couldn't find "${word}" after adding it`);
  if (dict) {
    mergeDictionaryInto(entry, dict);
    await host.store.touch(entry);
  }
  return entry;
}

// ── Session-scoped dictionary cache ─────────────────────────────────
//
// A preview card's own dictionary fetch (never plugin.enrichEntry() —
// that writes to the store) runs once per word no matter how many times
// the host redraws it while loading (every data:changed tick, tab
// switches, the sidebar's render()…). Module-level: shared by the sheet
// and the sidebar, cleared only by a plugin reload.

export interface PreviewDictState {
  status: "loading" | "ready" | "error";
  data?: DictionaryResult;
  error?: unknown;
}

export interface DictionarySource {
  fetchDictionary(word: string): Promise<DictionaryResult>;
}

const cache = new Map<string, PreviewDictState>();

// Returns the cached state at once (starting the fetch on a cache miss);
// `onSettled` fires once, the first time this word's fetch finishes —
// callers re-derive the state with another call instead of being handed
// it directly, since by the time it fires the original caller may already
// be gone (sheet closed, row torn down) and shouldn't touch its DOM.
export function loadPreviewDictionary(dict: DictionarySource, word: string, onSettled: () => void): PreviewDictState {
  const key = word.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const entry: PreviewDictState = { status: "loading" };
  cache.set(key, entry);
  dict
    .fetchDictionary(word)
    .then((data) => {
      entry.status = "ready";
      entry.data = data;
    })
    .catch((error) => {
      entry.status = "error";
      entry.error = error;
    })
    .finally(onSettled);
  return entry;
}

// Test-only: the module-level cache above would otherwise leak between
// vitest cases.
export function _resetPreviewDictionaryCache(): void {
  cache.clear();
}

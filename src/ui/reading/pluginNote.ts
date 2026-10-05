import { legacyTitleHeading, type HeadingCacheLike } from "../../services/files/entryFiles";

// Which notes are the plugin's own, and how their view is dressed
// (1005 回饋 #4: 「屬性」 sits at the top of 字族樹.md and the word pages,
// and the page title shows twice). Pure — no "obsidian" import — so it's
// unit-tested; PluginNoteChrome.ts applies it to the open views.

// frontmatter `vocab-tracker:` values the plugin writes. Its own notes
// carry one of these plus a `vocab-tracker-id`; anything else is the
// user's note and is never touched.
export type PluginNoteKind = "word" | "entry" | "ai-note";
const KINDS: readonly string[] = ["word", "entry", "ai-note"];

export function pluginNoteKind(frontmatter: Record<string, unknown> | null | undefined): PluginNoteKind | null {
  const kind = frontmatter?.["vocab-tracker"];
  const id = frontmatter?.["vocab-tracker-id"];
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (!(typeof id === "string" && id.trim()) && !(typeof id === "number" && Number.isFinite(id))) return null;
  return kind as PluginNoteKind;
}

export interface NoteCacheLike {
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: { end: { line: number } };
  headings?: readonly HeadingCacheLike[];
}

export interface ChromeState {
  // The view gets `vt-plugin-note`: 「屬性」 small, and in Live Preview
  // moved under the content.
  pluginNote: boolean;
  // An older entry file starting with 「# 字族樹」: the inline title (the
  // same text right above it) is hidden instead of editing the file.
  hideInlineTitle: boolean;
  // Remembers that 「屬性」 was folded once for this note, so a learner
  // who opens it again isn't overruled (null: not a plugin note).
  collapseKey: string | null;
}

export function chromeState(cache: NoteCacheLike | null | undefined, basename: string): ChromeState {
  const kind = pluginNoteKind(cache?.frontmatter);
  if (!kind || !cache) return { pluginNote: false, hideInlineTitle: false, collapseKey: null };
  const id = String(cache.frontmatter?.["vocab-tracker-id"]).trim();
  return {
    pluginNote: true,
    hideInlineTitle: kind === "entry" && legacyTitleHeading(basename, cache.headings, cache.frontmatterPosition?.end.line),
    collapseKey: `${kind}:${id}`,
  };
}

// The notes whose 「屬性」 the plugin has folded once, newest last. Kept
// small: an old key falls off after MAX_KEYS (worst case the note is
// folded once more).
export const MAX_KEYS = 500;

export class CollapseMemory {
  private keys: string[];

  constructor(saved: unknown) {
    this.keys = Array.isArray(saved) ? saved.filter((k): k is string => typeof k === "string").slice(-MAX_KEYS) : [];
  }

  has(key: string): boolean {
    return this.keys.includes(key);
  }

  // Returns the list to save.
  add(key: string): string[] {
    if (!this.has(key)) {
      this.keys.push(key);
      if (this.keys.length > MAX_KEYS) this.keys.splice(0, this.keys.length - MAX_KEYS);
    }
    return [...this.keys];
  }
}

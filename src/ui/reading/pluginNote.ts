import { legacyTitleHeading, type HeadingCacheLike } from "../../services/files/entryFiles";

// Which notes are the plugin's own, and how their view is dressed (1006
// #3/#4: 「屬性」 hidden outright on the plugin's own notes in reading mode
// and Live Preview — Source mode still shows the raw frontmatter, since
// Obsidian never renders the Properties widget there anyway — and a
// duplicated title above/below Obsidian's own inline title is hidden by
// CSS, never by editing the file). Pure — no "obsidian" import — so it's
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
  // The view gets `vt-plugin-note`: 「屬性」 hidden outright in reading
  // mode and Live Preview (CSS only — Source mode is untouched, and
  // doesn't render the Properties widget to begin with).
  pluginNote: boolean;
  // An older entry file starting with 「# 字族樹」: the inline title (the
  // same text right above it) is hidden instead of editing the file.
  hideInlineTitle: boolean;
  // The opposite direction, for a note that isn't the plugin's own (no
  // `vocab-tracker` frontmatter) but opens with its own H1 right above an
  // embedded vocab-dashboard block (1006 #4: vocab-list.md, the starter
  // file main.ts writes as 「# Vocabulary List」 + the block, no
  // frontmatter at all). Obsidian's inline title stays; this H1 is hidden.
  hideFirstHeading: boolean;
}

// Conservative on purpose (1006 #4): only a bare H1 as the very first
// thing in the file — not a `vocab-dashboard` block anywhere lower down in
// someone's own note, which keeps its own heading.
const DASHBOARD_TITLE_SLACK = 3;

function opensWithH1(headings: readonly HeadingCacheLike[] | undefined): boolean {
  const h = headings?.[0];
  return !!h && h.level === 1 && h.position.start.line < DASHBOARD_TITLE_SLACK;
}

export function chromeState(
  cache: NoteCacheLike | null | undefined,
  basename: string,
  hasDashboardBlock = false
): ChromeState {
  const kind = pluginNoteKind(cache?.frontmatter);
  if (kind && cache) {
    return {
      pluginNote: true,
      hideInlineTitle: kind === "entry" && legacyTitleHeading(basename, cache.headings, cache.frontmatterPosition?.end.line),
      hideFirstHeading: false,
    };
  }
  return {
    pluginNote: false,
    hideInlineTitle: false,
    hideFirstHeading: hasDashboardBlock && opensWithH1(cache?.headings),
  };
}

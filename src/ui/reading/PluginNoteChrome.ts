import { MarkdownView, type App, type Component } from "obsidian";
import { chromeState } from "./pluginNote";

// ── The plugin's own notes: chrome out of the way (1005 回饋 #4, 1006 #3/#4) ──
//
// 字族樹.md / 動詞用法.md / 冷知識.md / 單字卡.md, the word pages and the
// .ai.md notes carry `vocab-tracker` / `vocab-tracker-id` frontmatter so
// the plugin can find them again — nothing the learner needs to look at.
// Obsidian can't put frontmatter at the end of a file, so this only
// changes how those notes are shown:
//
// - The view (`.workspace-leaf-content`) gets `vt-plugin-note`, and
//   wordPage.css hides 「屬性」 outright in reading mode and Live Preview.
//   Source mode is never touched by this class — it shows the raw
//   frontmatter lines anyway, Obsidian doesn't render the Properties
//   widget there — so switching to it still shows everything.
// - An entry file created before 1005 starts with 「# 字族樹」 right under
//   the inline title showing the same name: the inline title is hidden
//   (`vt-hide-inline-title`) rather than editing the file.
// - List.md (vocab-list.md before 1010; main.ts's starter file) opens with its own 「#
//   Vocabulary List」 above the vocab-dashboard block instead — no
//   frontmatter, so it's judged separately (chromeState's
//   `hasDashboardBlock` param, from this note's own rendered DOM): the
//   heading is hidden (`vt-hide-first-heading`), Obsidian's inline title
//   stays, same 1006 #4 direction as the word page's own 「vt-wh-word」
//   (wordPage.css hides that one directly, scoped to `vt-plugin-note`).
//
// The classes are recomputed for every open Markdown view on each
// file-open / layout / metadata change, so a tab that moves on to one of
// the user's notes loses them at once. Other notes are never touched.

export const PLUGIN_NOTE_CLASS = "vt-plugin-note";
export const HIDE_TITLE_CLASS = "vt-hide-inline-title";
export const HIDE_FIRST_HEADING_CLASS = "vt-hide-first-heading";
// Lets the vocab-dashboard block (rendered async) finish before this looks
// for it; also just debounces the burst of events a file-open fires.
const SETTLE_MS = 80;

export class PluginNoteChrome {
  private timer: number | null = null;
  private disposed = false;

  constructor(private app: App) {}

  // Wires the workspace events to `owner` (the plugin); undone on unload.
  attach(owner: Component): void {
    const { workspace, metadataCache } = this.app;
    const later = () => this.schedule();
    owner.registerEvent(workspace.on("file-open", later));
    owner.registerEvent(workspace.on("layout-change", later));
    owner.registerEvent(workspace.on("active-leaf-change", later));
    // The note's frontmatter / first heading may change (or arrive late).
    owner.registerEvent(metadataCache.on("changed", later));
    workspace.onLayoutReady(later);
    owner.register(() => this.dispose());
  }

  private schedule(): void {
    if (this.disposed) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, SETTLE_MS);
  }

  refresh(): void {
    if (this.disposed) return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const file = view.file;
      const cache = file ? this.app.metadataCache.getFileCache(file) : null;
      const el = view.containerEl;
      // A vocab-dashboard block already on screen — reading mode or Live
      // Preview, both get the registered post-processor (dashboard.ts sets
      // `vt-dash` on its root). Not found yet (still rendering): next
      // refresh (the debounce above, or the next workspace event) catches it.
      const hasDashboardBlock = !!el.querySelector(".vt-dash");
      const state = chromeState(cache, file?.basename ?? "", hasDashboardBlock);
      el.toggleClass(PLUGIN_NOTE_CLASS, state.pluginNote);
      el.toggleClass(HIDE_TITLE_CLASS, state.hideInlineTitle);
      el.toggleClass(HIDE_FIRST_HEADING_CLASS, state.hideFirstHeading);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      leaf.view.containerEl.removeClass(PLUGIN_NOTE_CLASS, HIDE_TITLE_CLASS, HIDE_FIRST_HEADING_CLASS);
    }
  }
}

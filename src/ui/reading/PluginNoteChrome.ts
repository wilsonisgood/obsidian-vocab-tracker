import { MarkdownView, type App, type Component } from "obsidian";
import { chromeState, CollapseMemory } from "./pluginNote";

// ── The plugin's own notes: 「屬性」 out of the way (1005 回饋 #4) ──
//
// 字族樹.md / 動詞用法.md / 冷知識.md / 單字卡.md, the word pages and the
// .ai.md notes carry `vocab-tracker` / `vocab-tracker-id` frontmatter so
// the plugin can find them again — nothing the learner needs to look at.
// Obsidian can't put frontmatter at the end of a file, so this only
// changes how those notes are shown:
//
// - The view (`.workspace-leaf-content`) gets `vt-plugin-note`, and
//   wordPage.css makes 「屬性」 small and faint; in Live Preview, where the
//   editor's sizer is a flex column, it also moves below the content.
//   (Reading view keeps it under the title: there it lives in the
//   renderer's header section, which a stylesheet can't reorder.)
// - The first time the plugin sees such a note it folds 「屬性」 into its
//   one-line heading, the same as clicking it. Obsidian remembers the fold
//   per note, and so does the plugin (CollapseMemory), so unfolding it
//   again sticks.
// - An entry file created before 1005 starts with 「# 字族樹」 right under
//   the inline title showing the same name: the inline title is hidden
//   (`vt-hide-inline-title`) rather than editing the file.
//
// The classes are recomputed for every open Markdown view on each
// file-open / layout / metadata change, so a tab that moves on to one of
// the user's notes loses them at once. Other notes are never touched.

export const PLUGIN_NOTE_CLASS = "vt-plugin-note";
export const HIDE_TITLE_CLASS = "vt-hide-inline-title";
const STORAGE_KEY = "vt-folded-properties";
// Lets Obsidian finish loading the note (it restores the fold state then).
const SETTLE_MS = 80;

export class PluginNoteChrome {
  private timer: number | null = null;
  private memory: CollapseMemory;
  private disposed = false;

  constructor(private app: App) {
    let saved: unknown = null;
    try {
      saved = app.loadLocalStorage(STORAGE_KEY);
    } catch {
      // Private window / blocked storage: fold once per session instead.
    }
    this.memory = new CollapseMemory(saved);
  }

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
      const state = chromeState(cache, file?.basename ?? "");
      const el = view.containerEl;
      el.toggleClass(PLUGIN_NOTE_CLASS, state.pluginNote);
      el.toggleClass(HIDE_TITLE_CLASS, state.hideInlineTitle);
      if (state.collapseKey) this.foldOnce(el, state.collapseKey);
    }
  }

  // Clicks 「屬性」's heading once per note — Obsidian's own fold, so the
  // learner unfolds it the usual way and Obsidian keeps that per note.
  private foldOnce(viewEl: HTMLElement, key: string): void {
    if (this.memory.has(key)) return;
    const box = viewEl.querySelector<HTMLElement>(".metadata-container");
    // Not rendered yet (or Properties hidden in settings): try next time.
    if (!box || !box.isShown()) return;
    if (!box.hasClass("is-collapsed")) {
      // Not bubbling: the plugin's own reading-mode click handler (add a
      // word) must not see it.
      box
        .querySelector<HTMLElement>(".metadata-properties-heading")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));
    }
    const keys = this.memory.add(key);
    try {
      this.app.saveLocalStorage(STORAGE_KEY, keys);
    } catch {
      // Not saved: folded again next session at worst.
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      leaf.view.containerEl.removeClass(PLUGIN_NOTE_CLASS, HIDE_TITLE_CLASS);
    }
  }
}

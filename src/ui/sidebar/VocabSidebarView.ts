import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { ExpandState } from "../word/WordRow";
import { renderVocabRow } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";

export const VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";

type FilterMode = "note" | "all";

// ─── Sidebar View ─────────────────────────────────────────────────────────────

export class VocabSidebarView extends ItemView {
  plugin: VocabTrackerPlugin;
  // Word clicked via a plain ==mark== that isn't tracked yet — prompts an
  // "add to vocab" banner instead of a full row (see processMarks).
  pendingWord = "";
  filterMode?: FilterMode;
  expandState: Map<string, ExpandState> = new Map();
  collapsedGroups: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: VocabTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VOCAB_VIEW_TYPE; }
  getDisplayText() { return t("sidebar.title"); }
  getIcon() { return "book-open"; }

  async onOpen() { this.render(); }

  // Called when a tracked word is clicked (reading-mode word / ==mark==).
  // Expands its row in place rather than opening a separate card.
  setWord(word: string) {
    const entry = this.plugin.store.entries.find(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );
    if (entry) {
      if (this.expandState.get(entry.id) === undefined) {
        this.expandState.set(entry.id, "half");
      }
      this.pendingWord = "";
    } else {
      this.pendingWord = word;
    }
    this.render();
  }

  render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("vocab-tracker-sidebar");

    const header = root.createEl("div", { cls: "vocab-tracker-header" });
    header.createEl("h4", { text: t("sidebar.title") });
    const openList = header.createEl("span", { cls: "vocab-tracker-icon-btn" });
    setIcon(openList, "file-text");
    openList.title = t("sidebar.openList");
    openList.onclick = () => this.plugin.openVocabFile();

    const entries = this.plugin.store.entries;

    // ── Not-yet-tracked word banner ──────────────────────────────
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vocab-tracker-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vocab-tracker-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: t("sidebar.addPrompt.cta"), cls: "vocab-tracker-btn" });
      addBtn.onclick = async () => {
        await this.plugin.addWordToVocab(this.pendingWord);
      };
      const dismiss = banner.createEl("span", { cls: "vocab-tracker-close-btn" });
      setIcon(dismiss, "x");
      dismiss.onclick = () => { this.pendingWord = ""; this.render(); };
    }

    // ── Scope: words from this note, or all words ────────────────
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const canFilter = !!activeFile;
    if (this.filterMode === undefined) this.filterMode = "note";

    let list = entries;
    let scopeLabel = t("sidebar.scope.all");
    if (this.filterMode === "note" && canFilter) {
      list = entries.filter(
        (e) => e.source && e.source.path === activeFile!.path
      );
      scopeLabel = t("sidebar.scope.note");
    }

    const listHeader = root.createEl("div", { cls: "vocab-tracker-list-header" });

    const countLabel = listHeader.createEl("div", { cls: "vocab-tracker-count-label" });
    countLabel.textContent = `${scopeLabel} (${list.length})`;

    const toggle = listHeader.createEl("div", { cls: "vocab-tracker-toggle-group" });
    const mkToggle = (label: string, mode: FilterMode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label, cls: "vocab-tracker-toggle-btn" });
      b.toggleClass("is-active", on);
      b.onclick = () => {
        this.filterMode = mode;
        this.render();
      };
    };
    mkToggle(t("sidebar.filter.note"), "note");
    mkToggle(t("sidebar.filter.all"), "all");

    if (list.length === 0) {
      root.createEl("div", {
        text:
          this.filterMode === "note" && canFilter
            ? t("sidebar.hint.noteEmpty")
            : t("sidebar.hint.allEmpty"),
        cls: "vocab-tracker-hint",
      });
      return;
    }

    const listEl = root.createEl("div", { cls: "vocab-tracker-list" });
    if (this.filterMode === "all") {
      // Grouped by source note, same as the vocab-list dashboard — "This
      // note" stays flat since every row would be in the same group anyway.
      renderGroupedVocabList(
        this.plugin,
        listEl,
        list,
        this.collapsedGroups,
        this.expandState,
        () => this.render()
      );
    } else {
      for (const entry of list) {
        const state = this.expandState.get(entry.id) ?? "collapsed";
        renderVocabRow(
          this.plugin,
          listEl,
          entry,
          state,
          (s) => this.expandState.set(entry.id, s),
          () => this.render()
        );
      }
    }
  }
}

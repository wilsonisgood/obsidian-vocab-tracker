import { Component, ItemView, Notice, TFile, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState, RowOptions } from "../word/WordRow";
import { renderVocabRow } from "../word/WordRow";
import { groupTitle, renderGroupedVocabList } from "../word/GroupedWordList";
import { t } from "../../core/i18n";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import { WordUi, type WordTab } from "../word/wordUi";
import { renderExamStrip } from "./examStrip";
import { MissingNoteThreadList, ParagraphThreadList, type ParagraphListActions, type ParagraphListDeps } from "./ParagraphThreadList";
import { ParagraphThreadPane, type ParagraphPaneNav } from "./ParagraphThreadPane";
import { LIST_ROUTE, SidebarRouter, routeForActiveNote, routeKey, sameRoute, type SidebarRoute } from "./routes";

export const VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";

type FilterMode = "note" | "all";

// Re-reading a note after an edit waits for typing to settle.
const NOTE_REFRESH_MS = 400;

export const REBINDING_BODY_CLS = "vt-rebinding";

// ─── Sidebar View ─────────────────────────────────────────────────────────────
//
// Routes (routes.ts, 規劃書 06 §9.4): the This note / All list, or one
// paragraph's discussion (design D5) with a back button.
//
// Redraw strategy (§9.4): render() rebuilds the whole view, and is only
// meant for switching notes / tabs / routes (main.ts also still calls it
// after word edits). Everything else updates in place: the exam strip
// (refreshExamStrip), the 「段落討論」 list and the paragraph pane (their
// own thread events + the note's modify events), and the words' ✦ n chips
// (word thread events). While a paragraph pane is showing, render() keeps
// it as is unless the route changed — so a background refresh never wipes
// a half-typed question there.

export class VocabSidebarView extends ItemView {
  plugin: VocabTrackerPlugin;
  // Word clicked via a plain ==mark== that isn't tracked yet — prompts an
  // "add to vocab" banner instead of a full row (see processMarks).
  pendingWord = "";
  filterMode?: FilterMode;
  expandState: Map<string, ExpandState> = new Map();
  collapsedGroups: Set<string> = new Set();
  wordUi = new WordUi(this);
  readonly router = new SidebarRouter();
  // A discussion waiting for its new paragraph: the next ✦ clicked in
  // reading view rebinds it instead of opening that paragraph.
  rebindThreadId: string | null = null;
  // Exam word stats for the active note; refreshed on its own (see
  // refreshExamStrip) so a background scan never re-renders the word list
  // — that would wipe a half-typed question in an open AI tab.
  private examStripEl: HTMLElement | null = null;
  private rebindEl: HTMLElement | null = null;
  // Owner of the current draw's paragraph list / pane (their event
  // subscriptions end with the draw).
  private drawScope: Component | null = null;
  private pane: ParagraphThreadPane | null = null;
  private paragraphList: ParagraphThreadList | null = null;
  private missingList: MissingNoteThreadList | null = null;
  // Word id → its ✦ n chip in the word list (either tab).
  private wordChips = new Map<string, HTMLElement>();
  private changedPaths = new Set<string>();
  private refreshChangedNotes = debounce(() => this.flushChangedNotes(), NOTE_REFRESH_MS, true);

  constructor(leaf: WorkspaceLeaf, plugin: VocabTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VOCAB_VIEW_TYPE; }
  getDisplayText() { return t("sidebar.title"); }
  getIcon() { return "book-open"; }

  async onOpen() {
    const { threads } = this.plugin;
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind === "word") this.updateWordChip(th.anchor.entryId);
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.updateWordChips()));
    void threads.ensureLoaded().then(() => this.updateWordChips());

    const { vault } = this.app;
    this.registerEvent(vault.on("modify", (f) => this.noteChanged(f.path)));
    this.registerEvent(vault.on("delete", (f) => this.noteChanged(f.path, true)));
    this.registerEvent(
      vault.on("rename", (f, oldPath) => {
        // The listed note itself moved: the list is keyed by its path, so
        // draw it again under the new one (its threads follow through
        // ThreadService.renameParagraphPath's upserts).
        if (this.paragraphList?.notePath === oldPath) {
          window.setTimeout(() => this.render(), 0);
          return;
        }
        this.noteChanged(oldPath, true);
        this.noteChanged(f.path, true);
      })
    );
    this.register(() => document.body.removeClass(REBINDING_BODY_CLS));
    this.render();
  }

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
    // The word lives in the list.
    this.router.back();
    this.render();
  }

  // Shows one word's card, expanded and on the given tab (the word page's
  // 「在側欄開啟」 opens it on "ai"). Switches to All when the word isn't
  // from the note in front, and opens its group there.
  openWord(entryId: string, tab: WordTab): void {
    const entry = this.plugin.store.entries.find((e) => e.id === entryId);
    if (!entry) return;
    if (this.expandState.get(entry.id) === undefined || this.expandState.get(entry.id) === "collapsed") {
      this.expandState.set(entry.id, "half");
    }
    this.wordUi.tabs.set(entry.id, tab);
    this.pendingWord = "";
    const active = this.app.workspace.getActiveFile()?.path;
    if (this.filterMode !== "all" && (!active || entry.source?.path !== active)) this.filterMode = "all";
    if (this.filterMode === "all") this.collapsedGroups.delete(groupTitle(entry));
    this.router.back();
    this.draw();
    const root = this.containerEl.children[1] as HTMLElement;
    const row = root.querySelector<HTMLElement>(`.vocab-tracker-row[data-entry-id="${CSS.escape(entry.id)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }

  refreshExamStrip() {
    if (!this.examStripEl) return;
    this.examStripEl.empty();
    renderExamStrip(this.examStripEl, this.plugin, this.plugin.app.workspace.getActiveFile());
  }

  // ── Paragraph discussions ───────────────────────────────────────────────

  // A reading-mode ✦ was clicked (ParagraphBadges → main.ts). Opens that
  // paragraph's discussion, or a new one; while rebinding, the paragraph
  // becomes the waiting discussion's new anchor instead.
  async openParagraph(ref: SectionRef): Promise<void> {
    if (this.rebindThreadId) return this.finishRebind(ref);
    const { threads } = this.plugin;
    await threads.ensureLoaded();
    const thread = threads.paragraphThread(ref.path, ref.text);
    this.navigate(thread ? { name: "paragraph", threadId: thread.id } : { name: "paragraph-draft", section: ref });
  }

  openThread(threadId: string): void {
    this.navigate({ name: "paragraph", threadId });
  }

  navigate(route: SidebarRoute): void {
    if (this.router.go(route)) this.draw();
  }

  startRebind(threadId: string): void {
    this.rebindThreadId = threadId;
    document.body.addClass(REBINDING_BODY_CLS);
    this.drawRebindBanner();
  }

  cancelRebind(): void {
    this.rebindThreadId = null;
    document.body.removeClass(REBINDING_BODY_CLS);
    this.drawRebindBanner();
  }

  private async finishRebind(ref: SectionRef): Promise<void> {
    const threadId = this.rebindThreadId as string;
    this.cancelRebind();
    try {
      if (!(await this.plugin.threads.rebindParagraph(threadId, ref))) return;
      new Notice(t("paragraph.rebind.done"));
      this.navigate({ name: "paragraph", threadId });
    } catch (e) {
      console.error("Vocab Tracker: rebind failed", e);
      new Notice(t("paragraph.rebind.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private drawRebindBanner(): void {
    const el = this.rebindEl;
    if (!el) return;
    el.empty();
    el.toggle(!!this.rebindThreadId);
    if (!this.rebindThreadId) return;
    setIcon(el.createSpan({ cls: "vt-rebind-icon" }), "link");
    el.createSpan({ cls: "vt-rebind-text", text: t("paragraph.rebind.banner") });
    const cancel = el.createEl("button", { text: t("paragraph.rebind.cancel") });
    cancel.addEventListener("click", () => this.cancelRebind());
  }

  private listActions(): ParagraphListActions {
    return {
      open: (id) => this.openThread(id),
      rebind: (id) => this.startRebind(id),
      remove: (id) => void this.plugin.threads.deleteThread(id).then(() => new Notice(t("paragraph.deleted"))),
    };
  }

  private paneNav(): ParagraphPaneNav {
    return {
      back: () => this.navigate(LIST_ROUTE),
      threadStarted: (section, threadId) => {
        const draftKey = routeKey({ name: "paragraph-draft", section });
        if (!this.router.promoteDraft(section, threadId)) return;
        // Keep the composer focused across the hand-over.
        const chat = this.wordUi.chat;
        if (chat.focused === draftKey) chat.focused = threadId;
        this.draw();
      },
      rebind: (id) => this.startRebind(id),
      removed: (id) => {
        const r = this.router.current;
        if (r.name === "paragraph" && r.threadId === id) this.navigate(LIST_ROUTE);
      },
    };
  }

  private listDeps(): ParagraphListDeps {
    const { threads, notes, ai } = this.plugin;
    return { threads, notes, taskLabel: (id) => ai.tasks.get(id)?.label };
  }

  // The note a paragraph thread belongs to, if that note still exists.
  private threadPath = (threadId: string): string | null => {
    const th = this.plugin.threads.get(threadId);
    if (th?.anchor.kind !== "paragraph") return null;
    return this.app.vault.getAbstractFileByPath(th.anchor.path) ? th.anchor.path : null;
  };

  private noteChanged(path: string, structural = false): void {
    const watched = this.paragraphList?.notePath === path || this.pane?.path === path;
    if (!watched && !(structural && this.missingList)) return;
    this.changedPaths.add(path);
    this.refreshChangedNotes();
  }

  private flushChangedNotes(): void {
    const paths = this.changedPaths;
    this.changedPaths = new Set();
    if (this.paragraphList && paths.has(this.paragraphList.notePath)) void this.paragraphList.refresh();
    const panePath = this.pane?.path;
    if (this.pane && panePath && paths.has(panePath)) void this.pane.refreshStatus();
    this.missingList?.refresh();
  }

  // ── ✦ n on words with discussions ───────────────────────────────────────

  private drawWordChip(chip: HTMLElement, entryId: string): void {
    const n = this.plugin.threads.wordQuestionCount(entryId);
    chip.empty();
    chip.toggle(n > 0);
    if (!n) return;
    setIcon(chip.createSpan({ cls: "vt-word-tc-icon" }), "sparkles");
    chip.createSpan({ text: String(n) });
    chip.setAttr("aria-label", t("word.discussions", { n }));
  }

  private updateWordChip(entryId: string): void {
    const chip = this.wordChips.get(entryId);
    if (chip?.isConnected) this.drawWordChip(chip, entryId);
  }

  private updateWordChips(): void {
    for (const id of this.wordChips.keys()) this.updateWordChip(id);
  }

  // ── Drawing ─────────────────────────────────────────────────────────────

  // Public entry point (main.ts calls it on note switches and after word
  // edits). Closes a paragraph pane that belongs to another note; keeps an
  // open pane as is when its route didn't change.
  render() {
    const active = this.app.workspace.getActiveFile()?.path ?? null;
    const route = routeForActiveNote(this.router.current, active, this.threadPath);
    this.router.go(route);
    if (this.pane && sameRoute(this.pane.route, this.router.current)) return;
    this.draw();
  }

  private draw() {
    const root = this.containerEl.children[1] as HTMLElement;
    this.wordUi.beginRender();
    if (this.drawScope) this.removeChild(this.drawScope);
    const scope = (this.drawScope = this.addChild(new Component()));
    this.pane = null;
    this.paragraphList = null;
    this.missingList = null;
    this.examStripEl = null;
    this.wordChips.clear();
    root.empty();
    root.addClass("vocab-tracker-sidebar");

    const header = root.createEl("div", { cls: "vocab-tracker-header" });
    header.createEl("h4", { text: t("sidebar.title") });
    const openList = header.createEl("span", { cls: "vocab-tracker-icon-btn" });
    setIcon(openList, "file-text");
    openList.title = t("sidebar.openList");
    openList.onclick = () => this.plugin.openVocabFile();

    this.rebindEl = root.createDiv({ cls: "vt-rebind-banner" });
    this.drawRebindBanner();

    const route = this.router.current;
    if (route.name === "list") {
      this.drawList(root, scope);
    } else {
      this.pane = scope.addChild(new ParagraphThreadPane(root, route, this.plugin, this.wordUi.chat, this.paneNav()));
    }
  }

  private drawList(root: HTMLElement, scope: Component) {
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
    const noteMode = this.filterMode === "note" && canFilter;

    let list = entries;
    let scopeLabel = t("sidebar.scope.all");
    if (noteMode) {
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
        this.draw();
      };
    };
    mkToggle(t("sidebar.filter.note"), "note");
    mkToggle(t("sidebar.filter.all"), "all");

    // Exam word stats for the note in front (規劃書 03), at the top of both
    // tabs; its chips are the underline toggles. Redrawn on its own.
    this.examStripEl = root.createDiv();
    this.refreshExamStrip();

    if (list.length === 0) {
      root.createEl("div", {
        text: noteMode ? t("sidebar.hint.noteEmpty") : t("sidebar.hint.allEmpty"),
        cls: "vocab-tracker-hint",
      });
    } else {
      const listEl = root.createEl("div", { cls: "vocab-tracker-list" });
      const rowOpts: RowOptions = {
        ui: this.wordUi,
        // ✦ n after the word (design D1); the dashboard doesn't pass this.
        decorateWord: (wrap, entry) => {
          const chip = wrap.createSpan({ cls: "vt-word-tc" });
          this.wordChips.set(entry.id, chip);
          this.drawWordChip(chip, entry.id);
        },
        openWordPage: (entry: VocabEntry) => void this.plugin.openWordPage(entry.id),
      };
      if (this.filterMode === "all") {
        // Grouped by source note, same as the vocab-list dashboard — "This
        // note" stays flat since every row would be in the same group anyway.
        renderGroupedVocabList(
          this.plugin,
          listEl,
          list,
          this.collapsedGroups,
          this.expandState,
          () => this.render(),
          rowOpts
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
            () => this.render(),
            rowOpts
          );
        }
      }
    }

    // ── 段落討論（n） / orphaned discussions ─────────────────────
    if (noteMode && activeFile instanceof TFile && activeFile.extension === "md") {
      this.paragraphList = scope.addChild(
        new ParagraphThreadList(root, activeFile.path, this.listDeps(), this.listActions())
      );
    } else if (this.filterMode === "all") {
      this.missingList = scope.addChild(
        new MissingNoteThreadList(
          root,
          { ...this.listDeps(), exists: (p) => !!this.app.vault.getAbstractFileByPath(p) },
          this.listActions()
        )
      );
    }
  }
}

import { Component, ItemView, Notice, TFile, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState, RowOptions } from "../word/WordRow";
import { renderVocabRow } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { sortByRecent } from "../word/wordOrder";
import { t } from "../../core/i18n";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import { WordUi, type WordTab } from "../word/wordUi";
import { renderExamStrip } from "./examStrip";
import { MissingNoteThreadList, ParagraphThreadList, type ParagraphListActions, type ParagraphListDeps } from "./ParagraphThreadList";
import { ParagraphThreadPane, type ParagraphPaneNav } from "./ParagraphThreadPane";
import { DiscussionList } from "./DiscussionList";
import { discussionRows } from "./discussionRows";
import { FLASH_MS, planReveal, SectionState, type FilterMode, type SectionId } from "./sections";
import { LIST_ROUTE, REBINDING_BODY_CLS, SidebarRouter, routeForActiveNote, routeKey, sameRoute, type SidebarRoute } from "./routes";

export const VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";

// Re-reading a note after an edit waits for typing to settle.
const NOTE_REFRESH_MS = 400;

// Lives in routes.ts so the iPhone sheet (ui/mobile/WordSheet.ts) can use
// it without loading this view.
export { REBINDING_BODY_CLS };

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
  // 單字 / AI 討論 folded or open — remembered per device (1005 回饋 2).
  readonly sections: SectionState;
  // The AI 討論 list's 「顯示全部」 (view memory, like expandState).
  private discussionView = { showAll: false };
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
    this.sections = new SectionState(this.app);
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

  // Called when a word is clicked (reading-mode word / ==mark==, through
  // WordSurfaces.revealWord). A tracked word is brought into view (see
  // revealEntry); an untracked one gets the 「加入單字庫」 banner.
  setWord(word: string) {
    const entry = this.findEntry(word);
    if (entry) {
      this.revealEntry(entry);
      return;
    }
    this.pendingWord = word;
    // The word lives in the list.
    this.router.back();
    this.render();
    this.scrollRoot()?.scrollTo?.({ top: 0 });
  }

  // A tracked word was clicked in reading view while the sidebar is open
  // (tap action 「選單」, 1005 回饋 3): follow it here without bringing the
  // sidebar to the front. False when the word isn't tracked.
  locateWord(word: string): boolean {
    const entry = this.findEntry(word);
    if (!entry) return false;
    this.revealEntry(entry);
    return true;
  }

  // Shows one word's card, expanded and on the given tab (the word page's
  // 「在側欄開啟」 opens it on "ai", so does the AI 討論 list).
  openWord(entryId: string, tab: WordTab): void {
    const entry = this.plugin.store.entries.find((e) => e.id === entryId);
    if (entry) this.revealEntry(entry, tab);
  }

  private findEntry(word: string): VocabEntry | undefined {
    const lower = word.toLowerCase();
    return this.plugin.store.entries.find((e) => e.word.toLowerCase() === lower);
  }

  // Brings a word into view (1005 回饋 3): back to the list, the 單字
  // section open, This note → All when the word is from another note (its
  // group opened there), the card expanded — then scrolled to and briefly
  // highlighted.
  private revealEntry(entry: VocabEntry, tab?: WordTab): void {
    const plan = planReveal({
      filterMode: this.filterMode,
      activePath: this.app.workspace.getActiveFile()?.path ?? null,
      entry,
    });
    this.filterMode = plan.filterMode;
    if (plan.openGroup) this.collapsedGroups.delete(plan.openGroup);
    this.sections.set("words", false);
    const state = this.expandState.get(entry.id);
    if (state === undefined || state === "collapsed") this.expandState.set(entry.id, "half");
    if (tab) this.wordUi.tabs.set(entry.id, tab);
    this.pendingWord = "";
    this.router.back();
    this.draw();
    this.flashRow(entry.id);
  }

  // A card redrew the list (an edit, a fold, ✓). An edit makes the word
  // the most recent one, so it moves to the top: keep it in view there.
  private renderKeeping(entryId?: string): void {
    this.render();
    if (!entryId) return;
    const row = this.rowEl(entryId);
    row?.scrollIntoView({ block: "nearest" });
  }

  private rowEl(entryId: string): HTMLElement | null {
    return this.scrollRoot()?.querySelector<HTMLElement>(`.vt-row[data-entry-id="${CSS.escape(entryId)}"]`) ?? null;
  }

  private scrollRoot(): HTMLElement | null {
    return (this.containerEl.children[1] as HTMLElement | undefined) ?? null;
  }

  private flashRow(entryId: string): void {
    const row = this.rowEl(entryId);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    // Once more after layout: a sidebar that was just revealed has no size
    // yet on the first pass.
    window.setTimeout(() => {
      if (row.isConnected) row.scrollIntoView({ block: "center" });
    }, 60);
    row.removeClass("vt-row-flash");
    row.addClass("vt-row-flash");
    window.setTimeout(() => row.removeClass("vt-row-flash"), FLASH_MS);
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
    root.addClass("vt-sidebar");

    const header = root.createEl("div", { cls: "vt-sidebar-header" });
    header.createEl("h4", { text: t("sidebar.title") });
    const openList = header.createEl("span", { cls: "vt-icon-btn clickable-icon" });
    setIcon(openList, "file-text");
    openList.setAttr("role", "button");
    openList.setAttr("aria-label", t("sidebar.openList"));
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
    // ── Not-yet-tracked word banner ──────────────────────────────
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vt-sidebar-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vt-sidebar-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: t("sidebar.addPrompt.cta"), cls: "vt-sidebar-add-btn" });
      addBtn.onclick = async () => {
        // Shown here, in the sidebar — even on iPhone, where it was opened by hand.
        const word = this.pendingWord;
        await this.plugin.addWordToVocab(word, {}, { reveal: false });
        this.setWord(word);
      };
      const dismiss = banner.createEl("span", { cls: "vt-close-btn" });
      setIcon(dismiss, "x");
      dismiss.onclick = () => { this.pendingWord = ""; this.render(); };
    }

    // Two foldable sections (1005 回饋 2): 單字, then AI 討論.
    const words = this.drawSection(root, "words", t("sidebar.section.words"));
    if (words) this.drawWords(words, scope);

    const counter = { el: null as HTMLElement | null };
    const ai = this.drawSection(root, "ai", t("sidebar.section.ai", { n: "…" }), counter);
    if (ai) {
      const { threads } = this.plugin;
      scope.addChild(
        new DiscussionList(
          ai,
          { threads, entries: () => this.plugin.store.entries },
          {
            openWord: (entryId) => this.openWord(entryId, "ai"),
            openParagraph: (threadId) => this.openThread(threadId),
            counted: (n) => counter.el?.setText(t("sidebar.section.ai", { n })),
          },
          this.discussionView
        )
      );
    } else {
      // Folded: the count still shows, and follows new discussions.
      const { threads } = this.plugin;
      const recount = () => {
        if (!counter.el?.isConnected) return;
        const n = discussionRows(threads, this.plugin.store.entries).length;
        counter.el.setText(t("sidebar.section.ai", { n }));
      };
      scope.register(threads.events.on("thread:upsert", recount));
      scope.register(threads.events.on("threads:reloaded", recount));
      void threads.ensureLoaded().then(recount);
    }
  }

  // A section heading (click to fold); returns the body to fill, or null
  // when the section is folded.
  private drawSection(
    root: HTMLElement,
    id: SectionId,
    title: string,
    titleRef?: { el: HTMLElement | null }
  ): HTMLElement | null {
    const collapsed = this.sections.isCollapsed(id);
    const section = root.createDiv({ cls: "vt-sb-section" });
    section.setAttr("data-section", id);
    section.toggleClass("is-collapsed", collapsed);
    const head = section.createDiv({ cls: "vt-sb-section-head" });
    head.setAttr("role", "button");
    head.setAttr("tabindex", "0");
    head.setAttr("aria-expanded", String(!collapsed));
    setIcon(head.createSpan({ cls: "vt-sb-section-arrow" }), collapsed ? "chevron-right" : "chevron-down");
    const label = head.createSpan({ cls: "vt-sb-section-title", text: title });
    if (titleRef) titleRef.el = label;
    const toggle = () => {
      this.sections.toggle(id);
      this.draw();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    if (collapsed) return null;
    return section.createDiv({ cls: "vt-sb-section-body" });
  }

  private drawWords(root: HTMLElement, scope: Component) {
    const entries = this.plugin.store.entries;

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

    const listHeader = root.createEl("div", { cls: "vt-sidebar-list-header" });

    const countLabel = listHeader.createEl("div", { cls: "vt-sidebar-count-label" });
    countLabel.textContent = `${scopeLabel} (${list.length})`;

    const toggle = listHeader.createEl("div", { cls: "vt-toggle-group" });
    const mkToggle = (label: string, mode: FilterMode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label, cls: "vt-toggle-btn" });
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
        cls: "vt-sidebar-hint",
      });
    } else {
      const listEl = root.createEl("div", { cls: "vt-word-list" });
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
        // Grouped by source note (or where a word from no note came from),
        // same as the vocab-list dashboard — "This note" stays flat since
        // every row would be in the same group anyway. Most recently
        // changed first, groups too (1005 回饋 1).
        renderGroupedVocabList(
          this.plugin,
          listEl,
          list,
          this.collapsedGroups,
          this.expandState,
          (entryId) => this.renderKeeping(entryId),
          rowOpts,
          { order: "recent" }
        );
      } else {
        for (const entry of sortByRecent(list)) {
          const state = this.expandState.get(entry.id) ?? "collapsed";
          renderVocabRow(
            this.plugin,
            listEl,
            entry,
            state,
            (s) => this.expandState.set(entry.id, s),
            () => this.renderKeeping(entry.id),
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

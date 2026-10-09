import { Component, ItemView, Notice, TFile, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState, RowOptions } from "../word/WordRow";
import { renderVocabRow } from "../word/WordRow";
import { renderGroupedVocabList } from "../word/GroupedWordList";
import { draftEntry, loadPreviewDictionary, mergeDictionaryInto } from "../word/previewEntry";
import { sortByRecent } from "../word/wordOrder";
import { t } from "../../core/i18n";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import { WordUi, type WordTab } from "../word/wordUi";
import { renderExamStrip } from "./examStrip";
import {
  AllNotesThreadList,
  MissingNoteThreadList,
  ParagraphThreadList,
  type ParagraphListActions,
  type ParagraphListDeps,
} from "./ParagraphThreadList";
import { ParagraphThreadPane, type ParagraphPaneNav } from "./ParagraphThreadPane";
import { DiscussionList } from "./DiscussionList";
import { discussionRows } from "./discussionRows";
import { GrammarSection, type GrammarSectionDeps } from "./GrammarSection";
import { verbUsageRows } from "./grammarRows";
import { FLASH_MS, planReveal, SectionState, type FilterMode, type SectionId } from "./sections";
import { LIST_ROUTE, REBINDING_BODY_CLS, SidebarRouter, routeForActiveNote, routeKey, sameRoute, type SidebarRoute } from "./routes";
import { isListed, type IsListedContext } from "../../core/model/like";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../core/model/wordlists";
import { computeNoteScope, likeCountInScope, noteScopeSig } from "./noteScope";
import type { PageContext } from "../page/pageContext";
import { renderPageGroups } from "./pageGroups";
import { pageGroupEntryIds, pageScopedEntries, resetPageCollapsed, uniquePageWordCount } from "./pageGroupsModel";

export const VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";

// Re-reading a note after an edit waits for typing to settle.
const NOTE_REFRESH_MS = 400;

// 1009 #8: how long the focusWord row's .is-flash stays on (sidebarFlash.css).
const FOCUS_FLASH_MS = 1200;

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
  // Word clicked via a plain ==mark== that isn't tracked yet — shows a
  // preview card (1009-2 #1) instead of a library row (see processMarks).
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
  private allNotesList: AllNotesThreadList | null = null;
  private missingList: MissingNoteThreadList | null = null;
  private discussionList: DiscussionList | null = null;
  private grammarSection: GrammarSection | null = null;
  // Folded AI討論／文法 keep showing a live count (existing behaviour) —
  // when noteScope resolves or a chip toggles while they're folded, there's
  // no DiscussionList/GrammarSection instance to call .refresh() on, so
  // refreshFiltered() calls these instead.
  private aiRecount: (() => void) | null = null;
  private grammarRecount: (() => void) | null = null;
  // Word id → its ✦ n chip in the word list (either tab).
  private wordChips = new Map<string, HTMLElement>();
  private changedPaths = new Set<string>();
  private refreshChangedNotes = debounce(() => this.flushChangedNotes(), NOTE_REFRESH_MS, true);

  // ── 本篇 scope (1006report.md #6) ───────────────────────────────────────
  // Cache of "this note contains this word", kept until the note's mtime
  // changes: exam words come from the background scan's hits
  // (plugin.wordlists.cachedScan), liked words are matched against the
  // note's own text (computeNoteScope, src/ui/sidebar/noteScope.ts). The
  // async part (reading the note) resolves later and redraws only the
  // filtered sections (words/AI 討論/文法), never the whole sidebar.
  private noteScopeCache: { path: string; mtime: number; sig: string; ids: Set<string> } | null = null;
  private noteScopeSeq = 0;
  // The 單字 section's own elements, kept so a filter-only change (chip
  // toggle, scope resolving) can redraw just this section (#10).
  private wordsCountEl: HTMLElement | null = null;
  private wordsBodyEl: HTMLElement | null = null;
  // Wave 10 S (1007-2 #9): store.events "data:changed" used to only redraw
  // when noteScopeCache existed — which is never true in the All tab, so
  // adding a word from 字族樹／Word DNA never showed up there without a
  // manual re-render. Now it's a plain "did the live/liked set change"
  // signature check (noteScopeSig, already used by the This-note cache
  // below), independent of filterMode, so both tabs redraw right away.
  private lastListSig = "";

  // ── 側欄「本篇」頁面模式 (1007-2 #8, #9, #13, #14) ──────────────────────
  // Which page-mode groups are folded — its own set, not shared with the
  // All tab's collapsedGroups (頁面模式分類的收合狀態另外存). Reset to
  // "only the active group open" whenever the page's activeGroupKey
  // changes (syncPageCollapse); the user's own expand/collapse clicks in
  // between are left alone.
  pageCollapsed: Set<string> = new Set();
  private lastActiveGroupKey: string | null | undefined = undefined;
  // Suggested-row 「＋」 requests in flight (pageGroups.ts's busy spinner).
  private pageBusy: Set<string> = new Set();
  // 1009 #8: the last focusWord we actually flashed — so a re-publish with
  // the same word (every render while the galaxy block stays open) doesn't
  // re-flash it over and over.
  private lastFocusWord: string | null = null;

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
    // Wave 8 S (1006-2 #2): 本篇 scope's cache was keyed on path+mtime alone
    // — a race with store.addEntry/deleteEntry/restoreEntry/setLiked (none
    // of which touch the note's mtime, or touch it on a different tick
    // than main.ts's own vault.modify for highlighting) could leave it
    // serving a stale set once the word landed in the store. Only redraw
    // when noteScopeSig() says something that could actually change
    // computeNoteScope()'s output changed (count of live entries, or which
    // ones are liked) — a plain field edit (store.touch()) leaves the
    // signature alone, so it still doesn't reorder/redraw the list (#10).
    this.lastListSig = noteScopeSig(this.plugin.store.entries);
    this.register(
      this.plugin.store.events.on("data:changed", () => {
        const sig = noteScopeSig(this.plugin.store.entries);
        if (sig === this.lastListSig) return;
        this.lastListSig = sig;
        // Still invalidate the This-note cache on its own terms (mtime
        // keyed) — only matters in note mode, but harmless either way.
        if ((this.filterMode ?? "note") === "note") this.noteScopeCache = null;
        this.refreshFiltered();
      })
    );
    // Wave 10 S (1007-2 #8/#9/#13): a 字族樹／Word DNA block republished
    // (new groups, a different activeGroupKey, a word added/removed) —
    // redraw the filtered sections the same way any other scope change
    // does. No mode check: harmless (and cheap) outside page mode too.
    this.register(
      this.plugin.pageContext.events.on("changed", (ctx) => {
        this.refreshFiltered();
        this.flashFocusWord(ctx);
      })
    );
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
    // 1007-2 #10: resolved off the active file alone (not gated by the
    // currently-selected tab, unlike currentPage() below) — clicking a
    // page's own word must land on 本篇's page mode even if All was
    // selected before.
    const page = this.pageContextForActive();
    const plan = planReveal({
      filterMode: this.filterMode,
      activePath: this.app.workspace.getActiveFile()?.path ?? null,
      entry,
      page: page
        ? { groups: page.groups.map((g) => ({ key: g.key, entryIds: pageGroupEntryIds(g) })), activeGroupKey: page.activeGroupKey }
        : undefined,
    });
    this.filterMode = plan.filterMode;
    if (plan.openGroup) {
      if (plan.filterMode === "note") this.pageCollapsed.delete(plan.openGroup);
      else this.collapsedGroups.delete(plan.openGroup);
    }
    this.sections.set("words", false);
    const state = this.expandState.get(entry.id);
    if (state === undefined || state === "collapsed") this.expandState.set(entry.id, "half");
    if (tab) this.wordUi.tabs.set(entry.id, tab);
    this.pendingWord = "";
    this.router.back();
    this.draw();
    this.flashRow(entry.id);
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

  // 1009 #8: the page (字族樹／星系) asked the sidebar to point at one word
  // — a star/node tap on a suggested word republishes PageContext with
  // focusWord set. Runs after refreshFiltered() so the row already exists
  // in the DOM. Tracked words render through renderVocabRow
  // (data-entry-id); suggested ones through pageGroups.ts's own
  // data-word attribute (no entry yet).
  private flashFocusWord(ctx: PageContext | null): void {
    const word = ctx?.focusWord?.toLowerCase() || null;
    if (!word) {
      this.lastFocusWord = null;
      return;
    }
    if (word === this.lastFocusWord) return; // same word already flashed
    this.lastFocusWord = word;
    const root = this.scrollRoot();
    if (!root) return;
    const entry = this.findEntry(word);
    const el = entry
      ? root.querySelector<HTMLElement>(`.vt-row[data-entry-id="${CSS.escape(entry.id)}"]`)
      : root.querySelector<HTMLElement>(`.vt-row[data-word="${CSS.escape(word)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    el.removeClass("is-flash");
    el.addClass("is-flash");
    window.setTimeout(() => el.removeClass("is-flash"), FOCUS_FLASH_MS);
  }

  // Called by main.ts whenever something that affects the exam chips
  // changed (a scan finished, a chip was toggled, the note was edited).
  // Since those are exactly the things the 單字／AI 討論／文法 filter also
  // depends on now (#6, #7, #9), this also recomputes 本篇 scope and
  // redraws the filtered sections — surgically (redrawWords() etc.), never
  // the whole sidebar (#10).
  refreshExamStrip() {
    // redrawWords() (inside refreshFiltered) rebuilds the chips too — it
    // owns examStripEl and recreates it fresh each time, so there's no
    // separate "just redraw the strip" step here (that would recurse:
    // drawWords() already calls renderExamStrip() directly, not through
    // this method).
    this.refreshFiltered();
  }

  // ── isListed / 本篇 scope (#6, #7, #9) ───────────────────────────────────

  private isListedCtx(): IsListedContext {
    const knownTags = this.plugin.wordlists.index.tags;
    const settings = resolveWordlistSettings(this.plugin.store.settings.wordlists);
    return {
      knownTags,
      isTagOn: (tag) => tagEnabled(settings, tag),
      likeOn: likeChipOn(settings),
    };
  }

  // Wave 8 S (1006-2 #4): the Like chip's own number — 本篇＝liked words in
  // `scope`'s note-scope set (noteScopeFor's cache, or its source-note
  // fallback while that's still loading — same two cases scopedEntries()
  // already juggles); 全部＝every liked word in the library. Pure counting
  // lives in noteScope.ts's likeCountInScope(); this just resolves which
  // ids Set (or null for 全部) that function should use.
  private likeCountFor(scope: "note" | "all", activeFile: TFile | null): number {
    if (scope === "all" || !(activeFile instanceof TFile)) {
      return likeCountInScope(this.plugin.store.entries, null);
    }
    const noteScope = this.noteScopeFor(activeFile);
    if (noteScope) return likeCountInScope(this.plugin.store.entries, noteScope);
    const fallback = new Set(
      this.plugin.store.entries.filter((e) => e.source?.path === activeFile.path).map((e) => e.id)
    );
    return likeCountInScope(this.plugin.store.entries, fallback);
  }

  // Cached "this note has this word" set; null while it's still loading
  // (the caller should fall back to a provisional guess, see scopedEntries).
  private noteScopeFor(file: TFile): Set<string> | null {
    const cache = this.noteScopeCache;
    if (cache && cache.path === file.path && cache.mtime === file.stat.mtime) return cache.ids;
    void this.loadNoteScope(file);
    return null;
  }

  private async loadNoteScope(file: TFile): Promise<void> {
    const seq = ++this.noteScopeSeq;
    const hits = this.plugin.wordlists.cachedScan(file.path, file.stat.mtime)?.hits ?? [];
    let text: string | null;
    try {
      text = await this.plugin.notes.read(file.path);
    } catch {
      text = null;
    }
    if (seq !== this.noteScopeSeq) return; // superseded by a newer note/scope load
    const inflections = resolveWordlistSettings(this.plugin.store.settings.wordlists).inflections;
    const ids = computeNoteScope(this.plugin.store.entries, hits, text, inflections);
    // (1009 #10): the word's own tracked source is this note → always in
    // scope, even when computeNoteScope's text-tokenizer doesn't literally
    // find it (punctuation/markdown edge cases, a race with the highlight
    // wrap just written to the note, …). Without this, a word just added
    // from reading mode can flash into view via the loading-time fallback
    // below and then vanish once this "real" scope lands and disagrees
    // with it — which reads as "it never showed up".
    for (const e of this.plugin.store.entries) {
      if (!e.deletedAt && e.source?.path === file.path) ids.add(e.id);
    }
    this.noteScopeCache = { path: file.path, mtime: file.stat.mtime, sig: noteScopeSig(this.plugin.store.entries), ids };
    if (this.app.workspace.getActiveFile()?.path !== file.path) return;
    if ((this.filterMode ?? "note") !== "note") return;
    this.refreshFiltered();
  }

  // 1007-2 #8/#10/#13/#14: the page (字族樹／Word DNA) for the file in
  // front, regardless of which 本篇／全部 tab is selected right now — used
  // by revealEntry/setWord, which must land on 本篇's page mode even from
  // All (#10).
  private pageContextForActive(): PageContext | null {
    return this.plugin.pageContext.for(this.app.workspace.getActiveFile()?.path ?? null);
  }

  // The page, but only when it actually governs the current draw (#8: page
  // mode only replaces 本篇, never 全部).
  private currentPage(): PageContext | null {
    return (this.filterMode ?? "note") === "note" ? this.pageContextForActive() : null;
  }

  // The single source of truth for "which words count" (#7, #8): isListed
  // (like 或亮著的考試標籤)，再加上本篇模式下的 #6 scope. Used by the word
  // list itself, and fed into the AI 討論 / 文法 sections too so every
  // section agrees on what's visible.
  //
  // 1007-2 #8: in page mode this is instead "every word on the page that's
  // in the vocab library" (pageScopedEntries) — AI 討論／文法 scope to the
  // page's own words, not the usual isListed/noteScope rule.
  private scopedEntries(): VocabEntry[] {
    const page = this.currentPage();
    if (page) return pageScopedEntries(page.groups, this.plugin.store.entries);
    const ctx = this.isListedCtx();
    let list = this.plugin.store.entries.filter((e) => isListed(e, ctx));
    const activeFile = this.app.workspace.getActiveFile();
    const noteMode = (this.filterMode ?? "note") === "note" && activeFile instanceof TFile;
    if (noteMode) {
      const file = activeFile as TFile;
      const scope = this.noteScopeFor(file);
      list = scope
        ? list.filter((e) => scope.has(e.id))
        // Scope still loading: the old source-note heuristic tides things
        // over until loadNoteScope() resolves and redraws.
        : list.filter((e) => e.source?.path === file.path);
    }
    return list;
  }

  // Something that only changes which words are allowed (a chip toggled,
  // 本篇 scope resolved) — redraw just the 單字 section's body and refresh
  // the AI 討論 / 文法 sections' own elements. Never the whole sidebar, so
  // scroll position and every other section's state stay put (#10).
  private refreshFiltered(): void {
    this.redrawWords();
    this.refreshWordsCount(); // also covers the folded heading
    this.discussionList?.refresh();
    this.grammarSection?.refresh();
    // Folded: no live component to call .refresh() on, so these instead.
    this.aiRecount?.();
    this.grammarRecount?.();
  }

  private redrawWords(): void {
    if (!this.wordsBodyEl?.isConnected) return;
    this.wordsBodyEl.empty();
    this.drawWords(this.wordsBodyEl);
  }

  // 1007-2 #8: page mode counts every distinct word shown across every
  // category (including the grey suggestions, which scopedEntries() never
  // includes — they have no entryId).
  private wordsCount(): number {
    const page = this.currentPage();
    return page ? uniquePageWordCount(page.groups) : this.scopedEntries().length;
  }

  private refreshWordsCount(): void {
    if (!this.wordsCountEl?.isConnected) return;
    this.wordsCountEl.setText(t("sidebar.section.words.counted", { n: this.wordsCount() }));
  }

  // The contract with R's WordRow (1006report.md #10): a row only calls
  // the `refresh` it was given when it might need to leave the list (an
  // edit that un-likes it and drops every tag, or a delete). This removes
  // just that row and updates the 單字（n）count — never a full redraw, and
  // the scroll position never moves. A row whose edit keeps it listed is
  // R's problem to redraw on its own; this is a no-op for it.
  private handleWordRowChanged(entryId: string): void {
    const stillShown = this.scopedEntries().some((e) => e.id === entryId);
    if (!stillShown) this.removeWordRow(entryId);
  }

  private removeWordRow(entryId: string): void {
    this.rowEl(entryId)?.remove();
    this.wordChips.delete(entryId);
    this.expandState.delete(entryId);
    this.refreshWordsCount();
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
      // The real commit step for drawRow's own runUndoable() (#21) — no
      // Notice here, the undo prompt shown at delete-click time covers it.
      remove: (id) => void this.plugin.threads.deleteThread(id),
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
    this.allNotesList = null;
    this.missingList = null;
    this.discussionList = null;
    this.grammarSection = null;
    this.aiRecount = null;
    this.grammarRecount = null;
    this.examStripEl = null;
    this.wordsBodyEl = null;
    this.wordsCountEl = null;
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

    // 本篇／全部（1006report.md #5）: moved up here, shared by every
    // section below (words/段落討論/AI 討論/文法) instead of living inside
    // the 單字 section.
    this.drawFilterToggle(root);

    this.rebindEl = root.createDiv({ cls: "vt-rebind-banner" });
    this.drawRebindBanner();

    const route = this.router.current;
    if (route.name === "list") {
      this.drawList(root, scope);
    } else {
      this.pane = scope.addChild(new ParagraphThreadPane(root, route, this.plugin, this.wordUi.chat, this.paneNav()));
    }
  }

  private drawFilterToggle(root: HTMLElement): void {
    if (this.filterMode === undefined) this.filterMode = "note";
    const toggle = root.createDiv({ cls: "vt-toggle-group vt-sidebar-filter" });
    const mkToggle = (label: string, mode: FilterMode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label, cls: "vt-toggle-btn" });
      b.toggleClass("is-active", on);
      b.onclick = () => {
        if (this.filterMode === mode) return;
        this.filterMode = mode;
        this.draw();
      };
    };
    mkToggle(t("sidebar.filter.note"), "note");
    mkToggle(t("sidebar.filter.all"), "all");
  }

  private drawList(root: HTMLElement, scope: Component) {
    // ── Preview card for a word that isn't in the library yet ───────
    // (1009-2 #1, replaces the old 「加入單字庫」 banner/button) — the same
    // WordRow a liked:false library word gets; ♥ or the AI tab's first
    // question adds it for real (previewEntry.ts's promotePreview, wired
    // through RowOptions.preview), the x just clears pendingWord.
    if (this.pendingWord) {
      const word = this.pendingWord;
      const wrap = root.createEl("div", { cls: "vt-sidebar-preview" });
      const head = wrap.createEl("div", { cls: "vt-sidebar-preview-head" });
      const dismiss = head.createEl("span", { cls: "vt-close-btn" });
      setIcon(dismiss, "x");
      dismiss.onclick = () => { this.pendingWord = ""; this.render(); };

      const dict = loadPreviewDictionary(this.plugin.dictionary, word, () => {
        if (this.pendingWord.toLowerCase() === word.toLowerCase()) this.render();
      });
      const draft = draftEntry(word);
      if (dict.status === "ready" && dict.data) mergeDictionaryInto(draft, dict.data);
      renderVocabRow(
        this.plugin,
        wrap,
        draft,
        "half",
        () => {},
        () => this.setWord(word),
        {
          ui: this.wordUi,
          variant: "sheet",
          preview: { ctx: {}, dict: dict.data ?? null, status: dict.status },
        }
      );
    }

    // Four foldable sections (1005 回饋 2; Wave 6 W splits 段落討論 and
    // 文法 out): 單字, 段落討論, AI 討論, 文法.
    const wCounter = { el: null as HTMLElement | null };
    const words = this.drawSection(root, "words", t("sidebar.section.words.counted", { n: this.wordsCount() }), wCounter);
    this.wordsCountEl = wCounter.el;
    if (words) {
      this.wordsBodyEl = words;
      this.drawWords(words);
    } else {
      // Folded: the count still shows, and follows store changes (an
      // edit that drops the last tag/like, a word added elsewhere…).
      // Chip toggles and 本篇 scope resolving go through refreshFiltered()
      // (refreshExamStrip), which also calls refreshWordsCount() directly.
      scope.register(this.plugin.store.events.on("data:changed", () => this.refreshWordsCount()));
    }

    const pCounter = { el: null as HTMLElement | null };
    const paragraphs = this.drawSection(root, "paragraphs", t("paragraph.list.title", { n: "…" }), pCounter);
    if (paragraphs) {
      this.drawParagraphs(paragraphs, scope, (n) => pCounter.el?.setText(t("paragraph.list.title", { n })));
    } else {
      // Folded: the count still shows, and follows the note in front (or,
      // in 全部, every note).
      const { threads } = this.plugin;
      const recount = () => {
        if (!pCounter.el?.isConnected) return;
        const n = (this.filterMode ?? "note") === "all" ? this.allNotesParagraphCount() : this.currentNoteParagraphCount();
        pCounter.el.setText(t("paragraph.list.title", { n }));
      };
      scope.register(threads.events.on("thread:upsert", recount));
      scope.register(threads.events.on("threads:reloaded", recount));
      void threads.ensureLoaded().then(recount);
    }

    const counter = { el: null as HTMLElement | null };
    const ai = this.drawSection(root, "ai", t("sidebar.section.ai", { n: "…" }), counter);
    if (ai) {
      const { threads } = this.plugin;
      this.discussionList = scope.addChild(
        new DiscussionList(
          ai,
          { threads, entries: () => this.scopedEntries() },
          {
            openWord: (entryId) => this.openWord(entryId, "ai"),
            counted: (n) => counter.el?.setText(t("sidebar.section.ai", { n })),
          },
          this.discussionView
        )
      );
    } else {
      // Folded: the count still shows, and follows new discussions (and
      // noteScope/chip changes via refreshFiltered() → this.aiRecount).
      const { threads } = this.plugin;
      const recount = () => {
        if (!counter.el?.isConnected) return;
        const n = discussionRows(threads, this.scopedEntries()).length;
        counter.el.setText(t("sidebar.section.ai", { n }));
      };
      this.aiRecount = recount;
      scope.register(threads.events.on("thread:upsert", recount));
      scope.register(threads.events.on("threads:reloaded", recount));
      void threads.ensureLoaded().then(recount);
    }

    const gCounter = { el: null as HTMLElement | null };
    const grammar = this.drawSection(root, "grammar", t("sidebar.section.grammar", { n: "…" }), gCounter);
    if (grammar) {
      this.grammarSection = scope.addChild(
        new GrammarSection(
          grammar,
          { verbs: this.scopedVerbs(), learn: this.plugin.learn },
          {
            openWord: (entryId) => void this.plugin.openWordPage(entryId),
            viewAll: () => void this.plugin.openEntryFile("verbs"),
            counted: (n) => gCounter.el?.setText(t("sidebar.section.grammar", { n })),
          }
        )
      );
    } else {
      // Folded: the count still shows, and follows new/saved usages (and
      // noteScope/chip changes via refreshFiltered() → this.grammarRecount).
      const { verbs, learn } = this.plugin;
      const recount = () => {
        if (!gCounter.el?.isConnected) return;
        const n = verbUsageRows(this.scopedVerbs().verbs(), (id) => learn.verbFavorite(id)).length;
        gCounter.el.setText(t("sidebar.section.grammar", { n }));
      };
      this.grammarRecount = recount;
      scope.register(verbs.events.on("verb:usage", recount));
      scope.register(learn.events.on("verbFavorite:upsert", recount));
      scope.register(learn.events.on("learn:reloaded", recount));
      void learn.ensureLoaded().then(recount);
    }
  }

  // 動詞用法（文法區）也套第 7 點的篩選（1006report.md #7, #8）: a live
  // wrapper (not a snapshot) so GrammarSection.refresh() always sees the
  // current scope without the sidebar having to recreate it.
  private scopedVerbs(): GrammarSectionDeps["verbs"] {
    const { verbs } = this.plugin;
    return {
      verbs: () => {
        const allowed = new Set(this.scopedEntries().map((e) => e.id));
        return verbs.verbs().filter((e) => allowed.has(e.id));
      },
      events: verbs.events,
    };
  }

  // The active note's live paragraph threads — the 段落討論 section's
  // count while it's folded (unfolded, ParagraphThreadList reports its
  // own row count via onCount instead).
  private currentNoteParagraphCount(): number {
    const path = this.plugin.app.workspace.getActiveFile()?.path;
    return path ? this.plugin.threads.paragraphThreads(path).length : 0;
  }

  // 全部模式下 folded 段落討論 的計數（規格 #8）：每一篇現存筆記的段落討
  // 論，不含筆記已刪除/移走的那些（那些另外算在孤立清單裡）。
  private allNotesParagraphCount(): number {
    return this.plugin.threads
      .paragraphThreads()
      .filter((th) => th.anchor.kind === "paragraph" && this.app.vault.getAbstractFileByPath(th.anchor.path)).length;
  }

  // ── 段落討論（n）/ orphaned discussions ─────────────────────────
  //
  // Independent of the filter the 單字/AI討論/文法 sections use (#7) —
  // 段落討論 never gets篩選 (#8). 本篇: the note in front's discussions
  // (unchanged). 全部: every existing note's discussions, grouped by note
  // (AllNotesThreadList). Either way, discussions whose note is gone are
  // listed separately below and shown in both modes.
  private drawParagraphs(root: HTMLElement, scope: Component, onCount: (n: number) => void): void {
    if ((this.filterMode ?? "note") === "all") {
      this.allNotesList = scope.addChild(
        new AllNotesThreadList(
          root,
          { ...this.listDeps(), exists: (p) => !!this.app.vault.getAbstractFileByPath(p) },
          this.listActions(),
          onCount
        )
      );
    } else {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (activeFile instanceof TFile && activeFile.extension === "md") {
        this.paragraphList = scope.addChild(
          new ParagraphThreadList(root, activeFile.path, this.listDeps(), this.listActions(), undefined, onCount)
        );
      } else {
        onCount(0);
        root.createDiv({ cls: "vt-sidebar-hint", text: t("sidebar.paragraphs.noNote") });
      }
    }
    this.missingList = scope.addChild(
      new MissingNoteThreadList(
        root,
        { ...this.listDeps(), exists: (p) => !!this.app.vault.getAbstractFileByPath(p) },
        this.listActions()
      )
    );
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

  // Shared row options every drawWords() path uses (dashboard-equivalent
  // decorateWord/openWordPage/locate) — pageGroups.ts spreads these and
  // adds its own page-specific bits (levelInHead/dimUnliked/…) per row.
  private baseRowOpts(): RowOptions {
    return {
      ui: this.wordUi,
      // ✦ n after the word (design D1); the dashboard doesn't pass this.
      decorateWord: (wrap, entry) => {
        const chip = wrap.createSpan({ cls: "vt-word-tc" });
        this.wordChips.set(entry.id, chip);
        this.drawWordChip(chip, entry.id);
      },
      openWordPage: (entry: VocabEntry) => void this.plugin.openWordPage(entry.id),
      locate: (entry: VocabEntry) => void this.plugin.locator.locate(entry),
    };
  }

  // 1007-2 #8/#13: resets pageCollapsed to "only the page's active group
  // open" whenever that group changes (topic switched on 字族樹, tab
  // switched on Word DNA) — a no-op otherwise, so a manual expand/collapse
  // in between survives unrelated redraws (chip toggles, other words
  // edited elsewhere…).
  private syncPageCollapse(page: PageContext): void {
    if (page.activeGroupKey === this.lastActiveGroupKey) return;
    this.lastActiveGroupKey = page.activeGroupKey;
    this.pageCollapsed = resetPageCollapsed(page.groups, page.activeGroupKey);
  }

  // 本篇／全部已經移到側欄頂端共用（#5）；這裡只決定「哪些字」：isListed
  // 的字（#7），本篇模式再疊上「這篇有出現」的 scope（#6）—— scopedEntries()
  // 是兩邊唯一的篩選依據，跟 AI討論／文法共用。
  //
  // 1007-2 #8: on a 字族樹／Word DNA page, 本篇 becomes page mode instead —
  // no exam strip, grouped by the page's own topics/morpheme kinds via
  // renderPageGroups() rather than the usual flat/by-source-note list.
  private drawWords(root: HTMLElement) {
    const page = this.currentPage();
    if (page) {
      this.syncPageCollapse(page);
      this.examStripEl = null;
      renderPageGroups(root, {
        plugin: this.plugin,
        page,
        pageCollapsed: this.pageCollapsed,
        expandState: this.expandState,
        busy: this.pageBusy,
        rowOpts: this.baseRowOpts(),
        onToggleGroup: () => this.redrawWords(),
        onRowRemoved: (entryId) => (entryId ? this.handleWordRowChanged(entryId) : this.redrawWords()),
        onBusyChange: () => this.redrawWords(),
      });
      return;
    }

    const activeFile = this.plugin.app.workspace.getActiveFile();
    const noteMode = (this.filterMode ?? "note") === "note" && !!activeFile;
    const list = this.scopedEntries();

    // Exam-tag chips (規劃書 03；1006report.md #5: the "本篇考試字彙 · 全文
    // N 個不同的字" title and the old "(99)" count label above this are
    // both gone — just the chips now, at the top of this section). Drawn
    // directly here (not through refreshExamStrip(), which redraws this
    // whole section — calling it from inside itself would recurse).
    this.examStripEl = root.createDiv();
    renderExamStrip(this.examStripEl, this.plugin, activeFile, this.filterMode ?? "note", (scope) =>
      this.likeCountFor(scope, activeFile)
    );

    if (list.length === 0) {
      root.createEl("div", {
        text: noteMode ? t("sidebar.hint.noteEmpty") : t("sidebar.hint.allEmpty"),
        cls: "vt-sidebar-hint",
      });
    } else {
      const listEl = root.createEl("div", { cls: "vt-word-list" });
      const rowOpts: RowOptions = this.baseRowOpts();
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
          (entryId) => (entryId ? this.handleWordRowChanged(entryId) : this.redrawWords()),
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
            () => this.handleWordRowChanged(entry.id),
            rowOpts
          );
        }
      }
    }
  }
}

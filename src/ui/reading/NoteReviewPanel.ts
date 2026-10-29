import { Component, MarkdownView, setIcon, TFile, type App } from "obsidian";
import { t } from "../../core/i18n";
import { glossOf } from "../../core/learner/gloss";
import type { VocabEntry } from "../../core/model/entry";
import { resolveWordlistSettings } from "../../core/model/wordlists";
import type { AiService } from "../../services/ai/AiService";
import { noteCustom } from "../../services/ai/tasks/note";
import type { ScenarioService } from "../../services/practice/ScenarioService";
import type { ThreadService } from "../../services/threads/ThreadService";
import type { WordlistService } from "../../services/wordlists/WordlistService";
import type { VocabStore } from "../../core/store/VocabStore";
import type { NoteGlossCache } from "../word/noteGlossCache";
import { ChatPanel, createChatUiState } from "../chat/ChatPanel";
import type { SelectionTracker } from "../chat/SelectionTracker";
import { openPluginSettings } from "../kit/openSettings";
import { mountScenarioPane } from "../blocks/practice/scenarioPane";
import { mountScenarioPlayer } from "../blocks/practice/scenarioPlayer";
import { toPlayerQuestion } from "../blocks/practice/scenarioQuestionView";
import { SCENARIO_MIN_WORDS } from "../blocks/practice/vocabFilterModel";
import { computeNoteScope } from "../sidebar/noteScope";
import { skipsBadges } from "./ParagraphBadges";
import {
  noteVocabRefs,
  parseReviewPrefs,
  renameReviewPrefs,
  REVIEW_STORAGE_KEY,
  reviewPrefsOf,
  serializeReviewPrefs,
  showsReview,
  type ReviewPrefs,
  type ReviewTab,
} from "./noteReviewModel";

// 「複習這篇筆記」(1030 #4): a collapsible panel right under the title of
// the user's own notes (reading view and Live Preview, desktop and iPhone).
// Collapsed it's one line; open it has two tabs — 單字 (the practice hub's
// 情境練習 player, on this note's words only, in its own pool lane) and AI
// 討論 (one whole-note discussion: main idea, structure, free questions).
// Whether it's open and which tab is remembered per note, for good.
//
// Obsidian gives no slot under the title, so the panel's element is placed
// by hand: inside `.mod-header` after the title in reading view, after
// `.inline-title` (or before the content) in the editor, and moved along
// when the mode changes.

export interface NoteReviewHost {
  app: App;
  store: Pick<VocabStore, "entries" | "events" | "settings">;
  threads: ThreadService;
  ai: AiService;
  selection: SelectionTracker;
  wordlists: Pick<WordlistService, "cachedScan">;
  notes: { read(path: string): Promise<string | null> };
  noteGlosses: NoteGlossCache;
  learner: { ensureLoaded(): Promise<void>; events: { on(e: "gloss:change", fn: () => void): () => void } };
  manifest: { id: string };
  frontmatterOf(path: string): Record<string, unknown> | null | undefined;
  noteScenario(path: string): ScenarioService;
}

const SETTLE_MS = 120;
const PANEL_CLS = "vt-note-review";

interface Eligibility {
  key: string; // path + mtime + data signature
  show: boolean;
  scope: Set<string>;
}

export class NoteReviewPanels {
  private panels = new Map<MarkdownView, ReviewPanel>();
  private timer: number | null = null;
  private eligible = new Map<string, Eligibility>();
  private prefs: Map<string, ReviewPrefs>;
  private disposed = false;

  constructor(private host: NoteReviewHost) {
    this.prefs = parseReviewPrefs(host.app.loadLocalStorage(REVIEW_STORAGE_KEY));
  }

  attach(owner: Component): void {
    const { workspace, metadataCache, vault } = this.host.app;
    const later = () => this.schedule();
    owner.registerEvent(workspace.on("file-open", later));
    owner.registerEvent(workspace.on("layout-change", later));
    owner.registerEvent(workspace.on("active-leaf-change", later));
    owner.registerEvent(metadataCache.on("changed", later));
    owner.registerEvent(
      vault.on("rename", (f, oldPath) => {
        if (renameReviewPrefs(this.prefs, oldPath, f.path)) this.savePrefs();
        later();
      })
    );
    owner.register(this.host.store.events.on("data:changed", () => this.invalidate()));
    owner.register(this.host.threads.events.on("thread:upsert", () => this.invalidate()));
    workspace.onLayoutReady(later);
    owner.register(() => this.dispose());
  }

  prefsFor(path: string): ReviewPrefs {
    return reviewPrefsOf(this.prefs, path);
  }

  setPrefs(path: string, p: ReviewPrefs): void {
    this.prefs.set(path, p);
    this.savePrefs();
  }

  private savePrefs(): void {
    this.host.app.saveLocalStorage(REVIEW_STORAGE_KEY, serializeReviewPrefs(this.prefs));
  }

  private invalidate(): void {
    this.eligible.clear();
    this.schedule();
  }

  private schedule(): void {
    if (this.disposed) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, SETTLE_MS);
  }

  private async refresh(): Promise<void> {
    if (this.disposed) return;
    const seen = new Set<MarkdownView>();
    for (const leaf of this.host.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      seen.add(view);
      const file = view.file;
      const el = file ? await this.eligibility(file) : null;
      if (this.disposed) return;
      let panel = this.panels.get(view);
      if (!file || !el?.show) {
        if (panel) this.drop(view, panel);
        continue;
      }
      if (panel && panel.path !== file.path) {
        this.drop(view, panel);
        panel = undefined;
      }
      if (!panel) {
        panel = new ReviewPanel(this.host, this, file.path);
        panel.load();
        this.panels.set(view, panel);
      }
      panel.setScope(el.scope);
      panel.place(view);
    }
    for (const [view, panel] of this.panels) if (!seen.has(view)) this.drop(view, panel);
  }

  private drop(view: MarkdownView, panel: ReviewPanel): void {
    panel.unload();
    this.panels.delete(view);
  }

  // Shown on notes with a word of their own (本篇) or a discussion.
  private async eligibility(file: TFile): Promise<Eligibility | null> {
    if (file.extension !== "md") return null;
    const { store, threads } = this.host;
    await threads.ensureLoaded();
    const discussions = threads.paragraphThreads(file.path).length + (threads.noteThread(file.path) ? 1 : 0);
    const key = `${file.path}\n${file.stat.mtime}\n${store.entries.length}\n${discussions}`;
    const cached = this.eligible.get(file.path);
    if (cached?.key === key) return cached;
    const skip = skipsBadges(this.host.frontmatterOf(file.path));
    let scope = new Set<string>();
    if (!skip) {
      const hits = this.host.wordlists.cachedScan(file.path, file.stat.mtime)?.hits ?? [];
      let text: string | null;
      try {
        text = await this.host.notes.read(file.path);
      } catch {
        text = null;
      }
      const inflections = resolveWordlistSettings(store.settings.wordlists).inflections;
      scope = computeNoteScope(store.entries, hits, text, inflections);
      for (const e of store.entries) if (!e.deletedAt && e.source?.path === file.path) scope.add(e.id);
    }
    const out: Eligibility = { key, show: showsReview({ skip, words: scope.size, discussions }), scope };
    this.eligible.set(file.path, out);
    return out;
  }

  private dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    for (const [view, panel] of this.panels) this.drop(view, panel);
  }
}

class ReviewPanel extends Component {
  readonly root: HTMLElement;
  private body: HTMLElement | null = null;
  private scope = new Set<string>();
  private tabBodies = new Map<ReviewTab, { el: HTMLElement; owner: Component; refresh?: () => void }>();
  private observer: MutationObserver | null = null;
  private view: MarkdownView | null = null;

  constructor(
    private host: NoteReviewHost,
    private panels: NoteReviewPanels,
    readonly path: string
  ) {
    super();
    this.root = createDiv({ cls: ["vt", PANEL_CLS] });
  }

  onload(): void {
    this.draw();
    this.register(this.host.learner.events.on("gloss:change", () => this.tabBodies.get("vocab")?.refresh?.()));
    this.register(() => {
      this.observer?.disconnect();
      this.root.remove();
    });
  }

  setScope(scope: Set<string>): void {
    const changed = scope.size !== this.scope.size || [...scope].some((id) => !this.scope.has(id));
    this.scope = scope;
    if (changed) this.tabBodies.get("vocab")?.refresh?.();
  }

  // Under the title of whichever mode the view shows now.
  place(view: MarkdownView): void {
    this.view = view;
    const target = slotFor(view);
    if (!target) return;
    if (this.root.parentElement !== target.parent || this.root.previousElementSibling !== target.after) {
      if (target.after) target.after.after(this.root);
      else target.parent.prepend(this.root);
    }
    // Reading view re-renders its sizer: put the panel back if it's dropped.
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      if (!this.root.isConnected && this.view) this.place(this.view);
    });
    this.observer.observe(target.parent, { childList: true });
  }

  private prefs(): ReviewPrefs {
    return this.panels.prefsFor(this.path);
  }

  private draw(): void {
    this.root.empty();
    const prefs = this.prefs();
    this.root.toggleClass("is-open", prefs.open);
    const head = this.root.createDiv({ cls: "vt-nr-head", attr: { role: "button", tabindex: "0" } });
    setIcon(head.createSpan({ cls: "vt-nr-arrow" }), prefs.open ? "chevron-down" : "chevron-right");
    head.createSpan({ cls: "vt-nr-title", text: t("noteReview.title") });
    const toggle = () => {
      this.panels.setPrefs(this.path, { ...this.prefs(), open: !this.prefs().open });
      this.draw();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    if (!prefs.open) {
      this.closeTabs();
      return;
    }
    this.body = this.root.createDiv({ cls: "vt-nr-body" });
    const tabs = this.body.createDiv({ cls: ["vt-pr-tabs", "vt-nr-tabs"], attr: { role: "tablist" } });
    const holder = this.body.createDiv({ cls: "vt-nr-tab-body" });
    for (const id of ["vocab", "ai"] as const) {
      const btn = tabs.createEl("button", { cls: ["vt-pr-tab", "vt-nr-tab"], text: t(id === "vocab" ? "noteReview.tab.vocab" : "noteReview.tab.ai") });
      btn.toggleClass("is-active", prefs.tab === id);
      btn.addEventListener("click", () => {
        if (this.prefs().tab === id) return;
        this.panels.setPrefs(this.path, { ...this.prefs(), tab: id });
        this.draw();
      });
    }
    this.closeTabs();
    this.mountTab(prefs.tab, holder);
  }

  private closeTabs(): void {
    for (const { owner } of this.tabBodies.values()) this.removeChild(owner);
    this.tabBodies.clear();
  }

  private mountTab(tab: ReviewTab, holder: HTMLElement): void {
    const owner = this.addChild(new Component());
    const el = holder.createDiv({ cls: `vt-nr-${tab}` });
    const entry: { el: HTMLElement; owner: Component; refresh?: () => void } = { el, owner };
    this.tabBodies.set(tab, entry);
    if (tab === "ai") this.mountAi(el, owner);
    else entry.refresh = this.mountVocab(el, owner);
  }

  // 單字: the practice hub's scenario player alone — no filter bar, no
  // 錯題區 — on this note's words, in this note's own pool lane.
  private mountVocab(el: HTMLElement, owner: Component): () => void {
    el.addClass("vt-learn", "vt-pr");
    const api = this.host.noteScenario(this.path);
    let ready = false;
    const pane = mountScenarioPane(el, {
      track: "vocab",
      api,
      mountPlayer: mountScenarioPlayer,
      owner,
      toPlayer: (q) => toPlayerQuestion(q),
      aiStatus: () => this.host.ai.status(),
      idleText: () => t("noteReview.vocab.few", { n: SCENARIO_MIN_WORDS }),
    });
    const apply = () => {
      if (!ready) return;
      const file = this.host.app.vault.getAbstractFileByPath(this.path);
      const map = file instanceof TFile ? this.host.noteGlosses.get(file.path, file.stat.mtime) : null;
      const refs = noteVocabRefs(this.host.store.entries as VocabEntry[], this.scope, (w) => (map ? glossOf(map, w) : undefined), new Date());
      const req = refs.length >= SCENARIO_MIN_WORDS ? ({ track: "vocab", words: refs } as const) : null;
      pane.setRequest(req, req ? new Set(this.scope) : new Set());
    };
    owner.register(this.host.noteGlosses.onReady((p) => p === this.path && apply()));
    void this.host.learner.ensureLoaded().then(() => {
      ready = true;
      apply();
    });
    return apply;
  }

  // AI 討論: the note's whole-article discussion.
  private mountAi(el: HTMLElement, owner: Component): void {
    const { threads } = this.host;
    const chat = new ChatPanel(el, {
      app: this.host.app,
      threads,
      ai: this.host.ai,
      selection: this.host.selection,
      threadId: threads.noteThreadId(this.path),
      surface: "note",
      customTaskId: noteCustom.id,
      sourcePath: this.path,
      placeholder: t("noteReview.ai.placeholder"),
      state: createChatUiState(),
      attachSelection: false,
      send: async (req) => {
        await threads.askNote(this.path, { taskId: req.taskId, question: req.question });
      },
      retry: (turnId) => threads.retryNote(this.path, turnId),
      onOpenSettings: () => openPluginSettings(this.host.app, this.host.manifest.id),
    });
    owner.addChild(chat);
  }
}

// Where the panel goes in the view's current mode.
function slotFor(view: MarkdownView): { parent: HTMLElement; after: Element | null } | null {
  if (view.getMode() === "preview") {
    // Inside the header, not beside it: reading view lays its sections out
    // by heights it measured itself, so an element of ours between header and
    // sections pulled the scroll back by its height each time sections were
    // swapped in (1030: the jolt at headings).
    const header = view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer > .mod-header");
    if (!header) return null;
    return { parent: header, after: header.querySelector(":scope > .inline-title") };
  }
  const sizer = view.containerEl.querySelector<HTMLElement>(".markdown-source-view .cm-sizer");
  if (!sizer) return null;
  return { parent: sizer, after: sizer.querySelector(":scope > .inline-title") };
}

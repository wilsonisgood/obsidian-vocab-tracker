import { Component, Notice, TFile, setIcon, type App } from "obsidian";
import { t } from "../../core/i18n";
import type { NoteReaderPort } from "../../core/ports";
import type { VocabStore } from "../../core/store/VocabStore";
import { plainParagraph, splitParagraphSpans } from "../../core/text/paragraphs";
import type { AiService } from "../../services/ai/AiService";
import { paragraphCustom } from "../../services/ai/tasks/paragraph";
import { AnchorError, type AnchorResolution, type ParagraphAnchor, type SectionRef } from "../../services/anchors/ParagraphAnchorService";
import type { ThreadService } from "../../services/threads/ThreadService";
import { ChatPanel, type ChatSend, type ChatUiState } from "../chat/ChatPanel";
import type { SelectionTracker } from "../chat/SelectionTracker";
import { inlineNote } from "../kit/inlineNote";
import { openPluginSettings } from "../kit/openSettings";
import { needsBlockIdNotice, patchAnchorSettings, resolveAnchorSettings } from "./anchorSettings";
import { confirmButton } from "./ParagraphThreadList";
import { paragraphNumberAt } from "./paragraphRows";
import { routeKey, type SidebarRoute } from "./routes";

// One paragraph's discussion in the sidebar (規劃書 06 §9.4, design D5):
// back button, the paragraph quoted, status notes (原文已修改 / 孤立 /
// hash 模式 / the one-time block id explanation) and a ChatPanel on the
// paragraph surface.
//
// Its parts update in place: the header and notes re-resolve the anchor
// when the thread or the note changes; the ChatPanel updates itself. The
// sidebar only rebuilds the pane when the route changes.

// What the pane needs from the plugin (VocabTrackerPlugin satisfies it).
export interface ParagraphPaneHost {
  app: App;
  threads: ThreadService;
  ai: AiService;
  selection: SelectionTracker;
  notes: NoteReaderPort;
  store: VocabStore;
  manifest: { id: string };
  // The article's 討論串/<文章>.ai.md, when it exists (M6 ExportService).
  exporter: { aiNotePath(articlePath: string): Promise<string | null> };
  openNote(path: string, where?: "current" | "tab"): Promise<void>;
}

export interface ParagraphPaneNav {
  back(): void;
  // A draft's first question created this thread.
  threadStarted(section: SectionRef, threadId: string): void;
  rebind(threadId: string): void;
  removed(threadId: string): void;
}

type PaneRoute = Extract<SidebarRoute, { name: "paragraph" | "paragraph-draft" }>;

export class ParagraphThreadPane extends Component {
  private root: HTMLElement;
  private titleEl!: HTMLElement;
  private quoteEl!: HTMLElement;
  private notesEl!: HTMLElement;
  private noticeEl: HTMLElement | null = null;
  private aiNoteEl!: HTMLElement;
  private seq = 0;
  private aiNoteSeq = 0;
  private alive = false;
  // Where the quote jumps to.
  private target: { path: string; line: number } | null = null;

  constructor(
    parent: HTMLElement,
    readonly route: PaneRoute,
    private host: ParagraphPaneHost,
    private chatState: ChatUiState,
    private nav: ParagraphPaneNav
  ) {
    super();
    this.root = parent.createDiv({ cls: "vt-ppane" });
  }

  get key(): string {
    return routeKey(this.route);
  }

  private get threadId(): string | null {
    return this.route.name === "paragraph" ? this.route.threadId : null;
  }

  // The note this pane is about (for the sidebar's modify listener).
  get path(): string | null {
    if (this.route.name === "paragraph-draft") return this.route.section.path;
    const th = this.host.threads.get(this.route.threadId);
    return th?.anchor.kind === "paragraph" ? th.anchor.path : null;
  }

  onload(): void {
    this.alive = true;
    this.register(() => (this.alive = false));
    this.renderShell();

    const id = this.threadId;
    if (id) {
      const { threads } = this.host;
      this.register(
        threads.events.on("thread:upsert", (th) => {
          if (th.id !== id) return;
          // Deleted (here, or by a synced device): nothing left to show.
          if (th.deletedAt) return this.nav.removed(id);
          void this.refreshStatus();
        })
      );
      this.register(
        threads.events.on("threads:reloaded", () => {
          if (!threads.get(id)) return this.nav.removed(id);
          void this.refreshStatus();
        })
      );
    }
    void this.refreshStatus();

    // The .ai.md is written a moment after an answer (debounced export),
    // so the link also follows that note being created, renamed or deleted.
    const { vault } = this.host.app;
    const onNote = (path: string) => {
      if (/\.ai\.md$/i.test(path)) void this.refreshAiNote();
    };
    this.registerEvent(vault.on("create", (f) => onNote(f.path)));
    this.registerEvent(vault.on("rename", (f) => onNote(f.path)));
    this.registerEvent(vault.on("delete", (f) => onNote(f.path)));
  }

  // ── Static parts ───────────────────────────────────────────────────────
  private renderShell(): void {
    const back = this.root.createDiv({ cls: "vt-ppane-back" });
    back.setAttr("role", "button");
    back.setAttr("tabindex", "0");
    back.setAttr("aria-label", t("paragraph.pane.back"));
    setIcon(back.createSpan({ cls: "vt-ppane-back-icon" }), "arrow-left");
    back.createSpan({ text: t("sidebar.filter.note") });
    back.addEventListener("click", () => this.nav.back());
    back.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.nav.back();
    });

    const head = this.root.createDiv({ cls: "vt-ppane-head" });
    this.titleEl = head.createSpan({ cls: "vt-ppane-title", text: t("paragraph.pane.titleNoNumber") });
    const id = this.threadId;
    if (id) {
      const del = head.createSpan({ cls: "vt-ppane-delete clickable-icon" });
      setIcon(del, "trash-2");
      del.setAttr("aria-label", t("paragraph.pane.delete"));
      // Same in-place confirmation as the list's delete button.
      let armed = false;
      del.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          del.addClass("mod-warning");
          del.setAttr("aria-label", t("paragraph.action.confirmDelete"));
          window.setTimeout(() => {
            armed = false;
            del.removeClass("mod-warning");
            del.setAttr("aria-label", t("paragraph.pane.delete"));
          }, 3000);
          return;
        }
        void this.host.threads.deleteThread(id).then(() => new Notice(t("paragraph.deleted")));
      });
    }

    this.quoteEl = this.root.createDiv({ cls: "vt-ppane-quote" });
    this.quoteEl.setAttr("aria-label", t("paragraph.pane.jump"));
    this.quoteEl.addEventListener("click", () => void this.jump());
    if (this.route.name === "paragraph-draft") {
      this.quoteEl.setText(plainParagraph(this.route.section.text));
      this.target = { path: this.route.section.path, line: this.route.section.lineStart };
    } else {
      const anchor = this.anchor();
      if (anchor) this.quoteEl.setText(anchor.snapshot);
    }

    this.notesEl = this.root.createDiv({ cls: "vt-ppane-notes" });
    if (this.route.name === "paragraph-draft") this.renderBlockIdNotice(this.route.section);

    this.renderChat(this.root.createDiv({ cls: "vt-ppane-chat" }));

    this.aiNoteEl = this.root.createDiv({ cls: "vt-ppane-ainote" });
    this.aiNoteEl.setAttr("role", "button");
    this.aiNoteEl.setAttr("tabindex", "0");
  }

  // 「開啟 討論串/<文章>.ai.md」 under the chat (design D5): only when the
  // article's note exists.
  private async refreshAiNote(): Promise<void> {
    const seq = ++this.aiNoteSeq;
    const article = this.path;
    let note: string | null = null;
    if (article) {
      try {
        note = await this.host.exporter.aiNotePath(article);
      } catch (e) {
        console.error("Vocab Tracker: couldn't find the article's .ai.md", e);
      }
    }
    if (!this.alive || seq !== this.aiNoteSeq) return;
    const el = this.aiNoteEl;
    el.empty();
    if (!note) return;
    const path = note;
    setIcon(el.createSpan({ cls: "vt-ppane-ainote-icon" }), "file-text");
    // "討論串/<文章>.ai.md": the folder it's in and its name.
    el.createSpan({ text: t("paragraph.pane.openAiNote", { path: path.split("/").slice(-2).join("/") }) });
    el.onclick = () => void this.host.openNote(path, "tab");
    el.onkeydown = (e) => {
      if (e.key === "Enter") void this.host.openNote(path, "tab");
    };
  }

  private anchor(): ParagraphAnchor | null {
    const id = this.threadId;
    const th = id ? this.host.threads.get(id) : undefined;
    return th?.anchor.kind === "paragraph" ? th.anchor : null;
  }

  // ── First block id write: one-time explanation (§5.1) ─────────────────
  private renderBlockIdNotice(section: SectionRef): void {
    const settings = resolveAnchorSettings(this.host.store.settings);
    if (!needsBlockIdNotice(settings, section.text)) return;
    const el = (this.noticeEl = this.root.createDiv({ cls: "vt-ppane-notice" }));
    el.appendChild(inlineNote({ tone: "info", icon: "hash", text: t("paragraph.notice.blockId") }));
    const bar = el.createDiv({ cls: "vt-ppane-notice-actions" });
    const ok = bar.createEl("button", { cls: "mod-cta", text: t("paragraph.notice.ok") });
    ok.addEventListener("click", () => void this.dismissNotice(false));
    const hash = bar.createEl("button", { text: t("paragraph.notice.useHash") });
    hash.addEventListener("click", () => void this.dismissNotice(true));
  }

  private async dismissNotice(useHash: boolean): Promise<void> {
    this.noticeEl?.remove();
    this.noticeEl = null;
    await this.host.store.updateSettings((s) =>
      patchAnchorSettings(s, useHash ? { mode: "hash", blockIdNoticeSeen: true } : { blockIdNoticeSeen: true })
    );
    if (useHash) new Notice(t("paragraph.notice.hashOn"));
  }

  // ── Chat ───────────────────────────────────────────────────────────────
  private renderChat(el: HTMLElement): void {
    const { app, threads, ai, selection, manifest } = this.host;
    const route = this.route;
    const threadId = route.name === "paragraph" ? route.threadId : this.key;
    const sourcePath = route.name === "paragraph-draft" ? route.section.path : (this.anchor()?.path ?? "");
    this.addChild(
      new ChatPanel(el, {
        app,
        threads,
        ai,
        selection,
        threadId,
        surface: "paragraph",
        customTaskId: paragraphCustom.id,
        sourcePath,
        placeholder: t("paragraph.pane.placeholder"),
        state: this.chatState,
        send: (req) => friendlyErrors(route.name === "paragraph-draft" ? this.sendDraft(route.section, req) : this.sendThread(threadId, req)),
        retry: (turnId) => friendlyErrors(threads.retryParagraph(threadId, turnId)),
        onOpenSettings: () => openPluginSettings(app, manifest.id),
      })
    );
  }

  private async sendThread(threadId: string, req: ChatSend): Promise<void> {
    await this.host.threads.askParagraph({ threadId }, req);
  }

  // The first question about a paragraph: askParagraph writes the anchor
  // and creates the thread, then streams the answer — and only resolves
  // once the answer is done. The thread id is needed as soon as the
  // thread exists, so the pane listens for the new thread's first upsert
  // (it's marked busy before that event fires) and hands over to the real
  // thread's pane, which picks up the stream mid-way.
  private async sendDraft(section: SectionRef, req: ChatSend): Promise<void> {
    const { threads, store } = this.host;
    if (this.noticeEl) {
      // Asking is acknowledging the explanation shown right above.
      this.noticeEl.remove();
      this.noticeEl = null;
      await store.updateSettings((s) => patchAnchorSettings(s, { blockIdNoticeSeen: true }));
    }
    const busyBefore = new Set(threads.paragraphThreads(section.path).filter((th) => threads.isBusy(th.id)).map((th) => th.id));
    let started = false;
    const start = (id: string) => {
      if (started) return;
      started = true;
      off();
      // Out of the emit loop: the hand-over unloads this pane.
      window.setTimeout(() => this.nav.threadStarted(section, id), 0);
    };
    const off = threads.events.on("thread:upsert", (th) => {
      if (th.anchor.kind !== "paragraph" || th.anchor.path !== section.path) return;
      if (threads.isBusy(th.id) && !busyBefore.has(th.id)) start(th.id);
    });
    try {
      const id = await threads.askParagraph(section, req);
      if (id) start(id);
    } finally {
      off();
    }
  }

  // ── Header, quote and notes from where the anchor resolves now ─────────
  async refreshStatus(): Promise<void> {
    void this.refreshAiNote();
    const seq = ++this.seq;
    const route = this.route;
    if (route.name === "paragraph-draft") {
      const content = await this.readNote(route.section.path);
      if (!this.alive || seq !== this.seq || content === null) return;
      const n = paragraphNumberAt(splitParagraphSpans(content), route.section.lineStart);
      this.titleEl.setText(t("paragraph.pane.title", { n }));
      return;
    }
    let where: AnchorResolution | null = null;
    try {
      where = await this.host.threads.paragraphStatus(route.threadId);
    } catch (e) {
      console.error("Vocab Tracker: couldn't resolve a paragraph anchor", e);
    }
    if (!this.alive || seq !== this.seq) return;
    const anchor = this.anchor();
    if (!anchor) return;
    this.notesEl.empty();
    if (where?.status === "found") {
      const n = paragraphNumberAt(splitParagraphSpans(where.content), where.section.lineStart);
      this.titleEl.setText(t("paragraph.pane.title", { n }));
      this.quoteEl.setText(plainParagraph(where.section.text));
      this.quoteEl.removeClass("is-orphan");
      this.target = { path: anchor.path, line: where.section.lineStart };
      if (where.edited) this.notesEl.appendChild(inlineNote({ tone: "info", icon: "file-diff", text: t("paragraph.pane.edited") }));
      if (!anchor.blockId) this.notesEl.appendChild(inlineNote({ tone: "info", icon: "hash", text: t("paragraph.pane.hashAnchor") }));
      return;
    }
    this.titleEl.setText(t("paragraph.pane.titleNoNumber"));
    this.quoteEl.setText(anchor.snapshot);
    this.quoteEl.addClass("is-orphan");
    this.target = null;
    const missingFile = where?.status === "orphan" && where.reason === "missing-file";
    const note = inlineNote({ tone: "error", icon: "unlink", text: t(missingFile ? "paragraph.pane.orphanFile" : "paragraph.pane.orphanParagraph") });
    this.notesEl.appendChild(note);
    const bar = this.notesEl.createDiv({ cls: "vt-plist-actions" });
    const rebind = bar.createEl("button", { cls: "vt-plist-action", text: t("paragraph.action.rebind") });
    const id = route.threadId;
    rebind.addEventListener("click", () => this.nav.rebind(id));
    confirmButton(bar, t("paragraph.action.delete"), t("paragraph.action.confirmDelete"), () => {
      void this.host.threads.deleteThread(id).then(() => new Notice(t("paragraph.deleted")));
    });
  }

  private async readNote(path: string): Promise<string | null> {
    try {
      return await this.host.notes.read(path);
    } catch {
      return null;
    }
  }

  // Opens the note at the paragraph — in the pane that already shows it,
  // if there is one.
  private async jump(): Promise<void> {
    const target = this.target;
    if (!target) return;
    const { workspace, vault } = this.host.app;
    const file = vault.getAbstractFileByPath(target.path);
    if (!(file instanceof TFile)) return;
    const leaf =
      workspace.getLeavesOfType("markdown").find((l) => (l.view as { file?: TFile | null }).file?.path === target.path) ??
      workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: target.line } });
    workspace.revealLeaf(leaf);
  }
}

// AnchorError's codes aren't sentences; ChatPanel shows the message as is.
async function friendlyErrors(p: Promise<void>): Promise<void> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AnchorError && e.code === "not-anchorable") throw new Error(t("paragraph.error.notAnchorable"), { cause: e });
    throw e;
  }
}

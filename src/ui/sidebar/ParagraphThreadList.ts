import { Component, setIcon } from "obsidian";
import type { Thread } from "../../core/model/thread";
import type { NoteReaderPort } from "../../core/ports";
import { t, type I18nKey } from "../../core/i18n";
import type { ThreadService } from "../../services/threads/ThreadService";
import { paragraphRows, shortDate, threadsWithMissingNote, type ParagraphRow } from "./paragraphRows";
import { L } from "./strings";

// The This note tab's 「段落討論（n）」 list (規劃書 06 §9.4, design D1),
// and the All tab's list of discussions whose note is gone (§4.6). Each
// owns its element and redraws only itself — on its own threads' events,
// or when the sidebar says the note changed — never the word list above.

export interface ParagraphListActions {
  open(threadId: string): void;
  // 重新綁定 / 刪除, offered on orphaned rows.
  rebind(threadId: string): void;
  remove(threadId: string): void;
}

export interface ParagraphListDeps {
  threads: ThreadService;
  notes: NoteReaderPort;
  // Task id → label i18n key (ai.tasks.get(id)?.label).
  taskLabel(taskId: string): string | undefined;
}

function rowMeta(row: ParagraphRow): string {
  const parts = row.labels.map((key) => t(key as I18nKey));
  parts.push(L("paragraph.list.count", { n: row.count }));
  const date = shortDate(row.lastAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

// Delete asks once more in place (the button turns into 「確定刪除？」)
// rather than opening a modal, which is awkward in a narrow sidebar.
export function confirmButton(parent: HTMLElement, label: string, confirmLabel: string, onConfirm: () => void): HTMLElement {
  const btn = parent.createEl("button", { cls: "vt-plist-action", text: label });
  let armed = false;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      btn.setText(confirmLabel);
      btn.addClass("mod-warning");
      return;
    }
    onConfirm();
  });
  btn.addEventListener("blur", () => {
    armed = false;
    btn.setText(label);
    btn.removeClass("mod-warning");
  });
  return btn;
}

function orphanActions(parent: HTMLElement, threadId: string, actions: ParagraphListActions): void {
  const bar = parent.createDiv({ cls: "vt-plist-actions" });
  const rebind = bar.createEl("button", { cls: "vt-plist-action", text: L("paragraph.action.rebind") });
  rebind.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.rebind(threadId);
  });
  confirmButton(bar, L("paragraph.action.delete"), L("paragraph.action.confirmDelete"), () => actions.remove(threadId));
}

function drawRow(parent: HTMLElement, row: ParagraphRow, actions: ParagraphListActions, current: boolean, note?: string): void {
  const el = parent.createDiv({ cls: "vt-plist-row" });
  el.toggleClass("is-current", current);
  el.toggleClass("is-orphan", row.orphan);
  el.setAttr("role", "button");
  el.setAttr("tabindex", "0");
  el.addEventListener("click", () => actions.open(row.threadId));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") actions.open(row.threadId);
  });

  const title = el.createDiv({ cls: "vt-plist-text" });
  if (row.number !== null) title.createSpan({ cls: "vt-plist-num", text: `¶${row.number}` });
  title.createSpan({ text: row.preview });
  title.title = row.preview;

  const meta = el.createDiv({ cls: "vt-plist-meta" });
  setIcon(meta.createSpan({ cls: "vt-plist-meta-icon" }), "sparkles");
  meta.createSpan({ text: rowMeta(row) });
  if (row.orphan) meta.createSpan({ cls: "vt-plist-flag is-orphan", text: L("paragraph.list.orphan") });
  else if (row.edited) meta.createSpan({ cls: "vt-plist-flag", text: L("paragraph.list.edited") });
  if (note) el.createDiv({ cls: "vt-plist-path", text: note });

  if (row.orphan) orphanActions(el, row.threadId, actions);
}

// ── This note: 段落討論（n） ─────────────────────────────────────────────
export class ParagraphThreadList extends Component {
  private el: HTMLElement;
  private seq = 0;
  private alive = false;
  // Threads drawn last time.
  private mine = new Set<string>();

  constructor(
    parent: HTMLElement,
    private path: string,
    private deps: ParagraphListDeps,
    private actions: ParagraphListActions,
    private currentThreadId: () => string | null = () => null
  ) {
    super();
    this.el = parent.createDiv({ cls: "vt-plist" });
  }

  get notePath(): string {
    return this.path;
  }

  onload(): void {
    this.alive = true;
    this.register(() => (this.alive = false));
    const { threads } = this.deps;
    // Only this note's paragraph threads (or one that just moved away from
    // it — a rebind or rename) redraw the list.
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind !== "paragraph") return;
        if (th.anchor.path === this.path || this.mine.has(th.id)) void this.refresh();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => void this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }

  // Re-reads the note (paragraph positions, edits) and redraws the list.
  // Called by the sidebar when the note is modified.
  async refresh(): Promise<void> {
    const seq = ++this.seq;
    const threads = this.deps.threads.paragraphThreads(this.path);
    let content: string | null = null;
    if (threads.length) {
      try {
        content = await this.deps.notes.read(this.path);
      } catch {
        content = null;
      }
    }
    if (!this.alive || seq !== this.seq) return;
    this.mine.clear();
    for (const th of threads) this.mine.add(th.id);
    this.draw(paragraphRows(threads, content, (id) => this.deps.taskLabel(id)));
  }

  private draw(rows: ParagraphRow[]): void {
    this.el.empty();
    const head = this.el.createDiv({ cls: "vt-plist-head" });
    head.createSpan({ text: L("paragraph.list.title", { n: rows.length }) });
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: L("paragraph.list.hint") });
      return;
    }
    const current = this.currentThreadId();
    for (const row of rows) drawRow(this.el, row, this.actions, row.threadId === current);
  }
}

// ── All: discussions whose note was deleted or moved away ───────────────
export class MissingNoteThreadList extends Component {
  private el: HTMLElement;
  private alive = false;

  constructor(
    parent: HTMLElement,
    private deps: ParagraphListDeps & { exists(path: string): boolean },
    private actions: ParagraphListActions
  ) {
    super();
    this.el = parent.createDiv({ cls: "vt-plist" });
  }

  onload(): void {
    this.alive = true;
    this.register(() => (this.alive = false));
    const { threads } = this.deps;
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind === "paragraph") this.refresh();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }

  refresh(): void {
    if (!this.alive) return;
    const orphans: Thread[] = threadsWithMissingNote(this.deps.threads.paragraphThreads(), (p) => this.deps.exists(p));
    this.el.empty();
    if (!orphans.length) return;
    this.el.createDiv({ cls: "vt-plist-head" }).createSpan({ text: L("paragraph.list.orphanTitle", { n: orphans.length }) });
    const rows = paragraphRows(orphans, null, (id) => this.deps.taskLabel(id));
    for (const row of rows) {
      const anchor = orphans.find((x) => x.id === row.threadId)?.anchor;
      const note = anchor?.kind === "paragraph" ? L("paragraph.list.missingNote", { path: anchor.path }) : undefined;
      drawRow(this.el, row, this.actions, false, note);
    }
  }
}

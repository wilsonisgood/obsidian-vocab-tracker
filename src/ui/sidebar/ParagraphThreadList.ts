import { Component, setIcon } from "obsidian";
import type { Thread } from "../../core/model/thread";
import type { NoteReaderPort } from "../../core/ports";
import { t, type I18nKey } from "../../core/i18n";
import type { ThreadService } from "../../services/threads/ThreadService";
import { paragraphRows, shortDate, threadsWithMissingNote, type ParagraphRow } from "./paragraphRows";
import { runUndoable } from "../kit/undoable";
import { noteTitle } from "../word/wordOrder";

// The sidebar's 「段落討論（n）」 list for the note in front (規劃書 06
// §9.4, design D1; Wave 6 W: its own top-level section, no longer nested
// under 單字), and the list of discussions whose note is gone (§4.6). Each
// owns its element and redraws only itself — on its own threads' events,
// or when the sidebar says the note changed — never the word list above.
// The section's own header carries the 「段落討論（n）」 count now, so
// this list only draws rows (or the empty hint), not its own title.

export interface ParagraphListActions {
  open(threadId: string): void;
  // 重新綁定, offered on orphaned rows only.
  rebind(threadId: string): void;
  // The real deletion step (ThreadService.deleteThread) — called once the
  // undo window in drawRow's own runUndoable() runs out; never shows its
  // own Notice (the undo Notice already covers that, 規格 #21).
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
  parts.push(t("paragraph.list.count", { n: row.count }));
  const date = shortDate(row.lastAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

// Delete asks once more in place (the button turns into 「確定刪除？」)
// rather than opening a modal, which is awkward in a narrow sidebar. Kept
// for ParagraphThreadPane.ts (its own 「刪除這串討論」, not this list's
// rows any more — those use deleteButton()/runUndoable below, #21).
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

// 整串討論的刪除鈕（1006report.md #21）：不跳確認，runUndoable 立刻把這一
// 列藏起來，按「復原」就放回來，時間到才真的呼叫 actions.remove()
// （ThreadService.deleteThread）。放在每一列，不只是孤立的那些。
function deleteButton(parent: HTMLElement, el: HTMLElement, threadId: string, actions: ParagraphListActions): void {
  const btn = parent.createSpan({ cls: "vt-plist-delete" });
  setIcon(btn, "trash-2");
  btn.setAttr("role", "button");
  btn.setAttr("tabindex", "0");
  btn.setAttr("aria-label", t("row.delete"));
  const run = (e: Event) => {
    e.stopPropagation();
    runUndoable({
      message: t("undo.deletedThread"),
      apply: () => el.addClass("vt-plist-row-removed"),
      restore: () => el.removeClass("vt-plist-row-removed"),
      commit: () => actions.remove(threadId),
    });
  };
  btn.addEventListener("click", run);
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run(e);
  });
}

function rebindButton(parent: HTMLElement, threadId: string, actions: ParagraphListActions): void {
  const bar = parent.createDiv({ cls: "vt-plist-actions" });
  const rebind = bar.createEl("button", { cls: "vt-plist-action", text: t("paragraph.action.rebind") });
  rebind.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.rebind(threadId);
  });
}

function drawRow(parent: HTMLElement, row: ParagraphRow, actions: ParagraphListActions, current = false, note?: string): void {
  const el = parent.createDiv({ cls: "vt-plist-row" });
  el.toggleClass("is-current", current);
  el.toggleClass("is-orphan", row.orphan);
  el.setAttr("data-thread-id", row.threadId);
  el.setAttr("role", "button");
  el.setAttr("tabindex", "0");
  el.addEventListener("click", () => actions.open(row.threadId));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") actions.open(row.threadId);
  });

  const head = el.createDiv({ cls: "vt-plist-row-head" });
  const title = head.createDiv({ cls: "vt-plist-text" });
  if (row.number !== null) title.createSpan({ cls: "vt-plist-num", text: `¶${row.number}` });
  title.createSpan({ text: row.preview });
  title.setAttr("aria-label", row.preview);
  deleteButton(head, el, row.threadId, actions);

  const meta = el.createDiv({ cls: "vt-plist-meta" });
  setIcon(meta.createSpan({ cls: "vt-plist-meta-icon" }), "sparkles");
  meta.createSpan({ text: rowMeta(row) });
  if (row.orphan) meta.createSpan({ cls: "vt-plist-flag is-orphan", text: t("paragraph.list.orphan") });
  else if (row.edited) meta.createSpan({ cls: "vt-plist-flag", text: t("paragraph.list.edited") });
  if (note) el.createDiv({ cls: "vt-plist-path", text: note });

  if (row.orphan) rebindButton(el, row.threadId, actions);
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
    private currentThreadId: () => string | null = () => null,
    // The section header's count (Wave 6 W) — called after every draw.
    private onCount?: (n: number) => void
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
    this.onCount?.(rows.length);
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("paragraph.list.hint") });
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
    this.el.createDiv({ cls: "vt-plist-head" }).createSpan({ text: t("paragraph.list.orphanTitle", { n: orphans.length }) });
    const rows = paragraphRows(orphans, null, (id) => this.deps.taskLabel(id));
    for (const row of rows) {
      const anchor = orphans.find((x) => x.id === row.threadId)?.anchor;
      const note = anchor?.kind === "paragraph" ? t("paragraph.list.missingNote", { path: anchor.path }) : undefined;
      drawRow(this.el, row, this.actions, false, note);
    }
  }
}

// ── All mode: every note's paragraph discussions, grouped by note ──────
//
// 1006report.md #8（全部模式）: 段落討論在「全部」底下列出所有筆記的討
// 論、依筆記分組，不套 isListed 篩選（段落討論跟標籤／like 無關）。Notes
// whose file is gone are left to MissingNoteThreadList (shown in both
// modes already) rather than duplicated here.
export class AllNotesThreadList extends Component {
  private el: HTMLElement;
  private alive = false;
  private seq = 0;

  constructor(
    parent: HTMLElement,
    private deps: ParagraphListDeps & { exists(path: string): boolean },
    private actions: ParagraphListActions,
    private onCount?: (n: number) => void
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
        if (th.anchor.kind === "paragraph") void this.refresh();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => void this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }

  async refresh(): Promise<void> {
    const seq = ++this.seq;
    const byPath = new Map<string, Thread[]>();
    for (const th of this.deps.threads.paragraphThreads()) {
      if (th.anchor.kind !== "paragraph" || !this.deps.exists(th.anchor.path)) continue;
      const list = byPath.get(th.anchor.path);
      if (list) list.push(th);
      else byPath.set(th.anchor.path, [th]);
    }
    const paths = [...byPath.keys()].sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
    const contents = await Promise.all(paths.map((p) => this.deps.notes.read(p).catch(() => null)));
    if (!this.alive || seq !== this.seq) return;
    const groups = paths.map((path, i) => ({
      path,
      rows: paragraphRows(byPath.get(path)!, contents[i], (id) => this.deps.taskLabel(id)),
    }));
    this.draw(groups);
  }

  private draw(groups: { path: string; rows: ParagraphRow[] }[]): void {
    this.el.empty();
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    this.onCount?.(total);
    if (!total) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("paragraph.list.hint") });
      return;
    }
    for (const g of groups) {
      if (!g.rows.length) continue;
      this.el.createDiv({ cls: "vt-plist-group-head", text: noteTitle(g.path) });
      for (const row of g.rows) drawRow(this.el, row, this.actions);
    }
  }
}

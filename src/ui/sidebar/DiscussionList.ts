import { Component, setIcon } from "obsidian";
import type { VocabEntry } from "../../core/model/entry";
import { t } from "../../core/i18n";
import type { ThreadService } from "../../services/threads/ThreadService";
import { discussionRows, RECENT_DISCUSSIONS, type DiscussionRow } from "./discussionRows";
import { shortDate } from "./paragraphRows";
import { runUndoable } from "../kit/undoable";

// The sidebar's 「AI 討論（n）」 section body (1005 回饋 2; Wave 6 W: word
// discussions only, newest first — paragraph discussions have their own
// 「段落討論」 section now, so they aren't listed twice). Owns its element
// and redraws only itself on thread events — never the word list above it.

export interface DiscussionListActions {
  // A word discussion: the word's card on its AI tab.
  openWord(entryId: string): void;
  // The heading's count changed.
  counted(n: number): void;
}

export interface DiscussionListDeps {
  // "deleteThread": 整串刪除（1006report.md #21），runUndoable 包起來，見
  // drawRow 裡的 addDeleteButton。
  threads: Pick<ThreadService, "events" | "ensureLoaded" | "wordThread" | "deleteThread">;
  entries(): readonly VocabEntry[];
}

export class DiscussionList extends Component {
  private el: HTMLElement;
  private alive = false;

  constructor(
    parent: HTMLElement,
    private deps: DiscussionListDeps,
    private actions: DiscussionListActions,
    // 「顯示全部」, kept by the sidebar across its redraws.
    private view: { showAll: boolean } = { showAll: false }
  ) {
    super();
    this.el = parent.createDiv({ cls: "vt-dlist" });
  }

  onload(): void {
    this.alive = true;
    this.register(() => (this.alive = false));
    const { threads } = this.deps;
    this.register(threads.events.on("thread:upsert", () => this.refresh()));
    this.register(threads.events.on("threads:reloaded", () => this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }

  refresh(): void {
    if (!this.alive) return;
    const rows = discussionRows(this.deps.threads, this.deps.entries());
    this.actions.counted(rows.length);
    this.draw(rows);
  }

  private draw(rows: DiscussionRow[]): void {
    this.el.empty();
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("sidebar.ai.empty") });
      return;
    }
    const shown = this.view.showAll ? rows : rows.slice(0, RECENT_DISCUSSIONS);
    for (const row of shown) this.drawRow(row);
    if (rows.length > RECENT_DISCUSSIONS) {
      const more = this.el.createEl("button", {
        cls: "vt-dlist-more",
        text: this.view.showAll ? t("sidebar.ai.showLess") : t("sidebar.ai.showAll", { n: rows.length }),
      });
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        this.view.showAll = !this.view.showAll;
        this.draw(rows);
      });
    }
  }

  private drawRow(row: DiscussionRow): void {
    const el = this.el.createDiv({ cls: "vt-dlist-row is-word" });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-thread-id", row.threadId);
    const open = () => this.actions.openWord(row.entryId);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });

    const title = el.createDiv({ cls: "vt-dlist-title" });
    setIcon(title.createSpan({ cls: "vt-dlist-icon" }), "type");
    title.createSpan({ cls: "vt-dlist-text", text: row.title });
    title.setAttr("aria-label", row.title);
    this.addDeleteButton(title, el, row.threadId);

    const parts = [t("paragraph.list.count", { n: row.count })];
    const date = shortDate(row.lastAt);
    if (date) parts.push(date);
    el.createDiv({ cls: "vt-dlist-meta", text: parts.join(" · ") });
  }

  // 整串刪除（1006report.md #21）：不跳確認，立刻藏起這一列，runUndoable
  // 給幾秒「復原」，時間到才真的 deleteThread。
  private addDeleteButton(parent: HTMLElement, row: HTMLElement, threadId: string): void {
    const btn = parent.createSpan({ cls: "vt-dlist-delete" });
    setIcon(btn, "trash-2");
    btn.setAttr("role", "button");
    btn.setAttr("tabindex", "0");
    btn.setAttr("aria-label", t("row.delete"));
    const run = (e: Event) => {
      e.stopPropagation();
      runUndoable({
        message: t("undo.deletedThread"),
        apply: () => row.addClass("vt-dlist-row-removed"),
        restore: () => row.removeClass("vt-dlist-row-removed"),
        commit: () => void this.deps.threads.deleteThread(threadId),
      });
    };
    btn.addEventListener("click", run);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run(e);
    });
  }
}

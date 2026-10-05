import { Component, setIcon } from "obsidian";
import type { VocabEntry } from "../../core/model/entry";
import { t } from "../../core/i18n";
import type { ThreadService } from "../../services/threads/ThreadService";
import { noteTitle } from "../word/wordOrder";
import { discussionRows, RECENT_DISCUSSIONS, type DiscussionRow } from "./discussionRows";
import { shortDate } from "./paragraphRows";

// The sidebar's 「AI 討論（n）」 section body (1005 回饋 2): every word and
// paragraph discussion, newest first. Owns its element and redraws only
// itself on thread events — never the word list above it.

export interface DiscussionListActions {
  // A word discussion: the word's card on its AI tab.
  openWord(entryId: string): void;
  // A paragraph discussion: its pane.
  openParagraph(threadId: string): void;
  // The heading's count changed.
  counted(n: number): void;
}

export interface DiscussionListDeps {
  threads: Pick<ThreadService, "events" | "ensureLoaded" | "paragraphThreads" | "wordThread">;
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
    const el = this.el.createDiv({ cls: "vt-dlist-row" });
    el.addClass(row.kind === "word" ? "is-word" : "is-paragraph");
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-thread-id", row.threadId);
    const open = () => {
      if (row.kind === "word" && row.entryId) this.actions.openWord(row.entryId);
      else this.actions.openParagraph(row.threadId);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });

    const title = el.createDiv({ cls: "vt-dlist-title" });
    setIcon(title.createSpan({ cls: "vt-dlist-icon" }), row.kind === "word" ? "type" : "pilcrow");
    title.createSpan({ cls: "vt-dlist-text", text: row.title });
    title.setAttr("aria-label", row.title);

    const parts = [t(row.kind === "word" ? "sidebar.ai.kind.word" : "sidebar.ai.kind.paragraph")];
    if (row.path) parts.push(noteTitle(row.path));
    parts.push(t("paragraph.list.count", { n: row.count }));
    const date = shortDate(row.lastAt);
    if (date) parts.push(date);
    el.createDiv({ cls: "vt-dlist-meta", text: parts.join(" · ") });
  }
}

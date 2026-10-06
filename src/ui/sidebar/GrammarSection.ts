import { Component, setIcon } from "obsidian";
import { t } from "../../core/i18n";
import type { LearnStore } from "../../services/learn/LearnStore";
import type { VerbUsageService } from "../../services/learn/VerbUsageService";
import { shortDate } from "./paragraphRows";
import { RECENT_VERB_USAGE, verbUsageRows, type VerbUsageRow } from "./grammarRows";

// The sidebar's 「文法（n）」 section body (Wave 6 W). Today it's just one
// subsection — 動詞用法: the most recently generated/regenerated/saved
// verb usages, capped at RECENT_VERB_USAGE with a 「查看全部」 link to
// 動詞用法.md. A 句型結構 subsection is meant to join it later as a
// sibling .vt-glist-sub block; not stubbed here since there's nothing to
// show yet. Owns its element and redraws only itself, on verb usage /
// favorite events — never the sections above it.

export interface GrammarSectionDeps {
  verbs: Pick<VerbUsageService, "verbs" | "events">;
  learn: Pick<LearnStore, "verbFavorite" | "events" | "ensureLoaded">;
}

export interface GrammarSectionActions {
  // A verb's row: its word page (where the usage block lives).
  openWord(entryId: string): void;
  // 「查看全部」: 動詞用法.md.
  viewAll(): void;
  // The heading's count changed.
  counted(n: number): void;
}

export class GrammarSection extends Component {
  private el: HTMLElement;
  private alive = false;

  constructor(
    parent: HTMLElement,
    private deps: GrammarSectionDeps,
    private actions: GrammarSectionActions
  ) {
    super();
    this.el = parent.createDiv({ cls: "vt-glist" });
  }

  onload(): void {
    this.alive = true;
    this.register(() => (this.alive = false));
    const { verbs, learn } = this.deps;
    this.register(verbs.events.on("verb:usage", () => this.refresh()));
    this.register(learn.events.on("verbFavorite:upsert", () => this.refresh()));
    this.register(learn.events.on("learn:reloaded", () => this.refresh()));
    this.refresh();
    void learn.ensureLoaded().then(() => this.refresh());
  }

  private rows(): VerbUsageRow[] {
    return verbUsageRows(this.deps.verbs.verbs(), (id) => this.deps.learn.verbFavorite(id));
  }

  refresh(): void {
    if (!this.alive) return;
    const rows = this.rows();
    this.actions.counted(rows.length);
    this.draw(rows);
  }

  private draw(rows: VerbUsageRow[]): void {
    this.el.empty();
    this.el.createDiv({ cls: "vt-glist-sub", text: t("sidebar.grammar.verbs") });
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("sidebar.grammar.empty") });
    } else {
      for (const row of rows.slice(0, RECENT_VERB_USAGE)) this.drawRow(row);
    }
    const more = this.el.createEl("button", { cls: "vt-glist-more", text: t("sidebar.grammar.viewAll") });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.actions.viewAll();
    });
  }

  private drawRow(row: VerbUsageRow): void {
    const el = this.el.createDiv({ cls: "vt-glist-row" });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-entry-id", row.entryId);
    const open = () => this.actions.openWord(row.entryId);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });

    const title = el.createDiv({ cls: "vt-glist-title" });
    const icon = title.createSpan({ cls: "vt-glist-icon" });
    if (row.favorited) {
      icon.addClass("is-saved");
      setIcon(icon, "bookmark-check");
      icon.setAttr("aria-label", t("learn.verb.rowFavorited"));
    } else {
      setIcon(icon, "sparkles");
    }
    title.createSpan({ cls: "vt-glist-text", text: row.word });

    const date = shortDate(row.lastAt);
    if (date) el.createDiv({ cls: "vt-glist-meta", text: date });
  }
}

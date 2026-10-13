import { Component, setIcon } from "obsidian";
import { getLocale, t } from "../../core/i18n";
import { GRAMMAR_TOPICS } from "../../core/grammar/catalog";
import { grammarSightings } from "../../core/grammar/sightings";
import type { GrammarStore } from "../../services/grammar/GrammarStore";
import type { ThreadService } from "../../services/threads/ThreadService";
import type { LearnStore } from "../../services/learn/LearnStore";
import type { VerbUsageService } from "../../services/learn/VerbUsageService";
import { shortDate } from "./paragraphRows";
import {
  dueGrammarRows,
  grammarPlan,
  grammarTotal,
  noteGrammarRows,
  verbUsageRows,
  type GrammarTopicRow,
  type NoteGrammarRow,
  type VerbUsageRow,
} from "./grammarRows";

// The sidebar's 「文法（n）」 section body (Wave 6 W). Subsections, each a
// .vt-glist-sub block:
//   本篇用到的文法 (wave 15 S, 1013 §3.4) — the topics this note's 文法解析
//     answers named, "<title> ×n", most-met first, max 8; hidden when the
//     note has none.
//   待複習 (wave 15 S) — topics whose review is due, max 5, each with a
//     [練習]; hidden when nothing is due.
//   動詞用法 — the most recently generated/regenerated/saved verb usages,
//     capped at RECENT_VERB_USAGE with a 「查看全部」 link to 動詞用法.md.
// The first two only exist when the host passes `actions.openGrammarTopic`
// (wave 15 wiring); the heading count is all rows of all three. Owns its
// element and redraws only itself, on verb usage / favorite / thread /
// grammar-progress events — never the sections above it.

// Wave 15 rule 11: temporary strings, moved to i18n at integration.
const L = {
  "zh-TW": { note: "本篇用到的文法", due: "待複習", practice: "練習" },
  en: { note: "Grammar in this note", due: "Due for review", practice: "Practice" },
} as const;

export interface GrammarSectionDeps {
  verbs: Pick<VerbUsageService, "verbs" | "events">;
  learn: Pick<LearnStore, "verbFavorite" | "events" | "ensureLoaded">;
  // Wave 14 U: the visible Usage page (desktop, not `word=`), if any, and
  // a subscription for when it opens/closes/changes word.
  usagePage?: {
    current(): { selectedId(): string | undefined; select(entryId: string): void } | null;
    subscribe(cb: () => void): () => void;
  };
  // Rows for "every word with any usage" (Usage page mode); defaults to the
  // verbs() list when absent.
  usageEntries?: () => ReturnType<GrammarSectionDeps["verbs"]["verbs"]>;
  // Wave 15 S: where the 文法解析 answers live, and the active note.
  threads?: Pick<ThreadService, "events" | "ensureLoaded" | "paragraphThreads">;
  // GrammarStore (F): progress for 待複習. Absent until main.ts wires it up.
  grammar?: Pick<GrammarStore, "events" | "ensureLoaded" | "progress">;
  // The note in front (vault path), if any.
  path?: () => string | null;
  now?: () => Date;
}

export interface GrammarSectionActions {
  // A verb's row: its word page (where the usage block lives).
  openWord(entryId: string): void;
  // 「查看全部」: 動詞用法.md.
  viewAll(): void;
  // The heading's count changed.
  counted(n: number): void;
  // A grammar row: the topic's page (GrammarPages.open). When absent, the
  // 本篇用到的文法 / 待複習 subsections aren't shown.
  openGrammarTopic?(topicId: string): void;
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
    if (this.deps.usagePage) this.register(this.deps.usagePage.subscribe(() => this.refresh()));
    const { threads, grammar } = this.deps;
    if (threads) {
      this.register(threads.events.on("thread:upsert", () => this.refresh()));
      this.register(threads.events.on("threads:reloaded", () => this.refresh()));
      void threads.ensureLoaded().then(() => this.refresh());
    }
    if (grammar) {
      this.register(grammar.events.on("progress:upsert", () => this.refresh()));
      this.register(grammar.events.on("grammar:reloaded", () => this.refresh()));
      void grammar.ensureLoaded().then(() => this.refresh());
    }
    this.refresh();
    void learn.ensureLoaded().then(() => this.refresh());
  }

  private noteRows(): NoteGrammarRow[] {
    const { threads, path } = this.deps;
    const p = path?.() ?? null;
    if (!threads || !p || !this.actions.openGrammarTopic) return [];
    return noteGrammarRows(grammarSightings(threads.paragraphThreads(p)), p);
  }

  private dueRows(): GrammarTopicRow[] {
    const { grammar } = this.deps;
    if (!grammar || !this.actions.openGrammarTopic) return [];
    return dueGrammarRows(GRAMMAR_TOPICS, (id) => grammar.progress(id), this.deps.now?.() ?? new Date());
  }

  private page() {
    return this.deps.usagePage?.current() ?? null;
  }

  private rows(): VerbUsageRow[] {
    const fav = (id: string) => this.deps.learn.verbFavorite(id);
    if (this.page() && this.deps.usageEntries) return verbUsageRows(this.deps.usageEntries(), fav, true);
    return verbUsageRows(this.deps.verbs.verbs(), fav);
  }

  refresh(): void {
    if (!this.alive) return;
    const rows = this.rows();
    const note = this.noteRows();
    const due = this.dueRows();
    this.actions.counted(grammarTotal(note.length, due.length, rows.length));
    this.draw(rows, note, due);
  }

  private draw(rows: VerbUsageRow[], note: NoteGrammarRow[], due: GrammarTopicRow[]): void {
    this.el.empty();
    const lang = getLocale();
    if (note.length) {
      this.el.createDiv({ cls: "vt-glist-sub", text: L[lang].note });
      for (const row of note) this.drawTopicRow(row, row.count);
    }
    if (due.length) {
      this.el.createDiv({ cls: "vt-glist-sub", text: L[lang].due });
      for (const row of due) this.drawTopicRow(row);
    }
    const page = this.page();
    const plan = grammarPlan(!!page);
    const selected = page?.selectedId();
    this.el.createDiv({ cls: "vt-glist-sub", text: t("sidebar.grammar.verbs") });
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("sidebar.grammar.empty") });
    } else {
      for (const row of plan.limit === null ? rows : rows.slice(0, plan.limit)) {
        this.drawRow(row, plan.click === "select" ? selected === row.entryId : false, plan.click === "select" ? (id) => page?.select(id) : undefined);
      }
    }
    const more = this.el.createEl("button", { cls: "vt-glist-more", text: t("sidebar.grammar.viewAll") });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.actions.viewAll();
    });
  }

  // 本篇用到的文法: "<title> ×n"; 待複習: "<title>  [練習]". Either opens
  // the topic page.
  private drawTopicRow(row: GrammarTopicRow, count?: number): void {
    const open = () => this.actions.openGrammarTopic?.(row.topicId);
    const el = this.el.createDiv({ cls: `vt-gr-row is-stage-${row.stage}` });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-topic-id", row.topicId);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    el.createSpan({ cls: "vt-gr-row-title", text: row.title });
    if (count !== undefined) {
      el.createSpan({ cls: "vt-gr-row-count", text: `×${count}` });
      return;
    }
    const btn = el.createEl("button", { cls: "vt-gr-row-btn", text: L[getLocale()].practice, attr: { type: "button" } });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
  }

  private drawRow(row: VerbUsageRow, active: boolean, select?: (id: string) => void): void {
    const el = this.el.createDiv({ cls: "vt-glist-row" });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-entry-id", row.entryId);
    el.toggleClass("is-active", active);
    const open = () => (select ? select(row.entryId) : this.actions.openWord(row.entryId));
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

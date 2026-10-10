import { MarkdownRenderChild, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import { getLocale, t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { originFamilyId, type Family } from "../../core/model/family";
import type { BreakdownPart, WordBreakdown } from "../../core/model/morpheme";
import type { WordMeta } from "../../core/model/wordMeta";
import { noteBasename } from "../../core/text/slug";
import { paragraphNumber } from "../../services/files/paragraphNumber";
import { isNewCard, startOfLocalDay } from "../../services/srs/queue";
import { renderStrand } from "../dna/strand";
import { datesText, recordDates } from "../kit/dates";
import { inlineNote } from "../kit/inlineNote";
import { bindPronounceButton } from "../kit/pronounce";
import { autoGrowTextarea, commitEntryField, type EditableField, type FieldStore } from "../word/rowModel";
import { familyTitle, focusFamily } from "./familiesModel";
import { isOpenStored, toggleStored, type FoldSection, type FoldStorage } from "../reading/wordPageFolds";
import { hasDictionaryData } from "./wordHeaderModel";
import { parseBlockParams } from "./params";

export { hasDictionaryData };

// Temporary strings (wave 12 C) until the integration moves them into i18n.
const LABELS = {
  "zh-TW": { info: "Info", dna: "字根" },
  en: { info: "Info", dna: "Roots" },
};
const L = {
  get info() {
    return LABELS[getLocale()].info;
  },
  get dna() {
    return LABELS[getLocale()].dna;
  },
};

// ── vocab-word code block: the header of a word page (規劃書 06 §8.2, W1/W2) ──
//
// 單字/<word>.md starts with an empty ```vocab-word``` block; the word it
// shows comes from the page's frontmatter `vocab-tracker-id` (the entry
// id), so it keeps working after the user renames the page. The block can
// also name a word by hand: `id: <entry id>` or `word: glittery`.
// Rendered live from the store and redrawn on every data change; the
// subscription is dropped when the block goes away (MarkdownRenderChild).

export const WORD_BLOCK_LANG = "vocab-word";

type Key = "missing" | "speak" | "source" | "sourceTitle" | "dueNew" | "dueToday" | "dueOn" | "reviewed" | "review";

function l(key: Key, vars?: Record<string, string | number>): string {
  return t(`wordPage.${key}`, vars);
}

function lo(key: "origin" | "originUnknown" | "originTitle", name?: string): string {
  return name === undefined ? t(`wordPage.${key}`) : t(`wordPage.${key}`, { name });
}

// What the block needs from the plugin. VocabTrackerPlugin has most of it
// already; the rest is wired in main.ts.
export interface WordHeaderHost {
  // The plugin's `app`: only loadLocalStorage/saveLocalStorage are used, to
  // remember which categories are open. Optional (defaults apply without).
  readonly app?: FoldStorage;
  store: {
    readonly entries: readonly VocabEntry[];
    readonly events: { on(event: "data:changed", fn: () => void): () => void };
  } & FieldStore; // 1006-2 #12: the word page's fields save through the
  // same path as WordRow's (rowModel.ts's commitEntryField) — no main.ts
  // wiring needed, VocabTrackerPlugin.store already has setLiked/touch.
  // Frontmatter of a note, when ctx.frontmatter isn't there (metadataCache).
  frontmatterOf(path: string): Record<string, unknown> | null | undefined;
  jumpToSource(entry: VocabEntry): unknown;
  // Text of a note, for the ¶ number. Optional: without it the chip shows
  // just the note's name.
  readNote?(path: string): Promise<string | null>;
  // 「複習這個字」: a one-word review of `entry`, due or not — main.ts
  // opens WordReviewModal (wordReview.ts). Optional: the button is left
  // out without it.
  reviewWord?(entry: VocabEntry): unknown;
  // Families (LearnStore), for 「來源：字族樹 …」 on a word added from one
  // (origin "family:<id>"; 1005 回饋 #13). Optional: without it the chip
  // still shows, without the family's name.
  learn?: {
    ensureLoaded(): Promise<void>;
    family(id: string): Family | undefined;
    // LearnStore has this already (決定 1: emoji/breakdown live in
    // wordMeta, off VocabEntry, so `store.events`'s "data:changed" never
    // fires for them — a redraw on their own change needs this instead).
    // Optional: without it the header still shows the latest emoji/
    // breakdown on its next unrelated redraw, just not live.
    events?: { on(event: "wordMeta:upsert", fn: (meta: WordMeta) => void): () => void };
  };
  // Opens 字族樹.md (the chip's click); main.ts has it.
  openEntryFile?(id: "families", where?: "current" | "tab"): unknown;
  // Per-word emoji (09 §7.1 A7). EmojiService already satisfies this
  // (plugin.emoji) — see WP's 整合事項 for how it's wired. Optional:
  // without it no emoji shows and the word can't be given one here.
  emoji?: {
    emojiOf(entry: VocabEntry): string;
    set(entryId: string, emoji: string): void;
  };
  // Word DNA breakdown (09 §7.1). MorphemeService already satisfies this
  // (plugin.morphemes). Optional: without it neither the strand nor the
  // 「拆字」button shows — the header looks exactly as before M9.
  morphemes?: {
    breakdownOf(entryId: string): WordBreakdown | undefined;
    analyzeNow(entryIds: string[], signal?: AbortSignal): Promise<void>;
  };
  // Opens Word DNA.md with one morpheme selected (a strand part's
  // click) — main.ts doesn't implement this yet, see WP's 整合事項.
  // Optional: without it strand parts render as plain (non-clickable)
  // blocks (renderStrand's own behavior when `onPart` finds nothing to
  // call).
  openMorpheme?(morphemeId: string): unknown;
}

// ── emoji ／ 拆字（09 §7.1, A7）─────────────────────────────────────

// Which of the three states the breakdown area is in: no breakdown yet
// (offer the 「拆字」button), one that couldn't be split (決定 5 — show
// neither), or a real one (show its strand). Pure so it's testable
// without the DOM vitest doesn't have.
export type BreakdownDisplay = "button" | "strand" | "none";

export function breakdownDisplay(breakdown: WordBreakdown | undefined): BreakdownDisplay {
  if (!breakdown) return "button";
  return breakdown.status === "ok" ? "strand" : "none";
}

export function breakdownButtonLabel(busy: boolean): string {
  return busy ? t("wordPage.dna.breakdownBusy") : t("wordPage.dna.breakdown");
}

// ── 「來源：字族樹 …」 ──────────────────────────────────────────────

// The family a word was added from: VocabEntry.origin "family:<id>".
export { originFamilyId };

export interface OriginView {
  familyId: string;
  // 「clothing 服裝 › 舞台」: the family, and the group the word sits in.
  // Absent when the family is gone (deleted, or replaced by 重新分群
  // under another topic).
  name?: string;
}

export function originView(entry: Pick<VocabEntry, "id" | "word" | "origin">, family: Family | undefined): OriginView | null {
  const familyId = originFamilyId(entry.origin);
  if (!familyId) return null;
  if (!family || family.deletedAt) return { familyId };
  const word = entry.word.toLowerCase();
  const group = family.groups.find((g) =>
    g.members.some((m) => m.entryId === entry.id || (!m.entryId && m.word.toLowerCase() === word))
  );
  const title = familyTitle(family);
  return { familyId, name: group?.label.trim() ? `${title} › ${group.label.trim()}` : title };
}

export function originLabel(v: OriginView): string {
  return v.name ? lo("origin", v.name) : lo("originUnknown");
}

export interface WordTarget {
  id?: string;
  word?: string;
}

// Which word the block is for: its own params first, then the page's
// frontmatter id (only on a word page), then the note's name.
export function wordTarget(
  params: Record<string, string>,
  frontmatter: Record<string, unknown> | null | undefined,
  sourcePath: string
): WordTarget {
  if (params.id) return { id: params.id };
  if (params.word) return { word: params.word };
  const fmId = frontmatter?.["vocab-tracker-id"];
  if (frontmatter?.["vocab-tracker"] === "word" && (typeof fmId === "string" || typeof fmId === "number")) {
    return { id: String(fmId) };
  }
  return { word: noteBasename(sourcePath) };
}

export function findTarget(entries: readonly VocabEntry[], target: WordTarget): VocabEntry | undefined {
  const live = entries.filter((e) => !e.deletedAt);
  if (target.id) return live.find((e) => e.id === target.id);
  const word = target.word?.trim().toLowerCase();
  return word ? live.find((e) => e.word.toLowerCase() === word) : undefined;
}

// "MM/DD" in local time.
function shortDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

// The review chip: new card / due by the end of today / the day it's due.
export function dueLabel(entry: VocabEntry, now: Date = new Date()): string {
  if (isNewCard(entry) || !entry.srs) return l("dueNew");
  const due = new Date(entry.srs.due);
  if (Number.isNaN(due.getTime())) return l("dueNew");
  const tomorrow = startOfLocalDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return due.getTime() < tomorrow.getTime() ? l("dueToday") : l("dueOn", { date: shortDay(due) });
}

export function sourceLabel(path: string, paragraph: number | null): string {
  const name = noteBasename(path);
  return l("source", { source: paragraph ? `${name} ¶${paragraph}` : name });
}

export function renderWordHeader(
  host: WordHeaderHost,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const frontmatter = (ctx.frontmatter as Record<string, unknown> | undefined) ?? host.frontmatterOf(ctx.sourcePath);
  const target = wordTarget(parseBlockParams(source), frontmatter, ctx.sourcePath);
  ctx.addChild(new WordHeaderBlock(el, host, target));
}

class WordHeaderBlock extends MarkdownRenderChild {
  // "path\nline" → ¶ number, so a redraw doesn't re-read the note.
  private paragraphs = new Map<string, number | null>();
  private disposed = false;
  // 09 §7.1: the emoji button becomes an inline text input while editing
  // (same click-to-edit treatment as the fields below it).
  private editingEmoji = false;
  // Tracks this block's own analyzeNow() call, not MorphemeService's
  // system-wide auto-batch progress() — only this word's button cares.
  private analyzingBreakdown = false;

  constructor(
    containerEl: HTMLElement,
    private host: WordHeaderHost,
    private target: WordTarget
  ) {
    super(containerEl);
  }

  onload(): void {
    // The plugin's reading-mode click handler would otherwise offer to add
    // whatever word was clicked in the header.
    this.registerDomEvent(this.containerEl, "click", (e) => e.stopPropagation());
    // A change from elsewhere (dictionary data arriving, a sync) redraws —
    // except while the user is mid-edit in one of this block's own fields,
    // same guard as WordSheet's (1006-2 #12 added text fields here; this
    // block had nothing worth not losing before that).
    this.register(
      this.host.store.events.on("data:changed", () => {
        const active = this.containerEl.ownerDocument?.activeElement;
        if (active && this.containerEl.contains(active)) return;
        this.render();
      })
    );
    // emoji/breakdown (決定 1) live in wordMeta, off VocabEntry — "data:
    // changed" above never fires for them, so a background 拆字/emoji
    // write needs its own redraw.
    if (this.host.learn?.events) {
      this.register(
        this.host.learn.events.on("wordMeta:upsert", (meta) => {
          const entry = findTarget(this.host.store.entries, this.target);
          if (!entry || meta.id !== entry.id) return;
          const active = this.containerEl.ownerDocument?.activeElement;
          if (active && this.containerEl.contains(active)) return;
          this.render();
        })
      );
    }
    this.render();
    // The origin chip names the family once learn.json is in.
    const entry = findTarget(this.host.store.entries, this.target);
    if (this.host.learn && originFamilyId(entry?.origin)) {
      void this.host.learn.ensureLoaded().then(() => this.render(), () => undefined);
    }
  }

  onunload(): void {
    this.disposed = true;
  }

  private render(): void {
    if (this.disposed) return;
    const el = this.containerEl;
    el.empty();
    const root = el.createDiv({ cls: ["vt", "vt-word-header"] });
    const entry = findTarget(this.host.store.entries, this.target);
    if (!entry) {
      root.appendChild(inlineNote({ text: l("missing") }));
      return;
    }

    // Wave 12 C: one column — word, definitions, chips, 筆記 (always open),
    // then the collapsible Info / 字根. No dictionary data → Info is gone
    // altogether (and the empty definitions with it), only 筆記 stays.
    const dict = hasDictionaryData(entry);

    const top = root.createDiv({ cls: "vt-wh-top" });
    if (this.host.emoji) this.renderEmoji(top, entry, this.host.emoji);
    top.createSpan({ cls: "vt-wh-word", text: entry.word });
    const speak = top.createEl("button", { cls: ["clickable-icon", "vt-wh-speak"], attr: { "aria-label": l("speak") } });
    setIcon(speak, "volume-2");
    bindPronounceButton(speak, entry);

    if (dict) {
      const defs = root.createDiv({ cls: "vt-wh-defs" });
      this.field(defs, entry, "definition", t("row.field.definition"), { multiline: true });
      this.field(defs, entry, "definitionZh", t("row.field.definitionZh"), { multiline: true });
    }

    const chips = root.createDiv({ cls: "vt-wh-chips" });
    if (entry.source?.path) this.renderSource(chips, entry, entry.source.path, entry.source.line);
    this.renderOrigin(chips, entry);
    // 加入 / 更新 時間 (1006 #2: moved here from the sidebar).
    const dates = datesText(recordDates(entry));
    if (dates) chip(chips, "calendar-plus", dates);
    chip(chips, "calendar", dueLabel(entry));
    const reps = entry.srs?.reps ?? 0;
    if (reps > 0) chip(chips, "rotate-ccw", l("reviewed", { n: reps }));

    const review = this.host.reviewWord;
    if (review) {
      const btn = chips.createEl("button", { cls: ["mod-cta", "vt-wh-review"] });
      setIcon(btn.createSpan({ cls: "vt-wh-btn-icon" }), "layers");
      btn.createSpan({ text: l("review") });
      btn.addEventListener("click", () => void review.call(this.host, entry));
    }

    // 筆記 (= the grammar field): always open, fixed position.
    const notes = root.createDiv({ cls: "vt-wh-notes" });
    notes.createDiv({ cls: "vt-wh-notes-label", text: t("row.field.grammar") });
    this.field(notes, entry, "grammar", t("row.field.grammar"), { multiline: true });

    if (dict) {
      this.fold(root, entry, "info", L.info, (body) => {
        const rows: [EditableField, string][] = [
          ["phonetic", t("row.field.phonetic")],
          ["partOfSpeech", t("row.field.partOfSpeech")],
          ["synonyms", t("row.field.synonyms")],
          ["antonyms", t("row.field.antonyms")],
          ["example", t("row.field.example")],
          ["level", t("row.field.level")],
        ];
        for (const [key, label] of rows) {
          const row = body.createDiv({ cls: "vt-wh-inforow" });
          row.createSpan({ cls: "vt-wh-inforow-label", text: label });
          this.field(row, entry, key, label, { multiline: true });
        }
      });
    }

    const morphemes = this.host.morphemes;
    if (morphemes && breakdownDisplay(morphemes.breakdownOf(entry.id)) !== "none") {
      this.fold(root, entry, "dna", L.dna, (body) => this.renderBreakdown(body, entry, morphemes));
    }
  }

  // One collapsible category (arrow + name, nothing on the right). Open
  // state is per word and per category, kept in the device's localStorage.
  private fold(
    parent: HTMLElement,
    entry: VocabEntry,
    section: FoldSection,
    title: string,
    build: (body: HTMLElement) => void
  ): void {
    const open = isOpenStored(this.host.app, entry.id, section);
    const box = parent.createDiv({ cls: ["vt-wp-fold", open ? "is-open" : "is-closed"] });
    const head = box.createEl("button", {
      cls: "vt-wp-fold-head",
      attr: { type: "button", "aria-expanded": String(open) },
    });
    setIcon(head.createSpan({ cls: "vt-wp-fold-chev" }), "chevron-right");
    head.createSpan({ cls: "vt-wp-fold-title", text: title });
    const body = box.createDiv({ cls: "vt-wp-fold-content" });
    build(body);
    head.addEventListener("click", () => {
      const now = toggleStored(this.host.app, entry.id, section);
      box.toggleClass("is-open", now);
      box.toggleClass("is-closed", !now);
      head.setAttr("aria-expanded", String(now));
    });
  }

  // The emoji to the left of the word (09 §7.1 A7). A click turns it into
  // a plain text input, same click-to-edit shape as the fields below —
  // Enter or blur-with-a-change commits through EmojiService.set, Escape
  // cancels without writing anything (A7: this never touches VocabEntry).
  private renderEmoji(parent: HTMLElement, entry: VocabEntry, emoji: NonNullable<WordHeaderHost["emoji"]>): void {
    if (this.editingEmoji) {
      const inp = parent.createEl("input", { cls: ["vt-input", "vt-wh-emoji-input"] });
      inp.type = "text";
      inp.value = emoji.emojiOf(entry);
      inp.maxLength = 8;
      const commit = () => {
        if (!this.editingEmoji) return;
        const next = inp.value.trim();
        if (next) emoji.set(entry.id, next);
        this.editingEmoji = false;
        this.render();
      };
      inp.onchange = commit;
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") {
          this.editingEmoji = false;
          this.render();
        }
      });
      // Focus after it's actually in the DOM (createEl above just built
      // it this tick).
      window.setTimeout(() => inp.focus(), 0);
      return;
    }
    const btn = parent.createEl("button", { cls: ["clickable-icon", "vt-wh-emoji"], attr: { "aria-label": t("wordPage.dna.emoji"), type: "button" } });
    btn.setText(emoji.emojiOf(entry));
    btn.addEventListener("click", () => {
      this.editingEmoji = true;
      this.render();
    });
  }

  // The strand under the fields, or a 「拆字」button when the word hasn't
  // been analyzed yet (09 §7.1). Nothing renders at all when it was
  // analyzed and came back "none" (決定 5 — no morphemes worth showing).
  private renderBreakdown(parent: HTMLElement, entry: VocabEntry, morphemes: NonNullable<WordHeaderHost["morphemes"]>): void {
    const breakdown = morphemes.breakdownOf(entry.id);
    const display = breakdownDisplay(breakdown);
    if (display === "none") return;
    if (display === "strand") {
      renderStrand(parent, breakdown!, {
        onPart: (part: BreakdownPart) => {
          if (part.morphemeId) this.host.openMorpheme?.(part.morphemeId);
        },
      });
      return;
    }
    const btn = parent.createEl("button", { cls: ["vt-wh-breakdown-btn"], attr: { type: "button" } });
    btn.setText(breakdownButtonLabel(this.analyzingBreakdown));
    btn.disabled = this.analyzingBreakdown;
    btn.addEventListener("click", () => {
      if (this.analyzingBreakdown) return;
      this.analyzingBreakdown = true;
      this.render();
      morphemes
        .analyzeNow([entry.id])
        .catch(() => new Notice(t("wordPage.dna.breakdownFailed")))
        .finally(() => {
          this.analyzingBreakdown = false;
          if (!this.disposed) this.render();
        });
    });
  }

  // One editable field (1006-2 #12) — same save path as WordRow's own
  // fields (rowModel.ts's commitEntryField: first edit on an unliked word
  // also likes it, same as any other auto-like trigger). The container's
  // own click listener (onload above) already stops a click from reaching
  // the plugin's reading-mode handler, so fields here don't need their
  // own stopPropagation the way WordRow's do sitting inside a clickable
  // row header.
  private field(
    parent: HTMLElement,
    entry: VocabEntry,
    key: EditableField,
    placeholder: string,
    opts: { multiline?: boolean } = {}
  ): void {
    const value = entry[key] ?? "";
    const wrap = parent.createDiv({ cls: "vt-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vt-input", "vt-field-box"];
    if (opts.multiline) cls.push("vt-textarea");

    const commit = (next: string) => {
      void commitEntryField(this.host.store, entry, key, next).then(() => this.render());
    };

    if (opts.multiline) {
      const inp = wrap.createEl("textarea", { cls });
      inp.rows = 1;
      inp.value = value;
      inp.placeholder = placeholder;
      autoGrowTextarea(inp);
      inp.addEventListener("input", () => autoGrowTextarea(inp));
      inp.onchange = () => commit(inp.value);
    } else {
      const inp = wrap.createEl("input", { cls });
      inp.type = "text";
      inp.value = value;
      inp.placeholder = placeholder;
      inp.onchange = () => commit(inp.value);
    }
  }

  // 「來源：字族樹 clothing 服裝 › 舞台」 — a word added from a family; a
  // click opens 字族樹.md on that family with the word highlighted.
  private renderOrigin(parent: HTMLElement, entry: VocabEntry): void {
    const familyId = originFamilyId(entry.origin);
    if (!familyId) return;
    const view = originView(entry, this.host.learn?.family(familyId));
    if (!view) return;
    const el = chip(parent, "git-fork", originLabel(view));
    el.addClass("vt-wh-origin");
    const open = this.host.openEntryFile;
    if (!open) return;
    el.addClass("is-link");
    el.setAttr("title", lo("originTitle"));
    el.setAttr("role", "link");
    el.tabIndex = 0;
    const go = () => {
      if (view.name) focusFamily({ familyId, entryId: entry.id });
      void open.call(this.host, "families", "tab");
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }

  private renderSource(parent: HTMLElement, entry: VocabEntry, path: string, line: number): void {
    const key = `${path}\n${line}`;
    const known = this.paragraphs.get(key);
    const el = chip(parent, "file-text", sourceLabel(path, known ?? null));
    el.addClass("is-link");
    el.setAttr("title", l("sourceTitle"));
    el.setAttr("role", "link");
    el.tabIndex = 0;
    el.addEventListener("click", () => void this.host.jumpToSource(entry));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.host.jumpToSource(entry);
    });

    const read = this.host.readNote;
    if (known !== undefined || !read || line < 0) return;
    this.paragraphs.set(key, null);
    void read
      .call(this.host, path)
      .then((text) => {
        const n = text === null ? null : paragraphNumber(text, line);
        this.paragraphs.set(key, n);
        if (n !== null && !this.disposed) el.querySelector(".vt-chip-text")?.setText(sourceLabel(path, n));
      })
      .catch(() => undefined);
  }
}

function chip(parent: HTMLElement, icon: string, text: string): HTMLElement {
  const el = parent.createSpan({ cls: "vt-wh-chip" });
  setIcon(el.createSpan({ cls: "vt-chip-icon" }), icon);
  el.createSpan({ cls: "vt-chip-text", text });
  return el;
}

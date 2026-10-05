import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { noteBasename } from "../../core/text/slug";
import { paragraphNumber } from "../../services/files/paragraphNumber";
import { isNewCard, startOfLocalDay } from "../../services/srs/queue";
import { inlineNote } from "../kit/inlineNote";
import { bindPronounceButton } from "../kit/pronounce";
import { parseBlockParams } from "./params";

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

// What the block needs from the plugin. VocabTrackerPlugin has most of it
// already; the rest is wired in main.ts.
export interface WordHeaderHost {
  store: {
    readonly entries: readonly VocabEntry[];
    readonly events: { on(event: "data:changed", fn: () => void): () => void };
  };
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
    this.register(this.host.store.events.on("data:changed", () => this.render()));
    this.render();
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

    const top = root.createDiv({ cls: "vt-wh-top" });
    top.createSpan({ cls: "vt-wh-word", text: entry.word });
    const meta = [entry.phonetic, entry.partOfSpeech].map((s) => s?.trim()).filter(Boolean).join(" · ");
    if (meta) top.createSpan({ cls: "vt-wh-meta", text: meta });
    const speak = top.createEl("button", { cls: ["clickable-icon", "vt-wh-speak"], attr: { "aria-label": l("speak") } });
    setIcon(speak, "volume-2");
    bindPronounceButton(speak, entry);

    const def = entry.definitionZh?.trim() || entry.definition?.trim();
    if (def) root.createDiv({ cls: "vt-wh-def", text: def });

    const chips = root.createDiv({ cls: "vt-wh-chips" });
    if (entry.source?.path) this.renderSource(chips, entry, entry.source.path, entry.source.line);
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

import { MarkdownRenderChild, setIcon, type App, type MarkdownPostProcessorContext } from "obsidian";
import type { VocabEntry } from "../../core/model/entry";
import { CARD_MODES, RATINGS, Rating, type CardMode } from "../../core/model/srs";
import type { VocabStore } from "../../core/store/VocabStore";
import { clozeParts } from "../../core/text/cloze";
import { splitInterval } from "../../core/text/interval";
import { t, type I18nKey } from "../../core/i18n";
import type { SrsService } from "../../services/srs/SrsService";
import { isNewCard, matchesFilter, type QueueFilter } from "../../services/srs/queue";
import { buildBatchRows, type BatchRow } from "./flashcardsBatch";
import { L } from "./leftoverStrings";
import { parseFlashcardParams, type FlashcardParams } from "./params";
import { findTarget } from "./wordHeader";
import { nextReviewText, parseCardMode, timingText } from "./wordReviewModel";

// ── vocab-flashcards code block (規劃書 06 §7.1, §9.6; 設計稿 L2–L4, M2) ──
//
// One review session per block instance: the queue is snapshotted when the
// session starts (so the "3 / 8" progress stays stable) and each card is
// re-resolved by id from the store when shown/rated — a sync merge can
// swap entry objects underneath us, and rating a stale copy would be lost.
//
// With `id:` / `word:` the block reviews just that word, due or not (the
// word page's 「複習這個字」 runs it in a modal, wordReview.ts): same card
// faces, keys and rating as the queue, plus when it's due and, after
// rating, the next review date.

// What the block needs from the plugin (VocabTrackerPlugin has all of it).
export interface FlashcardsHost {
  app: App;
  store: Pick<VocabStore, "entries" | "events">;
  srs: Pick<
    SrsService,
    "ensureLoaded" | "queue" | "rate" | "preview" | "dueTomorrow" | "reviewsToday" | "timing"
  >;
  speakWord(entry: VocabEntry): void;
  jumpToSource(entry: VocabEntry): unknown;
  openVocabFile(): unknown;
}

export interface FlashcardsOptions {
  // Shown as 「完成」 after a one-word review (the modal closes itself).
  onClose?: () => void;
  // Take keyboard focus once the first card is up (a modal; never a block
  // in a note — that would steal focus from the editor).
  autoFocus?: boolean;
}

export function renderFlashcards(
  plugin: FlashcardsHost,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) {
  ctx.addChild(new FlashcardsBlock(el, plugin, parseFlashcardParams(source)));
}

export function formatInterval(ms: number): string {
  const { value, unit } = splitInterval(ms);
  return t(`srs.interval.${unit}` as I18nKey, { n: value });
}

// 「目前設定的模式」 for a one-word review: the mode last used in a
// flashcards block (opened with, or switched to), remembered per vault and
// device — a reading preference, not data, so it doesn't sync.
const MODE_KEY = "vocab-tracker:flashcards.mode";
let lastMode: CardMode | null = null;

export function rememberedMode(app: App): CardMode | null {
  if (lastMode) return lastMode;
  if (typeof app.loadLocalStorage !== "function") return null;
  const raw: unknown = app.loadLocalStorage(MODE_KEY);
  return parseCardMode(typeof raw === "string" ? raw : null);
}

function rememberMode(app: App, mode: CardMode): void {
  lastMode = mode;
  if (typeof app.saveLocalStorage === "function") app.saveLocalStorage(MODE_KEY, mode);
}

type Phase = "loading" | "card" | "empty" | "done";

let batchSeq = 0;

export class FlashcardsBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private mode: CardMode;
  private phase: Phase = "loading";
  private session: string[] = [];
  private index = 0;
  private flipped = false;
  private shownAt = 0;
  private typed = "";
  private results: { id: string; rating: Rating }[] = [];
  private initialDue = 0;
  private initialNew = 0;
  // Ids that were new when the session started (rating changes the state).
  private newIds = new Set<string>();
  // "本批單字" panel: closed while reviewing, open on the done screen.
  // Kept in memory only, per phase.
  private batchOpen = { card: false, done: true };
  private readonly batchId = `vt-fc-batch-${++batchSeq}`;
  // Set while rate() is in flight: rate() fires data:changed itself, and
  // reacting to our own write would double-render mid-transition.
  private busy = false;
  private disposed = false;
  // One-word review (`id:` / `word:`).
  private readonly single: boolean;

  constructor(
    containerEl: HTMLElement,
    private plugin: FlashcardsHost,
    private params: FlashcardParams,
    private opts: FlashcardsOptions = {}
  ) {
    super(containerEl);
    this.mode = params.mode;
    this.single = !!(params.id || params.word);
  }

  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-flashcards"] });
    // Focusable so Space / 1–4 work once the user clicks into the block.
    // Deliberately a listener on the block, not a global keydown (§7.1):
    // keys typed anywhere else in Obsidian must never rate a card.
    this.root.tabIndex = 0;
    this.registerDomEvent(this.root, "keydown", (e) => this.onKey(e));
    // The plugin's document-level reading-mode click handler would
    // otherwise pop its "Add <word> to Vocab Tracker" menu on every click
    // that lands on the card's text (the block sits inside
    // .markdown-rendered). Our own handlers live on descendants and have
    // already run by the time the event bubbles up to here.
    this.registerDomEvent(this.root, "click", (e) => e.stopPropagation());
    this.register(this.plugin.store.events.on("data:changed", () => this.onStoreChanged()));

    this.render();
    // The block the learner reviews in sets the mode a one-word review
    // opens in; a one-word review only records a mode switched to by hand.
    if (!this.single) rememberMode(this.plugin.app, this.mode);
    // Review logs feed the daily new-card cap, so wait for them before
    // building the first queue.
    void this.plugin.srs.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.startSession(undefined, { speak: this.single });
      // The spelling input in 聽音拼字, else the block (Space / 1–4).
      if (this.opts.autoFocus) (this.root.querySelector("input") ?? this.root).focus({ preventScroll: true });
    });
  }

  onunload() {
    this.disposed = true;
  }

  // ── Session state ─────────────────────────────────────────────

  private filter(): QueueFilter {
    return { source: this.params.source, mode: this.mode, limit: this.params.limit };
  }

  private live(id: string | undefined): VocabEntry | undefined {
    if (!id) return undefined;
    return this.plugin.store.entries.find((e) => e.id === id);
  }

  private current(): VocabEntry | undefined {
    return this.live(this.session[this.index]);
  }

  // The word of a one-word review, if it's (still) in the vocab list.
  private target(): VocabEntry | undefined {
    return findTarget(this.plugin.store.entries, { id: this.params.id, word: this.params.word });
  }

  // What a session starts with when no ids are given: the due queue, or
  // the one word — due or not.
  private defaultCards(): VocabEntry[] {
    if (!this.single) return this.plugin.srs.queue(this.filter());
    const entry = this.target();
    return entry && matchesFilter(entry, { mode: this.mode }) ? [entry] : [];
  }

  // `ids` replays a specific set (e.g. "practice forgotten words") instead
  // of the due queue; they're still filtered by mode so cloze never shows
  // a card it can't blank out.
  private startSession(ids?: string[], opts: { speak?: boolean } = {}) {
    const cards = ids
      ? ids
          .map((id) => this.live(id))
          .filter((e): e is VocabEntry => !!e && matchesFilter(e, { mode: this.mode }))
      : this.defaultCards();

    this.session = cards.map((e) => e.id);
    this.newIds = new Set(cards.filter(isNewCard).map((e) => e.id));
    this.initialNew = this.newIds.size;
    this.initialDue = cards.length - this.initialNew;
    this.index = 0;
    this.results = [];
    this.resetCard();
    this.phase = "card";
    this.skipMissing();
    this.render();
    if (opts.speak) this.autoSpeak();
  }

  private resetCard() {
    this.flipped = false;
    this.typed = "";
    this.shownAt = Date.now();
  }

  // Skips cards deleted (or synced away) since the session started; ends
  // the session when nothing's left.
  private skipMissing() {
    while (this.index < this.session.length && !this.current()) this.index++;
    if (this.index >= this.session.length) {
      this.phase = this.results.length > 0 ? "done" : "empty";
    }
  }

  private flip() {
    if (this.phase !== "card" || this.flipped) return;
    this.flipped = true;
    this.render();
  }

  private async rate(rating: Rating) {
    const entry = this.current();
    if (this.phase !== "card" || !this.flipped || this.busy || !entry) return;
    this.busy = true;
    try {
      await this.plugin.srs.rate(entry, rating, this.mode, Date.now() - this.shownAt);
      this.results.push({ id: entry.id, rating });
      this.index++;
      this.resetCard();
      this.skipMissing();
    } catch (err) {
      console.error("Vocab Tracker: rating failed", err);
    } finally {
      this.busy = false;
    }
    this.render();
    // Rating is a user gesture, so auto-playing the next word is allowed
    // (and expected) in listen mode.
    this.autoSpeak();
  }

  private autoSpeak() {
    const entry = this.current();
    if (this.mode === "listen" && this.phase === "card" && entry) this.plugin.speakWord(entry);
  }

  private onStoreChanged() {
    if (this.busy || this.disposed) return;
    if (this.phase === "card" && !this.current()) {
      this.skipMissing();
      this.render();
    } else if (this.phase === "empty") {
      // A word just added (or synced in) may be reviewable right away.
      if (this.defaultCards().length > 0) this.startSession();
      else if (this.single) this.render(); // e.g. the word was deleted
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || this.phase !== "card") return;

    // A keyboard-focused button in the batch list (or its toggle) gets its
    // native Enter / Space activation; 1–4 still rate the card.
    const target = e.target as HTMLElement | null;
    if (
      (e.key === " " || e.key === "Enter") &&
      target?.tagName === "BUTTON" &&
      target.closest(".vt-fc-batch, .vt-fc-batch-toggle")
    ) {
      return;
    }

    // In listen mode the spelling input owns Space and digits; only Enter
    // (submit) is ours.
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        this.flip();
      }
      return;
    }

    if ((e.key === " " || e.key === "Enter") && !this.flipped) {
      e.preventDefault(); // Space would otherwise scroll the note
      e.stopPropagation();
      this.flip();
    } else if (this.flipped && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      void this.rate(Number(e.key) as Rating);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────

  private render() {
    // Re-rendering replaces the focused element; keep keyboard focus in
    // the block if it was there, but never *take* focus on first paint
    // (that would steal it from the editor when the note opens).
    const hadFocus = this.root.contains(document.activeElement);
    this.root.empty();
    this.root.toggleClass("is-flipped", this.flipped);

    this.renderToolbar();
    if (this.phase === "card") this.renderCard();
    else if (this.phase === "empty") this.renderEmpty();
    else if (this.phase === "done") this.renderDone();

    if (hadFocus) {
      const input = this.root.querySelector("input");
      (input ?? this.root).focus({ preventScroll: true });
    }
  }

  private renderToolbar() {
    const bar = this.root.createDiv({ cls: "vt-fc-toolbar" });
    const modes = bar.createDiv({ cls: "vt-fc-modes" });
    for (const mode of CARD_MODES) {
      const b = modes.createEl("button", {
        text: t(`flashcards.mode.${mode}` as I18nKey),
        cls: "vt-fc-mode",
      });
      b.toggleClass("is-active", mode === this.mode);
      b.onclick = () => {
        if (mode === this.mode || this.phase === "loading") return;
        this.mode = mode;
        rememberMode(this.plugin.app, mode);
        this.startSession(undefined, { speak: true });
      };
    }

    const src = bar.createDiv({ cls: "vt-fc-source" });
    // Never the word itself: in 中→英 / 聽音拼字 that's the answer.
    setIcon(src.createSpan({ cls: "vt-fc-icon" }), this.single ? "crosshair" : "folder");
    src.createSpan({
      text: this.single ? L("flashcards.single.source") : (this.params.source ?? t("flashcards.source.all")),
    });
  }

  private renderCard() {
    const entry = this.current();
    if (!entry) return;

    if (this.single) {
      // Instead of 「1 / 1」: whether it's due, and what rating it early does.
      const timing = this.plugin.srs.timing(entry);
      this.root.createDiv({ cls: ["vt-fc-timing", `is-${timing.kind}`], text: timingText(timing) });
    } else {
      const progress = this.root.createDiv({ cls: "vt-fc-progress" });
      progress.createSpan({
        cls: "vt-fc-progress-n",
        text: `${this.index + 1} / ${this.session.length}`,
      });
      this.renderBatch(progress, this.root, "card");
    }

    const card = this.root.createDiv({ cls: "vt-fc-card" });
    const front = card.createDiv({ cls: "vt-fc-front" });
    switch (this.mode) {
      case "en-zh":
        this.renderWordHead(front, entry);
        break;
      case "zh-en":
        front.createDiv({ cls: "vt-fc-prompt", text: zhOf(entry) });
        if (entry.partOfSpeech) front.createDiv({ cls: "vt-fc-sub", text: entry.partOfSpeech });
        break;
      case "cloze":
        this.renderSentence(front, entry, this.flipped ? "answer" : "blank");
        if (!this.flipped && entry.definitionZh) {
          front.createDiv({ cls: "vt-fc-sub", text: entry.definitionZh });
        }
        break;
      case "listen":
        this.renderListenFront(front, entry);
        break;
    }

    if (!this.flipped) {
      card.createDiv({ cls: "vt-fc-hint", text: t(`flashcards.hint.${this.mode}` as I18nKey) });
      const flip = card.createEl("button", { cls: ["vt-fc-btn", "vt-fc-flip"] });
      flip.createSpan({ text: t("flashcards.flip") });
      flip.createEl("kbd", { cls: "vt-fc-kbd", text: t("flashcards.flipKey") });
      flip.onclick = () => this.flip();
    } else {
      this.renderBack(card.createDiv({ cls: "vt-fc-back" }), entry);
      this.renderRatings(entry);
    }

    if (this.single) return;
    const stats = this.root.createDiv({ cls: "vt-fc-stats" });
    const stat = (label: string, n: number) => {
      const s = stats.createSpan({ cls: "vt-fc-stat" });
      s.createSpan({ text: label });
      s.createSpan({ cls: "vt-fc-stat-n", text: String(n) });
    };
    stat(t("flashcards.stat.due"), this.initialDue);
    stat(t("flashcards.stat.new"), this.initialNew);
    stat(t("flashcards.stat.done"), this.results.length);
  }

  private renderWordHead(el: HTMLElement, entry: VocabEntry) {
    el.createDiv({ cls: "vt-fc-word", text: entry.word });
    const sub = el.createDiv({ cls: "vt-fc-sub" });
    const meta = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join(" · ");
    if (meta) sub.createSpan({ text: meta });
    const speak = sub.createEl("button", { cls: "vt-fc-icon-btn", attr: { "aria-label": t("row.pronounce") } });
    setIcon(speak, "volume-2");
    speak.onclick = () => this.plugin.speakWord(entry);
  }

  // Cloze sentence with the word blanked ("blank") or revealed and
  // highlighted ("answer"); also used for the example on the back.
  private renderSentence(el: HTMLElement, entry: VocabEntry, as: "blank" | "answer") {
    const parts = clozeParts(entry.example, entry.word);
    const line = el.createDiv({ cls: "vt-fc-sentence" });
    if (!parts) {
      line.setText(entry.example);
      return;
    }
    line.appendText(parts.before);
    if (as === "blank") line.createSpan({ cls: "vt-fc-blank", text: "_____" });
    else line.createEl("mark", { cls: "vt-fc-mark", text: parts.answer });
    line.appendText(parts.after);
  }

  private renderListenFront(el: HTMLElement, entry: VocabEntry) {
    const play = el.createEl("button", {
      cls: "vt-fc-listen",
      attr: { "aria-label": t("flashcards.listen.replay") },
    });
    setIcon(play, "volume-2");
    play.onclick = () => this.plugin.speakWord(entry);

    if (!this.flipped) {
      const input = el.createEl("input", {
        cls: "vt-fc-input",
        type: "text",
        attr: {
          placeholder: t("flashcards.listen.placeholder"),
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false",
        },
      });
      input.value = this.typed;
      input.oninput = () => (this.typed = input.value);
      return;
    }

    const ok = this.typed.trim().toLowerCase() === entry.word.trim().toLowerCase();
    const result = el.createDiv({ cls: ["vt-fc-result", ok ? "is-correct" : "is-wrong"] });
    setIcon(result.createSpan({ cls: "vt-fc-icon" }), ok ? "check" : "x");
    result.createSpan({
      text: ok ? t("flashcards.listen.correct") : t("flashcards.listen.wrong", { answer: this.typed.trim() || "—" }),
    });
  }

  private renderBack(el: HTMLElement, entry: VocabEntry) {
    if (this.mode !== "en-zh") this.renderWordHead(el, entry);
    if (this.mode !== "zh-en") el.createDiv({ cls: "vt-fc-answer", text: zhOf(entry) });
    if (entry.definition) el.createDiv({ cls: "vt-fc-def", text: entry.definition });
    if (entry.example && this.mode !== "cloze") this.renderSentence(el, entry, "answer");

    if (entry.source?.path) {
      const src = el.createDiv({ cls: "vt-fc-origin" });
      setIcon(src.createSpan({ cls: "vt-fc-icon" }), "file-text");
      src.createSpan({ text: entry.source.path.split("/").pop()!.replace(/\.md$/, "") });
      src.onclick = () => {
        // A modal would stay on top of the note it just opened.
        this.opts.onClose?.();
        void this.plugin.jumpToSource(entry);
      };
    }
  }

  private renderRatings(entry: VocabEntry) {
    const preview = this.plugin.srs.preview(entry);
    const grid = this.root.createDiv({ cls: "vt-fc-ratings" });
    for (const rating of RATINGS) {
      const b = grid.createEl("button", { cls: ["vt-fc-rate", `is-r${rating}`] });
      b.createEl("kbd", { cls: ["vt-fc-kbd", "vt-fc-rate-key"], text: String(rating) });
      b.createSpan({ cls: "vt-fc-rate-label", text: t(`srs.rating.${rating}` as I18nKey) });
      b.createSpan({ cls: "vt-fc-rate-interval", text: formatInterval(preview[rating].intervalMs) });
      b.onclick = () => void this.rate(rating);
    }
  }

  private renderEmpty() {
    if (this.single) return this.renderSingleEmpty();
    const box = this.root.createDiv({ cls: "vt-fc-empty" });
    setIcon(box.createDiv({ cls: "vt-fc-empty-icon" }), "layers");
    box.createDiv({ cls: "vt-fc-empty-title", text: t("flashcards.empty.title") });
    box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.body") });
    if (this.mode === "cloze") {
      box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.cloze") });
    }
    const tiles = box.createDiv({ cls: "vt-fc-tiles" });
    tile(tiles, String(this.plugin.srs.dueTomorrow(this.filter())), t("flashcards.done.dueTomorrow"));
  }

  // ── One-word review ───────────────────────────────────────────

  // The word is gone, or the mode can't show it (cloze without an example).
  private renderSingleEmpty() {
    const box = this.root.createDiv({ cls: "vt-fc-empty" });
    setIcon(box.createDiv({ cls: "vt-fc-empty-icon" }), "layers");
    const missing = !this.target();
    box.createDiv({
      cls: "vt-fc-empty-body",
      text: missing ? t("wordPage.missing") : L("flashcards.single.noCloze"),
    });
    this.renderSingleActions(box, false);
  }

  // After rating: what was recorded and when the word comes back.
  private renderSingleDone() {
    const box = this.root.createDiv({ cls: ["vt-fc-empty", "vt-fc-done", "vt-fc-single-done"] });
    setIcon(box.createDiv({ cls: "vt-fc-empty-icon" }), "check-circle-2");
    const last = this.results[this.results.length - 1];
    if (last) {
      box.createDiv({
        cls: "vt-fc-empty-title",
        text: L("flashcards.single.done", { rating: t(`srs.rating.${last.rating}` as I18nKey) }),
      });
    }
    const entry = this.live(last?.id);
    if (entry?.srs) {
      const due = new Date(entry.srs.due);
      if (!Number.isNaN(due.getTime())) {
        box.createDiv({ cls: "vt-fc-empty-body", text: nextReviewText(due, new Date(), formatInterval) });
      }
    }
    this.renderSingleActions(box, !!entry);
  }

  private renderSingleActions(box: HTMLElement, again: boolean) {
    const actions = box.createDiv({ cls: "vt-fc-actions" });
    if (again) {
      const retry = actions.createEl("button", { cls: "vt-fc-btn" });
      setIcon(retry.createSpan({ cls: "vt-fc-icon" }), "rotate-ccw");
      retry.createSpan({ text: L("flashcards.single.again") });
      // render() keeps focus in the block (the clicked button had it).
      retry.onclick = () => this.startSession(undefined, { speak: true });
    }
    const close = this.opts.onClose;
    if (close) {
      const done = actions.createEl("button", { cls: ["vt-fc-btn", "mod-cta"], text: L("flashcards.single.close") });
      done.onclick = () => close();
    }
  }

  private renderDone() {
    if (this.single) return this.renderSingleDone();
    const box = this.root.createDiv({ cls: ["vt-fc-empty", "vt-fc-done"] });
    setIcon(box.createDiv({ cls: "vt-fc-empty-icon" }), "check-circle-2");
    box.createDiv({ cls: "vt-fc-empty-title", text: t("flashcards.done.title") });
    box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.done.body") });

    const recalled = this.results.filter((r) => r.rating >= Rating.Good).length;
    const tiles = box.createDiv({ cls: "vt-fc-tiles" });
    tile(tiles, String(this.plugin.srs.reviewsToday(this.filter())), t("flashcards.done.reviewedToday"));
    tile(tiles, `${recalled} / ${this.results.length}`, t("flashcards.done.recalled"));
    tile(tiles, String(this.plugin.srs.dueTomorrow(this.filter())), t("flashcards.done.dueTomorrow"));

    const forgotten = [
      ...new Set(this.results.filter((r) => r.rating === Rating.Again).map((r) => r.id)),
    ]
      .map((id) => this.live(id))
      .filter((e): e is VocabEntry => !!e);

    if (forgotten.length > 0) {
      box.createDiv({ cls: "vt-fc-section-title", text: t("flashcards.done.forgotten") });
      const list = box.createDiv({ cls: "vt-fc-forgotten" });
      for (const entry of forgotten) {
        const row = list.createDiv({ cls: "vt-fc-forgotten-row" });
        row.createSpan({ cls: "vt-fc-forgotten-word", text: entry.word });
        row.createSpan({ cls: "vt-fc-forgotten-zh", text: entry.definitionZh });
        const speak = row.createEl("button", { cls: "vt-fc-icon-btn", attr: { "aria-label": t("row.pronounce") } });
        setIcon(speak, "volume-2");
        speak.onclick = () => this.plugin.speakWord(entry);
      }
    }

    const actions = box.createDiv({ cls: "vt-fc-actions" });
    if (forgotten.length > 0) {
      const retry = actions.createEl("button", { cls: ["vt-fc-btn", "mod-cta"] });
      setIcon(retry.createSpan({ cls: "vt-fc-icon" }), "rotate-ccw");
      retry.createSpan({ text: t("flashcards.done.retryForgotten", { count: forgotten.length }) });
      retry.onclick = () => this.startSession(forgotten.map((e) => e.id), { speak: true });
    }
    // Cards rated Again come back due within minutes (learning steps).
    const dueNow = this.plugin.srs.queue(this.filter()).length;
    if (dueNow > 0) {
      const more = actions.createEl("button", { cls: "vt-fc-btn" });
      more.setText(t("flashcards.done.continue", { count: dueNow }));
      more.onclick = () => this.startSession(undefined, { speak: true });
    }
    const back = actions.createEl("a", { cls: "vt-fc-link", text: t("flashcards.done.backToList") });
    back.onclick = (e) => {
      e.preventDefault();
      void this.plugin.openVocabFile();
    };

    this.renderBatch(box.createDiv({ cls: "vt-fc-batch-head" }), box, "done");
  }

  // ── 本批單字 list ─────────────────────────────────────────────

  // Toggle goes in `toggleHost`, the (collapsible) list in `panelHost`.
  // Opening/closing only flips `hidden` instead of re-rendering, so the
  // card underneath — a half-typed spelling, the flip state — is untouched.
  private renderBatch(toggleHost: HTMLElement, panelHost: HTMLElement, phase: "card" | "done") {
    const entries = new Map(this.plugin.store.entries.map((e) => [e.id, e]));
    const rows = buildBatchRows(
      {
        mode: this.mode,
        session: this.session,
        results: this.results,
        index: this.index,
        flipped: this.flipped,
        phase,
        newIds: this.newIds,
      },
      (id) => {
        const e = entries.get(id);
        return e && { word: e.word, zh: e.definitionZh || e.definition };
      }
    );
    if (rows.length === 0) return;

    const open = this.batchOpen[phase];
    const toggle = toggleHost.createEl("button", {
      cls: "vt-fc-batch-toggle",
      attr: { type: "button", "aria-expanded": String(open), "aria-controls": this.batchId },
    });
    toggle.toggleClass("is-open", open);
    setIcon(toggle.createSpan({ cls: "vt-fc-icon" }), "list");
    toggle.createSpan({ text: t("flashcards.batch.toggle", { n: rows.length }) });
    setIcon(toggle.createSpan({ cls: ["vt-fc-icon", "vt-fc-batch-chevron"] }), "chevron-down");

    const panel = panelHost.createDiv({ cls: "vt-fc-batch", attr: { id: this.batchId } });
    panel.hidden = !open;
    const list = panel.createEl("ol", { cls: "vt-fc-batch-list" });
    for (const row of rows) this.renderBatchRow(list, row, entries.get(row.id), phase);
    if (open) scrollToCurrent(panel);

    toggle.onclick = (e) => {
      const next = !this.batchOpen[phase];
      this.batchOpen[phase] = next;
      toggle.setAttr("aria-expanded", String(next));
      toggle.toggleClass("is-open", next);
      panel.hidden = !next;
      if (next) scrollToCurrent(panel);
      this.keepCardKeys(e);
    };
  }

  private renderBatchRow(
    list: HTMLElement,
    row: BatchRow,
    entry: VocabEntry | undefined,
    phase: "card" | "done"
  ) {
    const li = list.createEl("li", { cls: ["vt-fc-batch-row", `is-${row.status}`] });
    if (row.status === "current") li.setAttr("aria-current", "step");

    const text = li.createDiv({ cls: "vt-fc-batch-text" });
    if (row.word === null) {
      text.createSpan({
        cls: ["vt-fc-batch-word", "is-hidden"],
        text: "•••",
        attr: { "aria-label": t("flashcards.batch.hidden"), title: t("flashcards.batch.hidden") },
      });
    } else {
      text.createSpan({ cls: "vt-fc-batch-word", text: row.word });
    }
    if (row.zh) text.createSpan({ cls: "vt-fc-batch-zh", text: row.zh });

    const meta = li.createDiv({ cls: "vt-fc-batch-meta" });
    meta.createSpan({
      cls: ["vt-fc-batch-kind", row.isNew ? "is-new" : "is-due"],
      text: row.isNew ? t("flashcards.batch.new") : t("flashcards.batch.due"),
    });
    if (row.rating !== undefined) {
      meta.createSpan({
        cls: ["vt-fc-batch-rating", `is-r${row.rating}`],
        text: t(`srs.rating.${row.rating}` as I18nKey),
      });
    } else {
      meta.createSpan({
        cls: "vt-fc-batch-state",
        text: row.status === "current" ? t("flashcards.batch.current") : t("flashcards.batch.pending"),
      });
    }

    // Actions only on answered words: replaying audio of a pending card
    // would give a listen-mode answer away. Jumping to the source note
    // navigates away from this note, so it's only offered once the
    // session is over — never mid-review.
    if (!entry || row.status !== "rated") return;
    const speak = meta.createEl("button", {
      cls: "vt-fc-icon-btn",
      attr: { type: "button", "aria-label": t("row.pronounce") },
    });
    setIcon(speak, "volume-2");
    speak.onclick = (e) => {
      this.plugin.speakWord(entry);
      this.keepCardKeys(e);
    };
    if (phase === "done" && entry.source?.path) {
      const jump = meta.createEl("button", {
        cls: "vt-fc-icon-btn",
        attr: { type: "button", "aria-label": t("flashcards.batch.openSource"), title: entry.source.path },
      });
      setIcon(jump, "file-text");
      jump.onclick = () => void this.plugin.jumpToSource(entry);
    }
  }

  // After a mouse/touch click on a list control, hand focus back to the
  // block so Space / 1–4 keep acting on the card. Keyboard activation
  // (detail 0) leaves focus where the user put it.
  private keepCardKeys(e: MouseEvent) {
    if (e.detail > 0 && this.phase === "card") this.root.focus({ preventScroll: true });
  }
}

// Long batches scroll inside the panel; keep the card on screen in view
// without scrolling the note itself (scrollIntoView would).
function scrollToCurrent(panel: HTMLElement) {
  const row = panel.querySelector<HTMLElement>(".vt-fc-batch-row.is-current");
  if (row) panel.scrollTop = Math.max(0, row.offsetTop - panel.clientHeight / 2);
}

function zhOf(entry: VocabEntry): string {
  return entry.definitionZh || entry.definition || t("flashcards.noTranslation");
}

function tile(container: HTMLElement, value: string, label: string) {
  const el = container.createDiv({ cls: "vt-fc-tile" });
  el.createDiv({ cls: "vt-fc-tile-value", text: value });
  el.createDiv({ cls: "vt-fc-tile-label", text: label });
}

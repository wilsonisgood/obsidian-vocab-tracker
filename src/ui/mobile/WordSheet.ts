import { Component, Notice } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { WordContext } from "../../core/model/word-context";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import { ParagraphThreadPane, type ParagraphPaneNav } from "../sidebar/ParagraphThreadPane";
import { REBINDING_BODY_CLS, routeKey, type ParagraphRoute } from "../sidebar/routes";
import { renderVocabRow, type ExpandState } from "../word/WordRow";
import { WordUi, type WordTab } from "../word/wordUi";
import { actionNotice } from "./actionNotice";
import { BottomSheet, type SheetWindow } from "./BottomSheet";
import type { SheetTarget } from "./WordSurfaces";

// iPhone: the word card and paragraph discussions in a bottom sheet
// (規劃書 06 §9.7, design M1) instead of the right sidebar, which on a
// phone is a full-screen drawer over the article.
//
// - A word: the same WordCard as the sidebar (WordRow's "sheet" variant,
//   資料 · ✦ AI tabs, ChatPanel); a word that isn't saved yet gets the
//   「加入單字庫」 prompt.
// - A paragraph: the sidebar's ParagraphThreadPane as is; its 「← 返回」
//   closes the sheet, and 「重新綁定」 closes it until a ✦ is tapped.
//
// Redraws: tab switches and field edits redraw the card (like the
// sidebar). Store changes (dictionary data arriving, a sync) redraw the
// data tab only while nothing in the sheet has focus — and never the AI
// tab, so a streaming answer never takes the composer's focus (and the
// iOS keyboard) away. The ChatPanel updates itself.

type SheetView =
  | { kind: "word"; word: string; entryId?: string; ctx?: Partial<WordContext> }
  | { kind: "paragraph"; route: ParagraphRoute };

export interface WordSheetOptions {
  host?: HTMLElement;
  win?: SheetWindow;
}

export class WordSheet extends Component implements SheetTarget {
  readonly wordUi = new WordUi(this);
  private sheet: BottomSheet | null = null;
  private view: SheetView | null = null;
  private expand: ExpandState = "half";
  private redrawQueued = false;
  private rebindThreadId: string | null = null;
  private rebindNotice: Notice | null = null;

  constructor(
    private plugin: VocabTrackerPlugin,
    private opts: WordSheetOptions = {}
  ) {
    super();
  }

  onload(): void {
    this.register(this.plugin.store.events.on("data:changed", () => this.onDataChanged()));
    // Another note in front (incl. 「跳到原文」 from the card): the sheet
    // belonged to the previous one.
    this.registerEvent(this.plugin.app.workspace.on("file-open", () => this.close()));
    this.register(() => {
      this.cancelRebind();
      this.sheet?.destroy();
      this.sheet = null;
    });
  }

  get isOpen(): boolean {
    return !!this.sheet?.isOpen;
  }

  get rebinding(): boolean {
    return this.rebindThreadId !== null;
  }

  // What's showing, for tests and main.ts.
  get current(): Readonly<SheetView> | null {
    return this.isOpen ? this.view : null;
  }

  // ── SheetTarget ──────────────────────────────────────────────────────

  showWord(word: string, opts: { tab?: WordTab; ctx?: Partial<WordContext> } = {}): void {
    const entry = this.findEntry(word);
    if (entry && opts.tab) this.wordUi.tabs.set(entry.id, opts.tab);
    const same = this.view?.kind === "word" && this.view.word.toLowerCase() === word.toLowerCase();
    if (!same) this.expand = "half";
    this.view = { kind: "word", word, entryId: entry?.id, ctx: opts.ctx };
    this.show();
  }

  openWord(entryId: string, tab: WordTab): void {
    const entry = this.plugin.store.entries.find((e) => e.id === entryId);
    if (entry) this.showWord(entry.word, { tab });
  }

  async openParagraph(ref: SectionRef): Promise<void> {
    if (this.rebindThreadId) return this.finishRebind(ref);
    const { threads } = this.plugin;
    await threads.ensureLoaded();
    const thread = threads.paragraphThread(ref.path, ref.text);
    this.view = {
      kind: "paragraph",
      route: thread ? { name: "paragraph", threadId: thread.id } : { name: "paragraph-draft", section: ref },
    };
    this.show();
  }

  close(): void {
    this.sheet?.close();
  }

  // ── Drawing ──────────────────────────────────────────────────────────

  private ensureSheet(): BottomSheet {
    if (!this.sheet) {
      this.sheet = new BottomSheet({
        label: t("mobile.sheet.label.paragraph"),
        closeLabel: t("mobile.sheet.close"),
        host: this.opts.host,
        win: this.opts.win,
        // Unload the card's ChatPanel etc. (their subscriptions) now; the
        // DOM stays for the slide-out and goes when the layer detaches.
        onClosed: () => {
          this.wordUi.beginRender();
          this.view = null;
        },
      });
    }
    return this.sheet;
  }

  private show(): void {
    this.ensureSheet().open();
    this.draw();
  }

  private draw(): void {
    const sheet = this.sheet;
    const view = this.view;
    if (!sheet?.isOpen || !view) return;
    this.wordUi.beginRender();
    sheet.content.empty();
    sheet.content.toggleClass("is-word", view.kind === "word");
    sheet.content.toggleClass("is-paragraph", view.kind === "paragraph");
    if (view.kind === "word") this.drawWord(sheet, view);
    else this.drawParagraph(sheet, view.route);
  }

  private findEntry(word: string): VocabEntry | undefined {
    const lower = word.toLowerCase();
    return this.plugin.store.entries.find((e) => e.word.toLowerCase() === lower);
  }

  private drawWord(sheet: BottomSheet, view: Extract<SheetView, { kind: "word" }>): void {
    const entry = (view.entryId && this.plugin.store.entries.find((e) => e.id === view.entryId)) || this.findEntry(view.word);
    sheet.setLabel(t("mobile.sheet.label.word", { word: entry?.word ?? view.word }));
    if (!entry) {
      view.entryId = undefined;
      this.drawAddPrompt(sheet.content, view);
      return;
    }
    view.entryId = entry.id;
    renderVocabRow(
      this.plugin,
      sheet.content,
      entry,
      this.expand,
      (s) => (this.expand = s === "collapsed" ? "half" : s),
      () => this.draw(),
      {
        ui: this.wordUi,
        variant: "sheet",
        openWordPage: (e) => {
          this.close();
          void this.plugin.openWordPage(e.id);
        },
        onDeleted: () => this.close(),
        onJump: () => this.close(),
      }
    );
  }

  private drawAddPrompt(el: HTMLElement, view: Extract<SheetView, { kind: "word" }>): void {
    const box = el.createDiv({ cls: "vt-sheet-add" });
    box.createDiv({ cls: "vt-sheet-add-word", text: view.word });
    box.createDiv({ cls: "vt-sheet-add-hint", text: t("mobile.sheet.notTracked") });
    const btn = box.createEl("button", { cls: "mod-cta vt-sheet-add-btn", text: t("sidebar.addPrompt.cta") });
    btn.addEventListener("click", () => {
      btn.disabled = true;
      void this.plugin
        .addWordToVocab(view.word, view.ctx ?? {}, { reveal: false })
        .then(() => this.draw())
        .catch((e) => {
          console.error("Vocab Tracker: couldn't add the word", e);
          btn.disabled = false;
        });
    });
  }

  private drawParagraph(sheet: BottomSheet, route: ParagraphRoute): void {
    sheet.setLabel(t("mobile.sheet.label.paragraph"));
    this.wordUi.component.addChild(new ParagraphThreadPane(sheet.content, route, this.plugin, this.wordUi.chat, this.paneNav()));
  }

  private paneNav(): ParagraphPaneNav {
    return {
      back: () => this.close(),
      threadStarted: (section, threadId) => {
        const view = this.view;
        if (view?.kind !== "paragraph" || view.route.name !== "paragraph-draft") return;
        const s = view.route.section;
        if (s.path !== section.path || s.lineStart !== section.lineStart) return;
        const draftKey = routeKey(view.route);
        view.route = { name: "paragraph", threadId };
        // Keep the composer focused across the hand-over.
        const chat = this.wordUi.chat;
        if (chat.focused === draftKey) chat.focused = threadId;
        this.draw();
      },
      rebind: (id) => this.startRebind(id),
      jumped: () => this.close(),
      removed: (id) => {
        const view = this.view;
        if (view?.kind === "paragraph" && view.route.name === "paragraph" && view.route.threadId === id) this.close();
      },
    };
  }

  private onDataChanged(): void {
    if (this.redrawQueued || !this.isOpen || this.view?.kind !== "word") return;
    this.redrawQueued = true;
    window.setTimeout(() => {
      this.redrawQueued = false;
      const view = this.view;
      if (!this.isOpen || view?.kind !== "word") return;
      if (view.entryId && this.wordUi.tabs.get(view.entryId) === "ai") return;
      const active = this.sheet?.panel.ownerDocument?.activeElement;
      if (active && this.sheet?.panel.contains(active)) return;
      this.draw();
    }, 0);
  }

  // ── Moving a discussion to another paragraph (from the sheet) ─────────

  private startRebind(threadId: string): void {
    this.close();
    this.cancelRebind();
    this.rebindThreadId = threadId;
    document.body.addClass(REBINDING_BODY_CLS);
    this.rebindNotice = actionNotice(t("mobile.rebind.pick"), [{ label: t("paragraph.rebind.cancel"), run: () => this.cancelRebind() }], 0);
  }

  private cancelRebind(): void {
    if (this.rebindThreadId === null && !this.rebindNotice) return;
    this.rebindThreadId = null;
    document.body.removeClass(REBINDING_BODY_CLS);
    this.rebindNotice?.hide();
    this.rebindNotice = null;
  }

  private async finishRebind(ref: SectionRef): Promise<void> {
    const threadId = this.rebindThreadId as string;
    this.cancelRebind();
    try {
      if (!(await this.plugin.threads.rebindParagraph(threadId, ref))) return;
      new Notice(t("paragraph.rebind.done"));
      this.view = { kind: "paragraph", route: { name: "paragraph", threadId } };
      this.show();
    } catch (e) {
      console.error("Vocab Tracker: rebind failed", e);
      new Notice(t("paragraph.rebind.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
}

import {
  Component,
  FuzzySuggestModal,
  MarkdownRenderChild,
  MarkdownRenderer,
  Notice,
  setIcon,
  type App,
  type MarkdownPostProcessorContext,
} from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { joinWords, t, type I18nKey } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { Turn } from "../../core/model/thread";
import { TRIVIA_THREAD_ID } from "../../core/model/trivia";
import { triviaFollowup } from "../../services/ai/tasks/trivia";
import { subjectOf } from "../../services/learn/triviaPick";
import { WordIndex } from "../../services/learn/wordIndex";
import { ChatPanel, createChatUiState, type ChatPanelOptions, type ChatSend } from "../chat/ChatPanel";
import { emptyState } from "../kit/emptyState";
import type { KitAction } from "../kit/emptyState";
import { openPluginSettings } from "../kit/openSettings";
import { guardReadingClicks, learnErrorText } from "./learnUi";
import {
  favoriteViews,
  nextFeedback,
  parseTriviaParams,
  triviaCall,
  triviaTurnActions,
  triviaTurnHeader,
  type TriviaCall,
  type TriviaParams,
} from "./triviaModel";
import { shortDate } from "./verbsModel";

// ── vocab-trivia code block (規劃書 06 §7.4, §9.3, §9.6; 設計稿 L7、M4) ──
//
//   ```vocab-trivia
//   word: apron        # keep the conversation on one word (optional)
//   favorites: off     # hide 「收藏的冷知識」 (optional)
//   ```
//
// The single trivia-session conversation in a ChatPanel (surface
// "trivia"): quick actions 再來一則 / 考我一題 / 字源 / 笑話, follow-ups from
// the composer, and 👍 👎 / 收藏 under each answer. 「再來一則」 lets
// TriviaService pick the word, which keeps 30 rounds without a repeat.

export function renderTrivia(
  plugin: VocabTrackerPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new TriviaBlock(el, plugin, parseTriviaParams(source), ctx.sourcePath));
}

class WordPickModal extends FuzzySuggestModal<VocabEntry> {
  constructor(
    app: App,
    private entries: VocabEntry[],
    private onPick: (e: VocabEntry) => void
  ) {
    super(app);
    this.setPlaceholder(t("learn.trivia.pick.placeholder"));
  }

  getItems(): VocabEntry[] {
    return this.entries;
  }

  getItemText(e: VocabEntry): string {
    return e.definitionZh ? `${e.word}  ${e.definitionZh}` : e.word;
  }

  onChooseItem(e: VocabEntry): void {
    this.onPick(e);
  }
}

class TriviaBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private chipEl: HTMLButtonElement | null = null;
  private chatHost: HTMLElement | null = null;
  private chat: ChatPanel | null = null;
  private favEl: HTMLElement | null = null;
  private favScope: Component | null = null;
  private chatState = createChatUiState();
  private hasWords = false;
  private ready = false;
  private disposed = false;

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private params: TriviaParams,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-trivia"] });
    guardReadingClicks(this, this.root);
    this.root.createDiv({ cls: "vt-learn-loading", text: t("learn.loading") });

    this.register(this.plugin.store.events.on("data:changed", () => this.onStoreChanged()));
    const favChanged = () => {
      if (!this.ready) return;
      this.renderFavorites();
      // Turn actions read the favorites (收藏 ↔ 已收藏); ChatPanel only
      // redraws on thread events, so redraw its turns.
      this.chat?.refresh();
    };
    this.register(this.plugin.learn.events.on("trivia:upsert", favChanged));
    this.register(this.plugin.learn.events.on("learn:reloaded", favChanged));
    this.register(() => (this.disposed = true));

    void this.plugin.trivia.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.ready = true;
      this.build();
    });
  }

  private get entries(): VocabEntry[] {
    return this.plugin.store.entries;
  }

  private pinned(): VocabEntry | undefined {
    return this.params.word ? new WordIndex(this.entries).find(this.params.word) : undefined;
  }

  private entryById(id: string | undefined): VocabEntry | undefined {
    return id ? this.entries.find((e) => e.id === id) : undefined;
  }

  private onStoreChanged(): void {
    if (!this.ready) return;
    if (this.entries.length > 0 !== this.hasWords) return this.build();
    this.updateChip();
    this.renderFavorites();
  }

  // ── Layout ────────────────────────────────────────────────────

  private build(): void {
    const root = this.root;
    root.empty();
    this.chipEl = null;
    this.chatHost = null;
    this.favEl = null;
    if (this.chat) this.removeChild(this.chat);
    this.chat = null;
    this.hasWords = this.entries.length > 0;

    if (this.params.word && !this.pinned()) {
      root.appendChild(emptyState({ icon: "lightbulb", title: t("learn.notFound", { word: this.params.word }) }));
    } else if (!this.hasWords) {
      root.appendChild(
        emptyState({ icon: "lightbulb", title: t("learn.trivia.empty.title"), body: t("learn.trivia.empty.body") })
      );
    } else {
      const card = root.createDiv({ cls: "vt-trivia-card" });
      const head = card.createDiv({ cls: "vt-trivia-head" });
      const title = head.createSpan({ cls: "vt-trivia-title" });
      setIcon(title.createSpan({ cls: "vt-trivia-title-icon" }), "lightbulb");
      title.createSpan({ text: t("learn.trivia.title") });
      this.chipEl = head.createEl("button", { cls: "vt-trivia-subject" });
      this.chipEl.addEventListener("click", () => this.pickWord());
      this.updateChip();

      this.chatHost = card.createDiv({ cls: "vt-trivia-chat" });
      this.mountChat();
      card.createDiv({ cls: "vt-trivia-footer", text: t("learn.trivia.footer") });
    }

    if (this.params.favorites) {
      this.favEl = root.createDiv({ cls: "vt-trivia-favs" });
      this.renderFavorites();
    }
  }

  // 「從已學的 24 個字隨機 ⌄」 — a click picks the word for the next round.
  private updateChip(): void {
    const chip = this.chipEl;
    if (!chip) return;
    chip.empty();
    const pinned = this.pinned();
    chip.createSpan({
      text: pinned
        ? t("learn.trivia.subject", { word: pinned.word })
        : t("learn.trivia.random", { n: this.entries.length }),
    });
    if (!pinned) setIcon(chip.createSpan({ cls: "vt-trivia-subject-icon" }), "chevron-down");
    chip.disabled = !!pinned || this.plugin.ai.status() !== "ready";
    chip.title = pinned ? "" : t("learn.trivia.pick");
  }

  private pickWord(): void {
    if (this.pinned() || this.plugin.trivia.isBusy()) return;
    new WordPickModal(this.plugin.app, [...this.entries], (e) => {
      this.run({ type: "ask", kind: "next", entryId: e.id });
    }).open();
  }

  private mountChat(): void {
    const host = this.chatHost;
    if (!host) return;
    if (this.chat) this.removeChild(this.chat);
    host.empty();
    const opts: ChatPanelOptions = {
      app: this.plugin.app,
      threads: this.plugin.threads,
      ai: this.plugin.ai,
      selection: this.plugin.selection,
      threadId: TRIVIA_THREAD_ID,
      surface: "trivia",
      customTaskId: triviaFollowup.id,
      sourcePath: this.sourcePath,
      placeholder: t("learn.trivia.placeholder"),
      state: this.chatState,
      send: (req) => this.send(req),
      retry: (turnId) => this.retry(turnId),
      turnActions: (turn) => this.turnActions(turn),
      turnHeader: (turn) => this.turnHeader(turn),
      onOpenSettings: () => openPluginSettings(this.plugin.app, this.plugin.manifest.id),
    };
    this.chat = this.addChild(new ChatPanel(host, opts));
  }

  // ── Conversation ──────────────────────────────────────────────

  private async call(c: TriviaCall): Promise<void> {
    if (c.type === "followup") return this.plugin.trivia.followup(c.question, c.selection);
    const subject = await this.plugin.trivia.ask(c.kind, c.entryId ? { entryId: c.entryId } : {});
    if (!subject && !this.plugin.trivia.isBusy()) new Notice(t("learn.trivia.noWords"));
  }

  private run(c: TriviaCall): void {
    this.call(c).catch((e) => {
      console.error("Vocab Tracker: trivia request failed", e);
      new Notice(learnErrorText(e));
    });
  }

  private async send(req: ChatSend): Promise<void> {
    const c = triviaCall(req, this.pinned()?.id);
    if (c) await this.call(c);
  }

  private retry(turnId: string): Promise<void> {
    return this.plugin.trivia.retry(turnId);
  }

  private subjectWord(turn: Turn): string | undefined {
    return this.entryById(subjectOf(this.plugin.trivia.thread(), turn))?.word;
  }

  private turnHeader(turn: Turn): { text: string; icon: string } | undefined {
    const text = triviaTurnHeader(turn, this.subjectWord(turn), (kind) =>
      kind === "next" ? t("learn.trivia.turn.next") : t(`ai.task.trivia.${kind}` as I18nKey)
    );
    return text ? { text, icon: "lightbulb" } : undefined;
  }

  private turnActions(turn: Turn): KitAction[] {
    const { threads, trivia } = this.plugin;
    const favorite = trivia.favoriteOf(turn.id);
    const specs = triviaTurnActions(turn, { subjectWord: this.subjectWord(turn), favorite, feedback: true });
    return specs.map((s): KitAction => {
      const label = t(s.label, s.params);
      const base = { label, icon: s.icon, active: s.active, iconOnly: s.iconOnly };
      switch (s.kind) {
        case "up":
        case "down": {
          const kind = s.kind;
          return {
            ...base,
            onClick: () => void threads.setFeedback(TRIVIA_THREAD_ID, turn.id, nextFeedback(turn.feedback, kind)),
          };
        }
        case "favorite":
          return {
            ...base,
            onClick: () => {
              if (!this.plugin.trivia.favorite(turn.id)) new Notice(t("learn.trivia.noWords"));
            },
          };
        case "unfavorite":
          return { ...base, onClick: () => favorite && this.plugin.trivia.unfavorite(favorite.id) };
      }
    });
  }

  // ── 收藏的冷知識 ───────────────────────────────────────────────

  private renderFavorites(): void {
    const el = this.favEl;
    if (!el) return;
    el.empty();
    if (this.favScope) this.removeChild(this.favScope);
    const scope = (this.favScope = this.addChild(new Component()));

    el.createDiv({ cls: "vt-trivia-favs-title", text: t("learn.trivia.favorites") });
    const pinned = this.pinned();
    const items = this.plugin.trivia.favorites(pinned?.id);
    const views = favoriteViews(items, (id) => this.entryById(id)?.word, shortDate);
    if (!views.length) {
      el.createDiv({ cls: "vt-trivia-favs-empty", text: t("learn.trivia.favorites.empty") });
      return;
    }
    for (const v of views) {
      const card = el.createDiv({ cls: "vt-trivia-fav" });
      const head = card.createDiv({ cls: "vt-trivia-fav-head" });
      head.createSpan({ cls: "vt-trivia-fav-title", text: v.heading });
      const remove = head.createEl("button", { cls: "vt-trivia-fav-remove clickable-icon" });
      setIcon(remove, "bookmark-minus");
      remove.setAttr("aria-label", t("learn.trivia.unfavorite"));
      remove.addEventListener("click", () => this.plugin.trivia.unfavorite(v.id));
      const body = card.createDiv({ cls: "vt-trivia-fav-body" });
      void MarkdownRenderer.render(this.plugin.app, v.body, body, this.sourcePath, scope);
      const meta: string[] = [];
      if (v.date) meta.push(v.date);
      if (v.mentions.length) meta.push(t("learn.trivia.mentions", { words: joinWords(v.mentions) }));
      if (meta.length) card.createDiv({ cls: "vt-trivia-fav-meta", text: meta.join(" · ") });
    }
  }
}

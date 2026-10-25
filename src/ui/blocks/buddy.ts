import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { liveTurns, type Thread } from "../../core/model/thread";
import { buddyCustom, buddyReview } from "../../services/ai/tasks/buddy";
import { ChatPanel, createChatUiState, type ChatPanelOptions, type ChatSend } from "../chat/ChatPanel";
import { dayLabel } from "../kit/dates";
import { openPluginSettings } from "../kit/openSettings";
import { guardReadingClicks } from "./learnUi";

// ── vocab-buddy code block (規劃書 15 §7) ──
//
//   ```vocab-buddy
//   ```
//
// 學習夥伴: free conversation in a ChatPanel (surface "buddy"). A list of
// recent conversations sits above; each is its own thread (`buddy:<id>`).

const TITLE_CHARS = 30;

// 「第一個問題前 30 字」 — a quick-action question shows its button label.
export function buddyThreadTitle(thread: Thread): string {
  const first = liveTurns(thread).find((turn) => turn.role === "user");
  const text = (first?.question?.trim() || first?.content.trim() || "").replace(/\s+/g, " ");
  const chars = [...text];
  if (!chars.length) return t("buddy.untitled");
  return chars.length > TITLE_CHARS ? `${chars.slice(0, TITLE_CHARS).join("")}…` : text;
}

export function renderBuddy(
  plugin: VocabTrackerPlugin,
  _source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new BuddyBlock(el, plugin, ctx.sourcePath));
}

class BuddyBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private listEl!: HTMLElement;
  private chatHost!: HTMLElement;
  private chat: ChatPanel | null = null;
  private chatState = createChatUiState();
  // The open conversation; an id nothing is stored under yet is a new one.
  private threadId = "";
  private disposed = false;

  constructor(
    containerEl: HTMLElement,
    private plugin: VocabTrackerPlugin,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-buddy"] });
    guardReadingClicks(this, this.root);
    this.register(() => (this.disposed = true));

    const head = this.root.createDiv({ cls: "vt-buddy-head" });
    const title = head.createSpan({ cls: "vt-buddy-title" });
    setIcon(title.createSpan({ cls: "vt-buddy-title-icon" }), "message-circle");
    title.createSpan({ text: t("buddy.title") });
    const newBtn = head.createEl("button", { cls: "vt-chip vt-buddy-new", text: t("buddy.new") });
    newBtn.addEventListener("click", () => this.startNew());

    this.listEl = this.root.createDiv({ cls: "vt-buddy-list" });
    this.chatHost = this.root.createDiv({ cls: "vt-buddy-chat" });

    // Only list changes matter here; the ChatPanel follows its own thread.
    this.register(this.plugin.threads.events.on("thread:upsert", (th) => th.anchor.kind === "buddy" && this.renderList()));
    this.register(this.plugin.threads.events.on("threads:reloaded", () => this.renderList()));

    void this.plugin.threads.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.threadId = this.listed()[0]?.id ?? this.plugin.threads.newBuddyThreadId();
      this.renderList();
      this.mountChat();
    });
  }

  // Conversations worth listing: not deleted, at least one live question.
  private listed(): Thread[] {
    return this.plugin.threads.buddyThreads().filter((th) => liveTurns(th).some((turn) => turn.role === "user"));
  }

  private open(id: string): void {
    if (id === this.threadId) return;
    this.threadId = id;
    this.renderList();
    this.mountChat();
  }

  private startNew(): void {
    // Already on an empty new conversation: nothing to start.
    if (!liveTurns(this.plugin.threads.get(this.threadId)).length) return;
    this.open(this.plugin.threads.newBuddyThreadId());
  }

  private renderList(): void {
    const el = this.listEl;
    el.empty();
    const now = new Date();
    for (const th of this.listed()) {
      const row = el.createEl("button", { cls: "vt-buddy-item", attr: { type: "button" } });
      row.toggleClass("is-active", th.id === this.threadId);
      row.createSpan({ cls: "vt-buddy-item-title", text: buddyThreadTitle(th) });
      row.createSpan({ cls: "vt-buddy-item-date", text: dayLabel(th.updatedAt ?? th.createdAt, now) ?? "" });
      row.addEventListener("click", () => this.open(th.id));
    }
    el.toggle(el.childElementCount > 0);
  }

  private mountChat(): void {
    if (this.chat) this.removeChild(this.chat);
    this.chatHost.empty();
    const opts: ChatPanelOptions = {
      app: this.plugin.app,
      threads: this.plugin.threads,
      ai: this.plugin.ai,
      selection: this.plugin.selection,
      threadId: this.threadId,
      surface: "buddy",
      customTaskId: buddyCustom.id,
      sourcePath: this.sourcePath,
      placeholder: t("buddy.placeholder"),
      state: this.chatState,
      send: (req) => this.send(req),
      retry: (turnId) => this.plugin.threads.retryBuddy(this.threadId, turnId),
      onOpenSettings: () => openPluginSettings(this.plugin.app, this.plugin.manifest.id),
    };
    this.chat = this.addChild(new ChatPanel(this.chatHost, opts));
  }

  private async send(req: ChatSend): Promise<void> {
    let { question } = req;
    // 一起看看我寫的: the English pasted into the composer is the text to
    // look at (quick actions don't carry the draft), then the draft is spent.
    if (req.taskId === buddyReview.id && !question) {
      const draft = this.chatState.drafts.get(this.threadId)?.trim();
      if (draft) {
        question = draft;
        this.chatState.drafts.delete(this.threadId);
        this.mountChat();
      }
    }
    await this.plugin.threads.askBuddy(this.threadId, { taskId: req.taskId, question, selection: req.selection });
  }
}

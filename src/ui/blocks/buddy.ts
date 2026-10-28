import { MarkdownRenderChild, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { liveTurns, type Thread } from "../../core/model/thread";
import { defaultExpandedKeys, groupByDay, isGroupCollapsed, localDay, shouldWarnNinth, userQuestionCount, type DayGroup } from "../../core/learner/buddyGroups";
import { ROTATION_MS, rotationPaused, rotationWindow } from "../../core/learner/quickRotation";
import { buddyCustom, buddyGrammar, buddyPlan, buddyReading, buddyReview, buddyShare, buddyLevel, buddyWriting } from "../../services/ai/tasks/buddy";
import { BuddyNearFullModal } from "./BuddyNearFullModal";
import { showSinkButton } from "./scrollBottom";
import { ChatPanel, createChatUiState, type ChatPanelOptions, type ChatSend } from "../chat/ChatPanel";
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
const WARN_KEY = "buddy-nearfull-day";

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
  // 分類欄的收合狀態（true = 收起），這個 block 存活期間記住。
  private groupOverrides = new Map<string, boolean>();
  // 快速按鈕輪替：第幾輪、滑鼠是否停在按鈕列。
  private round = 0;
  private hovering = false;
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
    const listBtn = head.createEl("button", { cls: "vt-chip vt-buddy-list-toggle", text: t("buddy.list"), attr: { type: "button" } });
    listBtn.addEventListener("click", () => this.root.toggleClass("is-list-open", !this.root.hasClass("is-list-open")));
    const newBtn = head.createEl("button", { cls: "vt-chip vt-buddy-new", text: t("buddy.new") });
    newBtn.addEventListener("click", () => this.startNew());

    const body = this.root.createDiv({ cls: "vt-buddy-body" });
    this.chatHost = body.createDiv({ cls: "vt-buddy-chat" });
    this.listEl = body.createDiv({ cls: "vt-buddy-list" });

    this.registerDomEvent(this.chatHost, "mouseover", (e) => {
      this.hovering = e.target instanceof Element && !!e.target.closest(".vt-chat-quick");
    });
    this.registerDomEvent(this.chatHost, "mouseleave", () => (this.hovering = false));
    this.registerInterval(window.setInterval(() => this.rotateQuick(), ROTATION_MS));
    this.setupSink();

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
    const threads = this.listed();
    const byId = new Map(threads.map((th) => [th.id, th]));
    const groups = groupByDay(
      threads.map((th) => ({ id: th.id, at: th.updatedAt ?? th.createdAt ?? "" })),
      now
    );
    const defaults = defaultExpandedKeys(groups, this.threadId, now);
    for (const g of groups) {
      const collapsed = isGroupCollapsed(g.key, this.groupOverrides, defaults);
      const heading = el.createDiv({ cls: "vt-buddy-group-head" });
      setIcon(heading.createSpan({ cls: "vt-buddy-group-arrow" }), collapsed ? "chevron-right" : "chevron-down");
      heading.createSpan({ cls: "vt-buddy-group-title", text: this.groupLabel(g) });
      heading.createSpan({ cls: "vt-buddy-group-count", text: String(g.ids.length) });
      heading.addEventListener("click", () => {
        this.groupOverrides.set(g.key, !collapsed);
        this.renderList();
      });
      if (collapsed) continue;
      for (const id of g.ids) {
        const th = byId.get(id);
        if (!th) continue;
        const row = el.createEl("button", { cls: "vt-buddy-item", attr: { type: "button" } });
        row.toggleClass("is-active", th.id === this.threadId);
        row.createSpan({ cls: "vt-buddy-item-title", text: buddyThreadTitle(th) });
        row.addEventListener("click", () => {
          this.root.removeClass("is-list-open");
          this.open(th.id);
        });
      }
    }
    el.toggleClass("is-empty", groups.length === 0);
  }

  private groupLabel(g: DayGroup): string {
    const label = g.label;
    if (label.kind === "today") return t("buddy.group.today");
    if (label.kind === "yesterday") return t("buddy.group.yesterday");
    return label.md;
  }

  // ── 快速按鈕：常駐「隨機分享」＋ 六題輪流兩個 ──

  private rotationPool(): string[] {
    return [buddyGrammar, buddyWriting, buddyReview, buddyLevel, buddyReading, buddyPlan].map((task) => task.id);
  }

  private quickIds(): string[] {
    return [buddyShare.id, ...rotationWindow(this.rotationPool(), this.round)];
  }

  private rotateQuick(): void {
    if (this.disposed || !this.chat) return;
    const active = document.activeElement;
    const focused = active instanceof HTMLTextAreaElement && this.chatHost.contains(active);
    if (rotationPaused({ hovering: this.hovering, composerFocused: focused })) return;
    this.round++;
    this.chat.refreshQuick();
  }

  // ── 沉底按鈕：頁面不在最底時，右下角一顆圓形按鈕 ──

  private setupSink(): void {
    const scroller = this.containerEl.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
    if (!scroller) return;
    const btn = document.body.createEl("button", {
      cls: "vt vt-buddy-sink clickable-icon",
      attr: { type: "button", "aria-label": t("buddy.sink") },
    });
    setIcon(btn, "arrow-down");
    btn.hide();
    btn.addEventListener("click", () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }));
    const update = () => {
      const rect = scroller.getBoundingClientRect();
      const visible = this.root.isConnected && rect.width > 0 && rect.height > 0;
      if (!visible || !showSinkButton(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)) return btn.hide();
      btn.style.right = `${Math.max(8, window.innerWidth - rect.right + 16)}px`;
      btn.style.bottom = `${Math.max(8, window.innerHeight - rect.bottom + 16)}px`;
      btn.show();
    };
    this.registerDomEvent(scroller, "scroll", update);
    this.registerDomEvent(window, "resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(this.root);
    this.register(() => {
      observer.disconnect();
      btn.remove();
    });
    update();
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
      quickTasks: () => this.quickIds(),
      attachSelection: false,
      placeholder: t("buddy.placeholder"),
      state: this.chatState,
      send: (req) => this.send(req),
      retry: (turnId) => this.plugin.threads.retryBuddy(this.threadId, turnId),
      onOpenSettings: () => openPluginSettings(this.plugin.app, this.plugin.manifest.id),
    };
    this.chat = this.addChild(new ChatPanel(this.chatHost, opts));
  }

  // 第 9 則問題送出時提示一次「再一則就存檔」，一天一次。
  private maybeWarnNinth(): void {
    const number = userQuestionCount(this.plugin.threads.get(this.threadId)) + 1;
    const today = localDay(new Date());
    if (!shouldWarnNinth(number, this.plugin.device.get(WARN_KEY), today)) return;
    this.plugin.device.set(WARN_KEY, today);
    new BuddyNearFullModal(this.plugin.app).open();
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
    this.maybeWarnNinth();
    await this.plugin.threads.askBuddy(this.threadId, { taskId: req.taskId, question });
  }
}

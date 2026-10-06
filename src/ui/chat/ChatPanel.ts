import { Component, MarkdownRenderer, Notice, setIcon, type App } from "obsidian";
import { getLocale, t } from "../../core/i18n";
import { liveTurns, type Thread, type Turn } from "../../core/model/thread";
import type { AiService } from "../../services/ai/AiService";
import { AiError, type AiErrorCode } from "../../services/ai/errors";
import type { Surface } from "../../services/ai/tasks/types";
import type { ThreadService } from "../../services/threads/ThreadService";
import { aiErrorText, renderAiGate } from "../kit/aiState";
import { bubble } from "../kit/bubble";
import type { KitAction } from "../kit/emptyState";
import { runUndoable } from "../kit/undoable";
import type { SelectionTracker } from "./SelectionTracker";

// 整合事項: "chat.action.delete" isn't in src/core/i18n/{zh-TW,en}.ts yet
// (shared files this wave doesn't touch) — add it next to the other
// chat.action.* keys ("刪除這組問答" / "Delete this Q&A") and switch
// deleteQaLabel() below to t("chat.action.delete").
const DELETE_QA_LABEL: Record<"zh-TW" | "en", string> = { "zh-TW": "刪除這組問答", en: "Delete this Q&A" };
function deleteQaLabel(): string {
  return DELETE_QA_LABEL[getLocale()] ?? DELETE_QA_LABEL.en;
}

// Discussion panel shared by word (A2, M4), paragraph (A1, M5) and trivia
// (L7, M7) threads — 規劃書 06 §9.3, design D3/D4.
//
// It owns its DOM and updates it in place: a finished turn re-renders the
// turn list, a streaming delta repaints only the last bubble (once per
// animation frame), and the composer is never rebuilt while the panel is
// alive — so typing a follow-up during a streaming answer never loses focus.
// If the host redraws everything anyway (sidebar re-render), the draft and
// focus come back from ChatUiState, and an answer that's still streaming
// keeps streaming into the new panel (its text lives in ThreadService).

// Survives the host's redraws; one per sidebar / dashboard.
export interface ChatUiState {
  drafts: Map<string, string>;
  focused: string | null;
}

export function createChatUiState(): ChatUiState {
  return { drafts: new Map(), focused: null };
}

export interface ChatSend {
  taskId: string;
  question?: string;
  selection?: string;
}

export interface ChatPanelOptions {
  app: App;
  threads: ThreadService;
  ai: AiService;
  selection: SelectionTracker;
  threadId: string;
  surface: Surface;
  // Task used for free-form questions typed into the composer.
  customTaskId: string;
  // Resolves links inside rendered answers.
  sourcePath: string;
  placeholder: string;
  state: ChatUiState;
  send(req: ChatSend): Promise<void>;
  retry(turnId: string): Promise<void>;
  turnActions?(turn: Turn): KitAction[];
  // A line above an answer, e.g. 「冷知識 · apron」 (trivia, design L7).
  turnHeader?(turn: Turn): { text: string; icon?: string } | undefined;
  // Extra meta-line text that needs I/O, e.g. 「出自 ¶12」.
  origin?: Promise<string | undefined>;
  onOpenSettings(): void;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export class ChatPanel extends Component {
  private root: HTMLElement;
  private metaEl!: HTMLElement;
  private turnsEl!: HTMLElement;
  private selectionEl: HTMLElement | null = null;
  private input: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private quickBtns: HTMLButtonElement[] = [];
  private originText: string | undefined;

  // Turn-list markdown lives in its own child component, reset on every
  // re-render so old render children don't pile up.
  private turnsScope: Component | null = null;
  private streamScope: Component | null = null;
  private streamBody: HTMLElement | null = null;
  private streamTurnId: string | null = null;
  private streamText = "";
  private frame: number | null = null;
  private paintSeq = 0;
  private scrollOnNextRender = false;
  private alive = false;

  constructor(parent: HTMLElement, private opts: ChatPanelOptions) {
    super();
    this.root = parent.createDiv({ cls: "vt-chat" });
  }

  onload(): void {
    const { threads, threadId } = this.opts;
    this.alive = true;
    this.register(() => (this.alive = false));
    this.metaEl = this.root.createDiv({ cls: "vt-chat-meta" });
    this.turnsEl = this.root.createDiv({ cls: "vt-chat-turns" });
    this.renderControls();
    this.renderTurns();

    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.id === threadId) this.renderTurns();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.renderTurns()));
    this.register(
      threads.events.on("thread:turn-delta", (d) => {
        if (d.threadId !== threadId) return;
        if (d.turnId !== this.streamTurnId) return this.renderTurns();
        this.streamText = d.text;
        this.schedulePaint();
      })
    );
    this.register(
      threads.events.on("thread:retry-wait", (d) => {
        if (d.threadId === threadId && d.turnId === this.streamTurnId && !this.streamText && this.streamBody) {
          this.streamBody.setText(t("chat.retryWait", { seconds: Math.ceil(d.delayMs / 1000) }));
        }
      })
    );
    this.register(this.opts.selection.events.on("change", () => this.renderSelection()));
    this.register(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    });

    // Threads load lazily; draw again once they're in.
    void threads.ensureLoaded().then(() => {
      if (this.alive) this.renderTurns();
    });
    void this.opts.origin?.then((text) => {
      this.originText = text;
      if (this.alive) this.renderMeta(threads.get(threadId));
    });
  }

  private get thread(): Thread | undefined {
    return this.opts.threads.get(this.opts.threadId);
  }

  private get busy(): boolean {
    return this.opts.threads.isBusy(this.opts.threadId);
  }

  // ── Meta line: 「比較 · 10/02 · 出自 ¶12」 ─────────────────────────
  private renderMeta(thread: Thread | undefined): void {
    this.metaEl.empty();
    const turns = liveTurns(thread);
    if (!turns.length) return;
    const parts: string[] = [];
    const labels = new Set<string>();
    for (const turn of turns) {
      const label = turn.role === "user" && turn.taskId ? this.opts.ai.tasks.get(turn.taskId)?.label : undefined;
      if (label) labels.add(t(label));
    }
    parts.push(...labels);
    parts.push(shortDate(turns[turns.length - 1].at));
    if (this.originText) parts.push(this.originText);
    setIcon(this.metaEl.createSpan({ cls: "vt-chat-meta-icon" }), "sparkles");
    this.metaEl.createSpan({ text: parts.join(" · ") });
  }

  // ── Turns ────────────────────────────────────────────────────────

  // Redraws the turns when something outside the thread changed what
  // turnActions / turnHeader return (e.g. a trivia favorite). The composer
  // and its draft are left alone.
  refresh(): void {
    this.renderTurns();
  }

  private renderTurns(): void {
    const thread = this.thread;
    this.renderMeta(thread);
    if (this.turnsScope) this.removeChild(this.turnsScope);
    this.turnsScope = this.addChild(new Component());
    this.streamBody = null;
    this.streamTurnId = null;
    this.turnsEl.empty();

    const turns = liveTurns(thread);
    if (!turns.length) {
      this.turnsEl.createDiv({ cls: "vt-chat-empty", text: t("chat.empty") });
    }
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.role !== "user") {
        this.turnsEl.appendChild(this.answerBubble(turn));
        continue;
      }
      // The pair this question starts is still streaming (or about to
      // retry) when its answer is the very next turn and hasn't settled
      // yet — not deletable until it does.
      const next = turns[i + 1];
      const pairBusy = !!next && next.role === "assistant" && next.status === "streaming";
      this.turnsEl.appendChild(this.userBubble(turn, pairBusy));
    }
    this.updateBusy();
    if (this.scrollOnNextRender) {
      this.scrollOnNextRender = false;
      (this.input ?? this.turnsEl).scrollIntoView({ block: "nearest" });
    }
  }

  // Delete sits on the question bubble rather than the answer's action
  // bar (where pin/copy/retry live): that bar only exists for a finished
  // answer, but a pair must stay deletable with no answer yet or a
  // failed one too, and the question is the one part every pair always
  // has (1006 #20). It's also the one action bar a user bubble gets, so
  // it never competes with anything else for room.
  private userBubble(turn: Turn, pairBusy: boolean): HTMLElement {
    const actions: KitAction[] = pairBusy
      ? []
      : [{ label: deleteQaLabel(), icon: "trash-2", iconOnly: true, onClick: () => this.deleteTurnPair(turn) }];
    const el = bubble({ role: "user", text: turn.content, actions });
    if (turn.selection) {
      const quote = createDiv({ cls: "vt-bubble-quote", text: turn.selection });
      quote.setAttr("aria-label", turn.selection);
      el.prepend(quote);
    }
    return el;
  }

  // 整組刪除 (1006 #20): no confirmation — apply the tombstone right
  // away (the pair disappears as soon as the resulting "thread:upsert"
  // repaints) and offer "復原" for a few seconds. deleteTurnPair /
  // restoreTurnPair are async (they may await a grammar-note save), but
  // their first await is on an already-settled ensureLoaded() — calling
  // one without awaiting still runs its synchronous tombstone/untombstone
  // work before the other can observe it, so apply-then-restore (even
  // back to back) can't race.
  private deleteTurnPair(turn: Turn): void {
    const threadId = this.opts.threadId;
    const threads = this.opts.threads;
    runUndoable({
      message: t("undo.deletedQa"),
      apply: () => {
        threads.deleteTurnPair(threadId, turn.id).catch((e) => console.error("Vocab Tracker: delete Q&A failed", e));
      },
      restore: () => {
        threads.restoreTurnPair(threadId, turn.id).catch((e) => console.error("Vocab Tracker: restore Q&A failed", e));
      },
      // The tombstone deleteTurnPair wrote is already the final state on
      // disk (same as dropFailedRound's retry tombstone) — nothing left
      // to commit.
      commit: () => {},
    });
  }

  private answerBubble(turn: Turn): HTMLElement {
    const scope = this.turnsScope as Component;
    const render = (el: HTMLElement, md: string) =>
      void MarkdownRenderer.render(this.opts.app, md, el, this.opts.sourcePath, scope);

    if (turn.status === "streaming") {
      this.streamTurnId = turn.id;
      this.streamText = this.opts.threads.streamingText(turn.id) ?? "";
      const el = bubble({ role: "assistant", text: "", streaming: true });
      this.streamBody = el.querySelector<HTMLElement>(".vt-bubble-body");
      this.paint();
      return this.withHeader(el, turn);
    }

    const actions: KitAction[] = [];
    if (turn.status === "error") {
      actions.push({ label: t("ai.action.retry"), icon: "rotate-ccw", onClick: () => this.run(() => this.opts.retry(turn.id)) });
    }
    if (turn.content.trim()) {
      if (turn.status === "done") actions.push(...(this.opts.turnActions?.(turn) ?? []));
      actions.push({ label: t("chat.action.copy"), icon: "copy", onClick: () => this.copy(turn.content) });
    }

    let error: string | undefined;
    if (turn.status === "error") {
      error = aiErrorText(new AiError((turn.error ?? "network") as AiErrorCode, turn.errorMessage));
    } else if (turn.status === "aborted") {
      error = t("ai.error.aborted");
    } else if (turn.stop === "max_tokens") {
      error = t("chat.truncated");
    }

    const el = bubble({ role: "assistant", text: turn.content, render, actions, error });
    el.toggleClass("is-muted-error", turn.status === "aborted");
    if (!turn.content.trim()) el.addClass("is-empty");
    return this.withHeader(el, turn);
  }

  private withHeader(el: HTMLElement, turn: Turn): HTMLElement {
    const h = this.opts.turnHeader?.(turn);
    if (!h) return el;
    const head = createDiv({ cls: "vt-bubble-head" });
    if (h.icon) setIcon(head.createSpan({ cls: "vt-bubble-head-icon" }), h.icon);
    head.createSpan({ text: h.text });
    el.prepend(head);
    return el;
  }

  private schedulePaint(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  // Repaints the streaming bubble's body with the markdown so far. Rendered
  // off-DOM first and swapped in, so the bubble never flashes empty; a
  // sequence number drops renders that finish out of order.
  private paint(): void {
    const body = this.streamBody;
    if (!body) return;
    if (!this.streamText) {
      body.setText(t("ai.bubble.streaming"));
      body.addClass("vt-chat-waiting");
      return;
    }
    body.removeClass("vt-chat-waiting");
    const seq = ++this.paintSeq;
    if (this.streamScope) this.removeChild(this.streamScope);
    const scope = (this.streamScope = this.addChild(new Component()));
    const tmp = createDiv();
    void MarkdownRenderer.render(this.opts.app, this.streamText, tmp, this.opts.sourcePath, scope).then(() => {
      if (seq !== this.paintSeq || this.streamBody !== body) return;
      body.replaceChildren(...Array.from(tmp.childNodes));
    });
  }

  // ── Controls: gate, quick actions, selection chip, composer ──────
  private renderControls(): void {
    const status = this.opts.ai.status();
    const controls = this.root.createDiv({ cls: "vt-chat-controls" });
    if (renderAiGate(controls, status, { onOpenSettings: this.opts.onOpenSettings }) && status !== "offline") return;
    const offline = status === "offline";

    const quick = controls.createDiv({ cls: "vt-chat-quick" });
    for (const task of this.opts.ai.tasks.forSurface(this.opts.surface)) {
      if (!task.label) continue;
      const btn = quick.createEl("button", { cls: "vt-chip", text: t(task.label) });
      btn.disabled = offline;
      btn.addEventListener("click", () => this.submit(task.id, ""));
      this.quickBtns.push(btn);
    }

    this.selectionEl = controls.createDiv({ cls: "vt-chat-selection" });
    this.renderSelection();

    const composer = controls.createDiv({ cls: "vt-chat-composer" });
    const input = (this.input = composer.createEl("textarea", { cls: "vt-chat-input" }));
    input.rows = 1;
    // Enter sends: the on-screen keyboard labels its return key 「傳送」.
    input.setAttr("enterkeyhint", "send");
    input.placeholder = this.opts.placeholder;
    input.disabled = offline;
    const key = this.opts.threadId;
    input.value = this.opts.state.drafts.get(key) ?? "";
    autoGrow(input);
    input.addEventListener("input", () => {
      this.opts.state.drafts.set(key, input.value);
      autoGrow(input);
    });
    input.addEventListener("keydown", (e) => {
      // isComposing / 229: Enter that confirms an IME candidate (注音、拼音)
      // must not send the half-typed question.
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (!this.busy) this.submit(this.opts.customTaskId, input.value);
    });
    input.addEventListener("focus", () => (this.opts.state.focused = key));
    input.addEventListener("blur", () => {
      // A blur from the host tearing the panel down shouldn't forget focus.
      if (input.isConnected) this.opts.state.focused = null;
    });

    const btn = (this.sendBtn = composer.createEl("button", { cls: "vt-chat-send clickable-icon" }));
    btn.disabled = offline;
    btn.addEventListener("click", () => {
      if (this.busy) this.opts.threads.stop(this.opts.threadId);
      else this.submit(this.opts.customTaskId, input.value);
    });

    if (this.opts.state.focused === key && !offline) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  private renderSelection(): void {
    const el = this.selectionEl;
    if (!el) return;
    el.empty();
    const sel = this.opts.selection.get();
    el.toggle(!!sel);
    if (!sel) return;
    el.setAttr("aria-label", t("chat.selection.hint"));
    setIcon(el.createSpan({ cls: "vt-chat-selection-icon" }), "text-cursor");
    el.createSpan({ cls: "vt-chat-selection-text", text: t("chat.selection", { text: sel.text }) });
    const remove = el.createSpan({ cls: "vt-chat-selection-remove clickable-icon" });
    setIcon(remove, "x");
    remove.setAttr("aria-label", t("chat.selection.remove"));
    remove.addEventListener("click", () => this.opts.selection.clear());
  }

  private updateBusy(): void {
    const busy = this.busy;
    for (const b of this.quickBtns) b.disabled = busy || this.opts.ai.status() === "offline";
    const btn = this.sendBtn;
    if (!btn) return;
    btn.empty();
    setIcon(btn, busy ? "square" : "arrow-up");
    btn.setAttr("aria-label", t(busy ? "chat.stop" : "chat.send"));
    btn.toggleClass("is-stop", busy);
  }

  private submit(taskId: string, text: string): void {
    const question = text.trim();
    if (taskId === this.opts.customTaskId && !question) return;
    if (this.busy) return;
    const selection = this.opts.selection.get()?.text;
    if (question && this.input) {
      this.input.value = "";
      autoGrow(this.input);
      this.opts.state.drafts.delete(this.opts.threadId);
    }
    // Used up: the next question goes without it unless something new is
    // selected (規劃書 06 §6.4.1 #1).
    if (selection) this.opts.selection.clear();
    this.scrollOnNextRender = true;
    this.run(() => this.opts.send({ taskId, question: question || undefined, selection }));
  }

  private run(fn: () => Promise<void>): void {
    fn().catch((e) => {
      console.error("Vocab Tracker: AI request failed", e);
      new Notice(e instanceof Error ? e.message : String(e));
    });
  }

  private copy(text: string): void {
    void navigator.clipboard.writeText(text).then(
      () => new Notice(t("chat.copied")),
      (e) => console.error("Vocab Tracker: copy failed", e)
    );
  }
}

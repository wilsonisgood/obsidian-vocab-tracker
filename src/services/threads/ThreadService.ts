import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { liveTurns, wordThreadId, type Anchor, type Thread, type Turn } from "../../core/model/thread";
import type { NoteReaderPort, StoragePort } from "../../core/ports";
import { mergeThreads, settleStaleTurns } from "../../core/store/threads";
import { TypedEmitter } from "../../core/events";
import type { VocabStore } from "../../core/store/VocabStore";
import type { AiService } from "../ai/AiService";
import { isAiError } from "../ai/errors";
import type { ChatMessage } from "../ai/providers/types";
import { addPin, pinText, removePin } from "./pin";
import { findWordSource, wordInput } from "./wordInput";

// AI discussion threads (規劃書 06 §4.4, M4). Owns store/threads.json the
// way SrsService owns reviews.json: lazily loaded, debounced writes, and a
// read-merge-write on every save so another device's synced turns are
// never overwritten.
//
// Streaming text is kept in memory and announced through
// "thread:turn-delta" only; the thread itself is saved when the answer
// finishes (or stops / fails), never once per token.

export const THREADS_SHARD = "threads";
const WRITE_DEBOUNCE_MS = 500;

interface ThreadsShard {
  threads: Thread[];
}

export interface ThreadEvents {
  "thread:upsert": Thread;
  // `text` is the whole answer so far, not just the new piece.
  "thread:turn-delta": { threadId: string; turnId: string; text: string };
  "thread:retry-wait": { threadId: string; turnId: string; delayMs: number };
  // Threads were replaced by a merge with the disk copy (sync).
  "threads:reloaded": void;
}

export type ThreadAi = Pick<AiService, "prepare" | "complete" | "cancel" | "tasks">;

export interface ThreadServiceDeps {
  storage: StoragePort;
  store: VocabStore;
  ai: ThreadAi;
  notes: NoteReaderPort;
  clock?: () => Date;
  newId?: () => string;
}

export interface AskParams {
  threadId: string;
  anchor: Anchor;
  taskId: string;
  input: unknown;
  // What the user bubble shows: the question, or the quick action's label.
  display: string;
  question?: string;
  selection?: string;
}

export interface WordAsk {
  taskId: string;
  question?: string;
  selection?: string;
}

function defaultId(now: Date): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Earlier rounds for the prompt: each question paired with an answer that
// has text. Failed rounds are left out entirely, so the model never sees a
// question without its answer.
export function historyOf(thread: Thread | undefined): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pending: Turn | null = null;
  for (const turn of liveTurns(thread)) {
    if (turn.role === "user") {
      pending = turn;
      continue;
    }
    if (pending && turn.content.trim() && (turn.status === "done" || turn.status === "aborted")) {
      out.push({ role: "user", content: pending.sent ?? pending.content });
      out.push({ role: "assistant", content: turn.content });
    }
    pending = null;
  }
  return out;
}

export class ThreadService {
  readonly events = new TypedEmitter<ThreadEvents>();
  private threads: Thread[] = [];
  private loading: Promise<void> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();
  // threadId → the assistant turn currently streaming.
  private active = new Map<string, Turn>();
  private partial = new Map<string, string>();
  private disposed = false;
  private clock: () => Date;
  private newId: () => string;

  constructor(private deps: ThreadServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => defaultId(this.clock()));
  }

  // store/threads.json is read the first time a discussion is opened
  // (規劃書 06 §4.2). Memoized, so callers can await it freely.
  ensureLoaded(): Promise<void> {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        // Only the first load settles stale "streaming" turns: later
        // reloads may see this session's own in-flight turn on disk.
        this.threads = mergeThreads(this.threads, settleStaleTurns(disk));
      });
    }
    return this.loading;
  }

  // Unions a synced copy from disk into memory. A no-op until something
  // has opened a discussion — the first load reads the latest file anyway.
  async reload(): Promise<void> {
    if (!this.loading) return;
    await this.loading;
    this.threads = mergeThreads(this.threads, await this.readDisk());
    this.events.emit("threads:reloaded", undefined);
  }

  private async readDisk(): Promise<Thread[]> {
    try {
      const shard = await this.deps.storage.readShard<ThreadsShard>(THREADS_SHARD);
      return Array.isArray(shard?.threads) ? shard.threads : [];
    } catch (e) {
      console.error("Vocab Tracker: couldn't read threads", e);
      return [];
    }
  }

  get(threadId: string): Thread | undefined {
    return this.threads.find((th) => th.id === threadId && !th.deletedAt);
  }

  wordThread(entryId: string): Thread | undefined {
    return this.get(wordThreadId(entryId));
  }

  // Number of questions asked in a word's thread (the 「AI n」 tab badge).
  wordQuestionCount(entryId: string): number {
    return liveTurns(this.wordThread(entryId)).filter((turn) => turn.role === "user").length;
  }

  isBusy(threadId: string): boolean {
    return this.active.has(threadId);
  }

  // The answer streamed so far for a turn that's still streaming.
  streamingText(turnId: string): string | undefined {
    return this.partial.get(turnId);
  }

  stop(threadId: string): void {
    this.deps.ai.cancel(threadId);
  }

  async ask(p: AskParams): Promise<void> {
    await this.ensureLoaded();
    if (this.disposed || this.active.has(p.threadId)) return;

    let thread = this.get(p.threadId);
    const { task, request } = this.deps.ai.prepare(p.taskId, p.input, historyOf(thread));
    if (!thread) {
      thread = { id: p.threadId, anchor: p.anchor, turns: [], createdAt: this.nowIso(), rev: 0 };
      this.threads.push(thread);
    }

    const at = this.nowIso();
    const user: Turn = {
      id: this.newId(),
      role: "user",
      content: p.display,
      at,
      taskId: task.id,
      status: "done",
      sent: request.messages[request.messages.length - 1]?.content,
    };
    if (p.question) user.question = p.question;
    if (p.selection) user.selection = p.selection;
    const answer: Turn = {
      id: this.newId(),
      role: "assistant",
      content: "",
      at,
      taskId: task.id,
      taskVersion: task.version,
      status: "streaming",
    };
    thread.turns.push(user, answer);
    this.active.set(thread.id, answer);
    this.partial.set(answer.id, "");
    this.changed(thread);

    const threadId = thread.id;
    try {
      const r = await this.deps.ai.complete(request, {
        threadId,
        onDelta: (d) => {
          const text = (this.partial.get(answer.id) ?? "") + d;
          this.partial.set(answer.id, text);
          this.events.emit("thread:turn-delta", { threadId, turnId: answer.id, text });
        },
        onRetry: (_attempt, delayMs) => this.events.emit("thread:retry-wait", { threadId, turnId: answer.id, delayMs }),
      });
      if (this.disposed) return;
      answer.content = r.text;
      answer.status = "done";
      answer.model = r.model;
      answer.provider = r.provider;
      answer.usage = { input: r.usage.input, output: r.usage.output, cacheRead: r.usage.cacheRead, cacheWrite: r.usage.cacheWrite };
      answer.stop = r.stop;
    } catch (e) {
      if (this.disposed) return;
      const streamed = this.partial.get(answer.id) ?? "";
      answer.content = (isAiError(e) ? e.extra.partialText : undefined) ?? streamed;
      if (isAiError(e) && e.code === "aborted") {
        answer.status = "aborted";
      } else {
        answer.status = "error";
        answer.error = isAiError(e) ? e.code : "network";
        const message = e instanceof Error ? e.message : String(e);
        if (message && message !== answer.error) answer.errorMessage = message;
      }
    } finally {
      if (!this.disposed) {
        this.active.delete(threadId);
        this.partial.delete(answer.id);
        this.changed(thread);
      }
    }
  }

  async askWord(entry: VocabEntry, req: WordAsk): Promise<void> {
    const source = await findWordSource(entry, this.deps.notes);
    const label = this.deps.ai.tasks.get(req.taskId)?.label;
    const display = req.question?.trim() || (label ? t(label) : req.taskId);
    const anchor: Anchor = { kind: "word", entryId: entry.id };
    if (entry.source?.path) anchor.origin = { path: entry.source.path };
    await this.ask({
      threadId: wordThreadId(entry.id),
      anchor,
      taskId: req.taskId,
      input: wordInput(entry, source, { question: req.question, selection: req.selection }),
      display,
      question: req.question,
      selection: req.selection,
    });
  }

  // 重試: the failed answer and its question are tombstoned (not removed —
  // see Turn.deletedAt) and the same question is asked again.
  async retryWord(entry: VocabEntry, turnId: string): Promise<void> {
    const thread = this.wordThread(entry.id);
    if (!thread || this.isBusy(thread.id)) return;
    const turns = liveTurns(thread);
    const i = turns.findIndex((turn) => turn.id === turnId);
    if (i < 1) return;
    const question = turns[i - 1];
    if (question.role !== "user" || !question.taskId) return;
    const now = this.nowIso();
    for (const turn of [question, turns[i]]) {
      turn.deletedAt = now;
      turn.updatedAt = now;
    }
    this.changed(thread);
    await this.askWord(entry, { taskId: question.taskId, question: question.question, selection: question.selection });
  }

  // 釘選到文法提示: appends the answer (minus its 「你問的是」 line) to the
  // entry's grammar note; unpinning removes that same text again if the
  // user hasn't edited it away.
  async setPinned(entry: VocabEntry, turnId: string, pinned: boolean): Promise<void> {
    const thread = this.wordThread(entry.id);
    const turn = thread?.turns.find((x) => x.id === turnId);
    if (!thread || !turn || turn.role !== "assistant" || !!turn.pinnedToGrammar === pinned) return;
    const text = pinText(turn.content);
    if (!text) return;
    entry.grammar = pinned ? addPin(entry.grammar ?? "", text) : removePin(entry.grammar ?? "", text);
    turn.pinnedToGrammar = pinned;
    turn.updatedAt = this.nowIso();
    this.changed(thread);
    await this.deps.store.touch(entry);
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }

  private changed(thread: Thread): void {
    thread.updatedAt = this.nowIso();
    thread.rev = (thread.rev ?? 0) + 1;
    this.events.emit("thread:upsert", thread);
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }, WRITE_DEBOUNCE_MS);
  }

  private async write(): Promise<void> {
    try {
      // Read-merge-write: threads.json may have synced in from another
      // device since we last read it, and a plain write would drop its turns.
      this.threads = mergeThreads(this.threads, await this.readDisk());
      await this.deps.storage.writeShard<ThreadsShard>(THREADS_SHARD, { threads: this.threads });
    } catch (e) {
      console.error("Vocab Tracker: couldn't save threads", e);
    }
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }
    await this.pendingWrite;
  }

  // Plugin unload: whatever is still streaming is saved as stopped with
  // the text received so far (the aborted request's own error handler
  // would run too late, after the final flush).
  dispose(): void {
    for (const [threadId, turn] of this.active) {
      turn.content = this.partial.get(turn.id) ?? "";
      turn.status = "aborted";
      const thread = this.get(threadId);
      if (thread) this.changed(thread);
    }
    this.disposed = true;
    this.active.clear();
    this.partial.clear();
  }
}

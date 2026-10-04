import type { DictionaryResult } from "../../../src/core/model/dictionary";
import type { VocabEntry } from "../../../src/core/model/entry";
import { defaultLearnerProfile } from "../../../src/core/model/settings";
import type { Thread, Turn } from "../../../src/core/model/thread";
import type { AiRunResult } from "../../../src/services/ai/AiService";
import type { AiRequest } from "../../../src/services/ai/providers/types";
import { historyOf } from "../../../src/services/threads/ThreadService";
import type { AiTask } from "../../../src/services/ai/tasks/types";
import type { DictionaryLookupPort, LearnAi, LearnVocabPort, TriviaAskParams, TriviaThreadsPort } from "../../../src/services/learn/ports";
import { TRIVIA_TASKS } from "../../../src/services/ai/tasks/trivia";

export function entry(id: string, word: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...extra,
  };
}

export function result(text: string, extra: Partial<AiRunResult> = {}): AiRunResult {
  return {
    text,
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    model: "claude-sonnet-5",
    stop: "end",
    transport: "fetch",
    provider: "anthropic",
    ...extra,
  };
}

export class FakeVocab implements LearnVocabPort {
  touched: VocabEntry[] = [];
  constructor(public all: VocabEntry[] = []) {}
  get entries(): VocabEntry[] {
    return this.all.filter((e) => !e.deletedAt);
  }
  async addEntries(entries: VocabEntry[]): Promise<void> {
    this.all.push(...entries);
  }
  async touch(e: VocabEntry): Promise<void> {
    this.touched.push(e);
  }
}

export class FakeDictionary implements DictionaryLookupPort {
  looked: string[] = [];
  constructor(private fail: Set<string> = new Set()) {}
  async fetchDictionary(word: string): Promise<DictionaryResult> {
    this.looked.push(word);
    if (this.fail.has(word)) throw new Error("not found");
    return {
      phonetic: `/${word}/`,
      audio: "",
      partOfSpeech: "noun",
      definition: `definition of ${word}`,
      definitionZh: `${word} 的中文`,
      synonyms: ["a", "b"],
      antonyms: [],
    };
  }
}

// AiService.run with the real task.build and a scripted result.
export class FakeLearnAi implements LearnAi {
  requests: AiRequest[] = [];
  threadIds: (string | undefined)[] = [];
  cancelled: string[] = [];
  constructor(public script: (req: AiRequest) => AiRunResult | Promise<AiRunResult>) {}

  run: LearnAi["run"] = async (task, input, opt = {}) => {
    const t = task as AiTask<unknown, unknown>;
    const req = t.build(input, { profile: defaultLearnerProfile(), history: [] });
    this.requests.push(req);
    this.threadIds.push(opt.threadId);
    const r = await this.script(req);
    return { ...r, taskId: t.id, taskVersion: t.version };
  };

  cancel(threadId: string): void {
    this.cancelled.push(threadId);
  }
}

// ThreadService.ask as it behaves once it stores subjectEntryId (the M7
// integration item): appends a question/answer pair built with the real
// trivia tasks, answer text scripted.
export class FakeThreads implements TriviaThreadsPort {
  threads = new Map<string, Thread>();
  requests: AiRequest[] = [];
  asked: TriviaAskParams[] = [];
  busy = false;
  stopped: string[] = [];
  private n = 0;
  private clock = Date.parse("2026-10-04T08:00:00Z");
  constructor(public answer: (p: TriviaAskParams) => string = () => "**標題**\n\n內容") {}

  async ensureLoaded(): Promise<void> {}

  get(threadId: string): Thread | undefined {
    return this.threads.get(threadId);
  }

  isBusy(): boolean {
    return this.busy;
  }

  stop(threadId: string): void {
    this.stopped.push(threadId);
  }

  async ask(p: TriviaAskParams): Promise<void> {
    this.asked.push(p);
    let th = this.threads.get(p.threadId);
    const task = TRIVIA_TASKS.find((t) => t.id === p.taskId);
    if (!task) throw new Error(`unknown task ${p.taskId}`);
    const req = task.build(p.input as never, { profile: defaultLearnerProfile(), history: historyOf(th) });
    this.requests.push(req);
    if (!th) {
      th = { id: p.threadId, anchor: p.anchor, turns: [] };
      this.threads.set(p.threadId, th);
    }
    const at = new Date((this.clock += 1000)).toISOString();
    const q: Turn = { id: `t${++this.n}`, role: "user", content: p.display, at, taskId: p.taskId, status: "done" };
    const a: Turn = { id: `t${++this.n}`, role: "assistant", content: this.answer(p), at, taskId: p.taskId, status: "done" };
    if (p.subjectEntryId) q.subjectEntryId = a.subjectEntryId = p.subjectEntryId;
    if (p.question) q.question = p.question;
    th.turns.push(q, a);
  }
}

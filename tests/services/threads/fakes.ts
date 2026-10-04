import { defaultLearnerProfile } from "../../../src/core/model/settings";
import type { AiRunResult, RunOptions } from "../../../src/services/ai/AiService";
import type { AiRequest } from "../../../src/services/ai/providers/types";
import { defaultTaskRegistry } from "../../../src/services/ai/tasks/registry";
import type { ThreadAi } from "../../../src/services/threads/ThreadService";

export type Script = (req: AiRequest, opt: RunOptions) => Promise<AiRunResult>;

// Real task registry and prompt building, scripted completions.
export class FakeAi implements ThreadAi {
  tasks = defaultTaskRegistry();
  requests: AiRequest[] = [];
  cancelled: string[] = [];
  private controllers = new Map<string, AbortController>();
  constructor(public script: Script) {}

  prepare: ThreadAi["prepare"] = (task, input, history = []) => {
    const t = typeof task === "string" ? this.tasks.get(task) : task;
    if (!t) throw new Error("unknown task");
    return { task: t, request: t.build(input, { profile: defaultLearnerProfile(), history }) };
  };

  complete: ThreadAi["complete"] = (req, opt = {}) => {
    this.requests.push(req);
    return this.script(req, opt);
  };

  cancel(threadId: string): void {
    this.cancelled.push(threadId);
    this.controllers.get(threadId)?.abort();
  }
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

// Human-readable dump of a request, so a snapshot reads like the prompt.
export function render(req: AiRequest): string {
  const sys = req.system.map((b, i) => `── system[${i}]${b.cache ? " (cache)" : ""} ──\n${b.text}`);
  const msgs = req.messages.map((m) => `── ${m.role} ──\n${m.content}`);
  return [`tier=${req.tier} maxTokens=${req.maxTokens}`, ...sys, ...msgs].join("\n\n");
}

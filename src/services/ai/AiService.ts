import type { ProviderId, ResolvedSettings } from "../../core/model/settings";
import type { DeviceStatePort, FetchPort, NetworkPort, RequestPort } from "../../core/ports";
import { AiError, isAiError } from "./errors";
import type { ApiKeys } from "./keys";
import { Limiter } from "./limiter";
import { isMissingKey, providerDef } from "./providers/registry";
import type { AiProvider, AiRequest, AiResult, ChatMessage, TestConnectionResult } from "./providers/types";
import type { AiTask } from "./tasks/types";
import { defaultTaskRegistry, type TaskRegistry } from "./tasks/registry";
import { FallbackTransport } from "./transport/fallbackTransport";
import { FetchTransport } from "./transport/fetchTransport";
import { RequestUrlTransport } from "./transport/requestUrlTransport";
import type { UsageSummary, UsageTracker } from "./usage";

// Facade the UI talks to (規劃書 06 §6.5): picks the configured provider,
// enforces the master toggle, key, budget, global concurrency (2), one
// in-flight request per thread, and retries 429/529 with backoff.

export type AiStatus = "disabled" | "no_key" | "offline" | "ready";

export const MAX_CONCURRENT = 2;
export const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1_000;
// A retry-after longer than this isn't worth waiting on in an interactive
// chat — surface rate_limit and let the user retry later.
const MAX_RETRY_WAIT_MS = 30_000;

export interface AiServiceDeps {
  settings: () => ResolvedSettings;
  keys: ApiKeys;
  usage: UsageTracker;
  fetch: FetchPort;
  request: RequestPort;
  device: DeviceStatePort;
  network: NetworkPort;
  tasks?: TaskRegistry;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface RunOptions {
  // Requests sharing a threadId cancel each other: starting a new one
  // aborts the previous (a thread only ever has one answer streaming).
  threadId?: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  // Lets the UI show "伺服器忙碌，n 秒後重試…".
  onRetry?: (attempt: number, delayMs: number) => void;
  history?: ChatMessage[];
}

export interface AiRunResult extends AiResult {
  provider: ProviderId;
  taskId?: string;
  taskVersion?: number;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AiError("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiError("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class AiService {
  readonly tasks: TaskRegistry;
  private limiter = new Limiter(MAX_CONCURRENT);
  private inFlight = new Map<string, AbortController>();
  private transports = new Map<ProviderId, FallbackTransport>();
  private sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(private deps: AiServiceDeps) {
    this.tasks = deps.tasks ?? defaultTaskRegistry();
    this.sleep = deps.sleep ?? abortableSleep;
  }

  // Drives the D6 (no key / disabled) and D7 (offline) UI states.
  status(): AiStatus {
    const ai = this.deps.settings().ai;
    if (!ai.enabled) return "disabled";
    if (isMissingKey(ai.provider, this.deps.keys.get(ai.provider))) return "no_key";
    if (!this.deps.network.isOnline()) return "offline";
    return "ready";
  }

  usageSummary(): Promise<UsageSummary> {
    return this.deps.usage.summary();
  }

  usesFallback(provider: ProviderId = this.deps.settings().ai.provider): boolean {
    return this.transport(provider).usesFallback;
  }

  private transport(provider: ProviderId): FallbackTransport {
    let t = this.transports.get(provider);
    if (!t) {
      t = new FallbackTransport(
        provider,
        new FetchTransport(this.deps.fetch),
        new RequestUrlTransport(this.deps.request),
        this.deps.device,
        this.deps.network
      );
      this.transports.set(provider, t);
    }
    return t;
  }

  // Built per call so settings edits take effect immediately.
  private provider(id: ProviderId): AiProvider {
    const ai = this.deps.settings().ai;
    return providerDef(id).create({
      config: ai.providers[id],
      apiKey: this.deps.keys.get(id),
      transport: this.transport(id),
    });
  }

  // Works even with the master toggle off, so the user can verify their
  // setup before enabling AI. Clears the remembered transport fallback
  // first so a fixed CORS setup gets streaming back.
  async testConnection(provider: ProviderId = this.deps.settings().ai.provider, signal?: AbortSignal): Promise<TestConnectionResult> {
    if (isMissingKey(provider, this.deps.keys.get(provider))) throw new AiError("no_key");
    this.transport(provider).resetMemory();
    return this.provider(provider).testConnection(signal ?? new AbortController().signal);
  }

  async run<I>(task: AiTask<I, unknown> | string, input: I, opt: RunOptions = {}): Promise<AiRunResult> {
    const t = typeof task === "string" ? this.tasks.get(task) : task;
    if (!t) throw new Error(`Unknown AI task "${String(task)}"`);
    const req = t.build(input, { profile: this.deps.settings().learner, history: opt.history ?? [] });
    const result = await this.complete(req, opt);
    return { ...result, taskId: t.id, taskVersion: t.version };
  }

  async complete(req: AiRequest, opt: RunOptions = {}): Promise<AiRunResult> {
    const ai = this.deps.settings().ai;
    if (!ai.enabled) throw new AiError("disabled");
    const providerId = ai.provider;
    if (isMissingKey(providerId, this.deps.keys.get(providerId))) throw new AiError("no_key");
    if (!this.deps.network.isOnline()) throw new AiError("offline");
    await this.deps.usage.assertWithinBudget(ai.monthlyTokenBudget);

    const controller = new AbortController();
    const { threadId } = opt;
    if (threadId) {
      this.inFlight.get(threadId)?.abort();
      this.inFlight.set(threadId, controller);
    }
    const onExternalAbort = () => controller.abort();
    if (opt.signal?.aborted) controller.abort();
    opt.signal?.addEventListener("abort", onExternalAbort, { once: true });

    // Accumulated across attempts only for error reporting: a failed or
    // stopped answer keeps whatever text had already streamed in.
    let partial = "";
    try {
      const result = await this.limiter.run(
        () => this.withRetry(providerId, req, controller.signal, opt, (t) => (partial += t)),
        controller.signal
      );
      // Fire-and-forget: a failed usage write must not fail the answer.
      void this.deps.usage.record(result.usage).catch((e) => console.error("Vocab Tracker: usage write failed", e));
      if (result.stop === "refusal") {
        throw new AiError("refused", "The model declined to answer", { partialText: result.text });
      }
      return { ...result, provider: providerId };
    } catch (e) {
      // Once aborted, whatever the transport threw (AbortError, a reader
      // TypeError…) is just the stop button's echo.
      const err = controller.signal.aborted
        ? new AiError("aborted", undefined, { cause: e })
        : isAiError(e)
          ? e
          : new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
      if (partial && err.extra.partialText === undefined) err.extra.partialText = partial;
      throw err;
    } finally {
      opt.signal?.removeEventListener("abort", onExternalAbort);
      if (threadId && this.inFlight.get(threadId) === controller) this.inFlight.delete(threadId);
    }
  }

  private async withRetry(
    providerId: ProviderId,
    req: AiRequest,
    signal: AbortSignal,
    opt: RunOptions,
    collect: (t: string) => void
  ): Promise<AiResult> {
    for (let attempt = 0; ; attempt++) {
      let emitted = false;
      try {
        return await this.provider(providerId).complete(req, {
          signal,
          onDelta: (t) => {
            emitted = true;
            collect(t);
            opt.onDelta?.(t);
          },
        });
      } catch (e) {
        if (!isAiError(e) || !e.retryable || attempt >= MAX_RETRIES) throw e;
        // Retrying after text was shown would duplicate it in the bubble.
        if (emitted) throw e;
        const delay = e.extra.retryAfterMs ?? BASE_BACKOFF_MS * 2 ** attempt;
        if (delay > MAX_RETRY_WAIT_MS) throw e;
        opt.onRetry?.(attempt + 1, delay);
        await this.sleep(delay, signal);
      }
    }
  }

  isBusy(threadId: string): boolean {
    return this.inFlight.has(threadId);
  }

  cancel(threadId: string): void {
    this.inFlight.get(threadId)?.abort();
  }

  dispose(): void {
    for (const c of this.inFlight.values()) c.abort();
    this.inFlight.clear();
  }
}

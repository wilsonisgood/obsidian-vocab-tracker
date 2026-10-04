import { afterEach, describe, expect, it, vi } from "vitest";
import { withSettingsDefaults, type ResolvedSettings } from "../../../src/core/model/settings";
import type { FetchPort, FetchResponse, RawHttpRequest } from "../../../src/core/ports";
import { AiService } from "../../../src/services/ai/AiService";
import { ApiKeys } from "../../../src/services/ai/keys";
import type { AiRequest } from "../../../src/services/ai/providers/types";
import { paragraphGrammar } from "../../../src/services/ai/tasks/paragraph";
import { UsageTracker } from "../../../src/services/ai/usage";
import { errorResponse, FakeNetwork, fixture, MemoryDevice, MemorySecrets, MemoryStorage, response } from "./fakes";

const REQ: AiRequest = { system: [{ text: "s" }], messages: [{ role: "user", content: "q" }], maxTokens: 100, tier: "fast" };

type Handler = (req: RawHttpRequest, n: number, signal: AbortSignal) => FetchResponse | Promise<FetchResponse>;

class FakeFetch implements FetchPort {
  requests: RawHttpRequest[] = [];
  constructor(public handler: Handler) {}
  async fetch(req: RawHttpRequest, signal: AbortSignal): Promise<FetchResponse> {
    this.requests.push(req);
    return this.handler(req, this.requests.length - 1, signal);
  }
}

function setup(handler: Handler, opts: { enabled?: boolean; key?: string; budget?: number } = {}) {
  const settings: ResolvedSettings = withSettingsDefaults({ schemaVersion: 2 });
  settings.ai.enabled = opts.enabled ?? true;
  settings.ai.monthlyTokenBudget = opts.budget ?? 0;
  const secrets = new MemorySecrets();
  if (opts.key !== "") secrets.set(ApiKeys.secretId("anthropic"), opts.key ?? "sk-ant-x");
  const keys = new ApiKeys(secrets, () => settings, async (m) => m(settings));
  const storage = new MemoryStorage();
  const usage = new UsageTracker(storage, () => "dev", () => new Date(2026, 9, 4));
  const fetch = new FakeFetch(handler);
  const network = new FakeNetwork();
  const ai = new AiService({
    settings: () => settings,
    keys,
    usage,
    fetch,
    request: { request: async () => ({ status: 500, headers: {}, text: "" }) },
    device: new MemoryDevice(),
    network,
  });
  return { ai, fetch, usage, storage, settings, network, secrets };
}

const okStream = () => response(fixture("anthropic-basic.txt"));

afterEach(() => {
  vi.useRealTimers();
});

describe("AiService.status (D6/D7 gates)", () => {
  it("reports disabled, no_key, offline, ready in that priority", () => {
    expect(setup(okStream, { enabled: false }).ai.status()).toBe("disabled");
    expect(setup(okStream, { key: "" }).ai.status()).toBe("no_key");
    const s = setup(okStream);
    s.network.online = false;
    expect(s.ai.status()).toBe("offline");
    expect(setup(okStream).ai.status()).toBe("ready");
  });

  it("doesn't require a key for OpenAI-compatible (Ollama)", () => {
    const s = setup(okStream, { key: "" });
    s.settings.ai.provider = "openai-compatible";
    expect(s.ai.status()).toBe("ready");
  });
});

describe("AiService.complete", () => {
  it("refuses when disabled or keyless, before any request", async () => {
    const off = setup(okStream, { enabled: false });
    await expect(off.ai.complete(REQ)).rejects.toMatchObject({ code: "disabled" });
    const nokey = setup(okStream, { key: "" });
    await expect(nokey.ai.complete(REQ)).rejects.toMatchObject({ code: "no_key" });
    expect(off.fetch.requests.length + nokey.fetch.requests.length).toBe(0);
  });

  it("records usage after a successful answer", async () => {
    const s = setup(okStream);
    const r = await s.ai.complete(REQ);
    expect(r.provider).toBe("anthropic");
    await vi.waitFor(async () => expect((await s.usage.summary()).today.requests).toBe(1));
    expect((await s.usage.summary()).today).toMatchObject({ input: 412, output: 87, cacheWrite: 2048 });
  });

  it("throws budget once the month's usage reaches the limit", async () => {
    const s = setup(okStream, { budget: 100 });
    await s.usage.record({ input: 100, output: 0, cacheRead: 0, cacheWrite: 0 });
    await expect(s.ai.complete(REQ)).rejects.toMatchObject({ code: "budget" });
    expect(s.fetch.requests).toHaveLength(0);
  });

  it("turns a refusal into a refused error", async () => {
    const s = setup(() => response(fixture("anthropic-refusal.txt")));
    await expect(s.ai.complete(REQ)).rejects.toMatchObject({ code: "refused" });
  });

  it("runs a task and tags the result with its id and version", async () => {
    const s = setup(okStream);
    const r = await s.ai.run(paragraphGrammar, { article: { paragraphs: ["One.", "Two."] }, paragraphIndex: 1 });
    expect(r).toMatchObject({ taskId: "paragraph.grammar", taskVersion: 1 });
    const body = JSON.parse(s.fetch.requests[0].body ?? "{}");
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.system.at(-1).text).toContain("〔學習者設定〕");
  });
});

describe("AiService retry / backoff", () => {
  it("retries a 429 after retry-after, then succeeds", async () => {
    vi.useFakeTimers();
    const s = setup((_r, n) =>
      n === 0 ? errorResponse(429, { error: { type: "rate_limit_error", message: "slow" } }, { "retry-after": "2" }) : okStream()
    );
    const onRetry = vi.fn();
    const p = s.ai.complete(REQ, { onRetry });
    await vi.advanceTimersByTimeAsync(1999);
    expect(s.fetch.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(r.text).toContain("glittery");
    expect(onRetry).toHaveBeenCalledWith(1, 2000);
    expect(s.fetch.requests).toHaveLength(2);
  });

  it("backs off exponentially on 529 and gives up after 2 retries", async () => {
    vi.useFakeTimers();
    const s = setup(() => errorResponse(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    const onRetry = vi.fn();
    const p = s.ai.complete(REQ, { onRetry }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await p;
    expect(err.code).toBe("overloaded");
    expect(onRetry.mock.calls).toEqual([
      [1, 1000],
      [2, 2000],
    ]);
    expect(s.fetch.requests).toHaveLength(3);
  });

  it("doesn't wait out a retry-after longer than 30 s", async () => {
    const s = setup(() => errorResponse(429, { error: { message: "later" } }, { "retry-after": "120" }));
    await expect(s.ai.complete(REQ)).rejects.toMatchObject({ code: "rate_limit" });
    expect(s.fetch.requests).toHaveLength(1);
  });

  it("doesn't retry once text has streamed, and keeps the partial text", async () => {
    const s = setup(() => response(fixture("anthropic-midstream-error.txt")));
    const err = await s.ai.complete(REQ).catch((e) => e);
    expect(err.code).toBe("overloaded");
    expect(err.extra.partialText).toBe("部分回答");
    expect(s.fetch.requests).toHaveLength(1);
  });

  it("doesn't retry non-retryable errors", async () => {
    const s = setup(() => errorResponse(401, { error: { message: "bad key" } }));
    await expect(s.ai.complete(REQ)).rejects.toMatchObject({ code: "auth" });
    expect(s.fetch.requests).toHaveLength(1);
  });
});

// A stream that emits one delta, then waits until aborted.
function hangingStream(signal: AbortSignal): FetchResponse {
  async function* chunks() {
    yield 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"半"}}\n\n';
    await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }
  return { status: 200, header: () => "text/event-stream", chunks: chunks() };
}

describe("AiService cancellation and concurrency", () => {
  it("stop keeps the text streamed so far", async () => {
    const s = setup((_r, _n, signal) => hangingStream(signal));
    const ctrl = new AbortController();
    const deltas: string[] = [];
    const p = s.ai.complete(REQ, { signal: ctrl.signal, onDelta: (d) => deltas.push(d) }).catch((e) => e);
    await vi.waitFor(() => expect(deltas).toEqual(["半"]));
    ctrl.abort();
    const err = await p;
    expect(err.code).toBe("aborted");
    expect(err.extra.partialText).toBe("半");
  });

  it("a new request on the same thread aborts the previous one", async () => {
    const s = setup((_r, n, signal) => (n === 0 ? hangingStream(signal) : okStream()));
    const first = s.ai.complete(REQ, { threadId: "t1" }).catch((e) => e);
    await vi.waitFor(() => expect(s.fetch.requests).toHaveLength(1));
    expect(s.ai.isBusy("t1")).toBe(true);
    const second = await s.ai.complete(REQ, { threadId: "t1" });
    expect((await first).code).toBe("aborted");
    expect(second.text).toContain("glittery");
    expect(s.ai.isBusy("t1")).toBe(false);
  });

  it("runs at most 2 requests at once", async () => {
    const signals: AbortSignal[] = [];
    const s = setup((_r, _n, signal) => {
      signals.push(signal);
      return hangingStream(signal);
    });
    const ps = [1, 2, 3].map((i) => s.ai.complete(REQ, { threadId: `t${i}` }).catch((e) => e));
    await vi.waitFor(() => expect(s.fetch.requests).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(s.fetch.requests).toHaveLength(2);
    s.ai.cancel("t1");
    await vi.waitFor(() => expect(s.fetch.requests).toHaveLength(3));
    s.ai.dispose();
    expect((await Promise.all(ps)).map((e) => e.code)).toEqual(["aborted", "aborted", "aborted"]);
  });
});

describe("AiService.testConnection", () => {
  it("works with AI disabled and reports the models", async () => {
    const s = setup(okStream, { enabled: false });
    const r = await s.ai.testConnection();
    expect(r.models).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
    expect(r.transport).toBe("fetch");
  });

  it("needs a key for Claude", async () => {
    const s = setup(okStream, { key: "" });
    await expect(s.ai.testConnection()).rejects.toMatchObject({ code: "no_key" });
  });
});

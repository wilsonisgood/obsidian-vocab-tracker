import type { RawHttpRequest } from "../../../core/ports";
import { AiError, classifyStreamError } from "../errors";
import type { SseEvent } from "../transport/sse";
import { consumeBody, parseJson, throwIfHttpError, trimSlash } from "./stream";
import {
  emptyUsage,
  TEST_MAX_TOKENS,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type CompleteOptions,
  type ProviderDeps,
  type StopReason,
  type TestConnectionResult,
  type Usage,
} from "./types";

// Hand-rolled Messages API client (規劃書 06 §6.1: no SDK, so both providers
// share one transport with the mobile fallback, and the bundle stays small).
// Wire format verified against the Claude API docs (2026-06):
//   POST /v1/messages, headers x-api-key + anthropic-version: 2023-06-01,
//   plus anthropic-dangerous-direct-browser-access: true because Obsidian
//   is a browser context (CORS). SSE events: message_start → content_block_*
//   → message_delta (stop_reason, usage) → message_stop; `error` events can
//   arrive mid-stream. Structured output is `output_config.format`.
//
// Prompt caching and effort (規劃書 06 §6.4.1 #5–6), checked against the
// Claude API docs (2026-10):
//   - At most 4 `cache_control` breakpoints per request, counted across
//     tools, system and messages together; any content block can carry
//     one. The cache key is the exact prefix up to the breakpoint, rendered
//     in the order tools → system → messages.
//   - `output_config.effort` (GA, no beta header) is accepted by Sonnet 4.6
//     and later; Sonnet 4.5 and earlier and Haiku 4.5 reject it with a 400.
//     Changing it invalidates the messages cache, so it's fixed per model
//     rather than varied per request.

const API_VERSION = "2023-06-01";
// The API rejects more than 4 cache_control breakpoints per request.
const MAX_CACHE_BREAKPOINTS = 4;
const EPHEMERAL = { type: "ephemeral" } as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// Sonnet version from a model ID, including IDs users type themselves:
// "claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929",
// "us.anthropic.claude-sonnet-4-6-v1:0", "Claude-Sonnet-4.6". A date
// suffix is never read as a version number, and the legacy
// "claude-3-7-sonnet-…" naming doesn't match at all.
function sonnetVersion(model: string): { major: number; minor: number } | null {
  const m = /(?:^|[^a-z0-9])sonnet-(\d{1,2})(?:[-.](\d{1,2}))?(?!\d)/.exec(model.trim().toLowerCase());
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] ? Number(m[2]) : 0 };
}

// Effort to send for a model, or undefined to leave the field out. Sonnet's
// explanations hold up at "low", which is faster and spends fewer tokens;
// Haiku rejects the parameter, and Opus keeps its own default (it's the
// "best answer" choice). Anything not positively identified as Sonnet 4.6+
// gets nothing — an unknown model never sees the field.
export function effortFor(model: string): Effort | undefined {
  const v = sonnetVersion(model);
  if (!v) return undefined;
  return v.major > 4 || (v.major === 4 && v.minor >= 6) ? "low" : undefined;
}

function outputConfig(model: string, output?: AiRequest["output"]): Record<string, unknown> | undefined {
  const effort = effortFor(model);
  if (!output && !effort) return undefined;
  return {
    ...(output ? { format: { type: "json_schema", schema: output.schema } } : {}),
    ...(effort ? { effort } : {}),
  };
}

export function buildAnthropicBody(req: AiRequest, model: string): Record<string, unknown> {
  // One breakpoint on the last marked message — the end of the thread's
  // history — so a follow-up reads every earlier round from cache. The
  // system breakpoints share what's left of the budget, keeping the last.
  // (Empty text blocks can't carry cache_control.)
  let msgMark = -1;
  req.messages.forEach((m, i) => {
    if (m.cache && m.content.trim()) msgMark = i;
  });
  const systemBudget = MAX_CACHE_BREAKPOINTS - (msgMark >= 0 ? 1 : 0);
  const cacheIdx = req.system.map((b, i) => (b.cache ? i : -1)).filter((i) => i >= 0);
  const keep = new Set(cacheIdx.slice(Math.max(0, cacheIdx.length - systemBudget)));
  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens,
    stream: true,
    system: req.system.map((b, i) => ({
      type: "text",
      text: b.text,
      ...(keep.has(i) ? { cache_control: EPHEMERAL } : {}),
    })),
    // A string is shorthand for a single text block, so the marked message
    // renders exactly like the plain string it is in the next request.
    messages: req.messages.map((m, i) =>
      i === msgMark
        ? { role: m.role, content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }] }
        : { role: m.role, content: m.content }
    ),
  };
  const config = outputConfig(model, req.output);
  if (config) body.output_config = config;
  return body;
}

function mapStop(reason: string | null | undefined): StopReason {
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "end";
}

function applyUsage(target: Usage, u: AnthropicUsage | undefined): void {
  if (!u) return;
  // message_delta carries cumulative counts, so overwrite rather than add.
  if (u.input_tokens !== undefined) target.input = u.input_tokens;
  if (u.output_tokens !== undefined) target.output = u.output_tokens;
  if (u.cache_read_input_tokens != null) target.cacheRead = u.cache_read_input_tokens;
  if (u.cache_creation_input_tokens != null) target.cacheWrite = u.cache_creation_input_tokens;
}

export class AnthropicStreamState {
  text = "";
  usage = emptyUsage();
  model = "";
  stop: StopReason = "end";

  constructor(private onDelta?: (t: string) => void) {}

  // Returns true on the terminal event.
  handle(ev: SseEvent): boolean {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return false;
    }
    const type = (data.type as string | undefined) ?? ev.event;
    switch (type) {
      case "message_start": {
        const msg = data.message as { model?: string; usage?: AnthropicUsage } | undefined;
        if (msg?.model) this.model = msg.model;
        applyUsage(this.usage, msg?.usage);
        return false;
      }
      case "content_block_delta": {
        // Only visible text; thinking/signature deltas (Sonnet 5 thinks
        // adaptively by default) are not part of the answer.
        const delta = data.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          this.text += delta.text;
          this.onDelta?.(delta.text);
        }
        return false;
      }
      case "message_delta": {
        const delta = data.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) this.stop = mapStop(delta.stop_reason);
        applyUsage(this.usage, data.usage as AnthropicUsage | undefined);
        return false;
      }
      case "message_stop":
        return true;
      case "error": {
        const err = data.error as { type?: string; message?: string } | undefined;
        throw classifyStreamError(err?.type, err?.message ?? "stream error");
      }
      default:
        return false;
    }
  }

  // Non-streaming Message object (a server or proxy that ignored stream:true).
  handleJson(json: unknown): void {
    const msg = json as {
      model?: string;
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: AnthropicUsage;
    };
    this.model = msg.model ?? this.model;
    this.text = (msg.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (this.text) this.onDelta?.(this.text);
    this.stop = mapStop(msg.stop_reason);
    applyUsage(this.usage, msg.usage);
  }
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly caps = { streaming: true, structured: "native", promptCache: true } as const;

  constructor(private deps: ProviderDeps) {}

  private request(body: Record<string, unknown>): RawHttpRequest {
    if (!this.deps.apiKey) throw new AiError("no_key");
    return {
      url: `${trimSlash(this.deps.config.baseUrl || "https://api.anthropic.com")}/v1/messages`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.deps.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    };
  }

  private modelFor(tier: AiRequest["tier"]): string {
    const { smartModel, fastModel } = this.deps.config;
    return (tier === "smart" ? smartModel : fastModel) || smartModel || fastModel;
  }

  async complete(req: AiRequest, opt: CompleteOptions): Promise<AiResult> {
    const model = this.modelFor(req.tier);
    const httpReq = this.request(buildAnthropicBody(req, model));
    const res = await this.deps.transport.send(httpReq, opt.signal);
    await throwIfHttpError(res);

    const state = new AnthropicStreamState(opt.onDelta);
    await consumeBody(res, opt.signal, (ev) => state.handle(ev), (j) => state.handleJson(j));

    const result: AiResult = {
      text: state.text,
      usage: state.usage,
      model: state.model || model,
      stop: state.stop,
      transport: res.mode,
    };
    if (req.output && state.stop === "end") result.json = parseJson(state.text);
    return result;
  }

  // One tiny request per configured model, so a typo in either model ID
  // shows up here instead of on the first real question.
  async testConnection(signal: AbortSignal): Promise<TestConnectionResult> {
    const now = this.deps.now ?? Date.now;
    const started = now();
    const models = [...new Set([this.deps.config.smartModel, this.deps.config.fastModel].filter(Boolean))];
    let transport: TestConnectionResult["transport"] = "fetch";
    for (const model of models) {
      // Same effort setting as real requests, so a model that rejects it
      // fails here instead of on the first question.
      const config = outputConfig(model);
      const res = await this.deps.transport.send(
        this.request({
          model,
          max_tokens: TEST_MAX_TOKENS,
          stream: true,
          messages: [{ role: "user", content: "ping" }],
          ...(config ? { output_config: config } : {}),
        }),
        signal
      );
      await throwIfHttpError(res);
      transport = res.mode;
      const state = new AnthropicStreamState();
      await consumeBody(res, signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    }
    return { models, transport, latencyMs: now() - started };
  }
}

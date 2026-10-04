import type { RawHttpRequest } from "../../../core/ports";
import { AiError, classifyStreamError } from "../errors";
import type { SseEvent } from "../transport/sse";
import { consumeBody, parseJson, throwIfHttpError, trimSlash } from "./stream";
import {
  emptyUsage,
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

const API_VERSION = "2023-06-01";
// The API rejects more than 4 cache_control breakpoints per request.
const MAX_CACHE_BREAKPOINTS = 4;

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function buildAnthropicBody(req: AiRequest, model: string): Record<string, unknown> {
  const cacheIdx = req.system.map((b, i) => (b.cache ? i : -1)).filter((i) => i >= 0);
  const keep = new Set(cacheIdx.slice(-MAX_CACHE_BREAKPOINTS));
  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens,
    stream: true,
    system: req.system.map((b, i) => ({
      type: "text",
      text: b.text,
      ...(keep.has(i) ? { cache_control: { type: "ephemeral" } } : {}),
    })),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (req.output) {
    body.output_config = { format: { type: "json_schema", schema: req.output.schema } };
  }
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
      const res = await this.deps.transport.send(
        this.request({ model, max_tokens: 16, stream: true, messages: [{ role: "user", content: "ping" }] }),
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

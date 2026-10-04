import type { RawHttpRequest } from "../../../core/ports";
import { estimateTokens } from "../../../core/text/tokens";
import { AiError } from "../errors";
import type { SseEvent } from "../transport/sse";
import { consumeBody, extractJson, parseJson, throwIfHttpError, trimSlash } from "./stream";
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

// OpenAI Chat Completions wire format, which OpenAI, Gemini's OpenAI
// endpoint, Ollama (/v1), LM Studio, OpenRouter… all speak. Differences
// between those servers are handled by sniffing as little as possible:
//   • api.openai.com wants `max_completion_tokens` (newer models reject
//     `max_tokens`) and supports native json_schema output; everything else
//     gets `max_tokens` and "prompted" JSON (Ollama models often ignore
//     response_format).
//   • The API key is optional — local Ollama has none.

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

function isOfficialOpenAi(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

const PROMPTED_JSON_INSTRUCTION =
  "只輸出一個符合下列 JSON Schema 的 JSON 值，不要加任何說明文字，也不要用程式碼區塊包起來：\n";

export function buildOpenAiBody(req: AiRequest, model: string, baseUrl: string): Record<string, unknown> {
  const official = isOfficialOpenAi(baseUrl);
  // Chat Completions has no cache markers; OpenAI and others cache prompt
  // prefixes automatically, so keeping our block order stable is enough.
  const systemParts = req.system.map((b) => b.text);
  if (req.output && !official) {
    systemParts.push(PROMPTED_JSON_INSTRUCTION + JSON.stringify(req.output.schema));
  }
  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(systemParts.length ? [{ role: "system", content: systemParts.join("\n\n") }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    stream: true,
    // Without this, streamed responses carry no token counts at all.
    stream_options: { include_usage: true },
    [official ? "max_completion_tokens" : "max_tokens"]: req.maxTokens,
  };
  if (req.output && official) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: req.output.name, schema: req.output.schema, strict: true },
    };
  }
  return body;
}

function mapFinish(reason: string | null | undefined): StopReason | undefined {
  if (!reason) return undefined;
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "refusal";
  return "end";
}

function applyUsage(target: Usage, u: OpenAiUsage | undefined | null): boolean {
  if (!u || u.prompt_tokens === undefined) return false;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  target.input = u.prompt_tokens - cached;
  target.cacheRead = cached;
  target.output = u.completion_tokens ?? 0;
  return true;
}

function streamErrorFromChunk(err: { message?: string; type?: string; code?: unknown }): AiError {
  const message = err.message ?? "stream error";
  const kind = `${err.type ?? ""} ${String(err.code ?? "")}`;
  if (/rate|429/i.test(kind)) return new AiError("rate_limit", message);
  if (/overload|unavailable|503|529/i.test(kind)) return new AiError("overloaded", message);
  if (/context|too_long|length/i.test(kind + message)) return new AiError("too_long", message);
  return new AiError("network", message);
}

export class OpenAiStreamState {
  text = "";
  usage = emptyUsage();
  usageReported = false;
  model = "";
  stop: StopReason = "end";

  constructor(private onDelta?: (t: string) => void) {}

  handle(ev: SseEvent): boolean {
    if (ev.data.trim() === "[DONE]") return true;
    let chunk: {
      model?: string;
      error?: { message?: string; type?: string; code?: unknown };
      choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: OpenAiUsage | null;
    };
    try {
      chunk = JSON.parse(ev.data);
    } catch {
      return false;
    }
    if (chunk.error) throw streamErrorFromChunk(chunk.error);
    if (chunk.model) this.model = chunk.model;
    const choice = chunk.choices?.[0];
    // Reasoning models on some servers stream `reasoning`/`reasoning_content`
    // alongside `content`; only `content` is the answer.
    const piece = choice?.delta?.content;
    if (piece) {
      this.text += piece;
      this.onDelta?.(piece);
    }
    const stop = mapFinish(choice?.finish_reason);
    if (stop) this.stop = stop;
    if (applyUsage(this.usage, chunk.usage)) this.usageReported = true;
    return false;
  }

  handleJson(json: unknown): void {
    const res = json as {
      model?: string;
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: OpenAiUsage;
    };
    this.model = res.model ?? this.model;
    this.text = res.choices?.[0]?.message?.content ?? "";
    if (this.text) this.onDelta?.(this.text);
    this.stop = mapFinish(res.choices?.[0]?.finish_reason) ?? "end";
    if (applyUsage(this.usage, res.usage)) this.usageReported = true;
  }
}

export class OpenAiCompatProvider implements AiProvider {
  readonly id = "openai-compatible" as const;
  readonly caps;

  constructor(private deps: ProviderDeps) {
    this.caps = {
      streaming: true,
      structured: isOfficialOpenAi(deps.config.baseUrl) ? "native" : "prompted",
      promptCache: false,
    } as const;
  }

  private get baseUrl(): string {
    return trimSlash(this.deps.config.baseUrl);
  }

  private request(body: Record<string, unknown>): RawHttpRequest {
    if (!this.baseUrl) throw new AiError("bad_request", "Base URL is empty");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.deps.apiKey) headers.authorization = `Bearer ${this.deps.apiKey}`;
    return { url: `${this.baseUrl}/chat/completions`, method: "POST", headers, body: JSON.stringify(body) };
  }

  private modelFor(tier: AiRequest["tier"]): string {
    const { smartModel, fastModel } = this.deps.config;
    const model = (tier === "smart" ? smartModel : fastModel) || smartModel || fastModel;
    if (!model) throw new AiError("bad_request", "No model name configured");
    return model;
  }

  async complete(req: AiRequest, opt: CompleteOptions): Promise<AiResult> {
    const model = this.modelFor(req.tier);
    const res = await this.deps.transport.send(this.request(buildOpenAiBody(req, model, this.baseUrl)), opt.signal);
    await throwIfHttpError(res);

    const state = new OpenAiStreamState(opt.onDelta);
    await consumeBody(res, opt.signal, (ev) => state.handle(ev), (j) => state.handleJson(j));

    const usage = state.usageReported
      ? state.usage
      : {
          ...emptyUsage(),
          input: estimateTokens(req.system.map((b) => b.text).join("\n") + req.messages.map((m) => m.content).join("\n")),
          output: estimateTokens(state.text),
          estimated: true,
        };
    const result: AiResult = { text: state.text, usage, model: state.model || model, stop: state.stop, transport: res.mode };
    if (req.output && state.stop === "end") {
      result.json = this.caps.structured === "native" ? parseJson(state.text) : extractJson(state.text);
    }
    return result;
  }

  async testConnection(signal: AbortSignal): Promise<TestConnectionResult> {
    const now = this.deps.now ?? Date.now;
    const started = now();
    const models = [...new Set([this.deps.config.smartModel, this.deps.config.fastModel].filter(Boolean))];
    if (models.length === 0) throw new AiError("bad_request", "No model name configured");
    let transport: TestConnectionResult["transport"] = "fetch";
    for (const model of models) {
      const body = buildOpenAiBody(
        { system: [], messages: [{ role: "user", content: "ping" }], maxTokens: TEST_MAX_TOKENS, tier: "fast" },
        model,
        this.baseUrl
      );
      const res = await this.deps.transport.send(this.request(body), signal);
      await throwIfHttpError(res);
      transport = res.mode;
      const state = new OpenAiStreamState();
      await consumeBody(res, signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    }
    return { models, transport, latencyMs: now() - started };
  }
}

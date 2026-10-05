import { describe, expect, it } from "vitest";
import { defaultAiSettings } from "../../../src/core/model/settings";
import { AiError } from "../../../src/services/ai/errors";
import { AnthropicProvider, buildAnthropicBody } from "../../../src/services/ai/providers/anthropic";
import { buildOpenAiBody, normalizeBaseUrl, OpenAiCompatProvider } from "../../../src/services/ai/providers/openaiCompat";
import type { AiRequest } from "../../../src/services/ai/providers/types";
import { errorResponse, FakeTransport, fixture, response } from "./fakes";

const signal = () => new AbortController().signal;

const REQ: AiRequest = {
  system: [
    { text: "BASE", cache: true },
    { text: "ARTICLE", cache: true },
    { text: "FOCUS" },
    { text: "PROFILE" },
  ],
  messages: [
    { role: "user", content: "earlier q" },
    { role: "assistant", content: "earlier a" },
    { role: "user", content: "now" },
  ],
  maxTokens: 1024,
  tier: "smart",
};

function anthropic(transport: FakeTransport, apiKey = "sk-ant-test") {
  return new AnthropicProvider({ config: defaultAiSettings().providers.anthropic, apiKey, transport, now: () => 0 });
}

function openai(transport: FakeTransport, baseUrl = "http://localhost:11434/v1", apiKey = "") {
  return new OpenAiCompatProvider({
    config: { apiKey: "", baseUrl, smartModel: "qwen2.5:7b", fastModel: "qwen2.5:3b" },
    apiKey,
    transport,
    now: () => 0,
  });
}

describe("Anthropic request building", () => {
  it("maps system blocks to cache_control and picks the tier's model", () => {
    expect(buildAnthropicBody(REQ, "claude-sonnet-5")).toMatchInlineSnapshot(`
      {
        "max_tokens": 1024,
        "messages": [
          {
            "content": "earlier q",
            "role": "user",
          },
          {
            "content": "earlier a",
            "role": "assistant",
          },
          {
            "content": "now",
            "role": "user",
          },
        ],
        "model": "claude-sonnet-5",
        "stream": true,
        "system": [
          {
            "cache_control": {
              "type": "ephemeral",
            },
            "text": "BASE",
            "type": "text",
          },
          {
            "cache_control": {
              "type": "ephemeral",
            },
            "text": "ARTICLE",
            "type": "text",
          },
          {
            "text": "FOCUS",
            "type": "text",
          },
          {
            "text": "PROFILE",
            "type": "text",
          },
        ],
      }
    `);
  });

  it("never sends more than 4 cache breakpoints (keeps the last 4)", () => {
    const many: AiRequest = { ...REQ, system: Array.from({ length: 6 }, (_, i) => ({ text: `b${i}`, cache: true })) };
    const sys = buildAnthropicBody(many, "m").system as { cache_control?: unknown }[];
    expect(sys.map((b) => !!b.cache_control)).toEqual([false, false, true, true, true, true]);
  });

  it("uses output_config.format for structured output", () => {
    const body = buildAnthropicBody({ ...REQ, output: { name: "list", schema: { type: "object" } } }, "m");
    expect(body.output_config).toEqual({ format: { type: "json_schema", schema: { type: "object" } } });
  });

  it("sends the auth, version and browser-access headers", async () => {
    const t = new FakeTransport(() => response(fixture("anthropic-basic.txt")));
    await anthropic(t).complete(REQ, { signal: signal() });
    expect(t.requests[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(t.requests[0].headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(t.body().model).toBe("claude-sonnet-5");
  });

  it("uses the fast model for fast-tier requests", async () => {
    const t = new FakeTransport(() => response(fixture("anthropic-basic.txt")));
    await anthropic(t).complete({ ...REQ, tier: "fast" }, { signal: signal() });
    expect(t.body().model).toBe("claude-haiku-4-5");
  });
});

describe("Anthropic response parsing", () => {
  it("collects text deltas (skipping thinking) and usage, chunked byte-by-byte", async () => {
    const deltas: string[] = [];
    const t = new FakeTransport(() => response(fixture("anthropic-basic.txt"), { chunkSize: 1 }));
    const r = await anthropic(t).complete(REQ, { signal: signal(), onDelta: (d) => deltas.push(d) });
    expect(r.text).toBe("你問的是：「I was dancing in heels」\n\n**glittery** 是「閃亮、帶亮片」。");
    expect(deltas.join("")).toBe(r.text);
    expect(r.usage).toEqual({ input: 412, output: 87, cacheRead: 0, cacheWrite: 2048 });
    expect(r.model).toBe("claude-sonnet-5");
    expect(r.stop).toBe("end");
    expect(r.transport).toBe("fetch");
  });

  it("parses the same stream delivered whole by the requestUrl fallback", async () => {
    const t = new FakeTransport(() => response(fixture("anthropic-basic.txt"), { mode: "requestUrl" }));
    const r = await anthropic(t).complete(REQ, { signal: signal() });
    expect(r.text).toContain("glittery");
    expect(r.transport).toBe("requestUrl");
  });

  it("parses a non-streaming JSON Message", async () => {
    const t = new FakeTransport(() =>
      response(
        JSON.stringify({
          model: "claude-sonnet-5",
          content: [{ type: "text", text: "hi" }],
          stop_reason: "max_tokens",
          usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 },
        }),
        { headers: { "content-type": "application/json" } }
      )
    );
    const r = await anthropic(t).complete(REQ, { signal: signal() });
    expect(r).toMatchObject({ text: "hi", stop: "max_tokens", usage: { input: 5, output: 1, cacheRead: 3, cacheWrite: 0 } });
  });

  it("reports refusal as stop=refusal", async () => {
    const t = new FakeTransport(() => response(fixture("anthropic-refusal.txt")));
    const r = await anthropic(t).complete(REQ, { signal: signal() });
    expect(r.stop).toBe("refusal");
  });

  it("turns a mid-stream error event into an AiError after emitting partial text", async () => {
    const deltas: string[] = [];
    const t = new FakeTransport(() => response(fixture("anthropic-midstream-error.txt"), { chunkSize: 9 }));
    const err = await anthropic(t)
      .complete(REQ, { signal: signal(), onDelta: (d) => deltas.push(d) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("overloaded");
    expect(deltas).toEqual(["部分回答"]);
  });

  it.each([
    [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "auth"],
    [429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "rate_limit"],
    [529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "overloaded"],
    [400, { type: "error", error: { type: "invalid_request_error", message: "prompt is too long: 250000 tokens" } }, "too_long"],
    [404, { type: "error", error: { type: "not_found_error", message: "model: claude-nope" } }, "bad_request"],
  ])("maps HTTP %i to %s", async (status, body, code) => {
    const t = new FakeTransport(() => errorResponse(status, body, { "retry-after": "7" }));
    const err = await anthropic(t).complete(REQ, { signal: signal() }).catch((e) => e);
    expect(err.code).toBe(code);
    expect(err.message).toBe(body.error.message);
    expect(err.extra.retryAfterMs).toBe(7000);
  });

  it("fails with no_key before touching the network", async () => {
    const t = new FakeTransport(() => response(""));
    const err = await anthropic(t, "").complete(REQ, { signal: signal() }).catch((e) => e);
    expect(err.code).toBe("no_key");
    expect(t.requests).toHaveLength(0);
  });

  it("testConnection pings each configured model", async () => {
    const t = new FakeTransport(() => response(fixture("anthropic-basic.txt")));
    const r = await anthropic(t).testConnection(signal());
    expect(r.models).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
    expect(t.requests.map((q) => JSON.parse(q.body ?? "").max_tokens)).toEqual([256, 256]);
  });
});

describe("normalizeBaseUrl", () => {
  const gemini = "https://generativelanguage.googleapis.com/v1beta/openai";

  it.each([
    "https://generativelanguage.googleapis.com/v1beta/models",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    "https://generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "  https://generativelanguage.googleapis.com/v1beta/models/chat/completions  ",
  ])("maps the Gemini URL %s to the OpenAI-compatible root", (raw) => {
    expect(normalizeBaseUrl(raw)).toBe(gemini);
  });

  it("strips a pasted /chat/completions and trailing slashes elsewhere", () => {
    expect(normalizeBaseUrl("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
  });

  it("leaves non-URLs alone", () => {
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl("localhost:11434")).toBe("localhost:11434");
  });
});

describe("OpenAI-compatible usage", () => {
  it("counts Gemini thinking tokens that only show up in total_tokens", async () => {
    const body = {
      model: "gemini-3-flash-preview",
      choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 9, total_tokens: 91 },
    };
    const transport = new FakeTransport(() => response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    const p = new OpenAiCompatProvider({
      config: { ...defaultAiSettings().providers["openai-compatible"], baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", smartModel: "gemini-3-flash-preview" },
      apiKey: "k",
      transport,
    });
    const r = await p.complete({ system: [], messages: [{ role: "user", content: "ping" }], maxTokens: 256, tier: "smart" }, { signal: new AbortController().signal });
    expect(transport.requests[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(r.usage).toMatchObject({ input: 2, output: 89 });
  });
});

describe("OpenAI-compatible request building", () => {
  it("joins system blocks into one system message and asks for streamed usage (Ollama)", () => {
    expect(buildOpenAiBody(REQ, "qwen2.5:7b", "http://localhost:11434/v1")).toMatchInlineSnapshot(`
      {
        "max_tokens": 1024,
        "messages": [
          {
            "content": "BASE

      ARTICLE

      FOCUS

      PROFILE",
            "role": "system",
          },
          {
            "content": "earlier q",
            "role": "user",
          },
          {
            "content": "earlier a",
            "role": "assistant",
          },
          {
            "content": "now",
            "role": "user",
          },
        ],
        "model": "qwen2.5:7b",
        "stream": true,
        "stream_options": {
          "include_usage": true,
        },
      }
    `);
  });

  it("uses max_completion_tokens and native json_schema on api.openai.com", () => {
    const body = buildOpenAiBody({ ...REQ, output: { name: "list", schema: { type: "object" } } }, "gpt-4.1", "https://api.openai.com/v1");
    expect(body.max_completion_tokens).toBe(1024);
    expect(body.max_tokens).toBeUndefined();
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "list", schema: { type: "object" }, strict: true },
    });
  });

  it("falls back to prompted JSON elsewhere", () => {
    const body = buildOpenAiBody({ ...REQ, output: { name: "list", schema: { type: "object" } } }, "m", "http://localhost:11434/v1");
    expect(body.response_format).toBeUndefined();
    const sys = (body.messages as { content: string }[])[0].content;
    expect(sys).toContain('JSON Schema');
    expect(sys).toContain('{"type":"object"}');
  });

  it("sends Authorization only when a key is set", async () => {
    const t = new FakeTransport(() => response(fixture("openai-basic.txt")));
    await openai(t).complete(REQ, { signal: signal() });
    await openai(t, "https://api.openai.com/v1", "sk-1").complete(REQ, { signal: signal() });
    expect(t.requests[0].headers.authorization).toBeUndefined();
    expect(t.requests[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(t.requests[1].headers.authorization).toBe("Bearer sk-1");
  });
});

describe("OpenAI-compatible response parsing", () => {
  it("parses OpenAI chunks incl. the usage chunk before [DONE]", async () => {
    const t = new FakeTransport(() => response(fixture("openai-basic.txt"), { chunkSize: 3 }));
    const r = await openai(t, "https://api.openai.com/v1").complete(REQ, { signal: signal() });
    expect(r.text).toBe("你問的是：整段（¶3）");
    expect(r.usage).toEqual({ input: 176, output: 40, cacheRead: 1024, cacheWrite: 0 });
    expect(r.model).toBe("gpt-4.1-mini");
    expect(r.stop).toBe("end");
  });

  it("parses Ollama chunks and estimates usage when none is reported", async () => {
    const t = new FakeTransport(() => response(fixture("ollama-basic.txt"), { chunkSize: 5 }));
    const r = await openai(t).complete(REQ, { signal: signal() });
    expect(r.text).toBe("glittery 意思是閃亮的");
    expect(r.stop).toBe("max_tokens");
    expect(r.usage.estimated).toBe(true);
    expect(r.usage.input).toBeGreaterThan(0);
    expect(r.usage.output).toBeGreaterThan(0);
  });

  it("parses a non-streaming JSON completion", async () => {
    const t = new FakeTransport(() =>
      response(
        JSON.stringify({
          model: "llama3",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 9, completion_tokens: 1 },
        }),
        { headers: { "content-type": "application/json; charset=utf-8" } }
      )
    );
    const r = await openai(t).complete(REQ, { signal: signal() });
    expect(r).toMatchObject({ text: "ok", stop: "end", usage: { input: 9, output: 1, cacheRead: 0 } });
  });

  it("maps a mid-stream error chunk", async () => {
    const t = new FakeTransport(() => response(fixture("openai-midstream-error.txt")));
    const err = await openai(t).complete(REQ, { signal: signal() }).catch((e) => e);
    expect(err.code).toBe("rate_limit");
  });

  it("maps Ollama's model-not-found 404 to bad_request", async () => {
    const t = new FakeTransport(() =>
      errorResponse(404, { error: { message: 'model "qwen9" not found, try pulling it first', type: "api_error" } })
    );
    const err = await openai(t).complete(REQ, { signal: signal() }).catch((e) => e);
    expect(err.code).toBe("bad_request");
    expect(err.message).toContain("not found");
  });

  it("extracts prompted JSON even when wrapped in a code fence", async () => {
    const body = 'data: {"choices":[{"delta":{"content":"```json\\n{\\"words\\":[\\"a\\"]}\\n```"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const t = new FakeTransport(() => response(body));
    const r = await openai(t).complete({ ...REQ, output: { name: "w", schema: {} } }, { signal: signal() });
    expect(r.json).toEqual({ words: ["a"] });
  });

  it("raises bad_output for unparsable prompted JSON", async () => {
    const body = 'data: {"choices":[{"delta":{"content":"sorry, no json"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const t = new FakeTransport(() => response(body));
    const err = await openai(t).complete({ ...REQ, output: { name: "w", schema: {} } }, { signal: signal() }).catch((e) => e);
    expect(err.code).toBe("bad_output");
  });
});

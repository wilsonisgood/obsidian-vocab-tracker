// Every AI failure surfaces as one of these codes (規劃書 06 §6.5) so the UI
// maps code → i18n message + UI state instead of parsing provider-specific
// error bodies. `disabled` and `bad_request` are additions to the spec's
// list: the master toggle being off, and a 4xx that isn't auth/limits
// (usually a mistyped model name or base URL) need their own copy.
export const AI_ERROR_CODES = [
  "disabled",
  "no_key",
  "auth",
  "rate_limit",
  "overloaded",
  "network",
  "offline",
  "cors",
  "refused",
  "too_long",
  "bad_request",
  "bad_output",
  "aborted",
  "budget",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message?: string,
    readonly extra: {
      status?: number;
      // Parsed from the retry-after header (seconds → ms) when present.
      retryAfterMs?: number;
      cause?: unknown;
      // Text that had already streamed in before the failure/stop, so the
      // UI can keep it in the bubble (規劃書 06 M4: 停止後保留已產生的文字).
      partialText?: string;
      // What was sent and what came back, for a structured task whose
      // answer couldn't be read (bad_output): the UI shows it in a
      // collapsible box so the learner can copy it into a bug report.
      debug?: AiDebugInfo;
    } = {}
  ) {
    super(message ?? code);
    this.name = "AiError";
  }

  get retryable(): boolean {
    return this.code === "rate_limit" || this.code === "overloaded";
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}

// ── Debug info for answers that couldn't be read (1005 回饋 #4-2) ──

// Structural subset of providers/types AiRequest, so this file stays free
// of provider imports.
export interface DebugRequest {
  system: readonly { text: string }[];
  messages: readonly { role: string; content: string }[];
  maxTokens?: number;
  tier?: string;
  output?: { name: string };
}

export interface AiDebugInfo {
  taskId?: string;
  // The request as text (formatAiRequest). Never holds the API key: keys
  // only ever travel in request headers, and redactSecrets runs over it
  // anyway.
  prompt: string;
  // The model's raw answer; "" when nothing came back.
  output: string;
  model?: string;
  stop?: string;
  // The parser's complaint, e.g. "family.generate: malformed group".
  reason?: string;
}

const SECRET_PATTERNS: readonly [RegExp, string][] = [
  // Anthropic / OpenAI style: sk-ant-…, sk-proj-…, sk-…
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]"],
  // Google API keys (Gemini)
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]"],
  [/\b(Bearer|x-api-key:?)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
];

// Belt and braces for text that ends up on screen or on the clipboard.
export function redactSecrets(text: string, extra: readonly string[] = []): string {
  let out = text;
  for (const secret of extra) if (secret && secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out;
}

// The request the way a person reads it: every system block, every
// message, then the output schema's name.
export function formatAiRequest(req: DebugRequest): string {
  const parts: string[] = [];
  req.system.forEach((b, i) => parts.push(`[system${req.system.length > 1 ? ` ${i + 1}` : ""}]\n${b.text}`));
  for (const m of req.messages) parts.push(`[${m.role}]\n${m.content}`);
  const meta = [req.tier && `tier: ${req.tier}`, req.maxTokens && `max_tokens: ${req.maxTokens}`, req.output && `schema: ${req.output.name}`]
    .filter(Boolean)
    .join(" · ");
  if (meta) parts.push(`[request]\n${meta}`);
  return redactSecrets(parts.join("\n\n"));
}

// Attaches debug info to a bad_output error (other errors pass through).
// An error that already carries some keeps it.
export function withDebug(e: unknown, info: () => AiDebugInfo | undefined): unknown {
  if (!isAiError(e) || e.code !== "bad_output" || e.extra.debug) return e;
  const d = info();
  if (d) e.extra.debug = { ...d, prompt: redactSecrets(d.prompt), output: redactSecrets(d.output), reason: d.reason ?? e.message };
  return e;
}

export function aiDebugOf(e: unknown): AiDebugInfo | undefined {
  return isAiError(e) ? e.extra.debug : undefined;
}

// One block of plain text for the 「複製」 button / a bug report.
export function aiDebugReport(d: AiDebugInfo, labels: { prompt: string; output: string; empty: string }): string {
  const head = [d.taskId && `task: ${d.taskId}`, d.model && `model: ${d.model}`, d.stop && `stop: ${d.stop}`, d.reason && `error: ${d.reason}`]
    .filter(Boolean)
    .join("\n");
  return [head, `===== ${labels.prompt} =====`, d.prompt || labels.empty, `===== ${labels.output} =====`, d.output || labels.empty]
    .filter(Boolean)
    .join("\n\n");
}

// retry-after is either delta-seconds or an HTTP date.
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

// Pulls a human-readable message out of either provider's error body:
// Anthropic `{type:"error", error:{type, message}}`, OpenAI
// `{error:{message, type, code}}`, Ollama `{error:"..."}`.
export function errorBodyMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: unknown; message?: unknown };
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object") {
      const msg = (j.error as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    if (typeof j.message === "string") return j.message;
  } catch {
    // not JSON — fall through to the raw text
  }
  return body.slice(0, 300);
}

const TOO_LONG_RE = /prompt is too long|context length|context window|maximum context|too many tokens|request_too_large/i;

export function classifyHttpError(status: number, body: string, retryAfter?: string | null): AiError {
  const message = errorBodyMessage(body);
  const extra = { status, retryAfterMs: parseRetryAfter(retryAfter) };
  if (status === 401 || status === 403) return new AiError("auth", message, extra);
  if (status === 429) return new AiError("rate_limit", message, extra);
  if (status === 413 || TOO_LONG_RE.test(message)) return new AiError("too_long", message, extra);
  if (status === 529 || status >= 500) return new AiError("overloaded", message, extra);
  return new AiError("bad_request", message, extra);
}

// Error events that arrive *inside* a 200 SSE stream (Anthropic sends
// `event: error` with `{error:{type:"overloaded_error"}}` mid-response).
export function classifyStreamError(type: string | undefined, message: string): AiError {
  switch (type) {
    case "overloaded_error":
    case "api_error":
      return new AiError("overloaded", message);
    case "rate_limit_error":
      return new AiError("rate_limit", message);
    case "authentication_error":
    case "permission_error":
      return new AiError("auth", message);
    case "request_too_large":
      return new AiError("too_long", message);
    default:
      return TOO_LONG_RE.test(message) ? new AiError("too_long", message) : new AiError("network", message);
  }
}

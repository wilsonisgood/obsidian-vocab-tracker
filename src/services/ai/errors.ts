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

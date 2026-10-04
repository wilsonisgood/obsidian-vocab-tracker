import type { ProviderId, ProviderSettings } from "../../../core/model/settings";
import type { AiTransport, TransportMode } from "../transport/types";

export type Tier = "fast" | "smart";

// JSON Schema is passed through to the provider untouched.
export type JsonSchema = Record<string, unknown>;

export interface SystemBlock {
  text: string;
  // Marks the end of a cacheable prefix (Anthropic `cache_control`). Only
  // put this on content that is byte-identical across requests — see
  // services/ai/tasks/compose.ts for the ordering rationale.
  cache?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Provider-neutral request (規劃書 06 §6.1). Tasks build these; providers
// translate them to their wire format.
export interface AiRequest {
  system: SystemBlock[];
  messages: ChatMessage[];
  maxTokens: number;
  output?: { name: string; schema: JsonSchema };
  tier: Tier;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  // True when the provider didn't report usage and the numbers are a
  // characters-based estimate (some OpenAI-compatible servers omit it).
  estimated?: boolean;
}

export type StopReason = "end" | "max_tokens" | "refusal";

export interface AiResult {
  text: string;
  json?: unknown;
  usage: Usage;
  model: string;
  stop: StopReason;
  transport: TransportMode;
}

export interface CompleteOptions {
  signal: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface ProviderCaps {
  streaming: boolean;
  structured: "native" | "prompted";
  promptCache: boolean;
}

export interface TestConnectionResult {
  models: string[];
  transport: TransportMode;
  latencyMs: number;
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly caps: ProviderCaps;
  complete(req: AiRequest, opt: CompleteOptions): Promise<AiResult>;
  testConnection(signal: AbortSignal): Promise<TestConnectionResult>;
}

export interface ProviderDeps {
  config: ProviderSettings;
  apiKey: string;
  transport: AiTransport;
  now?: () => number;
}

// max_tokens for the 測試連線 ping. Generous on purpose: Sonnet 5 thinks
// adaptively by default and thinking counts against max_tokens, so a tiny
// cap risks a truncated or rejected test even though the setup is fine.
export const TEST_MAX_TOKENS = 256;

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

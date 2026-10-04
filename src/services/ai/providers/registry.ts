import type { I18nKey } from "../../../core/i18n";
import type { ProviderId } from "../../../core/model/settings";
import { AnthropicProvider } from "./anthropic";
import { OpenAiCompatProvider } from "./openaiCompat";
import type { AiProvider, ProviderDeps } from "./types";

// Adding a provider = implement AiProvider + add an entry here; the
// settings section renders its fields from this description (規劃書 06 §10).
export interface ProviderDef {
  id: ProviderId;
  label: I18nKey;
  // "required": requests fail with no_key without one; "optional": local
  // servers like Ollama accept requests without a key.
  key: "required" | "optional";
  // Fixed model lists render as dropdowns; free-form providers get text
  // inputs (each server has its own model names).
  models?: { smart: string[]; fast: string[] };
  // Base URL presets (OpenAI-compatible only).
  baseUrlPresets?: { label: string; url: string }[];
  // Whether the base URL is user-editable in settings.
  editableBaseUrl: boolean;
  create(deps: ProviderDeps): AiProvider;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    label: "ai.provider.anthropic",
    key: "required",
    // claude-opus-5-5 is listed because 規劃書 06 §6.1 names it as the
    // upgrade option; Sonnet 5 / Haiku 4.5 are the defaults.
    models: {
      smart: ["claude-sonnet-5", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-6"],
      fast: ["claude-haiku-4-5", "claude-sonnet-5"],
    },
    editableBaseUrl: false,
    create: (deps) => new AnthropicProvider(deps),
  },
  {
    id: "openai-compatible",
    label: "ai.provider.openai",
    key: "optional",
    baseUrlPresets: [
      { label: "OpenAI", url: "https://api.openai.com/v1" },
      { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
      { label: "Ollama", url: "http://localhost:11434/v1" },
    ],
    editableBaseUrl: true,
    create: (deps) => new OpenAiCompatProvider(deps),
  },
];

export function providerDef(id: ProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export function isMissingKey(id: ProviderId, key: string): boolean {
  return providerDef(id).key === "required" && !key;
}

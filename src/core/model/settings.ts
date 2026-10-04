// Plugin settings (規劃書 06 §4.1 `Settings`). Stored inside data.json's
// `settings` object; every sub-object is optional on disk and filled from
// the defaults below at read time, so adding a field later never needs a
// migration — old data simply picks up the new default.

export type ProviderId = "anthropic" | "openai-compatible";

export interface ProviderSettings {
  // Empty when the key lives in Obsidian's SecretStorage instead (see
  // services/ai/keys.ts) — never both.
  apiKey: string;
  baseUrl: string;
  smartModel: string;
  fastModel: string;
}

export interface AiSettings {
  // Master switch; AI stays off until the user opts in (規劃書 06 §12).
  enabled: boolean;
  provider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  // Weighted tokens per calendar month (cache reads count 1/10, see
  // services/ai/usage.ts). 0 = no limit.
  monthlyTokenBudget: number;
}

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const LEARNER_GOALS = ["general", "toefl", "toeic", "ielts", "gept", "school"] as const;
export type LearnerGoal = (typeof LEARNER_GOALS)[number];

export const ANSWER_LANGUAGES = ["zh-TW", "en", "bilingual"] as const;
export type AnswerLanguage = (typeof ANSWER_LANGUAGES)[number];

// Who the learner is — rendered into a system block on every AI request
// (services/ai/context/profile.ts) so answers match their level and goal.
export interface LearnerProfile {
  level: CefrLevel | "";
  goal: LearnerGoal;
  answerLanguage: AnswerLanguage;
  // Soft target the model is asked to stay under; 0 = no limit.
  maxAnswerChars: number;
  // Free-text "其他補充" appended verbatim.
  extra: string;
}

export type UiLocaleSetting = "auto" | "en" | "zh-TW";

export interface PluginSettings {
  schemaVersion: 2;
  // Lets core/store/merge.ts pick the newer settings object when two
  // devices both changed settings, instead of always keeping the local one.
  updatedAt?: string;
  ui?: { locale: UiLocaleSetting };
  ai?: AiSettings;
  learner?: LearnerProfile;
}

export type ResolvedSettings = PluginSettings & {
  ui: { locale: UiLocaleSetting };
  ai: AiSettings;
  learner: LearnerProfile;
};

// Model IDs verified against the Claude API model table (2026-06):
// Sonnet for answers that need judgement, Haiku for cheap/fast ones.
export const DEFAULT_ANTHROPIC_SMART_MODEL = "claude-sonnet-5";
export const DEFAULT_ANTHROPIC_FAST_MODEL = "claude-haiku-4-5";

export function defaultAiSettings(): AiSettings {
  return {
    enabled: false,
    provider: "anthropic",
    providers: {
      anthropic: {
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
        smartModel: DEFAULT_ANTHROPIC_SMART_MODEL,
        fastModel: DEFAULT_ANTHROPIC_FAST_MODEL,
      },
      "openai-compatible": {
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
        smartModel: "",
        fastModel: "",
      },
    },
    monthlyTokenBudget: 0,
  };
}

export function defaultLearnerProfile(): LearnerProfile {
  return { level: "", goal: "general", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };
}

// Fills every missing field with its default without dropping unknown keys
// (a newer plugin version on another device may have written fields this
// one doesn't know yet — sync must not strip them).
export function withSettingsDefaults(raw: PluginSettings | undefined): ResolvedSettings {
  const base = raw ?? { schemaVersion: 2 };
  const aiDefaults = defaultAiSettings();
  const ai = base.ai ?? aiDefaults;
  const providers = { ...aiDefaults.providers };
  for (const id of Object.keys(providers) as ProviderId[]) {
    providers[id] = { ...aiDefaults.providers[id], ...(ai.providers?.[id] ?? {}) };
  }
  return {
    ...base,
    schemaVersion: 2,
    ui: { locale: "auto", ...(base.ui ?? {}) },
    ai: { ...aiDefaults, ...ai, providers: { ...(ai.providers ?? {}), ...providers } },
    learner: { ...defaultLearnerProfile(), ...(base.learner ?? {}) },
  };
}

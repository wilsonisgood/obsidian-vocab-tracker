import type { SrsSettings } from "./srs";
import type { WordlistSettings } from "./wordlists";

// Plugin settings (規劃書 06 §4.1 `Settings`). Stored inside data.json's
// `settings` object; every sub-object is optional on disk and filled from
// the defaults below at read time, so adding a field later never needs a
// migration — old data simply picks up the new default.

// Each settings section carries its own stamp so two devices editing
// different sections (Mac: flashcards, iPhone: AI) both survive a sync —
// core/store/merge.ts picks the newer copy section by section. Written only
// by VocabStore.updateSettings (via stampChangedSections below).
export interface SectionStamp {
  updatedAt?: string;
}

export type ProviderId = "anthropic" | "openai-compatible";

export interface ProviderSettings {
  // Empty when the key lives in Obsidian's SecretStorage instead (see
  // services/ai/keys.ts) — never both.
  apiKey: string;
  baseUrl: string;
  smartModel: string;
  fastModel: string;
}

export interface AiSettings extends SectionStamp {
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
export interface LearnerProfile extends SectionStamp {
  level: CefrLevel | "";
  goal: LearnerGoal;
  answerLanguage: AnswerLanguage;
  // Soft target the model is asked to stay under; 0 = no limit.
  maxAnswerChars: number;
  // Free-text "其他補充" appended verbatim.
  extra: string;
}

export type UiLocaleSetting = "auto" | "en" | "zh-TW";

export interface UiSettings extends SectionStamp {
  locale: UiLocaleSetting;
}

export interface PluginSettings {
  schemaVersion: 2;
  // Bumped on every settings change. merge.ts goes by the per-section
  // stamps; this one only breaks the case where both copies of a section
  // are unstamped (written before per-section stamps existed — the old
  // whole-object rule) and picks whose top-level/unknown keys to keep.
  updatedAt?: string;
  ui?: UiSettings;
  ai?: AiSettings;
  learner?: LearnerProfile;
  // Read through resolveSrsSettings() (core/model/srs.ts), which fills in
  // DEFAULT_SRS_SETTINGS for anything missing.
  srs?: Partial<SrsSettings> & SectionStamp;
  // Read through resolveWordlistSettings() (core/model/wordlists.ts).
  wordlists?: Partial<WordlistSettings>;
}

// The sections merged independently, each with its own updatedAt.
export const SETTINGS_SECTIONS = ["ui", "ai", "learner", "srs", "wordlists"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type ResolvedSettings = PluginSettings & {
  ui: UiSettings;
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

// Key-order-independent JSON of a section, ignoring its own stamp — so a
// section rebuilt with the same values (e.g. `s.srs = { ...resolved, ...patch }`)
// doesn't count as changed just because its keys came out in another order.
function sectionFingerprint(section: unknown): string {
  if (!section || typeof section !== "object") return String(section);
  return JSON.stringify({ ...section, updatedAt: undefined }, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]])
        )
      : v
  );
}

export type SettingsSnapshot = Record<SettingsSection, { fingerprint: string; updatedAt?: string }>;

// Taken before an edit; pass to stampChangedSections afterwards.
export function snapshotSettingsSections(s: PluginSettings): SettingsSnapshot {
  const out = {} as SettingsSnapshot;
  for (const key of SETTINGS_SECTIONS) {
    const section = s[key] as SectionStamp | undefined;
    out[key] = { fingerprint: sectionFingerprint(section), updatedAt: section?.updatedAt };
  }
  return out;
}

// Stamps only the sections whose content differs from `before`, and
// returns them. A section whose content didn't change but whose object was
// replaced (losing its stamp, e.g. rebuilt through resolveSrsSettings) gets
// its old stamp back, so a no-op edit can't make it look newer or older.
export function stampChangedSections(s: PluginSettings, before: SettingsSnapshot, stamp: string): SettingsSection[] {
  const changed: SettingsSection[] = [];
  for (const key of SETTINGS_SECTIONS) {
    const section = s[key] as SectionStamp | undefined;
    if (!section || typeof section !== "object") continue;
    if (sectionFingerprint(section) !== before[key].fingerprint) {
      section.updatedAt = stamp;
      changed.push(key);
    } else if (before[key].updatedAt !== undefined) {
      section.updatedAt = before[key].updatedAt;
    } else {
      delete section.updatedAt;
    }
  }
  return changed;
}

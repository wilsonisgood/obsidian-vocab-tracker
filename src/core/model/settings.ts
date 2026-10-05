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

// What tapping a word in reading view does (規劃書 01 §3.2, 06 §9.7):
//   menu — a menu with 「加入／開啟」 (the desktop default)
//   save — saves it at once, with a Notice that can undo it; tapping a word
//          that's already saved opens its card instead (the mobile default)
//   open — opens the word's card without saving it: the sidebar, or the
//          bottom sheet (WordSheet) on iPhone
export const TAP_ACTIONS = ["menu", "save", "open"] as const;
export type TapAction = (typeof TAP_ACTIONS)[number];

// Which voice 🔊 uses (1005 回饋第 12 項, services/speech/Pronouncer.ts):
//   auto      — the dictionary recording, or the system voice when it's
//               slow (1.5 s) or this is an iPhone / iPad
//   recording — wait for the recording
//   synth     — always the system voice
export const PRONOUNCE_SOURCES = ["auto", "recording", "synth"] as const;
export type PronounceSource = (typeof PRONOUNCE_SOURCES)[number];

export interface UiSettings extends SectionStamp {
  locale: UiLocaleSetting;
  // Read through resolveUiPrefs() below. Optional on disk: data written
  // before M8 has none of them, and a copy that only gained defaults must
  // not look edited to merge.ts.
  // Desktop (and anything that isn't Obsidian mobile).
  tapAction?: TapAction;
  // iPhone and iPad (Platform.isMobile).
  tapActionMobile?: TapAction;
  // The one-time 「Live Preview 不能點字」 hint on mobile; false once the
  // user picked 「不再提示」.
  livePreviewHint?: boolean;
  // 🔊 用哪種讀音（1005 回饋第 12 項）.
  pronounceSource?: PronounceSource;
}

export interface UiPrefs {
  tapAction: TapAction;
  tapActionMobile: TapAction;
  livePreviewHint: boolean;
  pronounceSource: PronounceSource;
}

export const DEFAULT_UI_PREFS: Readonly<UiPrefs> = {
  tapAction: "menu",
  tapActionMobile: "save",
  livePreviewHint: true,
  pronounceSource: "auto",
};

function isTapAction(v: unknown): v is TapAction {
  return typeof v === "string" && (TAP_ACTIONS as readonly string[]).includes(v);
}

function isPronounceSource(v: unknown): v is PronounceSource {
  return typeof v === "string" && (PRONOUNCE_SOURCES as readonly string[]).includes(v);
}

// The ui section's M8 fields with defaults filled in. A value this version
// doesn't know (written by a newer version on another device) reads as the
// default, but stays on disk untouched.
export function resolveUiPrefs(ui: Partial<UiSettings> | undefined): UiPrefs {
  return {
    tapAction: isTapAction(ui?.tapAction) ? ui.tapAction : DEFAULT_UI_PREFS.tapAction,
    tapActionMobile: isTapAction(ui?.tapActionMobile) ? ui.tapActionMobile : DEFAULT_UI_PREFS.tapActionMobile,
    livePreviewHint: typeof ui?.livePreviewHint === "boolean" ? ui.livePreviewHint : DEFAULT_UI_PREFS.livePreviewHint,
    pronounceSource: isPronounceSource(ui?.pronounceSource) ? ui.pronounceSource : DEFAULT_UI_PREFS.pronounceSource,
  };
}

// Where the plugin's notes go (規劃書 06 §8.3). Read through
// resolveFilesSettings() (services/files/settings.ts), which cleans the
// folder names and fills in the defaults (vocab-list / 單字 / 討論串).
export interface FilesSettings extends SectionStamp {
  // Vault folder of the entry files (單字卡.md…) and the two folders below.
  folder: string;
  // Word pages, under `folder`.
  wordsFolder: string;
  // Paragraph discussions (<文章>.ai.md), under `folder`.
  threadsFolder: string;
}

// Paragraph discussion anchors (規劃書 06 §5.1). Read through
// resolveAnchorSettings() (ui/sidebar/anchorSettings.ts).
export interface AnchorSettings extends SectionStamp {
  // "hash" = 設定「不要修改我的筆記」: no ` ^vt-…` is written into notes.
  mode: "block" | "hash";
  // The one-time explanation before the first ` ^vt-…` is written.
  blockIdNoticeSeen: boolean;
}

export interface PluginSettings {
  schemaVersion: 2;
  // Set to the same stamp as the section(s) an edit changed; never newer
  // than the newest section stamp when this version wrote it. merge.ts goes
  // by the per-section stamps and uses this one to spot copies edited by an
  // older plugin version (top-level newer than every section — see
  // legacyStamp below), to break ties, and to pick whose top-level/unknown
  // keys to keep.
  updatedAt?: string;
  ui?: UiSettings;
  ai?: AiSettings;
  learner?: LearnerProfile;
  // Read through resolveSrsSettings() (core/model/srs.ts), which fills in
  // DEFAULT_SRS_SETTINGS for anything missing.
  srs?: Partial<SrsSettings> & SectionStamp;
  // Read through resolveWordlistSettings() (core/model/wordlists.ts).
  wordlists?: Partial<WordlistSettings>;
  // Read through resolveFilesSettings() (services/files/settings.ts).
  files?: Partial<FilesSettings>;
  // Read through resolveAnchorSettings() (ui/sidebar/anchorSettings.ts).
  anchors?: Partial<AnchorSettings>;
}

// The sections merged independently, each with its own updatedAt.
export const SETTINGS_SECTIONS = ["ui", "ai", "learner", "srs", "wordlists", "files", "anchors"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type ResolvedSettings = PluginSettings & {
  ui: UiSettings;
  ai: AiSettings;
  learner: LearnerProfile;
};

// Epoch ms of a stamp; missing or unparseable stamps count as oldest (0).
export function stampMs(iso: unknown): number {
  if (typeof iso !== "string" || !iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// Older plugin versions (still around while devices update one by one via
// BRAT) edit sections without stamping them — or drop the stamp when they
// rebuild a section — yet still bump the top-level updatedAt. This version
// only ever bumps it together with a section stamp of the same value, so a
// top-level stamp newer than every section stamp means an old version
// changed this copy at that time, in some section we can't pinpoint.
// Every object-valued key counts as a section here, so one added by a newer
// plugin version is included too.
export function legacyStamp(s: PluginSettings): { ms: number; iso: string } | null {
  const ms = stampMs(s.updatedAt);
  let newest = 0;
  for (const v of Object.values(s)) {
    if (v && typeof v === "object") newest = Math.max(newest, stampMs((v as SectionStamp).updatedAt));
  }
  return ms > newest ? { ms, iso: s.updatedAt as string } : null;
}

// Called by VocabStore.updateSettings before an edit. Once this version
// bumps the top-level stamp, legacyStamp can no longer see an old version's
// edit — so first hand that time down to every section older than it,
// which is exactly the time merge.ts would have given those sections
// (pickSection raises each one to the old-version edit time). Merge
// outcomes are therefore the same before and after the carry.
//
// Sections that aren't there have nothing to carry (a later edit that
// creates one stamps it as changed). Sections only filled in by
// withSettingsDefaults (ui/ai/learner) do get the stamp: merge.ts already
// treats them like any other section of that copy, and the old version
// persisted them the same way, so there's no telling them apart from
// sections the user really set.
export function carryLegacyStamp(s: PluginSettings): void {
  const legacy = legacyStamp(s);
  if (!legacy) return;
  for (const key of SETTINGS_SECTIONS) {
    const section = s[key] as SectionStamp | undefined;
    if (section && typeof section === "object" && stampMs(section.updatedAt) < legacy.ms) section.updatedAt = legacy.iso;
  }
}

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
// Also what merge.ts compares to tell whether two copies really differ.
export function sectionFingerprint(section: unknown): string {
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

import { describe, expect, it, vi } from "vitest";
import {
  carryLegacyStamp,
  defaultAiSettings,
  defaultLearnerProfile,
  snapshotSettingsSections,
  stampChangedSections,
  withSettingsDefaults,
  type PluginSettings,
} from "../../../src/core/model/settings";
import { resolveSrsSettings } from "../../../src/core/model/srs";
import { resolveWordlistSettings, type WordlistSettings } from "../../../src/core/model/wordlists";
import { merge } from "../../../src/core/store/merge";
import { VocabStore } from "../../../src/core/store/VocabStore";

describe("withSettingsDefaults", () => {
  it("fills everything for pre-M3 settings, with AI off", () => {
    const s = withSettingsDefaults({ schemaVersion: 2 });
    expect(s.ai.enabled).toBe(false);
    expect(s.ai.provider).toBe("anthropic");
    expect(s.ai.providers.anthropic).toMatchObject({ smartModel: "claude-sonnet-5", fastModel: "claude-haiku-4-5" });
    expect(s.learner).toEqual({ level: "", goal: "general", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" });
    expect(s.ui.locale).toBe("auto");
  });

  it("keeps stored values, fills missing nested fields, and preserves unknown keys", () => {
    const raw = {
      schemaVersion: 2,
      futureField: 1,
      ai: { enabled: true, providers: { "openai-compatible": { baseUrl: "https://api.openai.com/v1" } } },
      learner: { level: "B2" },
    } as unknown as PluginSettings;
    const s = withSettingsDefaults(raw);
    expect(s.ai.enabled).toBe(true);
    expect(s.ai.monthlyTokenBudget).toBe(0);
    expect(s.ai.providers["openai-compatible"]).toEqual({ ...defaultAiSettings().providers["openai-compatible"], baseUrl: "https://api.openai.com/v1" });
    expect(s.ai.providers.anthropic.smartModel).toBe("claude-sonnet-5");
    expect(s.learner.level).toBe("B2");
    expect(s.learner.maxAnswerChars).toBe(300);
    expect((s as unknown as { futureField: number }).futureField).toBe(1);
  });

  it("is idempotent", () => {
    const once = withSettingsDefaults({ schemaVersion: 2 });
    expect(withSettingsDefaults(once)).toEqual(once);
  });
});

describe("merge() settings", () => {
  const data = (settings: PluginSettings) => ({ schemaVersion: 2 as const, settings, entries: [] });

  // Pre-section-stamp data: no section carries its own updatedAt, so the
  // old whole-object rule (newer top-level updatedAt) still decides.
  it("takes the more recently updated settings object when no section is stamped", () => {
    const local = { schemaVersion: 2 as const, updatedAt: "2026-10-01T00:00:00.000Z", learner: { level: "A1" } } as PluginSettings;
    const remote = { schemaVersion: 2 as const, updatedAt: "2026-10-02T00:00:00.000Z", learner: { level: "C1" } } as PluginSettings;
    // The winning section takes the top-level time as its own stamp.
    const expected = { ...remote, learner: { level: "C1", updatedAt: remote.updatedAt } };
    expect(merge(data(local), data(remote)).settings).toEqual(expected);
    expect(merge(data(remote), data(local)).settings).toEqual(expected);
  });

  it("converges on the same copy when neither side has any stamp at all", () => {
    const a = { schemaVersion: 2 as const, learner: { level: "A1" } } as PluginSettings;
    const b = { schemaVersion: 2 as const, learner: { level: "C1" } } as PluginSettings;
    const ab = merge(data(a), data(b)).settings;
    expect(ab).toEqual(merge(data(b), data(a)).settings);
    expect([a, b]).toContainEqual(ab);
  });
});

describe("VocabStore settings", () => {
  it("resolves defaults and stamps updatedAt on update", async () => {
    const writes: unknown[] = [];
    const store = new VocabStore({ schemaVersion: 2, entries: [] }, async (d) => {
      writes.push(structuredClone(d));
    });
    expect(store.settings.ai.enabled).toBe(false);
    // Stable object across reads (no re-resolve churn).
    expect(store.settings).toBe(store.settings);
    await store.updateSettings((s) => {
      s.ai.enabled = true;
    });
    expect(store.vocabData.settings?.ai?.enabled).toBe(true);
    expect(store.vocabData.settings?.updatedAt).toMatch(/^\d{4}-/);
    await store.flush();
    expect(writes).toHaveLength(1);
  });
});

describe("VocabStore.updateSettings per-section stamps", () => {
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";

  async function at<T>(iso: string, fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  }

  const newStore = (settings?: PluginSettings) =>
    new VocabStore({ schemaVersion: 2, settings, entries: [] }, async () => {});

  it("leaves every stamp alone, top-level included, when nothing changed", async () => {
    const store = newStore();
    await at(T1, () => store.updateSettings((s) => (s.ai.enabled = true)));
    await at(T2, () => store.updateSettings((s) => (s.ai.enabled = true)));
    await at(T2, () => store.updateSettings(() => {}));
    expect(store.vocabData.settings?.ai?.updatedAt).toBe(T1);
    expect(store.vocabData.settings?.updatedAt).toBe(T1);
  });

  it("stamps only the section that changed (plus the top-level stamp)", async () => {
    const store = newStore();
    await at(T1, () => store.updateSettings((s) => (s.ai.enabled = true)));
    const s = store.vocabData.settings!;
    expect(s.ai?.updatedAt).toBe(T1);
    expect(s.updatedAt).toBe(T1);
    expect(s.learner?.updatedAt).toBeUndefined();
    expect(s.ui?.updatedAt).toBeUndefined();
    expect(s.srs).toBeUndefined();
    expect(s.wordlists).toBeUndefined();
  });

  it("re-stamps a section on a later change and leaves the others' stamps alone", async () => {
    const store = newStore();
    await at(T1, () => store.updateSettings((s) => (s.learner.level = "B2")));
    await at(T2, () => store.updateSettings((s) => (s.ui.locale = "en")));
    const s = store.vocabData.settings!;
    expect(s.learner?.updatedAt).toBe(T1);
    expect(s.ui?.updatedAt).toBe(T2);
    expect(s.updatedAt).toBe(T2);
  });

  it("stamps a nested change inside a section (ai.providers)", async () => {
    const store = newStore();
    await at(T1, () => store.updateSettings((s) => (s.ai.providers.anthropic.smartModel = "x")));
    expect(store.vocabData.settings?.ai?.updatedAt).toBe(T1);
  });

  it("keeps the old stamp when a section is rebuilt with identical values", async () => {
    const store = newStore();
    await at(T1, () => store.updateSettings((s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 30 })));
    expect(store.vocabData.settings?.srs?.updatedAt).toBe(T1);

    // Same pattern as ui/settings/sections/srs.ts: resolve (drops the
    // stamp), spread a patch that changes nothing, assign back.
    await at(T2, () => store.updateSettings((s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 30 })));
    expect(store.vocabData.settings?.srs?.updatedAt).toBe(T1);
    // Key order alone isn't a change either.
    await at(T2, () => store.updateSettings((s) => (s.srs = { dailyNew: 30, retention: 0.9 })));
    expect(store.vocabData.settings?.srs?.updatedAt).toBe(T1);

    await at(T2, () => store.updateSettings((s) => (s.srs = { ...resolveSrsSettings(s.srs), dailyNew: 40 })));
    expect(store.vocabData.settings?.srs?.updatedAt).toBe(T2);
  });

  it("stamps wordlists when replaced through resolveWordlistSettings, which itself never carries the stamp", async () => {
    const store = newStore();
    const patch = (p: Partial<WordlistSettings>) =>
      store.updateSettings((s) => (s.wordlists = { ...resolveWordlistSettings(s.wordlists), ...p }));
    await at(T1, () => patch({ tags: { "exam/TOEFL": { color: "#000000" } } }));
    expect(store.vocabData.settings?.wordlists?.updatedAt).toBe(T1);
    expect(store.vocabData.settings?.ai?.updatedAt).toBeUndefined();
    // main.ts compares resolved wordlist settings as JSON to decide whether
    // to reload lists — the stamp must not leak into that.
    expect(resolveWordlistSettings(store.vocabData.settings?.wordlists)).not.toHaveProperty("updatedAt");
  });
});

describe("snapshotSettingsSections / stampChangedSections", () => {
  it("returns the changed sections and leaves untouched ones unstamped", () => {
    const s = withSettingsDefaults({ schemaVersion: 2 });
    const before = snapshotSettingsSections(s);
    s.learner.extra = "hi";
    s.wordlists = { tags: { a: { enabled: false } } };
    expect(stampChangedSections(s, before, "2026-10-01T00:00:00.000Z")).toEqual(["learner", "wordlists"]);
    expect(s.ai.updatedAt).toBeUndefined();
  });

  it("is a no-op when nothing changed", () => {
    const s = withSettingsDefaults({ schemaVersion: 2, learner: { ...defaultLearnerProfile(), updatedAt: "2026-01-01T00:00:00.000Z" } });
    const copy = structuredClone(s);
    expect(stampChangedSections(s, snapshotSettingsSections(s), "2026-10-01T00:00:00.000Z")).toEqual([]);
    expect(s).toEqual(copy);
  });
});

describe("carryLegacyStamp", () => {
  const T1 = "2026-09-01T00:00:00.000Z";
  const T2 = "2026-10-01T00:00:00.000Z";

  it("does nothing to a copy this version wrote last", () => {
    const s: PluginSettings = { schemaVersion: 2, updatedAt: T2, ui: { locale: "en", updatedAt: T2 }, learner: defaultLearnerProfile() };
    const copy = structuredClone(s);
    carryLegacyStamp(s);
    expect(s).toEqual(copy);
    const unstamped: PluginSettings = { schemaVersion: 2, learner: defaultLearnerProfile() };
    carryLegacyStamp(unstamped);
    expect(unstamped.learner?.updatedAt).toBeUndefined();
  });

  it("stamps every present section older than an old-version edit, and only those", () => {
    const s = {
      schemaVersion: 2,
      updatedAt: T2,
      ui: { locale: "en", updatedAt: T1 },
      learner: { ...defaultLearnerProfile(), updatedAt: "not a date" },
      srs: { dailyNew: 5 },
      futureSection: { x: 1 },
    } as PluginSettings;
    carryLegacyStamp(s);
    expect(s.ui?.updatedAt).toBe(T2);
    expect(s.learner?.updatedAt).toBe(T2);
    expect(s.srs?.updatedAt).toBe(T2);
    expect(s.ai).toBeUndefined();
    expect(s.wordlists).toBeUndefined();
    expect((s as unknown as { futureSection: object }).futureSection).toEqual({ x: 1 });
    // Afterwards the copy no longer looks old-version-edited: idempotent.
    const copy = structuredClone(s);
    carryLegacyStamp(s);
    expect(s).toEqual(copy);
  });

  it("runs inside updateSettings, before the edit is stamped", async () => {
    const store = new VocabStore(
      { schemaVersion: 2, settings: { schemaVersion: 2, updatedAt: T1, learner: { ...defaultLearnerProfile(), level: "B2" } }, entries: [] },
      async () => {}
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T2));
    try {
      await store.updateSettings((s) => (s.ui.locale = "en"));
    } finally {
      vi.useRealTimers();
    }
    const s = store.vocabData.settings!;
    expect(s.updatedAt).toBe(T2);
    expect(s.ui?.updatedAt).toBe(T2);
    // Getter-filled ai and stored learner both carry the old-version time.
    expect(s.learner?.updatedAt).toBe(T1);
    expect(s.ai?.updatedAt).toBe(T1);
    expect(s.srs).toBeUndefined();
  });
});

describe("resolveWordlistSettings", () => {
  it("fills defaults and normalises the folder", async () => {
    const { resolveWordlistSettings, defaultTagColor } = await import("../../../src/core/model/wordlists");
    expect(resolveWordlistSettings(undefined)).toEqual({
      folder: "vocab-wordlists",
      highlight: true,
      inflections: true,
      autoImport: true,
      tags: {},
    });
    expect(resolveWordlistSettings({ folder: "/lists/exams/" }).folder).toBe("lists/exams");
    expect(resolveWordlistSettings({ folder: "  " }).folder).toBe("vocab-wordlists");
    expect(defaultTagColor("exam/TOEFL")).toBe("#3b82f6");
    expect(defaultTagColor("custom/醫學")).toBe(defaultTagColor("custom/醫學"));
  });
});

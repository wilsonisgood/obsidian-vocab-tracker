import { describe, expect, it } from "vitest";
import { defaultAiSettings, withSettingsDefaults, type PluginSettings } from "../../../src/core/model/settings";
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

  it("takes the more recently updated settings object", () => {
    const local = { schemaVersion: 2 as const, updatedAt: "2026-10-01T00:00:00.000Z", learner: { level: "A1" } } as PluginSettings;
    const remote = { schemaVersion: 2 as const, updatedAt: "2026-10-02T00:00:00.000Z", learner: { level: "C1" } } as PluginSettings;
    expect(merge(data(local), data(remote)).settings).toBe(remote);
    expect(merge(data(remote), data(local)).settings).toBe(remote);
  });

  it("keeps local settings when neither side is stamped", () => {
    const local: PluginSettings = { schemaVersion: 2 };
    expect(merge(data(local), data({ schemaVersion: 2 })).settings).toBe(local);
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

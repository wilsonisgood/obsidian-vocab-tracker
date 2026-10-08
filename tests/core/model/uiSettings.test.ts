import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_PREFS,
  resolveUiPrefs,
  withSettingsDefaults,
  type PluginSettings,
  type UiSettings,
} from "../../../src/core/model/settings";
import { merge } from "../../../src/core/store/merge";
import { VocabStore } from "../../../src/core/store/VocabStore";

// M8 tap-action settings live in the ui section (規劃書 01 §3.2), merged
// with the rest of it by the section's updatedAt (任務 E).

const T1 = "2026-10-01T00:00:00.000Z";
const T2 = "2026-10-02T00:00:00.000Z";
const T3 = "2026-10-03T00:00:00.000Z";

const data = (settings: PluginSettings) => ({ schemaVersion: 2 as const, settings, entries: [] });

describe("resolveUiPrefs", () => {
  it("defaults: menu on desktop, save at once on mobile, Live Preview hint on, automatic pronunciation", () => {
    expect(DEFAULT_UI_PREFS).toEqual({
      tapAction: "menu",
      tapActionMobile: "save",
      livePreviewHint: true,
      pronounceSource: "auto",
      sidebarOnPhone: false,
    });
    expect(resolveUiPrefs(undefined)).toEqual(DEFAULT_UI_PREFS);
  });

  it("fills the defaults for pre-M8 data (ui has only the locale)", () => {
    expect(resolveUiPrefs({ locale: "zh-TW" })).toEqual(DEFAULT_UI_PREFS);
  });

  it("keeps stored values", () => {
    expect(
      resolveUiPrefs({ locale: "auto", tapAction: "open", tapActionMobile: "menu", livePreviewHint: false, pronounceSource: "synth" })
    ).toEqual({
      tapAction: "open",
      tapActionMobile: "menu",
      livePreviewHint: false,
      pronounceSource: "synth",
      sidebarOnPhone: false,
    });
    expect(resolveUiPrefs({ locale: "auto", pronounceSource: "recording" }).pronounceSource).toBe("recording");
    expect(resolveUiPrefs({ locale: "auto", sidebarOnPhone: true }).sidebarOnPhone).toBe(true);
  });

  it("reads values it doesn't know (a newer version's) as the default", () => {
    const ui = {
      locale: "auto",
      tapAction: "long-press",
      tapActionMobile: 3,
      livePreviewHint: "no",
      pronounceSource: "neural",
    } as unknown as UiSettings;
    expect(resolveUiPrefs(ui)).toEqual(DEFAULT_UI_PREFS);
  });
});

describe("withSettingsDefaults and the ui section", () => {
  it("doesn't write the M8 defaults into old data, so it doesn't look edited", () => {
    const s = withSettingsDefaults({ schemaVersion: 2, ui: { locale: "en", updatedAt: T1 } });
    expect(s.ui).toEqual({ locale: "en", updatedAt: T1 });
    expect(resolveUiPrefs(s.ui).tapActionMobile).toBe("save");
  });

  it("keeps a value it doesn't know on disk", () => {
    const raw = { schemaVersion: 2, ui: { locale: "en", tapAction: "long-press" } } as unknown as PluginSettings;
    expect((withSettingsDefaults(raw).ui as unknown as { tapAction: string }).tapAction).toBe("long-press");
  });
});

describe("VocabStore.updateSettings stamps the ui section", () => {
  it("changing the mobile tap action stamps ui only", async () => {
    const store = new VocabStore({ schemaVersion: 2, entries: [], settings: { schemaVersion: 2, learner: { level: "B1", updatedAt: T1 } as PluginSettings["learner"] } }, async () => {});
    await store.updateSettings((s) => {
      s.ui.tapActionMobile = "open";
    });
    const s = store.settings;
    expect(s.ui.tapActionMobile).toBe("open");
    expect(s.ui.updatedAt).toBeDefined();
    expect(s.ui.updatedAt).toBe(s.updatedAt);
    expect(s.learner.updatedAt).toBe(T1);
  });

  it("setting a value equal to nothing-changed doesn't stamp", async () => {
    const store = new VocabStore({ schemaVersion: 2, entries: [], settings: { schemaVersion: 2, ui: { locale: "en", tapAction: "save", updatedAt: T1 } } }, async () => {});
    await store.updateSettings((s) => {
      s.ui.tapAction = "save";
    });
    expect(store.settings.ui.updatedAt).toBe(T1);
  });
});

describe("merge() and the tap actions", () => {
  const both = (a: PluginSettings, b: PluginSettings) => [merge(data(a), data(b)).settings, merge(data(b), data(a)).settings];

  it("the newer ui section wins as a whole, tap actions included", () => {
    const phone: PluginSettings = { schemaVersion: 2, updatedAt: T2, ui: { locale: "auto", tapActionMobile: "open", updatedAt: T2 } };
    const mac: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "auto", tapAction: "save", updatedAt: T1 } };
    for (const s of both(phone, mac)) {
      expect(s?.ui).toEqual(phone.ui);
      expect(resolveUiPrefs(s?.ui).tapAction).toBe("menu");
    }
  });

  it("an iPhone tap-action edit survives a Mac edit to another section", () => {
    const phone: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T3,
      ui: { locale: "auto", tapActionMobile: "menu", updatedAt: T3 },
      srs: { dailyNew: 10, updatedAt: T1 },
    };
    const mac: PluginSettings = {
      schemaVersion: 2,
      updatedAt: T2,
      ui: { locale: "auto", updatedAt: T1 },
      srs: { dailyNew: 30, updatedAt: T2 },
    };
    for (const s of both(phone, mac)) {
      expect(resolveUiPrefs(s?.ui).tapActionMobile).toBe("menu");
      expect(s?.srs?.dailyNew).toBe(30);
    }
  });

  it("a pre-M8 device's newer locale edit drops the tap actions (whole-section rule) — they fall back to defaults", () => {
    const newer: PluginSettings = { schemaVersion: 2, updatedAt: T1, ui: { locale: "auto", tapActionMobile: "open", updatedAt: T1 } };
    const old: PluginSettings = { schemaVersion: 2, updatedAt: T2, ui: { locale: "en", updatedAt: T2 } };
    for (const s of both(newer, old)) {
      expect(s?.ui?.locale).toBe("en");
      expect(resolveUiPrefs(s?.ui).tapActionMobile).toBe("save");
    }
  });
});

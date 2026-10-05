import { Setting } from "obsidian";
import { resolveUiPrefs, TAP_ACTIONS, type TapAction, type UiPrefs } from "../../../core/model/settings";
import { t, type I18nKey } from "../../../core/i18n";
import type { SettingsContext, SettingsSection } from "../SettingsTab";

// 「點字動作」 (規劃書 01 §3.2): what tapping a word in reading view does —
// desktop and mobile set separately (mobile defaults to saving at once).
// Stored in the ui section, so it syncs and merges like the locale.

function tapOptions(): Record<TapAction, string> {
  const out = {} as Record<TapAction, string>;
  for (const a of TAP_ACTIONS) out[a] = t(`settings.reading.tap.${a}` as I18nKey);
  return out;
}

async function setPref<K extends keyof UiPrefs>(ctx: SettingsContext, key: K, value: UiPrefs[K]): Promise<void> {
  await ctx.store.updateSettings((s) => {
    const patch: Partial<UiPrefs> = { [key]: value };
    Object.assign(s.ui, patch);
  });
}

export const readingSection: SettingsSection = {
  id: "reading",
  title: "settings.section.reading",
  render(el, ctx) {
    const prefs = resolveUiPrefs(ctx.store.settings.ui);
    new Setting(el)
      .setName(t("settings.reading.tapAction.name"))
      .setDesc(t("settings.reading.tapAction.desc"))
      .addDropdown((d) =>
        d
          .addOptions(tapOptions())
          .setValue(prefs.tapAction)
          .onChange((v) => setPref(ctx, "tapAction", v as TapAction))
      );
    new Setting(el)
      .setName(t("settings.reading.tapActionMobile.name"))
      .setDesc(t("settings.reading.tapActionMobile.desc"))
      .addDropdown((d) =>
        d
          .addOptions(tapOptions())
          .setValue(prefs.tapActionMobile)
          .onChange((v) => setPref(ctx, "tapActionMobile", v as TapAction))
      );
    new Setting(el)
      .setName(t("settings.reading.livePreviewHint.name"))
      .setDesc(t("settings.reading.livePreviewHint.desc"))
      .addToggle((tg) => tg.setValue(prefs.livePreviewHint).onChange((on) => setPref(ctx, "livePreviewHint", on)));
  },
};

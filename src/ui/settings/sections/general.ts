import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import type { UiLocaleSetting } from "../../../core/model/settings";
import type { SettingsSection } from "../SettingsTab";

export const generalSection: SettingsSection = {
  id: "general",
  title: "settings.section.general",
  render(el, ctx) {
    new Setting(el)
      .setName(t("settings.general.locale.name"))
      .setDesc(t("settings.general.locale.desc"))
      .addDropdown((d) =>
        d
          .addOptions({ auto: t("settings.general.locale.auto"), "zh-TW": "繁體中文", en: "English" })
          .setValue(ctx.store.settings.ui.locale)
          .onChange(async (v) => {
            await ctx.store.updateSettings((s) => {
              s.ui.locale = v as UiLocaleSetting;
            });
            ctx.applyLocale();
            ctx.redisplay();
          })
      );
  },
};

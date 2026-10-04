import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import { resolveSrsSettings, type SrsSettings } from "../../../core/model/srs";
import { parseNonNegativeInt, type SettingsSection } from "../SettingsTab";

// Flashcard scheduling (規劃書 06 §7.1). SrsService reads these live via
// resolveSrsSettings(), so a change applies to the next queue/rating
// without reloading the plugin.
export const srsSection: SettingsSection = {
  id: "srs",
  title: "settings.section.srs",
  render(el, ctx) {
    const current = () => resolveSrsSettings(ctx.store.settings.srs);
    const update = (patch: Partial<SrsSettings>) =>
      ctx.store.updateSettings((s) => (s.srs = { ...current(), ...patch }));

    new Setting(el)
      .setName(t("settings.srs.retention.name"))
      .setDesc(t("settings.srs.retention.desc"))
      .addSlider((s) =>
        s
          .setLimits(0.7, 0.99, 0.01)
          .setValue(current().retention)
          .setDynamicTooltip()
          .onChange((v) => void update({ retention: v }))
      );

    new Setting(el)
      .setName(t("settings.srs.dailyNew.name"))
      .setDesc(t("settings.srs.dailyNew.desc"))
      .addText((text) => {
        text.inputEl.inputMode = "numeric";
        text.setValue(String(current().dailyNew)).onChange((v) => {
          const n = parseNonNegativeInt(v);
          if (n !== null) void update({ dailyNew: n });
        });
      });
  },
};

import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import { resolveDiarySettings, type DiarySettings } from "../../../core/model/settings";
import { parseNonNegativeInt, type SettingsSection } from "../SettingsTab";

// 每日日記 (第十九波 D2b, 1016 A11): on/off and how often a quote / place
// replaces the ordinary diary.
export const diarySection: SettingsSection = {
  id: "diary",
  title: "settings.section.diary",
  render(el, ctx) {
    const current = () => resolveDiarySettings(ctx.store.settings.diary);
    const update = (patch: Partial<DiarySettings>) =>
      ctx.store.updateSettings((s) => {
        s.diary = { ...(s.diary ?? {}), ...resolveDiarySettings(s.diary), ...patch };
      });

    new Setting(el)
      .setName(t("settings.diary.enabled.name"))
      .setDesc(t("settings.diary.enabled.desc"))
      .addToggle((tg) => tg.setValue(current().enabled).onChange((v) => void update({ enabled: v })));
    new Setting(el)
      .setName(t("settings.diary.specialEvery.name"))
      .setDesc(t("settings.diary.specialEvery.desc"))
      .addText((text) => {
        text.setValue(String(current().specialEvery));
        text.inputEl.addEventListener("change", async () => {
          const n = parseNonNegativeInt(text.getValue());
          if (n !== null) await update({ specialEvery: n });
          text.setValue(String(current().specialEvery));
        });
      });
  },
};

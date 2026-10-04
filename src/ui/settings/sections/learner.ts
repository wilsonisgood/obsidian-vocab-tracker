import { Setting } from "obsidian";
import { t, type I18nKey } from "../../../core/i18n";
import {
  ANSWER_LANGUAGES,
  CEFR_LEVELS,
  LEARNER_GOALS,
  type AnswerLanguage,
  type CefrLevel,
  type LearnerGoal,
  type LearnerProfile,
} from "../../../core/model/settings";
import { renderProfile } from "../../../services/ai/context/profile";
import { parseNonNegativeInt, type SettingsSection } from "../SettingsTab";

// Learner profile → the 〔學習者設定〕 block appended to every AI request
// (services/ai/context/profile.ts). The preview shows that exact block, so
// what the user edits is what the model reads.
export const learnerSection: SettingsSection = {
  id: "learner",
  title: "settings.section.learner",
  render(el, ctx) {
    const profile = () => ctx.store.settings.learner;
    el.createDiv({ cls: "setting-item-description vt-settings-intro", text: t("settings.learner.desc") });

    // Created detached up front so every onChange below can refresh it; it's
    // appended under its heading at the end.
    const preview = createEl("pre", { cls: "vt-settings-preview", text: renderProfile(profile()) });
    const update = async (mutate: (p: LearnerProfile) => void) => {
      await ctx.store.updateSettings((s) => mutate(s.learner));
      preview.setText(renderProfile(profile()));
    };

    new Setting(el).setName(t("settings.learner.level.name")).addDropdown((d) => {
      d.addOption("", t("settings.learner.level.none"));
      for (const lv of CEFR_LEVELS) d.addOption(lv, lv);
      d.setValue(profile().level).onChange((v) => void update((p) => (p.level = v as CefrLevel | "")));
    });

    new Setting(el).setName(t("settings.learner.goal.name")).addDropdown((d) => {
      for (const g of LEARNER_GOALS) d.addOption(g, t(`settings.learner.goal.${g}` as I18nKey));
      d.setValue(profile().goal).onChange((v) => void update((p) => (p.goal = v as LearnerGoal)));
    });

    new Setting(el).setName(t("settings.learner.language.name")).addDropdown((d) => {
      for (const l of ANSWER_LANGUAGES) d.addOption(l, t(`settings.learner.language.${l}` as I18nKey));
      d.setValue(profile().answerLanguage).onChange((v) => void update((p) => (p.answerLanguage = v as AnswerLanguage)));
    });

    new Setting(el)
      .setName(t("settings.learner.maxChars.name"))
      .setDesc(t("settings.learner.maxChars.desc"))
      .addText((text) => {
        text.inputEl.inputMode = "numeric";
        text.setValue(String(profile().maxAnswerChars)).onChange((v) => {
          const n = parseNonNegativeInt(v);
          if (n !== null) void update((p) => (p.maxAnswerChars = n));
        });
      });

    new Setting(el)
      .setName(t("settings.learner.extra.name"))
      .setDesc(t("settings.learner.extra.desc"))
      .addTextArea((ta) => {
        ta.inputEl.rows = 3;
        ta.inputEl.addClass("vt-settings-wide");
        ta.setValue(profile().extra).onChange((v) => void update((p) => (p.extra = v)));
      });

    const previewSetting = new Setting(el).setName(t("settings.learner.preview.name"));
    previewSetting.settingEl.addClass("vt-settings-preview-row");
    el.appendChild(preview);
  },
};

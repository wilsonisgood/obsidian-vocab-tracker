import { Setting } from "obsidian";
import { t, type I18nKey } from "../../../core/i18n";
import {
  CEFR_LEVELS,
  ENGLISH_STEPS,
  englishStepOf,
  LANGUAGE_MODES,
  languageModeOf,
  LEARNER_GOALS,
  type CefrLevel,
  type LanguageMode,
  type LearnerGoal,
  type LearnerProfile,
  resolveGrammarSettings,
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

    // 1101 互動語言: follow the level, or pick a step on the slider.
    const stepName = (i: number) => t(`settings.learner.english.${ENGLISH_STEPS[i]}` as I18nKey);
    let slider: Setting | null = null;
    const showSlider = (): void => {
      slider?.settingEl.toggle(languageModeOf(profile()) === "manual");
    };
    new Setting(el)
      .setName(t("settings.learner.language.name"))
      .setDesc(t("settings.learner.language.desc"))
      .addDropdown((d) => {
        for (const m of LANGUAGE_MODES) d.addOption(m, t(`settings.learner.language.mode.${m}` as I18nKey));
        d.setValue(languageModeOf(profile())).onChange(
          (v) =>
            void update((p) => {
              p.languageMode = v as LanguageMode;
              p.englishStep = englishStepOf(p);
            }).then(showSlider)
        );
      });
    slider = new Setting(el).setName(t("settings.learner.english.name"));
    // Returns nothing on purpose: it runs as a promise's .then callback, and
    // Obsidian's Setting has its own then() — returning the Setting made the
    // promise unwrap it forever and froze the app (1101).
    const sliderDesc = (): void => {
      slider?.setDesc(`${t("settings.learner.english.scale")} → ${stepName(ENGLISH_STEPS.indexOf(englishStepOf(profile())))}`);
    };
    slider.addSlider((s) =>
      s
        .setLimits(0, ENGLISH_STEPS.length - 1, 1)
        .setValue(ENGLISH_STEPS.indexOf(englishStepOf(profile())))
        .setDynamicTooltip()
        .onChange((v) => void update((p) => (p.englishStep = ENGLISH_STEPS[v] ?? "zh")).then(sliderDesc))
    );
    sliderDesc();
    showSlider();

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

    // 文法出題 (Wave 15): whether recent words go into the grammar-question request.
    new Setting(el)
      .setName(t("settings.grammar.useMyWords.name"))
      .setDesc(t("settings.grammar.useMyWords.desc"))
      .addToggle((tg) =>
        tg.setValue(resolveGrammarSettings(ctx.store.settings.grammar).useMyWords).onChange(
          (v) =>
            void ctx.store.updateSettings((s) => {
              s.grammar = { ...(s.grammar ?? {}), ...resolveGrammarSettings(s.grammar), useMyWords: v };
            })
        )
      );
    // R2: whether sentences from the learner's reading go into the request.
    new Setting(el)
      .setName(t("settings.grammar.useMySentences.name"))
      .setDesc(t("settings.grammar.useMySentences.desc"))
      .addToggle((tg) =>
        tg.setValue(resolveGrammarSettings(ctx.store.settings.grammar).useMySentences).onChange(
          (v) =>
            void ctx.store.updateSettings((s) => {
              s.grammar = { ...(s.grammar ?? {}), ...resolveGrammarSettings(s.grammar), useMySentences: v };
            })
        )
      );

    const previewSetting = new Setting(el).setName(t("settings.learner.preview.name"));
    previewSetting.settingEl.addClass("vt-settings-preview-row");
    el.appendChild(preview);
  },
};

import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import {
  resolveWordlistSettings,
  tagColor,
  tagEnabled,
  type WordlistSettings,
  type WordlistTagSettings,
} from "../../../core/model/wordlists";
import { tagLabel } from "../../../core/wordlists/parse";
import type { SettingsSection } from "../SettingsTab";

// Exam word lists (規劃書 03 §3.2): where the lists live, whether to
// underline matches in reading view, and each list's colour / on-off.
export const wordlistsSection: SettingsSection = {
  id: "wordlists",
  title: "settings.section.wordlists",
  render(el, ctx) {
    const current = () => resolveWordlistSettings(ctx.store.settings.wordlists);
    const update = async (patch: Partial<WordlistSettings>, change: "display" | "scan" | "reload") => {
      await ctx.store.updateSettings((s) => (s.wordlists = { ...current(), ...patch }));
      ctx.onWordlistsChanged(change);
    };
    const updateTag = (tag: string, patch: WordlistTagSettings) => {
      const tags = current().tags;
      return update({ tags: { ...tags, [tag]: { ...tags[tag], ...patch } } }, "display");
    };

    el.createDiv({ cls: "setting-item-description", text: t("settings.wordlists.desc") });

    new Setting(el)
      .setName(t("settings.wordlists.folder.name"))
      .setDesc(t("settings.wordlists.folder.desc"))
      .addText((text) => {
        text.setValue(current().folder);
        // Reload on blur, not per keystroke — each reload re-reads every list.
        text.inputEl.addEventListener("change", () => void update({ folder: text.getValue() }, "reload"));
      });

    new Setting(el)
      .setName(t("settings.wordlists.highlight.name"))
      .setDesc(t("settings.wordlists.highlight.desc"))
      .addToggle((tg) => tg.setValue(current().highlight).onChange((v) => void update({ highlight: v }, "display")));

    new Setting(el)
      .setName(t("settings.wordlists.inflections.name"))
      .setDesc(t("settings.wordlists.inflections.desc"))
      .addToggle((tg) =>
        tg.setValue(current().inflections).onChange((v) => void update({ inflections: v }, "scan"))
      );

    new Setting(el)
      .setName(t("settings.wordlists.autoImport.name"))
      .setDesc(t("settings.wordlists.autoImport.desc"))
      .addToggle((tg) =>
        tg.setValue(current().autoImport).onChange((v) => void update({ autoImport: v }, "display"))
      );

    const lists = ctx.wordlists.index.lists;
    new Setting(el)
      .setName(t("settings.wordlists.loaded.name"))
      .setDesc(
        lists.length === 0
          ? t("settings.wordlists.loaded.none", { folder: current().folder })
          : t("settings.wordlists.loaded.some", { n: lists.length })
      )
      .addButton((b) =>
        b.setButtonText(t("settings.wordlists.reload")).onClick(async () => {
          await ctx.wordlists.reload();
          ctx.redisplay();
        })
      );

    const s = current();
    for (const list of lists) {
      const row = new Setting(el)
        .setName(tagLabel(list.tag))
        .setDesc(t("settings.wordlists.list.desc", { n: list.words.toLocaleString(), paths: list.paths.join(", ") }))
        .addColorPicker((c) => c.setValue(tagColor(s, list.tag)).onChange((v) => void updateTag(list.tag, { color: v })))
        .addToggle((tg) => tg.setValue(tagEnabled(s, list.tag)).onChange((v) => void updateTag(list.tag, { enabled: v })));
      row.settingEl.addClass("vt-wordlist-row");
    }
  },
};

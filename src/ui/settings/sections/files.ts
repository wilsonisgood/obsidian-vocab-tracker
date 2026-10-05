import { Setting } from "obsidian";
import { t, type I18nKey } from "../../../core/i18n";
import { resolveFilesSettings, type FilesSettings } from "../../../services/files/settings";
import type { SettingsSection } from "../SettingsTab";

type FolderKey = "folder" | "wordsFolder" | "threadsFolder";

const FIELDS: { key: FolderKey; name: I18nKey; desc: I18nKey }[] = [
  { key: "folder", name: "settings.files.folder.name", desc: "settings.files.folder.desc" },
  { key: "wordsFolder", name: "settings.files.wordsFolder.name", desc: "settings.files.wordsFolder.desc" },
  { key: "threadsFolder", name: "settings.files.threadsFolder.name", desc: "settings.files.threadsFolder.desc" },
];

// Where the plugin's notes go (規劃書 06 §8.3): the entry files' folder and
// the word page / discussion folders inside it. Existing files aren't
// moved — they're found by their frontmatter id wherever they are.
export const filesSection: SettingsSection = {
  id: "files",
  title: "settings.section.files",
  render(el, ctx) {
    const current = () => resolveFilesSettings(ctx.store.settings.files);
    const update = (patch: Partial<FilesSettings>) =>
      ctx.store.updateSettings((s) => (s.files = { ...current(), ...patch }));

    el.createDiv({ cls: "setting-item-description", text: t("settings.files.desc") });

    for (const field of FIELDS) {
      new Setting(el)
        .setName(t(field.name))
        .setDesc(t(field.desc))
        .addText((text) => {
          text.setValue(current()[field.key]);
          // Saved on blur, not per keystroke; the box then shows the cleaned
          // path (slashes trimmed, empty → the default).
          text.inputEl.addEventListener("change", async () => {
            await update({ [field.key]: text.getValue() });
            text.setValue(current()[field.key]);
          });
        });
    }
  },
};

import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import { patchAnchorSettings, resolveAnchorSettings } from "../../sidebar/anchorSettings";
import type { SettingsSection } from "../SettingsTab";

// Paragraph discussions (規劃書 06 §5.1): block ids or hash matching.
// Switching either way never touches notes already anchored.
export const paragraphsSection: SettingsSection = {
  id: "paragraphs",
  title: "settings.section.paragraphs",
  render(el, ctx) {
    new Setting(el)
      .setName(t("settings.paragraphs.hashMode.name"))
      .setDesc(t("settings.paragraphs.hashMode.desc"))
      .addToggle((tg) =>
        tg
          .setValue(resolveAnchorSettings(ctx.store.settings).mode === "hash")
          .onChange((on) =>
            ctx.store.updateSettings((s) => patchAnchorSettings(s, { mode: on ? "hash" : "block", blockIdNoticeSeen: true }))
          )
      );
  },
};

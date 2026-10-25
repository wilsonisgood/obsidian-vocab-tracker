import { Setting } from "obsidian";
import { t } from "../../../core/i18n";
import { resolveReportSettings, type ReportSettings } from "../../../core/model/settings";
import type { SettingsSection } from "../SettingsTab";

// 每週學習報告 (第二十波): on/off for the automatic weekly report.
export const reportSection: SettingsSection = {
  id: "report",
  title: "settings.section.report",
  render(el, ctx) {
    const current = () => resolveReportSettings(ctx.store.settings.report);
    const update = (patch: Partial<ReportSettings>) =>
      ctx.store.updateSettings((s) => {
        s.report = { ...(s.report ?? {}), ...resolveReportSettings(s.report), ...patch };
      });
    new Setting(el)
      .setName(t("settings.report.enabled.name"))
      .setDesc(t("settings.report.enabled.desc"))
      .addToggle((tg) => tg.setValue(current().enabled).onChange((v) => void update({ enabled: v })));
  },
};

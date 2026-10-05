import { Notice, Setting } from "obsidian";
import { t } from "../../../core/i18n";
import { errorMessage } from "../../../core/errorMessage";
import type { BackupService } from "../../../services/backup/BackupService";
import type { SettingsContext, SettingsSection } from "../SettingsTab";
import { backupDesc, backupTitle } from "../backupText";
import { RestoreModal } from "../RestoreModal";

// Where the last restore (this session) saved the data it replaced, so the
// path stays on screen after the notice fades.
let lastSafetyPath: string | null = null;

// 備份與還原 (規劃書 06 §4.5 第 6 點): back up now, and the backup list
// with a restore button each. The list is read when the tab opens.
export const backupSection: SettingsSection = {
  id: "backup",
  title: "settings.section.backup",
  render(el, ctx) {
    const backups = ctx.backups;
    if (!backups) return;

    el.createDiv({ cls: "setting-item-description", text: t("settings.backup.desc", { folder: backups.folder }) });
    if (lastSafetyPath) {
      el.createDiv({ cls: "setting-item-description vt-backup-last", text: t("settings.backup.lastRestore", { path: lastSafetyPath }) });
    }

    const listEl = createDiv();
    const fill = () => void renderList(listEl, backups, ctx);

    new Setting(el)
      .setName(t("settings.backup.create.name"))
      .setDesc(t("settings.backup.create.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.backup.create.button")).onClick(async () => {
          b.setDisabled(true);
          try {
            const path = await backups.create();
            new Notice(t("settings.backup.created", { path }), 8000);
            fill();
          } catch (e) {
            new Notice(t("settings.backup.failed", { error: errorMessage(e) }), 8000);
          } finally {
            b.setDisabled(false);
          }
        })
      );

    new Setting(el)
      .setName(t("settings.backup.list.name"))
      .addExtraButton((b) => b.setIcon("refresh-cw").setTooltip(t("settings.backup.list.reload")).onClick(fill));
    el.appendChild(listEl);
    fill();
  },
};

async function renderList(listEl: HTMLElement, backups: BackupService, ctx: SettingsContext): Promise<void> {
  listEl.empty();
  listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.list.loading") });
  let items;
  try {
    items = await backups.list();
  } catch (e) {
    listEl.empty();
    listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.failed", { error: errorMessage(e) }) });
    return;
  }
  listEl.empty();
  if (!items.length) {
    listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.list.empty") });
    return;
  }
  for (const item of items) {
    const row = new Setting(listEl).setName(backupTitle(item)).setDesc(backupDesc(item));
    if (item.kind === "unreadable") continue;
    row.addButton((b) =>
      b.setButtonText(t("settings.backup.restore.button")).onClick(() =>
        new RestoreModal(ctx.app, backups, item, (result) => {
          lastSafetyPath = result.safetyPath;
          ctx.redisplay();
        }).open()
      )
    );
  }
}

import { Modal, Notice, Setting, type App } from "obsidian";
import { t } from "../../core/i18n";
import { errorMessage } from "../../core/errorMessage";
import { BackupError, type BackupItem, type BackupService, type RestoreResult } from "../../services/backup/BackupService";
import { backupTime, deviceLines, previewText, summaryText } from "./backupText";

// The confirmation for 從備份還原: what will change (compared with the
// current data), what is saved first and where, what other devices will
// see — then the restore itself.
export class RestoreModal extends Modal {
  private removeExtras = false;
  private running = false;

  constructor(
    app: App,
    private backups: BackupService,
    private item: BackupItem,
    private onDone: (result: RestoreResult) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("backup.restore.title"));
    this.contentEl.addClass("vt-restore");
    this.contentEl.createEl("p", { text: t("backup.restore.loading"), cls: "vt-settings-muted" });
    void this.load();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
    try {
      const preview = await this.backups.preview(this.item.name);
      this.render(previewText(preview), preview.safetyFolder, preview.item);
    } catch (e) {
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: t("backup.restore.failed", { error: errorMessage(e) }) });
    }
  }

  private render(text: ReturnType<typeof previewText>, folder: string, item: BackupItem): void {
    const el = this.contentEl;
    el.empty();
    const summary = item.summary ? summaryText(item.summary) : "";
    el.createEl("p", { text: t("backup.restore.from", { time: backupTime(item.createdAt), summary }) });

    el.createEl("h4", { text: t("backup.restore.what") });
    const what = el.createEl("ul");
    for (const line of text.what) what.createEl("li", { text: line });

    if (text.extras) {
      el.createEl("h4", { text: t("backup.restore.extras.title") });
      el.createEl("p", { text: text.extras });
      const remove = new Setting(el).setName(t("backup.restore.extras.remove")).addToggle((toggle) =>
        toggle.setValue(this.removeExtras).onChange((v) => (this.removeExtras = v))
      );
      // Undoing a restore: what it brought back counts as "added after"
      // the before-restore backup, so only the toggle gets back exactly.
      if (item.reason === "before-restore") remove.setDesc(t("backup.restore.extras.undoHint"));
    }

    el.createEl("p", { text: t("backup.restore.safety", { folder }) });

    el.createEl("h4", { text: t("backup.restore.devices.title") });
    const devices = el.createEl("ul");
    for (const line of deviceLines()) devices.createEl("li", { text: line });

    new Setting(el)
      .addButton((b) => b.setButtonText(t("backup.restore.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("backup.restore.confirm"))
          .setWarning()
          .onClick(async () => {
            if (this.running) return;
            this.running = true;
            b.setDisabled(true).setButtonText(t("backup.restore.working"));
            await this.restore();
          })
      );
  }

  private async restore(): Promise<void> {
    try {
      const result = await this.backups.restore(this.item.name, { removeExtras: this.removeExtras });
      new Notice(t("backup.restore.done", { path: result.safetyPath }), 10000);
      this.onDone(result);
    } catch (e) {
      const key = e instanceof BackupError && e.code === "safety-failed" ? "backup.restore.safetyFailed" : "backup.restore.failed";
      new Notice(t(key, { error: errorMessage(e) }), 10000);
      console.error("Vocab Tracker: restore failed", e);
    } finally {
      this.close();
    }
  }
}

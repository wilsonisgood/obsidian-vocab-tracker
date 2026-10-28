import { Modal, type App } from "obsidian";
import { t } from "../../core/i18n";

// 第 9 則問題送出後的小提示（一天一次）：再一則就滿十則，對話會自動存檔。
export class BuddyNearFullModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("buddy.nearFull.title"));
    this.contentEl.createEl("p", { text: t("buddy.nearFull.body") });
    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = row.createEl("button", { cls: "mod-cta", text: t("buddy.nearFull.ok") });
    ok.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

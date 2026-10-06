import { Modal, Setting, type App } from "obsidian";
import { t } from "../../core/i18n";
import type { DeletionImpact } from "../../services/learn/linkage";
import { deletionImpactLines } from "./deleteEntryImpact";

// The confirm dialog every delete entry point goes through (row ✕, the
// iPhone sheet's 🗑, …): what this word is linked to and how many, so a
// delete doesn't quietly take a family membership or a saved trivia
// back-link with it. Resolves via `onResult` — the chosen options when the
// learner confirms, or null on cancel/✕ — never both.

export interface DeleteEntryResult {
  // 「同時刪除單字頁」 — unticked by default: the file stays, showing the
  // word is no longer in the vocab list (wordHeader.ts's existing
  // "missing" state), so it can still be read or reused later.
  trashWordPage: boolean;
}

export class DeleteEntryModal extends Modal {
  private trashWordPage = false;
  private confirmed = false;

  constructor(
    app: App,
    private word: string,
    private impact: DeletionImpact,
    private onResult: (result: DeleteEntryResult | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("deleteEntry.title", { word: this.word }));
    this.contentEl.addClass("vt-delete-entry");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.confirmed) this.onResult(null);
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    const lines = deletionImpactLines(this.impact);
    if (lines.length) {
      const ul = el.createEl("ul", { cls: "vt-delete-entry-impact" });
      for (const line of lines) ul.createEl("li", { text: line });
    } else {
      el.createEl("p", { text: t("deleteEntry.noLinks"), cls: "vt-settings-muted" });
    }

    if (this.impact.wordPageExists) {
      new Setting(el).setName(t("deleteEntry.trashWordPage")).addToggle((toggle) =>
        toggle.setValue(this.trashWordPage).onChange((v) => (this.trashWordPage = v))
      );
    }

    new Setting(el)
      .addButton((b) => b.setButtonText(t("deleteEntry.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("deleteEntry.confirm"))
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.onResult({ trashWordPage: this.trashWordPage });
            this.close();
          })
      );
  }
}

import { Modal, Setting, type App } from "obsidian";
import { t } from "../../core/i18n";
import type { Morpheme } from "../../core/model/morpheme";
import { formatTimeline, parseTimeline } from "./dnaModel";

// Hand-edit a morpheme's meaning/origin/timeline/fact (規劃書 09 §7).
// Saving always marks it 已確認 — dna.ts's caller does that
// (MorphemeApi.setVerified(id, true)) right after onSave runs.

export interface MorphemeEditPatch {
  meaningZh: string;
  origin: string;
  timeline: { stage: string; form: string }[];
  fact?: { title: string; body: string };
}

export class MorphemeEditModal extends Modal {
  private meaningZh: string;
  private origin: string;
  private timelineText: string;
  private factTitle: string;
  private factBody: string;

  constructor(
    app: App,
    private morpheme: Morpheme,
    private onSave: (patch: MorphemeEditPatch) => void
  ) {
    super(app);
    this.meaningZh = morpheme.meaningZh;
    this.origin = morpheme.origin;
    this.timelineText = formatTimeline(morpheme.timeline);
    this.factTitle = morpheme.fact?.title ?? "";
    this.factBody = morpheme.fact?.body ?? "";
  }

  onOpen(): void {
    this.titleEl.setText(t("dna.edit.title", { form: this.morpheme.form }));
    this.contentEl.addClass("vt-dna-edit");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    new Setting(el).setName(t("dna.edit.meaning")).addText((text) => text.setValue(this.meaningZh).onChange((v) => (this.meaningZh = v)));
    new Setting(el).setName(t("dna.edit.origin")).addText((text) => text.setValue(this.origin).onChange((v) => (this.origin = v)));
    new Setting(el)
      .setName(t("dna.edit.timeline"))
      .setDesc(t("dna.edit.timelineDesc"))
      .addTextArea((ta) => {
        ta.setValue(this.timelineText).onChange((v) => (this.timelineText = v));
        ta.inputEl.rows = 4;
      });
    new Setting(el).setName(t("dna.edit.factTitle")).addText((text) => text.setValue(this.factTitle).onChange((v) => (this.factTitle = v)));
    new Setting(el)
      .setName(t("dna.edit.factBody"))
      .addTextArea((ta) => ta.setValue(this.factBody).onChange((v) => (this.factBody = v)));

    new Setting(el)
      .addButton((b) => b.setButtonText(t("dna.edit.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("dna.edit.save"))
          .setCta()
          .onClick(() => {
            const title = this.factTitle.trim();
            const body = this.factBody.trim();
            this.onSave({
              meaningZh: this.meaningZh.trim(),
              origin: this.origin.trim(),
              timeline: parseTimeline(this.timelineText),
              fact: title || body ? { title, body } : undefined,
            });
            this.close();
          })
      );
  }
}

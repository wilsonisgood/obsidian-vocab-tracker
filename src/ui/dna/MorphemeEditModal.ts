import { Modal, Setting, type App } from "obsidian";
import type { Morpheme } from "../../core/model/morpheme";
import { formatTimeline, parseTimeline } from "./dnaModel";

// Hand-edit a morpheme's meaning/origin/timeline/fact (規劃書 09 §7).
// Saving always marks it 已確認 — dna.ts's caller does that
// (MorphemeApi.setVerified(id, true)) right after onSave runs.

const L = {
  title: (form: string) => `編輯「${form}」`,
  meaning: "意思",
  origin: "來源",
  timeline: "演變路線",
  timelineDesc: "一行一個階段，格式「階段：形式」，例如「拉丁語：ex（出、離開）」",
  factTitle: "冷知識標題",
  factBody: "冷知識內容",
  cancel: "取消",
  save: "儲存",
};

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
    this.titleEl.setText(L.title(this.morpheme.form));
    this.contentEl.addClass("vt-dna-edit");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();

    new Setting(el).setName(L.meaning).addText((text) => text.setValue(this.meaningZh).onChange((v) => (this.meaningZh = v)));
    new Setting(el).setName(L.origin).addText((text) => text.setValue(this.origin).onChange((v) => (this.origin = v)));
    new Setting(el)
      .setName(L.timeline)
      .setDesc(L.timelineDesc)
      .addTextArea((ta) => {
        ta.setValue(this.timelineText).onChange((v) => (this.timelineText = v));
        ta.inputEl.rows = 4;
      });
    new Setting(el).setName(L.factTitle).addText((text) => text.setValue(this.factTitle).onChange((v) => (this.factTitle = v)));
    new Setting(el)
      .setName(L.factBody)
      .addTextArea((ta) => ta.setValue(this.factBody).onChange((v) => (this.factBody = v)));

    new Setting(el)
      .addButton((b) => b.setButtonText(L.cancel).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(L.save)
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

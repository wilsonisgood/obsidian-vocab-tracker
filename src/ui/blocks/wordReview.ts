import { Modal } from "obsidian";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { FlashcardsBlock, rememberedMode, type FlashcardsHost } from "./flashcards";
import { singleReviewMode } from "./wordReviewModel";

// 「複習這個字」 (word page header, vocab-word): reviews just this word, due
// or not, in a modal. The card is the vocab-flashcards block itself run on
// one word — same faces, Space / 1–4, SrsService.rate — so there's no
// second copy of the card UI to keep in step. Opens in the mode last used
// in a flashcards block (cloze falls back to 英→中 when the word has no
// example sentence to blank out); the mode buttons can still switch.

export class WordReviewModal extends Modal {
  private block: FlashcardsBlock | null = null;

  constructor(
    private host: FlashcardsHost,
    private entry: VocabEntry
  ) {
    super(host.app);
  }

  onOpen(): void {
    this.modalEl.addClass("vt-word-review-modal");
    // Not the word: in 中→英 / 聽音拼字 the title would give it away.
    this.titleEl.setText(t("wordPage.review"));
    const mode = singleReviewMode(this.entry, rememberedMode(this.host.app));
    this.block = new FlashcardsBlock(
      this.contentEl.createDiv(),
      this.host,
      { mode, id: this.entry.id },
      { onClose: () => this.close(), autoFocus: true }
    );
    this.block.load();
  }

  onClose(): void {
    this.block?.unload();
    this.block = null;
    this.contentEl.empty();
  }
}

export function openWordReview(host: FlashcardsHost, entry: VocabEntry): void {
  new WordReviewModal(host, entry).open();
}

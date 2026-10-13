import type { VocabEntry } from "../../../core/model/entry";
import { CARD_MODES } from "../../../core/model/srs";
import { FlashcardsBlock, type FlashcardsHost } from "../flashcards";
import { parseFlashcardParams } from "../params";
import { t } from "../../../core/i18n";
import { renderFilterBar } from "./filterBar";
import { parseFilterValue, pruneValue, type FilterValue } from "./filterBarModel";
import type { PracticeTabDef } from "./types";
import { collectVocabOptions, toQueueFilter, vocabGroups, vocabQuickPicks, vocabSummary } from "./vocabFilterModel";

// 單字 tab (第十六波 E): the shared filter bar over the existing flashcards
// (FSRS card review). A filter change starts a new round.

export function vocabTab(host: FlashcardsHost): PracticeTabDef {
  return {
    id: "vocab",
    label: t("practice.vocab.label"),
    order: 0,
    mount(el, ctx) {
      const groups = vocabGroups(collectVocabOptions(host.store.entries as readonly VocabEntry[]));
      let value: FilterValue = pruneValue(parseFilterValue(ctx.filters.get("vocab")), groups);
      el.addClass("vt-pr-vocab");

      const cardsEl = el.createDiv({ cls: "vt-pr-vocab-cards" });
      const block = new FlashcardsBlock(
        cardsEl,
        host,
        { ...parseFlashcardParams(""), mode: CARD_MODES[0] },
        { filter: () => toQueueFilter(value, new Date()) }
      );

      // The bar goes above the cards.
      const barEl = createDiv();
      el.insertBefore(barEl, cardsEl);
      renderFilterBar(barEl, {
        groups,
        quick: vocabQuickPicks(),
        value,
        summary: (v) => vocabSummary(v, groups),
        onChange: (next) => {
          value = next;
          ctx.filters.set("vocab", next);
          block.restart();
        },
      });
      ctx.component.addChild(block);
    },
  };
}

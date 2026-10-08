import { t, type I18nKey } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { MorphemeType } from "../../core/model/morpheme";
import type { MorphemeStat } from "../../services/learn/MorphemeService";
import type { PageGroup, PageWord } from "../page/pageContext";

// Word DNA → 側欄「本篇」(1007-2 #13). Pure: dna.ts calls this at the end
// of every render() and publishes the result through PageContextHub; the
// sidebar does its own grouping/sorting/dedup from here on.
//
// Fixed three groups, in this order regardless of which tab is currently
// open in the block (that's `activeGroupKey`, set by the caller) — not
// DNA_TAB_ORDER (dnaModel's suffix-before-root tab-fallback order), which
// is a different concern.
const GROUP_ORDER: readonly MorphemeType[] = ["prefix", "root", "suffix"];

const TAB_TITLE: Record<MorphemeType, I18nKey> = {
  prefix: "dna.tabs.prefix",
  root: "dna.tabs.root",
  suffix: "dna.tabs.suffix",
};

export function dnaPageGroups(
  statsByType: Record<MorphemeType, readonly MorphemeStat[]>,
  findEntry: (word: string) => VocabEntry | undefined,
  emojiOf: (entry: VocabEntry) => string
): PageGroup[] {
  return GROUP_ORDER.map((type) => {
    const words: PageWord[] = [];
    for (const stat of statsByType[type]) {
      const morpheme = { id: stat.morpheme.id, label: stat.morpheme.form };
      for (const entry of stat.learned) {
        words.push({ word: entry.word, zh: entry.definitionZh ?? "", emoji: emojiOf(entry), entryId: entry.id, morpheme });
      }
      for (const s of stat.suggested) {
        words.push({ word: s.word, zh: s.zh, emoji: s.emoji, entryId: findEntry(s.word)?.id, morpheme });
      }
    }
    return { key: `dna:${type}`, title: t(TAB_TITLE[type]), words };
  });
}

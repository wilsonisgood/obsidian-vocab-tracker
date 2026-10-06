import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { hasExamTag } from "../../core/model/like";
import type { VocabEntry } from "../../core/model/entry";
import { runUndoable } from "../kit/undoable";

// Wave 7 R — "取消 like" (1006report.md 定案規格 #14). Liking is just
// VocabStore.setLiked(entry, true) wherever a trigger decides to do it
// (WordRow's ♡/♥, #15's auto-like elsewhere) — nothing special there, so
// it doesn't need a wrapper here. Unliking is the special case this file
// owns: a word with no exam tag at all (dimmed tags count — #14 explicitly
// says "按淡的標籤也算有") has nothing else keeping it listed, so unliking
// it deletes the entry outright instead of leaving an orphaned, never-shown
// row sitting in the vault. A word that does carry a tag just loses its
// like — it's not deleted, the tag is reason enough to keep it around.
//
// No confirm dialog either way (regardless of which branch runs): instead
// a few seconds' undo (src/ui/kit/undoable.ts), the same pattern #20/#21
// use for deleting a Q&A / a whole discussion.
//
// Returns whether this unlike took the delete-with-undo path, so the
// caller (WordRow.ts) knows whether to also fire its onDeleted callback —
// the "has a tag" branch doesn't delete anything, the word stays listed
// (or not) purely by the existing filter rules.
export function unlikeEntry(plugin: VocabTrackerPlugin, entry: VocabEntry): boolean {
  const knownTags = plugin.wordlists.index.tags;
  if (hasExamTag(entry, knownTags)) {
    void plugin.store.setLiked(entry, false);
    return false;
  }

  const id = entry.id;
  const word = entry.word;
  const source = entry.source;
  runUndoable({
    message: t("undo.deletedWord", { word }),
    // Soft-delete only — never plugin.deleteEntry(), which would also
    // unhighlight the note immediately. The ==mark== (and the word page)
    // should stay untouched until the undo window actually closes.
    apply: () => {
      void plugin.store.deleteEntry(id);
    },
    restore: () => {
      void plugin.store.restoreEntry(id);
      // 1006-2 #3: the row this undo brings back was already removed from
      // the sidebar's DOM (handleWordRowChanged/removeWordRow ran when it
      // got deleted) — nothing else redraws the 單字 section on a bare
      // restoreEntry(), so without this the row stays missing until some
      // unrelated redraw happens. refreshExamStrip() is the sidebar's
      // existing "re-filter without a full render()" hook (chip toggles,
      // 本篇 scope resolving); scroll position is untouched the same way.
      plugin.refreshExamStrip();
    },
    commit: () => {
      plugin.linkage.unlink(id);
      if (source && source.path) void plugin.unhighlightWord(word, source.path);
    },
  });
  return true;
}

import type { VocabEntry } from "../../core/model/entry";
import type { NoticeAction } from "./actionNotice";
import { lm } from "./strings";

// Tap action "save" (規劃書 01 §3.2): the word is added at once — no
// sidebar, no sheet — and a Notice confirms it with 「復原」, which deletes
// it again (and takes its ==highlight== back out of the note).

export interface QuickSaveDeps {
  // Adds the word; the new entry, or null when it was already saved.
  add(): Promise<VocabEntry | null>;
  remove(entry: VocabEntry): Promise<void>;
  notify(text: string, actions?: NoticeAction[]): void;
}

// The added entry, or null when there was nothing to add.
export async function quickSave(word: string, deps: QuickSaveDeps): Promise<VocabEntry | null> {
  const entry = await deps.add();
  if (!entry) return null;
  let undone = false;
  deps.notify(lm("mobile.save.added", { word: entry.word }), [
    {
      label: lm("mobile.save.undo"),
      run: () => {
        if (undone) return;
        undone = true;
        void deps.remove(entry).then(
          () => deps.notify(lm("mobile.save.undone", { word })),
          (e) => console.error("Vocab Tracker: undo failed", e)
        );
      },
    },
  ]);
  return entry;
}

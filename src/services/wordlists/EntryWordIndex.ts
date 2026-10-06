import type { VocabEntry } from "../../core/model/entry";
import type { VocabStore } from "../../core/store/VocabStore";
import { buildEntryLookup, type EntryLookup } from "../../core/wordlists/importPlan";

// Wave 7 Y (1006report.md #25) — a cached EntryLookup for planImport().
//
// scanNote() runs on every note open (and autoImport, if it ever stops
// bailing out on an already-imported note, now runs every time too — see
// main.ts 整合事項). A vault can easily have a few thousand vocab entries;
// rebuilding core/wordlists/importPlan.ts's word→entry Map from scratch on
// every single note open would mean redoing an O(entries) pass just to
// answer "is this exam word already tracked?" each time a note is opened,
// not only when the data actually changed.
//
// Instead this only rebuilds lazily, the first lookup after
// VocabStore's "data:changed" has fired since the last build — so the
// O(entries) cost is paid once per actual edit (add/delete/restore/sync),
// not once per scan.
export class EntryWordIndex implements EntryLookup {
  private cached: EntryLookup | null = null;
  private readonly unsubscribe: () => void;

  constructor(private store: Pick<VocabStore, "allEntries" | "events">) {
    this.unsubscribe = store.events.on("data:changed", () => {
      this.cached = null;
    });
  }

  // Call on plugin unload — the store outlives this index otherwise and
  // would keep a dangling listener on it.
  dispose(): void {
    this.unsubscribe();
  }

  live(word: string): VocabEntry | undefined {
    return this.lookup().live(word);
  }

  latestTombstone(word: string): VocabEntry | undefined {
    return this.lookup().latestTombstone(word);
  }

  private lookup(): EntryLookup {
    if (!this.cached) this.cached = buildEntryLookup(this.store.allEntries);
    return this.cached;
  }
}

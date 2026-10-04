import type { VocabData, VocabEntry } from "../model/entry";
import { TypedEmitter } from "../events";
import { nowIso } from "../nowIso";

export interface VocabStoreEvents {
  // Coarse-grained for now: every save (add/edit/delete/enrich) fires this.
  // PR5 (UI split, 規劃書 06 M0 step 5) replaced per-row `view.render()`
  // calls with subscriptions here; per-entry events are still a later step
  // (not needed until a view wants to re-render just one row).
  "data:changed": VocabData;
}

const WRITE_DEBOUNCE_MS = 500;

export class VocabStore {
  readonly events = new TypedEmitter<VocabStoreEvents>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private data: VocabData,
    private persist: (data: VocabData) => Promise<void>
  ) {}

  get vocabData(): VocabData {
    return this.data;
  }

  // Live entries only — excludes soft-deleted (tombstoned) ones. UI code
  // should read this instead of vocabData.entries directly; the raw array
  // (tombstones included) is only needed by persistence and merge.ts.
  get entries(): VocabEntry[] {
    return this.data.entries.filter((e) => !e.deletedAt);
  }

  // Stamps a brand-new entry and adds it. Pushes the same object reference
  // the caller holds (not a copy) so later direct mutations on it — e.g.
  // enrichEntry filling in dictionary fields — land in this.data too.
  addEntry(entry: VocabEntry): Promise<void> {
    const stamp = nowIso();
    entry.createdAt = entry.createdAt ?? stamp;
    entry.updatedAt = stamp;
    entry.rev = 0;
    entry.lang = entry.lang ?? "en";
    this.data.entries.push(entry);
    return this.save();
  }

  // Call after directly mutating fields on an entry that's already in
  // this.data.entries, so its updatedAt/rev stay meaningful to merge.ts.
  touch(entry: VocabEntry): Promise<void> {
    entry.updatedAt = nowIso();
    entry.rev = (entry.rev ?? 0) + 1;
    return this.save();
  }

  // Soft-delete: sets deletedAt instead of removing the entry, so a delete
  // on one device can be merged against an edit on another (see
  // core/store/merge.ts) instead of the record just vanishing or
  // reappearing depending on write order. Permanently purged after 30 days
  // by core/store/cleanupTombstones.ts.
  deleteEntry(id: string): Promise<void> {
    const entry = this.data.entries.find((e) => e.id === id);
    if (!entry) return Promise.resolve();
    const stamp = nowIso();
    entry.deletedAt = stamp;
    entry.updatedAt = stamp;
    entry.rev = (entry.rev ?? 0) + 1;
    return this.save();
  }

  // Emits data:changed immediately (so the UI reflects the edit right
  // away) but coalesces the actual disk write: rapid edits (e.g. typing in
  // an inline-editable field) share one write instead of one per
  // keystroke. Callers that need the write to have actually landed (e.g.
  // before closing a file) should use flush(), not rely on this resolving.
  async save(): Promise<void> {
    this.events.emit("data:changed", this.data);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.persist(this.data);
    }, WRITE_DEBOUNCE_MS);
  }

  // Forces any debounced write to land now — call on plugin unload so a
  // pending edit isn't lost if Obsidian closes before the timer fires.
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.persist(this.data);
    }
    await this.pendingWrite;
  }

  // Used by onExternalSettingsChange (multi-device sync) once that exists.
  replace(data: VocabData): void {
    this.data = data;
    this.events.emit("data:changed", this.data);
  }
}

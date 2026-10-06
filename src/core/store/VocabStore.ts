import type { VocabData, VocabEntry } from "../model/entry";
import { TypedEmitter } from "../events";
import { nowIso } from "../nowIso";
import {
  carryLegacyStamp,
  snapshotSettingsSections,
  stampChangedSections,
  withSettingsDefaults,
  type ResolvedSettings,
} from "../model/settings";

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

  // Settings with every default filled in. Written back into this.data so
  // later in-place edits (updateSettings) land on the persisted object;
  // re-resolving after replace() (sync merge) picks up remote fields too.
  get settings(): ResolvedSettings {
    const current = this.data.settings;
    if (current && this.resolvedSettings.has(current)) return current as ResolvedSettings;
    const resolved = withSettingsDefaults(current);
    this.data.settings = resolved;
    this.resolvedSettings.add(resolved);
    return resolved;
  }

  // Settings objects already passed through withSettingsDefaults, so the
  // getter returns a stable object instead of re-resolving on every read.
  private resolvedSettings = new WeakSet<object>();

  // The only way UI code should change settings. Stamps updatedAt on just
  // the sections (ui/ai/learner/srs/wordlists) whose content actually
  // changed, so merge.ts can keep the newer copy of each section
  // independently. The top-level updatedAt gets the very same stamp, and
  // only when some section changed — so it never exceeds the newest section
  // stamp, which is how merge.ts recognises a copy last edited by an older
  // plugin version (those bump only the top-level stamp). Such a copy first
  // hands that old-version time down to its sections (carryLegacyStamp),
  // since bumping the top-level stamp here would hide it from merge.ts.
  updateSettings(mutate: (s: ResolvedSettings) => void): Promise<void> {
    const s = this.settings;
    carryLegacyStamp(s);
    const before = snapshotSettingsSections(s);
    mutate(s);
    const stamp = nowIso();
    if (stampChangedSections(s, before, stamp).length > 0) s.updatedAt = stamp;
    return this.save();
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
    return this.addEntries([entry]);
  }

  // One save (and one data:changed) for a whole batch, e.g. a note's exam
  // words imported at once.
  addEntries(entries: VocabEntry[]): Promise<void> {
    const stamp = nowIso();
    for (const entry of entries) {
      entry.createdAt = entry.createdAt ?? stamp;
      entry.updatedAt = stamp;
      entry.rev = 0;
      entry.lang = entry.lang ?? "en";
      this.data.entries.push(entry);
    }
    return this.save();
  }

  // Raw entries including tombstones — for logic that must know a word was
  // deleted (e.g. auto-import not re-adding it), not for display.
  get allEntries(): readonly VocabEntry[] {
    return this.data.entries;
  }

  // Call after directly mutating fields on an entry that's already in
  // this.data.entries, so its updatedAt/rev stay meaningful to merge.ts.
  touch(entry: VocabEntry): Promise<void> {
    return this.touchMany([entry]);
  }

  touchMany(entries: VocabEntry[]): Promise<void> {
    const stamp = nowIso();
    for (const entry of entries) {
      entry.updatedAt = stamp;
      entry.rev = (entry.rev ?? 0) + 1;
    }
    return this.save();
  }

  // Sets the like state (Wave 7 F, 規格 #13-#15) the same way any other
  // field edit does: mutate in place, then stamp updatedAt/rev and save
  // like touch() does. Callers decide *when* to like/unlike (UI click, or
  // an automatic trigger — AI use, pin, flashcard review…); this is just
  // the one place that writes the field so every trigger stays consistent.
  setLiked(entry: VocabEntry, liked: boolean): Promise<void> {
    entry.liked = liked;
    return this.touch(entry);
  }

  // One-time migration helper (規格 #23): fills in `liked` for every entry
  // that doesn't have it yet (liked === undefined). `decide` is typically
  // core/model/like.ts's initialLiked(), called with signals the caller
  // assembles from ThreadService/usage/etc — this layer can't compute those
  // itself, it only owns the write. Tombstones are included too (harmless,
  // and keeps the whole data set consistent). One save for the whole pass.
  // Returns how many entries were changed, so the caller can skip the
  // save-already-done no-op case or log it.
  async backfillLiked(decide: (entry: VocabEntry) => boolean): Promise<number> {
    const stamp = nowIso();
    let count = 0;
    for (const entry of this.data.entries) {
      if (entry.liked !== undefined) continue;
      entry.liked = decide(entry);
      entry.updatedAt = stamp;
      entry.rev = (entry.rev ?? 0) + 1;
      count++;
    }
    if (count > 0) await this.save();
    return count;
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

  // Reverses deleteEntry (Wave 7 R, 規格 #14's undo window): clears
  // deletedAt so the entry is live again, and bumps updatedAt/rev like any
  // other edit — mirrors deleteEntry's shape exactly, just the opposite
  // field value. A no-op (no save) if the id doesn't exist.
  restoreEntry(id: string): Promise<void> {
    const entry = this.data.entries.find((e) => e.id === id);
    if (!entry) return Promise.resolve();
    entry.deletedAt = undefined;
    const stamp = nowIso();
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

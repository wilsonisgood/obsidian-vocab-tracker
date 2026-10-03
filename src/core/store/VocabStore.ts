import type { VocabData } from "../model/entry";
import { TypedEmitter } from "../events";

export interface VocabStoreEvents {
  // Coarse-grained for now: every save (add/edit/delete/enrich) fires this.
  // PR5 (UI split, 規劃書 06 M0 step 5) will replace per-row `view.render()`
  // calls with subscriptions here; per-entry events arrive with the schema
  // v2 store in M1.
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

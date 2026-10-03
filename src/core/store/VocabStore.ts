import type { VocabData } from "../model/entry";
import { TypedEmitter } from "../events";

export interface VocabStoreEvents {
  // Coarse-grained for now: every save (add/edit/delete/enrich) fires this.
  // PR5 (UI split, 規劃書 06 M0 step 5) will replace per-row `view.render()`
  // calls with subscriptions here; per-entry events arrive with the schema
  // v2 store in M1.
  "data:changed": VocabData;
}

export class VocabStore {
  readonly events = new TypedEmitter<VocabStoreEvents>();

  constructor(
    private data: VocabData,
    private persist: (data: VocabData) => Promise<void>
  ) {}

  get vocabData(): VocabData {
    return this.data;
  }

  async save(): Promise<void> {
    await this.persist(this.data);
    this.events.emit("data:changed", this.data);
  }

  // Used by onExternalSettingsChange (multi-device sync) once that exists.
  replace(data: VocabData): void {
    this.data = data;
    this.events.emit("data:changed", this.data);
  }
}

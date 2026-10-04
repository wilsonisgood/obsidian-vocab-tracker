import { TypedEmitter } from "../../core/events";
import type { WordlistSourcePort } from "../../core/ports";
import { tagEnabled, type WordlistSettings } from "../../core/model/wordlists";
import { parseWordlist, tagFromBasename } from "../../core/wordlists/parse";
import { WordlistIndex, type Wordlist } from "../../core/wordlists/WordlistIndex";
import { proseLines, ScanAccumulator, type Lookup, type Matcher, type ScanResult } from "../../core/wordlists/scan";

type Events = {
  // The index was rebuilt (lists added/edited/removed, folder changed).
  "index-changed": WordlistIndex;
  // A note finished its background scan.
  scanned: { path: string; result: ScanResult };
};

export interface WordlistServiceDeps {
  source: WordlistSourcePort;
  settings: () => WordlistSettings;
  // Hands control back to the UI between scan slices. Injected so tests
  // don't wait on real timers.
  yieldToUi?: () => Promise<void>;
}

// Lines scanned between yields — a slice stays well under a frame even on
// a phone, while a typical note still finishes in one or two slices.
const SLICE_LINES = 300;
const MAX_CACHED_SCANS = 100;

// Loads the word lists from the vault and scans notes against them in the
// background — once per note version (path + mtime), so reopening a note
// or switching back to it reuses the earlier result.
export class WordlistService extends TypedEmitter<Events> {
  index = new WordlistIndex();
  private generation = 0;
  private scans = new Map<string, { mtime: number; result: ScanResult }>();
  private inflight = new Map<string, { mtime: number; promise: Promise<ScanResult> }>();
  private yieldToUi: () => Promise<void>;

  constructor(private deps: WordlistServiceDeps) {
    super();
    this.yieldToUi = deps.yieldToUi ?? (() => new Promise((r) => setTimeout(r, 0)));
  }

  async reload(): Promise<void> {
    const gen = ++this.generation;
    const { folder } = this.deps.settings();
    const lists: Wordlist[] = [];
    for (const file of this.deps.source.list(folder)) {
      const content = await this.deps.source.read(file.path);
      if (gen !== this.generation) return; // a newer reload started
      if (content == null) continue;
      const parsed = parseWordlist(content);
      if (parsed.words.length === 0) continue;
      lists.push({ tag: parsed.tag || tagFromBasename(file.basename), words: parsed.words, path: file.path });
    }
    this.index = new WordlistIndex(lists);
    this.invalidateScans();
    this.emit("index-changed", this.index);
  }

  // Inflection matching or the index changed, so every cached count is stale.
  invalidateScans(): void {
    this.scans.clear();
    this.inflight.clear();
  }

  match: Matcher = (word) => this.index.match(word, this.deps.settings().inflections);

  // Tags to underline in reading view: enabled tags only. Null when
  // highlighting is off or there's nothing loaded, so the post-processor
  // can skip walking the DOM at all.
  highlightLookup(): Lookup | null {
    const s = this.deps.settings();
    if (!s.highlight || this.index.isEmpty) return null;
    const enabled = new Set(this.index.tags.filter((t) => tagEnabled(s, t)));
    if (enabled.size === 0) return null;
    const memo = new Map<readonly string[], readonly string[]>();
    return (word) => {
      const tags = this.index.lookup(word, s.inflections);
      if (tags.length === 0) return tags;
      let hit = memo.get(tags);
      if (!hit) memo.set(tags, (hit = tags.filter((t) => enabled.has(t))));
      return hit;
    };
  }

  cachedScan(path: string, mtime: number): ScanResult | null {
    const hit = this.scans.get(path);
    return hit && hit.mtime === mtime ? hit.result : null;
  }

  // Scans a note unless this version was already scanned (or is being
  // scanned right now). `read` is only called when a scan is needed.
  scan(path: string, mtime: number, read: () => Promise<string>): Promise<ScanResult> {
    const cached = this.cachedScan(path, mtime);
    if (cached) return Promise.resolve(cached);
    const running = this.inflight.get(path);
    if (running && running.mtime === mtime) return running.promise;

    const gen = this.generation;
    // Identifies this run, so a scan superseded by invalidateScans() or a
    // newer version of the note doesn't overwrite fresher results.
    const token = { mtime, promise: null as unknown as Promise<ScanResult> };
    const run = async () => {
      const lines = proseLines(await read());
      const acc = new ScanAccumulator(this.match);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0 && i % SLICE_LINES === 0) await this.yieldToUi();
        acc.add(lines[i], i);
      }
      const result = acc.result();
      // Don't cache a result computed against an index that's since been replaced.
      if (gen === this.generation && this.inflight.get(path) === token) {
        this.inflight.delete(path);
        this.scans.delete(path);
        this.scans.set(path, { mtime, result });
        if (this.scans.size > MAX_CACHED_SCANS) this.scans.delete(this.scans.keys().next().value!);
        this.emit("scanned", { path, result });
      }
      return result;
    };
    token.promise = run();
    this.inflight.set(path, token);
    token.promise.catch(() => {
      if (this.inflight.get(path) === token) this.inflight.delete(path);
    });
    return token.promise;
  }
}

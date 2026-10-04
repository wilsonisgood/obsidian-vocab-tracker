import { TypedEmitter } from "../../core/events";
import { liveTurns, type Thread } from "../../core/model/thread";
import { trailingBlockId } from "../../core/text/blockId";
import { paragraphHash } from "../../core/text/hash";

// Paragraph discussion counts for reading-mode badges (規劃書 06 §9.5):
// Map<path, Map<key, count>>, maintained from thread events so the
// post-processor only does an O(1) lookup and never touches the vault.
//
// Keys: "b:<blockId>" for block anchors, "h:<hash>" for hash anchors. A
// block anchor is only indexed by its id — indexing it by hash too would
// badge every other paragraph with the same text (short lines like "Hi.").

export interface ParagraphIndexEvents {
  // Badge counts changed for these notes; re-render their badges.
  "paragraph-index:change": { paths: string[] };
}

// The slice of ThreadService the index listens to.
export interface ParagraphThreadSource {
  paragraphThreads(): Thread[];
  ensureLoaded(): Promise<void>;
  events: {
    on(event: "thread:upsert", fn: (thread: Thread) => void): () => void;
    on(event: "threads:reloaded", fn: () => void): () => void;
  };
}

interface Contribution {
  path: string;
  key: string;
  count: number;
}

export function paragraphKey(anchor: { blockId?: string; hash: string }): string {
  return anchor.blockId ? `b:${anchor.blockId}` : `h:${anchor.hash}`;
}

// What the badge counts: questions asked in the thread.
export function questionCount(thread: Thread | undefined): number {
  return liveTurns(thread).filter((t) => t.role === "user").length;
}

export class ParagraphIndex {
  readonly events = new TypedEmitter<ParagraphIndexEvents>();
  private byPath = new Map<string, Map<string, number>>();
  private byThread = new Map<string, Contribution>();

  // Subscribes to a ThreadService and fills the index once threads.json is
  // loaded. Returns the unsubscribe function.
  attach(source: ParagraphThreadSource): () => void {
    const offs = [
      source.events.on("thread:upsert", (th) => this.upsert(th)),
      source.events.on("threads:reloaded", () => this.rebuild(source.paragraphThreads())),
    ];
    void source.ensureLoaded().then(() => this.rebuild(source.paragraphThreads()));
    return () => offs.forEach((off) => off());
  }

  rebuild(threads: readonly Thread[]): void {
    const touched = new Set(this.byPath.keys());
    this.byPath.clear();
    this.byThread.clear();
    for (const th of threads) this.add(th);
    for (const p of this.byPath.keys()) touched.add(p);
    if (touched.size) this.events.emit("paragraph-index:change", { paths: [...touched] });
  }

  upsert(thread: Thread): void {
    const before = this.byThread.get(thread.id);
    if (before) this.remove(thread.id);
    const after = this.add(thread);
    if (before?.path === after?.path && before?.key === after?.key && before?.count === after?.count) return;
    const paths = new Set<string>();
    if (before) paths.add(before.path);
    if (after) paths.add(after.path);
    this.events.emit("paragraph-index:change", { paths: [...paths] });
  }

  // Badge count for a reading-mode section (its raw text, as
  // getSectionInfo covers it). Notes without paragraph discussions return
  // before any hashing.
  count(path: string, sectionText: string): number {
    const keys = this.byPath.get(path);
    if (!keys) return 0;
    const id = trailingBlockId(sectionText);
    if (id) {
      const n = keys.get(`b:${id}`);
      if (n) return n;
    }
    return keys.get(`h:${paragraphHash(sectionText)}`) ?? 0;
  }

  hasPath(path: string): boolean {
    return this.byPath.has(path);
  }

  private add(thread: Thread): Contribution | undefined {
    if (thread.deletedAt || thread.anchor.kind !== "paragraph") return undefined;
    const count = questionCount(thread);
    if (!count) return undefined;
    const c: Contribution = { path: thread.anchor.path, key: paragraphKey(thread.anchor), count };
    let keys = this.byPath.get(c.path);
    if (!keys) {
      keys = new Map();
      this.byPath.set(c.path, keys);
    }
    keys.set(c.key, (keys.get(c.key) ?? 0) + count);
    this.byThread.set(thread.id, c);
    return c;
  }

  private remove(threadId: string): void {
    const c = this.byThread.get(threadId);
    if (!c) return;
    this.byThread.delete(threadId);
    const keys = this.byPath.get(c.path);
    if (!keys) return;
    const left = (keys.get(c.key) ?? 0) - c.count;
    if (left > 0) keys.set(c.key, left);
    else keys.delete(c.key);
    if (!keys.size) this.byPath.delete(c.path);
  }
}

import { describe, expect, it } from "vitest";
import { TypedEmitter } from "../../../src/core/events";
import type { Thread, Turn } from "../../../src/core/model/thread";
import { paragraphHash } from "../../../src/core/text/hash";
import { ParagraphIndex, paragraphKey, questionCount } from "../../../src/services/anchors/ParagraphIndex";

const P = "Last time I was in a stadium this size, I was wearing a glittery leotard.";

function turns(questions: number): Turn[] {
  const out: Turn[] = [];
  for (let i = 0; i < questions; i++) {
    out.push({ id: `q${i}`, role: "user", content: "?", at: "2026-10-04T00:00:00Z", status: "done" });
    out.push({ id: `a${i}`, role: "assistant", content: "!", at: "2026-10-04T00:00:00Z", status: "done" });
  }
  return out;
}

function thread(id: string, path: string, opts: { blockId?: string; text?: string; questions?: number } = {}): Thread {
  const text = opts.text ?? P;
  return {
    id,
    anchor: { kind: "paragraph", path, blockId: opts.blockId, hash: paragraphHash(text), snapshot: text },
    turns: turns(opts.questions ?? 1),
    rev: 0,
  };
}

class Source {
  threads: Thread[] = [];
  events = new TypedEmitter<{ "thread:upsert": Thread; "threads:reloaded": void }>();
  loaded = Promise.resolve();
  paragraphThreads = () => this.threads.filter((t) => !t.deletedAt && t.anchor.kind === "paragraph");
  ensureLoaded = () => this.loaded;
}

describe("ParagraphIndex", () => {
  it("counts questions per block id or hash, per note", () => {
    const idx = new ParagraphIndex();
    idx.rebuild([
      thread("t1", "a.md", { blockId: "vt-aaaaaa", questions: 2 }),
      thread("t2", "a.md", { text: "Hi. Hello. Hi.", questions: 3 }),
      thread("t3", "b.md", { blockId: "vt-bbbbbb" }),
      { id: "w", anchor: { kind: "word", entryId: "e1" }, turns: turns(4), rev: 0 },
    ]);
    expect(idx.count("a.md", `${P} ^vt-aaaaaa`)).toBe(2);
    // Hash anchors match the section's text, highlight marks and all.
    expect(idx.count("a.md", "Hi. ==Hello==. Hi.")).toBe(3);
    expect(idx.count("b.md", "Anything ^vt-bbbbbb")).toBe(1);
    expect(idx.count("b.md", `${P} ^vt-aaaaaa`)).toBe(0);
    expect(idx.count("c.md", P)).toBe(0);
    expect(idx.hasPath("c.md")).toBe(false);
  });

  it("indexes block anchors by id only, so identical text elsewhere isn't badged", () => {
    const idx = new ParagraphIndex();
    idx.rebuild([thread("t1", "a.md", { blockId: "vt-aaaaaa" })]);
    expect(idx.count("a.md", P)).toBe(0);
    expect(idx.count("a.md", `${P} ^someone-else`)).toBe(0);
  });

  it("sums threads on the same paragraph and skips empty or deleted ones", () => {
    const idx = new ParagraphIndex();
    const deleted = thread("t3", "a.md", { questions: 5 });
    deleted.deletedAt = "2026-10-04T00:00:00Z";
    idx.rebuild([thread("t1", "a.md"), thread("t2", "a.md", { questions: 2 }), thread("t0", "a.md", { questions: 0 }), deleted]);
    expect(idx.count("a.md", P)).toBe(3);
  });

  it("tracks upserts, renames and deletions from thread events", async () => {
    const src = new Source();
    const t1 = thread("t1", "a.md", { blockId: "vt-aaaaaa" });
    src.threads.push(t1);
    const idx = new ParagraphIndex();
    const changes: string[][] = [];
    idx.events.on("paragraph-index:change", (c) => changes.push(c.paths));
    const detach = idx.attach(src);
    await src.loaded;
    await Promise.resolve();
    expect(idx.count("a.md", `${P} ^vt-aaaaaa`)).toBe(1);

    t1.turns.push(...turns(1).map((t) => ({ ...t, id: `${t.id}-2` })));
    src.events.emit("thread:upsert", t1);
    expect(idx.count("a.md", `${P} ^vt-aaaaaa`)).toBe(2);

    // Note renamed: the count moves with the anchor's path.
    t1.anchor = { ...(t1.anchor as Extract<Thread["anchor"], { kind: "paragraph" }>), path: "renamed.md" };
    src.events.emit("thread:upsert", t1);
    expect(idx.count("a.md", `${P} ^vt-aaaaaa`)).toBe(0);
    expect(idx.hasPath("a.md")).toBe(false);
    expect(idx.count("renamed.md", `${P} ^vt-aaaaaa`)).toBe(2);

    // An upsert that changes nothing the badge shows doesn't re-render.
    const before = changes.length;
    src.events.emit("thread:upsert", t1);
    expect(changes.length).toBe(before);

    t1.deletedAt = "2026-10-04T01:00:00Z";
    src.events.emit("thread:upsert", t1);
    expect(idx.count("renamed.md", `${P} ^vt-aaaaaa`)).toBe(0);
    expect(changes).toEqual([["a.md"], ["a.md"], ["a.md", "renamed.md"], ["renamed.md"]]);

    // Sync replaced the threads: rebuilt from the source.
    src.threads = [thread("t9", "z.md")];
    src.events.emit("threads:reloaded", undefined);
    expect(idx.count("z.md", P)).toBe(1);

    detach();
    src.events.emit("thread:upsert", thread("t10", "y.md"));
    expect(idx.hasPath("y.md")).toBe(false);
  });

  it("helpers", () => {
    expect(paragraphKey({ blockId: "vt-x", hash: "h" })).toBe("b:vt-x");
    expect(paragraphKey({ hash: "abc" })).toBe("h:abc");
    const th = thread("t", "a.md", { questions: 2 });
    th.turns[0].deletedAt = "2026-10-04T00:00:00Z";
    expect(questionCount(th)).toBe(1);
    expect(questionCount(undefined)).toBe(0);
  });
});

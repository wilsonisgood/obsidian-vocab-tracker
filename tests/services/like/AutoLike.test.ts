import { describe, expect, it } from "vitest";
import { TypedEmitter } from "../../../src/core/events";
import type { VocabEntry } from "../../../src/core/model/entry";
import { liveTurns, type Thread, type Turn } from "../../../src/core/model/thread";
import type { FamilyServiceEvents } from "../../../src/services/learn/FamilyService";
import type { VerbUsageEvents } from "../../../src/services/learn/VerbUsageService";
import type { SrsServiceEvents } from "../../../src/services/srs/SrsService";
import type { ThreadEvents } from "../../../src/services/threads/ThreadService";
import { AutoLike, type AutoLikeVocabPort } from "../../../src/services/like/AutoLike";

function entry(id: string, overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word: id,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: "",
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "",
    lastReviewed: "",
    reviews: 0,
    ...overrides,
  };
}

class FakeStore implements AutoLikeVocabPort {
  liked: string[] = [];
  constructor(public entries: VocabEntry[]) {}
  async setLiked(entry: VocabEntry, liked: boolean): Promise<void> {
    entry.liked = liked;
    this.liked.push(entry.id);
  }
}

function turn(id: string, role: Turn["role"], extra: Partial<Turn> = {}): Turn {
  return { id, role, content: `${id} text`, at: "2026-10-04T00:00:00Z", status: "done", ...extra };
}

class FakeThreads {
  events = new TypedEmitter<ThreadEvents>();
  private byEntry = new Map<string, Thread>();
  set(entryId: string, thread: Thread): void {
    this.byEntry.set(entryId, thread);
  }
  wordThread(entryId: string): Thread | undefined {
    return this.byEntry.get(entryId);
  }
  async ensureLoaded(): Promise<void> {}
  // Mutates the thread and fires thread:upsert, the way ThreadService does.
  push(entryId: string, thread: Thread): void {
    this.byEntry.set(entryId, thread);
    this.events.emit("thread:upsert", thread);
  }
}

describe("AutoLike — AI 提問／釘選 (1006report.md #15)", () => {
  it("likes a word the first time it has a live user turn", () => {
    const store = new FakeStore([entry("e1")]);
    const threads = new FakeThreads();
    new AutoLike({ store, threads });
    const thread: Thread = { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q1", "user"), turn("a1", "assistant")] };
    threads.push("e1", thread);
    expect(store.liked).toEqual(["e1"]);
    expect(store.entries[0].liked).toBe(true);
  });

  it("does not re-trigger on a later unrelated upsert once already liked", () => {
    const store = new FakeStore([entry("e1", { liked: true })]);
    const threads = new FakeThreads();
    new AutoLike({ store, threads });
    const thread: Thread = { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q1", "user"), turn("a1", "assistant")] };
    threads.push("e1", thread);
    expect(store.liked).toEqual([]); // already liked: likeEntry() is a no-op
  });

  it("asking a second question (turn count increases again) likes an unliked word", () => {
    const store = new FakeStore([entry("e1")]);
    const threads = new FakeThreads();
    const al = new AutoLike({ store, threads });
    const thread: Thread = { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q1", "user"), turn("a1", "assistant")] };
    threads.push("e1", thread);
    expect(store.liked).toEqual(["e1"]);
    // Unlike it (as if the user pressed 取消 like), then ask again.
    store.entries[0].liked = false;
    thread.turns.push(turn("q2", "user"), turn("a2", "assistant"));
    threads.push("e1", thread);
    expect(store.liked).toEqual(["e1", "e1"]);
    void al; // keep the reference alive for lint
  });

  it("a baseline seeded by init() stops the first deletion of an old thread from false-triggering", async () => {
    const store = new FakeStore([entry("e1", { liked: true })]);
    const threads = new FakeThreads();
    const thread: Thread = {
      id: "word:e1",
      anchor: { kind: "word", entryId: "e1" },
      turns: [turn("q1", "user"), turn("a1", "assistant"), turn("q2", "user"), turn("a2", "assistant")],
    };
    threads.set("e1", thread);
    const al = new AutoLike({ store, threads });
    await al.init();

    // User unlikes the word by hand, then deletes the OLDER qa pair
    // (C's "刪除一組問答"): live user-turn count drops 2 → 1. Must not
    // resurrect the like.
    store.entries[0].liked = false;
    const deleted = { ...thread, turns: thread.turns.map((t) => (t.id === "q1" || t.id === "a1" ? { ...t, deletedAt: "x" } : t)) };
    threads.push("e1", deleted);
    expect(store.liked).toEqual([]);
    expect(liveTurns(deleted)).toHaveLength(2);
  });

  it("pinning an answer to the grammar hint likes the word; unpinning it again also likes it", () => {
    const store = new FakeStore([entry("e1")]);
    const threads = new FakeThreads();
    new AutoLike({ store, threads });
    const base: Thread = { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q1", "user"), turn("a1", "assistant")] };
    threads.push("e1", base);
    store.liked.length = 0;
    store.entries[0].liked = false;

    const pinned: Thread = { ...base, turns: base.turns.map((t) => (t.id === "a1" ? { ...t, pinnedToGrammar: true } : t)) };
    threads.push("e1", pinned);
    expect(store.liked).toEqual(["e1"]);

    store.entries[0].liked = false;
    store.liked.length = 0;
    const unpinned: Thread = { ...pinned, turns: pinned.turns.map((t) => (t.id === "a1" ? { ...t, pinnedToGrammar: false } : t)) };
    threads.push("e1", unpinned);
    expect(store.liked).toEqual(["e1"]);
  });

  it("deleting a pinned qa pair (turn tombstoned, not unpinned by the user) does not trigger", async () => {
    const store = new FakeStore([entry("e1", { liked: false })]);
    const threads = new FakeThreads();
    const pinned: Thread = {
      id: "word:e1",
      anchor: { kind: "word", entryId: "e1" },
      turns: [turn("q1", "user"), turn("a1", "assistant", { pinnedToGrammar: true })],
    };
    threads.set("e1", pinned);
    const al = new AutoLike({ store, threads });
    await al.init(); // seeds: 1 live user turn, {"a1"} pinned

    // C's "刪除一組問答": both turns tombstoned, pinnedToGrammar untouched.
    const deleted: Thread = { ...pinned, turns: pinned.turns.map((t) => ({ ...t, deletedAt: "x" })) };
    threads.push("e1", deleted);
    expect(store.liked).toEqual([]);
  });

  it("ignores paragraph/trivia-session threads and tombstoned whole threads", () => {
    const store = new FakeStore([entry("e1")]);
    const threads = new FakeThreads();
    new AutoLike({ store, threads });
    threads.push("p1", { id: "paragraph:p1", anchor: { kind: "paragraph", path: "a.md", hash: "h", snapshot: "" }, turns: [turn("q", "user")] });
    threads.push("trivia", { id: "trivia", anchor: { kind: "trivia-session" }, turns: [turn("q", "user")] });
    threads.push("word:e1", { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q", "user")], deletedAt: "x" });
    expect(store.liked).toEqual([]);
  });
});

describe("AutoLike — 找字族／動詞用法／單字卡複習", () => {
  it("likes only the seed entries from family:saved, ignoring list-scope (no seed) regroups", () => {
    const store = new FakeStore([entry("e1"), entry("e2"), entry("e3")]);
    const family = { events: new TypedEmitter<FamilyServiceEvents>() };
    new AutoLike({ store, family });
    family.events.emit("family:saved", { seedEntryIds: ["e1", "e2"] });
    expect(store.liked.sort()).toEqual(["e1", "e2"]);
    family.events.emit("family:saved", { seedEntryIds: [] });
    expect(store.liked.sort()).toEqual(["e1", "e2"]);
  });

  it("likes the entry a verb usage block was generated for", () => {
    const store = new FakeStore([entry("e1")]);
    const verbs = { events: new TypedEmitter<VerbUsageEvents>() };
    new AutoLike({ store, verbs });
    verbs.events.emit("verb:usage", { entryId: "e1" });
    expect(store.liked).toEqual(["e1"]);
  });

  it("likes the entry a flashcard review (SrsService.rate) just rated", () => {
    const store = new FakeStore([entry("e1")]);
    const srs = { events: new TypedEmitter<SrsServiceEvents>() };
    new AutoLike({ store, srs });
    srs.events.emit("srs:rated", { entryId: "e1" });
    expect(store.liked).toEqual(["e1"]);
  });
});

describe("AutoLike.likeEntry / dispose", () => {
  it("likeEntry() no-ops for an unknown id or an already-liked entry", async () => {
    const store = new FakeStore([entry("e1", { liked: true })]);
    const al = new AutoLike({ store });
    await al.likeEntry("nope");
    await al.likeEntry("e1");
    expect(store.liked).toEqual([]);
  });

  it("dispose() stops reacting to further events", () => {
    const store = new FakeStore([entry("e1")]);
    const threads = new FakeThreads();
    const al = new AutoLike({ store, threads });
    al.dispose();
    threads.push("e1", { id: "word:e1", anchor: { kind: "word", entryId: "e1" }, turns: [turn("q1", "user"), turn("a1", "assistant")] });
    expect(store.liked).toEqual([]);
  });
});

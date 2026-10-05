import { describe, expect, it } from "vitest";
import type { VocabData, VocabEntry } from "../../../src/core/model/entry";
import type { Family } from "../../../src/core/model/family";
import type { ReviewLog } from "../../../src/core/model/srs";
import type { Thread, Turn } from "../../../src/core/model/thread";
import type { TriviaItem } from "../../../src/core/model/trivia";
import { merge } from "../../../src/core/store/merge";
import { mergeThreads } from "../../../src/core/store/threads";
import { mergeLearn, type LearnShard } from "../../../src/services/learn/learnMerge";
import type { VerbFavorite } from "../../../src/core/model/usage";
import type { Snapshot } from "../../../src/services/backup/format";
import { planRestore, restoreStamp } from "../../../src/services/backup/restorePlan";

// Times: the backup at T0, edits after it at T1/T2, the restore at NOW,
// edits made after the restore at LATER.
const T0 = "2026-09-01T10:00:00.000Z";
const T1 = "2026-09-10T10:00:00.000Z";
const T2 = "2026-09-20T10:00:00.000Z";
const NOW = "2026-10-01T10:00:00.000Z";
const LATER = "2026-10-02T10:00:00.000Z";

function entry(id: string, word: string, extra: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id,
    word,
    level: "",
    synonyms: "",
    antonyms: "",
    example: "",
    definition: `${word} (backup)`,
    definitionZh: "",
    phonetic: "",
    partOfSpeech: "",
    grammar: "",
    source: null,
    added: "2026-08-01 10:00:00",
    lastReviewed: "",
    reviews: 0,
    createdAt: T0,
    updatedAt: T0,
    rev: 1,
    ...extra,
  };
}

function data(entries: VocabEntry[]): VocabData {
  return { schemaVersion: 2, settings: { schemaVersion: 2 }, entries };
}

function turn(id: string, role: Turn["role"], at: string, extra: Partial<Turn> = {}): Turn {
  return { id, role, content: id, at, status: "done", ...extra };
}

function thread(id: string, turns: Turn[], extra: Partial<Thread> = {}): Thread {
  return { id, anchor: { kind: "word", entryId: id.replace("word:", "") }, turns, createdAt: T0, updatedAt: T0, rev: 1, ...extra };
}

function family(id: string, extra: Partial<Family> = {}): Family {
  return { id, topic: id, label: id, source: "ai", scope: "list", groups: [], createdAt: T0, updatedAt: T0, rev: 1, ...extra };
}

function trivia(id: string, extra: Partial<TriviaItem> = {}): TriviaItem {
  return { id, entryId: "a", mentions: [], title: id, body: id, createdAt: T0, updatedAt: T0, rev: 1, ...extra };
}

function log(id: string, at: string): ReviewLog {
  return { id, entryId: "a", at, rating: 3, mode: "manual", elapsedMs: 1000 };
}

const live = (d: VocabData) => d.entries.filter((e) => !e.deletedAt);
const byWord = (d: VocabData, word: string) => d.entries.find((e) => e.word === word);
const liveWords = (d: VocabData) => live(d).map((e) => e.word).sort();

// The library at backup time: apple, bread, cider.
function backupSnapshot(): Snapshot {
  return {
    data: data([entry("a", "apple"), entry("b", "bread"), entry("c", "cider")]),
    threads: [thread("word:a", [turn("q1", "user", T0), turn("a1", "assistant", T0)])],
    learn: { families: [family("f1")], trivia: [trivia("t1")] },
    reviews: [log("r1", T0)],
    imports: { "note-a.md": T0 },
    files: { flashcards: T0 },
  };
}

// The library now: apple edited, bread deleted, cider untouched, dates added.
function currentSnapshot(): Snapshot {
  return {
    data: data([
      entry("a", "apple", { definition: "apple (edited)", updatedAt: T1, rev: 2 }),
      entry("b", "bread", { deletedAt: T1, updatedAt: T1, rev: 2 }),
      entry("c", "cider"),
      entry("d", "dates", { createdAt: T2, updatedAt: T2, rev: 0 }),
    ]),
    threads: [
      thread(
        "word:a",
        [turn("q1", "user", T0), turn("a1", "assistant", T0, { feedback: "down", updatedAt: T1 }), turn("q2", "user", T1), turn("a2", "assistant", T1)],
        { updatedAt: T1, rev: 3 }
      ),
      thread("word:d", [turn("q3", "user", T2), turn("a3", "assistant", T2)], { createdAt: T2, updatedAt: T2 }),
    ],
    learn: {
      families: [family("f1", { deletedAt: T1, updatedAt: T1, rev: 2 }), family("f2", { createdAt: T2, updatedAt: T2 })],
      trivia: [trivia("t1"), trivia("t2", { createdAt: T2, updatedAt: T2 })],
    },
    reviews: [log("r2", T2)],
    imports: { "note-d.md": T2 },
    files: {},
  };
}

function plan(removeExtras = false, current = currentSnapshot(), backup = backupSnapshot()) {
  return planRestore(current, backup, { removeExtras, now: NOW });
}

describe("planRestore — what the restored state looks like", () => {
  it("brings back the backup's words: edited ones revert, deleted ones return, extras stay", () => {
    const p = plan();
    const d = p.data!;
    expect(liveWords(d)).toEqual(["apple", "bread", "cider", "dates"]);
    expect(byWord(d, "apple")!.definition).toBe("apple (backup)");
    expect(byWord(d, "bread")!.deletedAt).toBeUndefined();
    expect(p.counts.words).toEqual({ changed: 1, revived: 1, extra: 1 });
    expect(p.changes.entryIds.sort()).toEqual(["a", "b"]);
  });

  it("stamps only what it changed with the restore time; unchanged records keep their stamps", () => {
    const d = plan().data!;
    expect(byWord(d, "apple")).toMatchObject({ updatedAt: NOW, rev: 3 });
    expect(byWord(d, "bread")).toMatchObject({ updatedAt: NOW, rev: 3 });
    expect(byWord(d, "cider")).toMatchObject({ updatedAt: T0, rev: 1 });
    expect(byWord(d, "dates")).toMatchObject({ updatedAt: T2, rev: 0 });
  });

  it("removeExtras turns words added after the backup into tombstones stamped now", () => {
    const p = plan(true);
    expect(liveWords(p.data!)).toEqual(["apple", "bread", "cider"]);
    expect(byWord(p.data!, "dates")).toMatchObject({ deletedAt: NOW, updatedAt: NOW, rev: 1 });
    expect(p.changes.entryIds.sort()).toEqual(["a", "b", "d"]);
  });

  it("keeps the current settings (AI keys, flashcard options…) untouched", () => {
    const current = currentSnapshot();
    current.data!.settings = { schemaVersion: 2, updatedAt: T2, srs: { dailyNew: 7, updatedAt: T2 } } as VocabData["settings"];
    const backup = backupSnapshot();
    backup.data!.settings = { schemaVersion: 2, srs: { dailyNew: 50 } } as VocabData["settings"];
    expect(plan(false, current, backup).data!.settings).toBe(current.data!.settings);
  });

  it("restores threads turn by turn: reverts edits, keeps (or deletes) later questions", () => {
    const keep = plan();
    const th = (keep.shards.threads as { threads: Thread[] }).threads;
    const wa = th.find((t) => t.id === "word:a")!;
    expect(wa.turns.find((t) => t.id === "a1")).toMatchObject({ updatedAt: NOW });
    expect(wa.turns.find((t) => t.id === "a1")!.feedback).toBeUndefined();
    expect(wa.turns.find((t) => t.id === "q2")!.deletedAt).toBeUndefined();
    expect(wa.updatedAt).toBe(NOW);
    expect(th.find((t) => t.id === "word:d")!.deletedAt).toBeUndefined();
    expect(keep.counts.questions.extra).toBe(2);
    expect(keep.counts.threads).toEqual({ changed: 1, revived: 0, extra: 1 });

    const remove = plan(true);
    const rth = (remove.shards.threads as { threads: Thread[] }).threads;
    expect(rth.find((t) => t.id === "word:a")!.turns.find((t) => t.id === "q2")).toMatchObject({ deletedAt: NOW });
    expect(rth.find((t) => t.id === "word:d")).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
  });

  it("restores families and trivia; a deleted family comes back, a removed extra is a plain delete", () => {
    const p = plan(true);
    const learn = p.shards.learn as LearnShard;
    expect(learn.families.find((f) => f.id === "f1")).toMatchObject({ updatedAt: NOW });
    expect(learn.families.find((f) => f.id === "f1")!.deletedAt).toBeUndefined();
    const f2 = learn.families.find((f) => f.id === "f2")!;
    expect(f2).toMatchObject({ deletedAt: NOW });
    expect(f2.deletedBy).toBeUndefined();
    expect(learn.trivia.find((t) => t.id === "t2")).toMatchObject({ deletedAt: NOW });
    expect(p.counts.families).toEqual({ changed: 0, revived: 1, extra: 1 });
  });

  it("restores saved verb usages too (learn.verbs); a deleted one comes back", () => {
    const fav = (id: string, extra: Partial<VerbFavorite> = {}): VerbFavorite =>
      ({ id, entryId: id.slice(5), word: id.slice(5), createdAt: T0, updatedAt: T0, rev: 0, ...extra }) as VerbFavorite;
    const backup = backupSnapshot();
    backup.learn = { ...backup.learn!, verbs: [fav("verb:a")] };
    const current = currentSnapshot();
    current.learn = { ...current.learn!, verbs: [fav("verb:a", { deletedAt: T1, updatedAt: T1, rev: 1 }), fav("verb:b")] };
    const verbs = (plan(false, current, backup).shards.learn as LearnShard).verbs!;
    expect(verbs.find((v) => v.id === "verb:a")).toMatchObject({ updatedAt: NOW });
    expect(verbs.find((v) => v.id === "verb:a")!.deletedAt).toBeUndefined();
    expect(verbs.find((v) => v.id === "verb:b")!.deletedAt).toBeUndefined();
  });

  it("unions review logs, imports and the files record (they only ever grow)", () => {
    const p = plan(true);
    expect((p.shards.reviews as { logs: ReviewLog[] }).logs.map((l) => l.id)).toEqual(["r1", "r2"]);
    expect(p.counts.reviewsAdded).toBe(1);
    expect((p.shards.imports as { notes: Record<string, string> }).notes).toEqual({ "note-a.md": T0, "note-d.md": T2 });
    expect((p.shards.files as { seeded: Record<string, string> }).seeded).toEqual({ flashcards: T0 });
  });

  it("leaves parts a backup doesn't include alone (a words-only migration backup)", () => {
    const p = plan(true, currentSnapshot(), { data: backupSnapshot().data });
    expect(Object.keys(p.shards)).toEqual(["data"]);
    expect(p.missing).toEqual(["threads", "learn", "reviews"]);
  });

  it("changes nothing when the backup matches the current state", () => {
    const p = plan(true, backupSnapshot(), backupSnapshot());
    expect(p.counts.words).toEqual({ changed: 0, revived: 0, extra: 0 });
    expect(p.changes.entryIds).toEqual([]);
    expect(p.data!.entries).toEqual(backupSnapshot().data!.entries);
  });

  it("revives a word whose tombstone has already been purged (missing now)", () => {
    const current = currentSnapshot();
    current.data!.entries = current.data!.entries.filter((e) => e.id !== "b");
    const p = plan(false, current);
    expect(byWord(p.data!, "bread")).toMatchObject({ updatedAt: NOW, rev: 2 });
    expect(p.counts.words.revived).toBe(1);
  });
});

describe("restoreStamp", () => {
  it("is now, or 1 ms past a newer stamp already in the data (a fast clock elsewhere)", () => {
    expect(restoreStamp(currentSnapshot(), new Date(NOW))).toBe(NOW);
    const current = currentSnapshot();
    current.data!.entries[0].updatedAt = "2026-10-01T10:00:05.000Z";
    expect(restoreStamp(current, new Date(NOW))).toBe("2026-10-01T10:00:05.001Z");
  });
});

// The restore has to survive the merges every shard goes through: this
// device's own services merging memory with the new files, and every other
// device merging its copy with the synced files (core/store/merge.ts,
// core/store/threads.ts, services/learn/learnMerge.ts).
describe("merging with the restored state (本機還原 → 另一台同步過來)", () => {
  const threadsOf = (p: ReturnType<typeof plan>) => (p.shards.threads as { threads: Thread[] }).threads;

  it("dominates the pre-restore state: merging it with the old copy, in either order, gives it back", () => {
    for (const removeExtras of [false, true]) {
      const before = currentSnapshot();
      const p = plan(removeExtras);
      const restored = p.data!;
      for (const merged of [merge(before.data!, restored), merge(restored, before.data!)]) {
        expect(liveWords(merged)).toEqual(liveWords(restored));
        expect(byWord(merged, "apple")!.definition).toBe("apple (backup)");
      }
      const th = threadsOf(p);
      const q = (ts: Thread[]) =>
        ts.flatMap((t) => (t.deletedAt ? [] : t.turns.filter((x) => !x.deletedAt).map((x) => `${t.id}/${x.id}/${x.feedback ?? ""}`))).sort();
      expect(q(mergeThreads(before.threads!, th))).toEqual(q(th));
      expect(q(mergeThreads(th, before.threads!))).toEqual(q(th));
      const learn = p.shards.learn as LearnShard;
      const ids = (s: LearnShard) => [...s.families, ...s.trivia].filter((r) => !r.deletedAt).map((r) => r.id).sort();
      expect(ids(mergeLearn(before.learn!, learn))).toEqual(ids(learn));
      expect(ids(mergeLearn(learn, before.learn!))).toEqual(ids(learn));
    }
  });

  it("control: copying the backup files over as they are is undone by the next merge", () => {
    // What a plain file copy would do: the other device (or this device's
    // own memory) still has the newer copies, and they win.
    const before = currentSnapshot();
    const naive = backupSnapshot();
    const merged = merge(before.data!, naive.data!);
    expect(byWord(merged, "apple")!.definition).toBe("apple (edited)");
    expect(byWord(merged, "bread")!.deletedAt).toBe(T1);
    expect(liveWords(merged)).toContain("dates");
    const fam = mergeLearn(before.learn!, naive.learn!).families.find((f) => f.id === "f1")!;
    expect(fam.deletedAt).toBe(T1);
  });

  // The iPhone has the same pre-restore library plus edits it made offline
  // (before the restore) that never reached the Mac. The Mac restores, the
  // files sync, the iPhone merges its memory with them.
  function iphoneBeforeSync(): Snapshot {
    const s = currentSnapshot();
    const edit = (id: string, def: string) => {
      const e = s.data!.entries.find((x) => x.id === id)!;
      Object.assign(e, { definition: def, updatedAt: "2026-09-25T10:00:00.000Z", rev: (e.rev ?? 0) + 1 });
    };
    edit("a", "apple (iPhone, offline)"); // also changed by the restore
    edit("c", "cider (iPhone, offline)"); // not touched by the restore
    s.data!.entries.push(entry("e", "eel", { createdAt: "2026-09-26T10:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z", rev: 0 }));
    return s;
  }

  it("keep mode: restored words win on the other device; its untouched edits and new words survive", () => {
    const restored = plan(false).data!;
    const iphone = merge(iphoneBeforeSync().data!, restored);
    expect(byWord(iphone, "apple")!.definition).toBe("apple (backup)");
    expect(byWord(iphone, "bread")!.deletedAt).toBeUndefined();
    expect(byWord(iphone, "cider")!.definition).toBe("cider (iPhone, offline)");
    expect(liveWords(iphone)).toEqual(["apple", "bread", "cider", "dates", "eel"]);
    // …and the Mac converges when the iPhone's merged copy syncs back.
    const mac = merge(restored, iphone);
    expect(liveWords(mac)).toEqual(liveWords(iphone));
    expect(byWord(mac, "cider")!.definition).toBe("cider (iPhone, offline)");
    expect(byWord(mac, "apple")!.definition).toBe("apple (backup)");
  });

  it("remove mode: words added after the backup are deleted on the other device too — except ones the Mac never saw", () => {
    const restored = plan(true).data!;
    const iphone = merge(iphoneBeforeSync().data!, restored);
    expect(liveWords(iphone)).toEqual(["apple", "bread", "cider", "eel"]);
    expect(byWord(iphone, "dates")!.deletedAt).toBe(NOW);
  });

  it("an edit made after the restore (anywhere) still wins over it", () => {
    const restored = plan(true).data!;
    const later = structuredClone(restored);
    const apple = byWord(later, "apple")!;
    Object.assign(apple, { definition: "apple (after restore)", updatedAt: LATER, rev: (apple.rev ?? 0) + 1 });
    const dates = byWord(later, "dates")!;
    delete dates.deletedAt;
    Object.assign(dates, { updatedAt: LATER, rev: (dates.rev ?? 0) + 1 });
    for (const merged of [merge(restored, later), merge(later, restored)]) {
      expect(byWord(merged, "apple")!.definition).toBe("apple (after restore)");
      expect(byWord(merged, "dates")!.deletedAt).toBeUndefined();
    }
  });

  it("threads: the other device's restored turns follow the restore; its own new question is kept", () => {
    const p = plan(true);
    const th = threadsOf(p);
    const iphone = currentSnapshot().threads!;
    const wa = iphone.find((t) => t.id === "word:a")!;
    wa.turns.push(turn("q9", "user", "2026-09-28T10:00:00.000Z"), turn("a9", "assistant", "2026-09-28T10:00:00.000Z"));
    const merged = mergeThreads(iphone, th).find((t) => t.id === "word:a")!;
    const liveIds = merged.turns.filter((t) => !t.deletedAt).map((t) => t.id);
    expect(liveIds).toEqual(["q1", "a1", "q9", "a9"]);
    expect(merged.turns.find((t) => t.id === "a1")!.feedback).toBeUndefined();
  });

  it("restoring the automatic pre-restore backup undoes the restore, on both devices", () => {
    const before = currentSnapshot();
    const first = plan(true);
    const after: Snapshot = { ...before, data: first.data, threads: threadsOf(first), learn: first.shards.learn as LearnShard };
    const undo = planRestore(after, before, { removeExtras: true, now: LATER });
    expect(liveWords(undo.data!)).toEqual(liveWords(before.data!));
    expect(byWord(undo.data!, "apple")!.definition).toBe("apple (edited)");
    expect(byWord(undo.data!, "bread")!.deletedAt).toBeDefined();
    // The other device, still on the first restore, follows the undo too.
    const other = merge(first.data!, undo.data!);
    expect(liveWords(other)).toEqual(liveWords(before.data!));
    expect(byWord(other, "apple")!.definition).toBe("apple (edited)");
  });
});

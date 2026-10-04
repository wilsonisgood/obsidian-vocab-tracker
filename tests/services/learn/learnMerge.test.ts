import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { TriviaItem } from "../../../src/core/model/trivia";
import { dropOldTombstones, mergeLearn, mergeRecords, normalizeLearnShard } from "../../../src/services/learn/learnMerge";

function fam(id: string, updatedAt: string, extra: Partial<Family> = {}): Family {
  return { id, topic: id, label: id, source: "ai", groups: [], updatedAt, rev: 1, ...extra };
}

function item(id: string, updatedAt: string, extra: Partial<TriviaItem> = {}): TriviaItem {
  return { id, entryId: "e1", mentions: [], title: id, body: "", updatedAt, rev: 1, ...extra };
}

describe("mergeRecords", () => {
  it("unions by id, keeping local order then remote additions", () => {
    const out = mergeRecords([fam("a", "2026-10-01T00:00:00Z"), fam("b", "2026-10-01T00:00:00Z")], [fam("c", "2026-10-01T00:00:00Z"), fam("a", "2026-10-01T00:00:00Z")]);
    expect(out.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the newer updatedAt, whichever side it's on", () => {
    const local = fam("a", "2026-10-01T00:00:00Z", { label: "local" });
    const remote = fam("a", "2026-10-02T00:00:00Z", { label: "remote" });
    expect(mergeRecords([local], [remote])[0].label).toBe("remote");
    expect(mergeRecords([remote], [local])[0].label).toBe("remote");
  });

  it("breaks updatedAt ties by rev, then keeps local", () => {
    const local = fam("a", "2026-10-01T00:00:00Z", { label: "local", rev: 2 });
    const remote = fam("a", "2026-10-01T00:00:00Z", { label: "remote", rev: 3 });
    expect(mergeRecords([local], [remote])[0].label).toBe("remote");
    expect(mergeRecords([{ ...local, rev: 3 }], [remote])[0].label).toBe("local");
  });

  it("treats a tombstone like any edit: the later of delete and edit wins", () => {
    const deleted = fam("a", "2026-10-02T00:00:00Z", { deletedAt: "2026-10-02T00:00:00Z" });
    const edited = fam("a", "2026-10-03T00:00:00Z", { label: "edited later" });
    expect(mergeRecords([deleted], [edited])[0].deletedAt).toBeUndefined();
    const stale = fam("a", "2026-10-01T00:00:00Z", { label: "older edit" });
    expect(mergeRecords([stale], [deleted])[0].deletedAt).toBe("2026-10-02T00:00:00Z");
  });

  it("an unstamped record loses to a stamped one", () => {
    const unstamped = { ...fam("a", ""), updatedAt: undefined, label: "old" };
    expect(mergeRecords([unstamped], [fam("a", "2026-10-01T00:00:00Z", { label: "new" })])[0].label).toBe("new");
  });
});

describe("learn shard", () => {
  it("merges families and trivia independently", () => {
    const out = mergeLearn(
      { families: [fam("f1", "2026-10-01T00:00:00Z")], trivia: [item("t1", "2026-10-01T00:00:00Z")] },
      { families: [fam("f2", "2026-10-01T00:00:00Z")], trivia: [item("t1", "2026-10-05T00:00:00Z", { title: "phone" })] }
    );
    expect(out.families.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(out.trivia).toHaveLength(1);
    expect(out.trivia[0].title).toBe("phone");
  });

  it("normalizes a missing or partial file", () => {
    expect(normalizeLearnShard(null)).toEqual({ families: [], trivia: [] });
    expect(normalizeLearnShard({ families: "oops" })).toEqual({ families: [], trivia: [] });
  });

  it("drops tombstones older than 30 days only", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const recs = [
      fam("live", "2026-09-01T00:00:00Z"),
      fam("old", "2026-09-01T00:00:00Z", { deletedAt: "2026-09-01T00:00:00Z" }),
      fam("recent", "2026-10-20T00:00:00Z", { deletedAt: "2026-10-20T00:00:00Z" }),
    ];
    expect(dropOldTombstones(recs, now).map((f) => f.id)).toEqual(["live", "recent"]);
  });
});

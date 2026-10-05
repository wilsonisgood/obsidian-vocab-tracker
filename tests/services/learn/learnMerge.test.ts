import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { TriviaItem } from "../../../src/core/model/trivia";
import {
  dropOldTombstones,
  mergeLearn,
  mergeRecords,
  normalizeLearnShard,
  pickFamily,
} from "../../../src/services/learn/learnMerge";

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

  it("a 重新分群 tombstone never removes a family another device made a word family", () => {
    // Device A: 找字族 merged into family f (now scope "word") on 10-02.
    const word = fam("f", "2026-10-02T00:00:00Z", { scope: "word", seedEntryIds: ["e1"] });
    // Device B still saw f as a grouping and regrouped on 10-03.
    const regrouped = fam("f", "2026-10-03T00:00:00Z", {
      scope: "list",
      deletedAt: "2026-10-03T00:00:00Z",
      deletedBy: "regroup",
    });
    expect(mergeLearn({ families: [word], trivia: [] }, { families: [regrouped], trivia: [] }).families[0]).toBe(word);
    expect(mergeLearn({ families: [regrouped], trivia: [] }, { families: [word], trivia: [] }).families[0]).toBe(word);
    expect(pickFamily(regrouped, word)).toBe(word);
  });

  it("an old device's word family (no scope field, but a seed) is protected the same way", () => {
    const word = fam("f", "2026-10-02T00:00:00Z", { seedEntryIds: ["e1"] });
    const regrouped = fam("f", "2026-10-03T00:00:00Z", { deletedAt: "2026-10-03T00:00:00Z", deletedBy: "regroup" });
    expect(pickFamily(word, regrouped)).toBe(word);
  });

  it("a newer regroup tombstone still wins over a whole-list family, and a user's delete over anything", () => {
    const list = fam("f", "2026-10-02T00:00:00Z", { scope: "list" });
    const regrouped = fam("f", "2026-10-03T00:00:00Z", { deletedAt: "2026-10-03T00:00:00Z", deletedBy: "regroup" });
    expect(pickFamily(list, regrouped)).toBe(regrouped);
    const word = fam("f", "2026-10-02T00:00:00Z", { scope: "word" });
    const userDeleted = fam("f", "2026-10-03T00:00:00Z", { scope: "word", deletedAt: "2026-10-03T00:00:00Z" });
    expect(pickFamily(word, userDeleted)).toBe(userDeleted);
    // An edit made after the regroup wins as usual.
    const edited = fam("f", "2026-10-04T00:00:00Z", { scope: "list", label: "edited" });
    expect(pickFamily(regrouped, edited)).toBe(edited);
  });

  it("normalizes a missing or partial file", () => {
    expect(normalizeLearnShard(null)).toEqual({ families: [], trivia: [], verbs: [] });
    expect(normalizeLearnShard({ families: "oops" })).toEqual({ families: [], trivia: [], verbs: [] });
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

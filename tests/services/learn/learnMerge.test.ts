import { describe, expect, it } from "vitest";
import type { Family } from "../../../src/core/model/family";
import type { Morpheme } from "../../../src/core/model/morpheme";
import type { TriviaItem } from "../../../src/core/model/trivia";
import type { WordMeta } from "../../../src/core/model/wordMeta";
import {
  dedupeMorphemes,
  dropOldTombstones,
  mergeLearn,
  mergeRecords,
  normalizeLearnShard,
  pickFamily,
  pickMorpheme,
  pickWordMeta,
} from "../../../src/services/learn/learnMerge";

function fam(id: string, updatedAt: string, extra: Partial<Family> = {}): Family {
  return { id, topic: id, label: id, source: "ai", groups: [], updatedAt, rev: 1, ...extra };
}

function item(id: string, updatedAt: string, extra: Partial<TriviaItem> = {}): TriviaItem {
  return { id, entryId: "e1", mentions: [], title: id, body: "", updatedAt, rev: 1, ...extra };
}

function morph(id: string, type: Morpheme["type"], form: string, extra: Partial<Morpheme> = {}): Morpheme {
  return {
    id,
    form,
    variants: [],
    type,
    meaningZh: "x",
    origin: `dna:${id}`,
    timeline: [],
    suggested: [],
    source: "ai",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    rev: 1,
    ...extra,
  };
}

function meta(id: string, updatedAt: string, extra: Partial<WordMeta> = {}): WordMeta {
  return { id, updatedAt, rev: 1, ...extra };
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

  it("normalizes a missing or partial file, including an old file with no morphemes/wordMeta", () => {
    const empty = { families: [], trivia: [], verbs: [], morphemes: [], wordMeta: [] };
    expect(normalizeLearnShard(null)).toEqual(empty);
    expect(normalizeLearnShard({ families: "oops" })).toEqual(empty);
    expect(normalizeLearnShard({ families: [], trivia: [], verbs: [] })).toEqual(empty);
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

// 決定 3 (09 §2): verified unconditionally beats unverified.
describe("pickMorpheme", () => {
  it("a verified record wins over an unverified one even when it's older", () => {
    const verified = morph("a", "prefix", "un", { verified: true, updatedAt: "2026-10-01T00:00:00Z" });
    const unverified = morph("a", "prefix", "un", { verified: false, updatedAt: "2026-10-05T00:00:00Z" });
    expect(pickMorpheme(verified, unverified)).toBe(verified);
    expect(pickMorpheme(unverified, verified)).toBe(verified);
  });

  it("falls back to pickNewer when both or neither side is verified", () => {
    const older = morph("a", "prefix", "un", { verified: true, updatedAt: "2026-10-01T00:00:00Z" });
    const newer = morph("a", "prefix", "un", { verified: true, updatedAt: "2026-10-05T00:00:00Z", meaningZh: "y" });
    expect(pickMorpheme(older, newer)).toBe(newer);

    const u1 = morph("a", "prefix", "un", { updatedAt: "2026-10-01T00:00:00Z" });
    const u2 = morph("a", "prefix", "un", { updatedAt: "2026-10-05T00:00:00Z" });
    expect(pickMorpheme(u1, u2)).toBe(u2);
  });

  it("a deleted verified record doesn't override a newer unverified edit", () => {
    const deletedVerified = morph("a", "prefix", "un", {
      verified: true,
      deletedAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
    const edited = morph("a", "prefix", "un", { updatedAt: "2026-10-05T00:00:00Z" });
    expect(pickMorpheme(deletedVerified, edited)).toBe(edited);
  });
});

describe("dedupeMorphemes", () => {
  it("merges two independently-coined morphemes that share a variant (ten vs tin/tain)", () => {
    const a = morph("a", "root", "ten", { variants: ["tain"], createdAt: "2026-10-01T00:00:00Z" });
    const b = morph("b", "root", "tin", { variants: ["tain"], createdAt: "2026-10-02T00:00:00Z" });
    const out = dedupeMorphemes([a, b]);
    const canonical = out.find((m) => !m.mergedInto)!;
    const other = out.find((m) => m.mergedInto)!;
    expect(canonical.id).toBe("a"); // earliest createdAt, neither verified
    expect(other.mergedInto).toBe("a");
    // The absorbed morpheme's own form joins canonical's variants, so a
    // future lookup for "tin" still resolves.
    const keys = canonical.variants.map((v) => v.toLowerCase());
    expect(keys).toContain("tain");
    expect(keys).toContain("tin");
  });

  it("gives the same result regardless of which device's array order it runs on", () => {
    const a = morph("a", "root", "ten", { variants: ["tain"], createdAt: "2026-10-01T00:00:00Z" });
    const b = morph("b", "root", "tin", { variants: ["tain"], createdAt: "2026-10-02T00:00:00Z" });
    const fromA = dedupeMorphemes([a, b]);
    const fromB = dedupeMorphemes([b, a]);
    const norm = (list: Morpheme[]) =>
      [...list]
        .sort((x, y) => x.id.localeCompare(y.id))
        .map((m) => ({ id: m.id, mergedInto: m.mergedInto, variants: [...m.variants].sort() }));
    expect(norm(fromA)).toEqual(norm(fromB));
  });

  it("picks the verified record as canonical even if it was coined later", () => {
    const early = morph("a", "root", "ten", { createdAt: "2026-10-01T00:00:00Z" });
    const verifiedLater = morph("b", "root", "ten", { createdAt: "2026-10-05T00:00:00Z", verified: true });
    const out = dedupeMorphemes([early, verifiedLater]);
    expect(out.find((m) => m.id === "b")!.mergedInto).toBeUndefined();
    expect(out.find((m) => m.id === "a")!.mergedInto).toBe("b");
  });

  it("doesn't touch unrelated morphemes, tombstones or already-redirected records", () => {
    const solo = morph("solo", "suffix", "ing");
    const dead = morph("dead", "root", "ten", { deletedAt: "2026-10-01T00:00:00Z" });
    const redirected = morph("red", "root", "ten", { mergedInto: "elsewhere" });
    const out = dedupeMorphemes([solo, dead, redirected]);
    expect(out).toHaveLength(3);
    expect(out.find((m) => m.id === "solo")).toEqual(solo);
    expect(out.find((m) => m.id === "dead")).toEqual(dead);
    expect(out.find((m) => m.id === "red")).toEqual(redirected);
  });

  it("doesn't change updatedAt on the canonical or the redirected records", () => {
    const a = morph("a", "root", "ten", { variants: ["tain"], updatedAt: "2026-10-01T00:00:00Z" });
    const b = morph("b", "root", "tin", { variants: ["tain"], updatedAt: "2026-10-02T00:00:00Z", createdAt: "2026-10-02T00:00:00Z" });
    const out = dedupeMorphemes([a, b]);
    expect(out.find((m) => m.id === "a")!.updatedAt).toBe("2026-10-01T00:00:00Z");
    expect(out.find((m) => m.id === "b")!.updatedAt).toBe("2026-10-02T00:00:00Z");
  });
});

describe("pickWordMeta", () => {
  it("picks the newer record as the base", () => {
    const older = meta("e1", "2026-10-01T00:00:00Z", { emoji: "📘" });
    const newer = meta("e1", "2026-10-02T00:00:00Z", { emoji: "🦊" });
    expect(pickWordMeta(older, newer).emoji).toBe("🦊");
  });

  it("a user-picked emoji always wins over an AI one, even if the AI one is newer", () => {
    const user = meta("e1", "2026-10-01T00:00:00Z", { emoji: "🦊", emojiSource: "user" });
    const ai = meta("e1", "2026-10-05T00:00:00Z", { emoji: "📘", emojiSource: "ai" });
    expect(pickWordMeta(user, ai)).toMatchObject({ emoji: "🦊", emojiSource: "user" });
    expect(pickWordMeta(ai, user)).toMatchObject({ emoji: "🦊", emojiSource: "user" });
  });

  it("keeps the AI emoji when neither side is a user pick", () => {
    const older = meta("e1", "2026-10-01T00:00:00Z", { emoji: "📘", emojiSource: "ai" });
    const newer = meta("e1", "2026-10-02T00:00:00Z", { emoji: "🦊", emojiSource: "ai" });
    expect(pickWordMeta(older, newer)).toMatchObject({ emoji: "🦊", emojiSource: "ai" });
  });

  it("takes the breakdown with the newer generatedAt, or whichever side has one", () => {
    const withOld = meta("e1", "2026-10-01T00:00:00Z", {
      breakdown: { status: "ok", parts: [], gloss: "a", word: "a", generatedAt: "2026-09-01T00:00:00Z", model: "m" },
    });
    const withNew = meta("e1", "2026-10-02T00:00:00Z", {
      breakdown: { status: "ok", parts: [], gloss: "b", word: "a", generatedAt: "2026-09-05T00:00:00Z", model: "m" },
    });
    expect(pickWordMeta(withOld, withNew).breakdown?.gloss).toBe("b");
    expect(pickWordMeta(withNew, withOld).breakdown?.gloss).toBe("b");

    const noBreakdown = meta("e1", "2026-10-03T00:00:00Z");
    expect(pickWordMeta(withNew, noBreakdown).breakdown?.gloss).toBe("b");
    expect(pickWordMeta(noBreakdown, withNew).breakdown?.gloss).toBe("b");
  });
});

describe("mergeLearn — morphemes and wordMeta", () => {
  it("unions morphemes and wordMeta like the other arrays, and dedupes morphemes", () => {
    const out = mergeLearn(
      { families: [], trivia: [], morphemes: [morph("a", "root", "ten")], wordMeta: [meta("e1", "2026-10-01T00:00:00Z")] },
      {
        families: [],
        trivia: [],
        morphemes: [morph("b", "root", "ten", { createdAt: "2026-10-02T00:00:00Z" })],
        wordMeta: [meta("e2", "2026-10-01T00:00:00Z")],
      }
    );
    expect(out.wordMeta?.map((w) => w.id).sort()).toEqual(["e1", "e2"]);
    // Both devices coined the same morpheme ("ten"/"ten") independently —
    // dedupeMorphemes folds them into one canonical + one redirect.
    expect(out.morphemes?.filter((m) => !m.mergedInto)).toHaveLength(1);
    expect(out.morphemes?.filter((m) => m.mergedInto)).toHaveLength(1);
  });

  it("handles a shard with no morphemes/wordMeta at all (old file)", () => {
    const out = mergeLearn({ families: [], trivia: [] }, { families: [], trivia: [] });
    expect(out.morphemes).toEqual([]);
    expect(out.wordMeta).toEqual([]);
  });
});

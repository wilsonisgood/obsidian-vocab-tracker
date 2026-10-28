import { describe, expect, it } from "vitest";
import { collectShareItems, pickShare, pickShareStyle, rememberShare, shareBrief, shareSubject, SHARE_STYLES, type ShareItem } from "../../../src/core/learner/sharePick";
import type { Thread } from "../../../src/core/model/thread";

const NOW = new Date(2026, 9, 28, 12);
const iso = (m: number, d: number) => new Date(2026, m - 1, d, 9).toISOString();
const para = (id: string, snapshot: string, when: string, o: Partial<Thread> = {}): Thread => ({
  id,
  anchor: { kind: "paragraph", path: "TED/How to learn.md", hash: "h", snapshot },
  turns: [{ id: `${id}u`, role: "user", content: "q", at: when, status: "done" }],
  ...o,
});
const LONG = "[00:01:29] She wore an **apron** while cooking dinner for the whole family.";

describe("collectShareItems", () => {
  it("collects recent paragraphs (cleaned) and words (touched or newly saved) with meanings", () => {
    const items = collectShareItems({
      threads: [para("p1", LONG, iso(10, 25)), para("old", LONG, iso(9, 1)), para("short", "Hi.", iso(10, 26)), para("del", LONG, iso(10, 26), { deletedAt: "x" })],
      entries: [
        { word: "apron", definitionZh: "圍裙", createdAt: iso(10, 27) },
        { word: "Ancient", definitionZh: "古老的", createdAt: iso(8, 1) },
        { word: "gone", definitionZh: "x", createdAt: iso(10, 27), deletedAt: "y" },
      ],
      touches: [
        { word: "apron", day: "2026-10-26", updatedAt: "" },
        { word: "ancient", day: "2026-10-20", updatedAt: "" },
        { word: "ephemeral", day: "2026-10-01", updatedAt: "" },
      ],
      now: NOW,
    });
    expect(items).toEqual([
      { kind: "paragraph", key: "p:p1", title: "How to learn", text: "She wore an apron while cooking dinner for the whole family." },
      { kind: "word", key: "w:apron", word: "apron", meaning: "圍裙" },
      { kind: "word", key: "w:ancient", word: "ancient", meaning: "古老的" },
    ]);
  });
  it("is empty with no material", () => {
    expect(collectShareItems({ threads: [], entries: [], touches: [], now: NOW })).toEqual([]);
  });
});

describe("pickShare", () => {
  const w = (n: string): ShareItem => ({ kind: "word", key: `w:${n}`, word: n });
  const items = ["a", "b", "c", "d", "e", "f", "g"].map(w);
  it("returns null without material", () => {
    expect(pickShare([], [], Math.random)).toBeNull();
  });
  it("avoids the last 5 picks", () => {
    const recent = ["w:a", "w:b", "w:c", "w:d", "w:e"];
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(["w:f", "w:g"]).toContain(pickShare(items, recent, () => r)?.key);
    }
  });
  it("only the newest 5 are avoided, and a small pool is reused", () => {
    expect(pickShare(items, ["w:a", "w:b", "w:c", "w:d", "w:e", "w:f"], () => 0)?.key).toBe("w:a");
    expect(pickShare([w("a")], ["w:a"], () => 0)?.key).toBe("w:a");
  });
  it("tracks recent picks, newest five", () => {
    let r: string[] = [];
    for (const k of ["1", "2", "3", "4", "5", "6", "3"]) r = rememberShare(r, k);
    expect(r).toEqual(["2", "4", "5", "6", "3"]);
  });
  it("briefs a word and a paragraph", () => {
    expect(shareBrief({ kind: "word", key: "w:x", word: "apron", meaning: "圍裙" })).toBe("單字：apron（圍裙）");
    expect(shareBrief({ kind: "word", key: "w:x", word: "apron" })).toBe("單字：apron");
    expect(shareBrief({ kind: "paragraph", key: "p:1", title: "T", text: "Hello there" })).toBe("段落（出自「T」）：\nHello there");
    expect(shareBrief(null)).toBe("");
  });
});

describe("kinds take turns, paragraphs first", () => {
  const w = (n: string): ShareItem => ({ kind: "word", key: `w:${n}`, word: n });
  const p = (n: string): ShareItem => ({ kind: "paragraph", key: `p:${n}`, title: n, text: "x".repeat(30) });
  const mixed = [w("a"), w("b"), p("1"), p("2")];
  it("after a word, a paragraph when there is one", () => {
    for (const r of [0, 0.5, 0.99]) expect(pickShare(mixed, [], () => r, "word")?.kind).toBe("paragraph");
  });
  it("otherwise paragraphs win about 60%", () => {
    expect(pickShare(mixed, [], () => 0.3, "paragraph")?.kind).toBe("paragraph");
    expect(pickShare(mixed, [], () => 0.3)?.kind).toBe("paragraph");
    expect(pickShare(mixed, [], () => 0.7)?.kind).toBe("word");
  });
  it("one kind only: that kind; recent picks still avoided", () => {
    expect(pickShare([w("a")], [], () => 0, "word")?.kind).toBe("word");
    expect(pickShare([p("1"), p("2")], ["p:1"], () => 0, "paragraph")?.key).toBe("p:2");
    expect(pickShare(mixed, ["p:1", "p:2"], () => 0, "word")?.kind).toBe("word");
  });
  it("remembers the subject", () => {
    expect(shareSubject(w("a"))).toBe("a");
    expect(shareSubject(p("Ellis Island"))).toBe("〈Ellis Island〉");
    expect(shareSubject(null)).toBeUndefined();
  });
});

describe("pickShareStyle", () => {
  it("never repeats the last style, and respects scope", () => {
    for (const kind of ["word", "paragraph"] as const) {
      for (const last of SHARE_STYLES.map((s) => s.id)) {
        for (const r of [0, 0.5, 0.99]) {
          const s = pickShareStyle(kind, last, () => r);
          expect(s.id).not.toBe(last);
          expect([ "both", kind ]).toContain(s.scope);
        }
      }
    }
  });
  it("sentence is for words, rephrase for paragraphs", () => {
    const ids = (k: "word" | "paragraph") => new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => pickShareStyle(k, undefined, () => r).id));
    expect(ids("word").has("rephrase")).toBe(false);
    expect(ids("paragraph").has("sentence")).toBe(false);
  });
});

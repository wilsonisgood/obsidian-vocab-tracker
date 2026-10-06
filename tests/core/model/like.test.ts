import { describe, expect, it } from "vitest";
import { examTags, hasExamTag, initialLiked, isListed } from "../../../src/core/model/like";

const KNOWN = ["exam/TOEFL", "exam/IELTS"];

describe("examTags", () => {
  it("matches level entries against the known tags' display label", () => {
    expect(examTags({ level: "TOEFL" }, KNOWN)).toEqual(["exam/TOEFL"]);
  });

  it("matches case-insensitively", () => {
    expect(examTags({ level: "toefl" }, KNOWN)).toEqual(["exam/TOEFL"]);
  });

  it("returns every matching tag when a word has several", () => {
    expect(examTags({ level: "TOEFL, IELTS" }, KNOWN)).toEqual(["exam/TOEFL", "exam/IELTS"]);
  });

  it("ignores a user-typed, non-exam level string", () => {
    expect(examTags({ level: "多益中級" }, KNOWN)).toEqual([]);
  });

  it("returns [] for an empty level", () => {
    expect(examTags({ level: "" }, KNOWN)).toEqual([]);
  });

  it("returns [] when no word lists are loaded", () => {
    expect(examTags({ level: "TOEFL" }, [])).toEqual([]);
  });
});

describe("hasExamTag", () => {
  it("is true when any exam tag is present, enabled or not", () => {
    expect(hasExamTag({ level: "TOEFL" }, KNOWN)).toBe(true);
  });

  it("is false for a word with no exam tag", () => {
    expect(hasExamTag({ level: "多益中級" }, KNOWN)).toBe(false);
  });
});

describe("isListed", () => {
  const on = (enabled: Set<string>) => (tag: string) => enabled.has(tag);

  it("is true when liked, regardless of tags", () => {
    expect(isListed({ level: "", liked: true }, { knownTags: KNOWN, isTagOn: on(new Set()) })).toBe(true);
  });

  it("is true when any of its tags is on", () => {
    const ctx = { knownTags: KNOWN, isTagOn: on(new Set(["exam/TOEFL"])) };
    expect(isListed({ level: "TOEFL", liked: false }, ctx)).toBe(true);
  });

  it("is true when one of several tags is on even if another is off", () => {
    const ctx = { knownTags: KNOWN, isTagOn: on(new Set(["exam/IELTS"])) };
    expect(isListed({ level: "TOEFL, IELTS", liked: undefined }, ctx)).toBe(true);
  });

  it("is false when not liked and every tag is off", () => {
    const ctx = { knownTags: KNOWN, isTagOn: on(new Set()) };
    expect(isListed({ level: "TOEFL", liked: false }, ctx)).toBe(false);
  });

  it("is false when not liked and has no tag at all", () => {
    const ctx = { knownTags: KNOWN, isTagOn: on(new Set(KNOWN)) };
    expect(isListed({ level: "", liked: undefined }, ctx)).toBe(false);
  });
});

describe("initialLiked", () => {
  const noSignals = { hasWordThread: false, hasUsage: false, hasReviewed: false, hasEditedContent: false };

  it("is true for any non-wordlist origin, regardless of signals", () => {
    expect(initialLiked({ origin: undefined }, noSignals)).toBe(true);
    expect(initialLiked({ origin: "family:kitchenware" }, noSignals)).toBe(true);
  });

  it("is false for a plain wordlist import with no AI use, no review, no edits", () => {
    expect(initialLiked({ origin: "wordlist" }, noSignals)).toBe(false);
  });

  it("is true for a wordlist import that has an AI thread", () => {
    expect(initialLiked({ origin: "wordlist" }, { ...noSignals, hasWordThread: true })).toBe(true);
  });

  it("is true for a wordlist import that has generated verb usage", () => {
    expect(initialLiked({ origin: "wordlist" }, { ...noSignals, hasUsage: true })).toBe(true);
  });

  it("is true for a wordlist import that has been reviewed", () => {
    expect(initialLiked({ origin: "wordlist" }, { ...noSignals, hasReviewed: true })).toBe(true);
  });

  it("is true for a wordlist import with edited-content signal set", () => {
    expect(initialLiked({ origin: "wordlist" }, { ...noSignals, hasEditedContent: true })).toBe(true);
  });
});

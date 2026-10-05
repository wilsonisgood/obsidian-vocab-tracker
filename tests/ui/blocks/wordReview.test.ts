import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ setIcon: () => undefined }));

import { getLocale, setLocale, type Locale } from "../../../src/core/i18n";
import { LEFTOVER_STRINGS } from "../../../src/ui/blocks/leftoverStrings";
import { wordOpener } from "../../../src/ui/blocks/learnUi";
import {
  nextReviewText,
  parseCardMode,
  singleReviewMode,
  timingText,
} from "../../../src/ui/blocks/wordReviewModel";
import { makeEntry } from "../../services/srs/fixtures";

let previousLocale: Locale;
beforeAll(() => {
  previousLocale = getLocale();
  setLocale("zh-TW");
});
afterAll(() => setLocale(previousLocale));

const interval = (ms: number) => `${Math.round(ms / 60000)}m`;

describe("one-word review (「複習這個字」)", () => {
  it("parses a remembered card mode, ignoring anything else", () => {
    expect(parseCardMode("cloze")).toBe("cloze");
    expect(parseCardMode("listen")).toBe("listen");
    expect(parseCardMode("bogus")).toBeNull();
    expect(parseCardMode(null)).toBeNull();
  });

  it("opens in the mode last used, unless the word can't be shown that way", () => {
    const withExample = makeEntry({ word: "apron", example: "She tied an apron on." });
    const noExample = makeEntry({ word: "apron" });
    expect(singleReviewMode(withExample, "cloze")).toBe("cloze");
    expect(singleReviewMode(withExample, "zh-en")).toBe("zh-en");
    expect(singleReviewMode(noExample, "listen")).toBe("listen");
    // Cloze needs a sentence that contains the word: 英→中 instead.
    expect(singleReviewMode(noExample, "cloze")).toBe("en-zh");
    expect(singleReviewMode(noExample, null)).toBe("en-zh");
  });

  it("explains what rating now does: new, due, or early", () => {
    expect(timingText({ kind: "new" })).toContain("新字額度");
    expect(timingText({ kind: "due", due: new Date(2026, 9, 5) })).toBe("已到期，照常複習。");
    const early = timingText({ kind: "early", due: new Date(2026, 9, 12, 9) });
    expect(early).toContain("原定 10/12");
    expect(early).toContain("FSRS");
  });

  it("shows the next review as a date, or minutes while still learning", () => {
    const now = new Date(2026, 9, 5, 12, 0, 0);
    expect(nextReviewText(new Date(2026, 9, 5, 12, 10), now, interval)).toBe("下次複習：10m後");
    expect(nextReviewText(new Date(2026, 9, 8, 12, 0), now, interval)).toBe("下次複習：10/08（4320m後）");
  });
});

describe("leftover strings", () => {
  it("has every key in both languages with the same placeholders", () => {
    const zh = LEFTOVER_STRINGS["zh-TW"];
    const en = LEFTOVER_STRINGS.en;
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) expect(vars(en[key])).toEqual(vars(zh[key]));
  });
});

describe("wordOpener", () => {
  it("uses the host's openWordCard when it has one", () => {
    const calls: string[] = [];
    const host = {
      name: "host",
      openWordCard(this: { name: string }, e: { word: string }) {
        calls.push(`${this.name}:${e.word}`);
      },
    };
    const open = wordOpener(host);
    open?.(makeEntry({ word: "apron" }));
    expect(calls).toEqual(["host:apron"]);
  });

  it("is undefined until the host provides it (chips stay plain)", () => {
    expect(wordOpener({})).toBeUndefined();
    expect(wordOpener({ openWordCard: "nope" })).toBeUndefined();
  });
});

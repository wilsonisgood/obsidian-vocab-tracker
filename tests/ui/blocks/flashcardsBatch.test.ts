import { describe, expect, it } from "vitest";
import { CARD_MODES, Rating, type CardMode } from "../../../src/core/model/srs";
import {
  briefMeaning,
  buildBatchRows,
  hiddenFields,
  type BatchState,
  type BatchWord,
} from "../../../src/ui/blocks/flashcardsBatch";

const WORDS: Record<string, BatchWord> = {
  a: { word: "abandon", zh: "放棄" },
  b: { word: "bias", zh: "偏見\n(n.) a tendency" },
  c: { word: "candid", zh: "坦率的" },
  d: { word: "deter", zh: "" },
};
const lookup = (id: string) => WORDS[id];

function state(over: Partial<BatchState> = {}): BatchState {
  return {
    mode: "en-zh",
    session: ["a", "b", "c", "d"],
    results: [],
    index: 0,
    flipped: false,
    phase: "card",
    newIds: new Set(["c", "d"]),
    ...over,
  };
}

// Mid-session: a rated, b on screen, c and d still to come.
const mid = (mode: CardMode, flipped = false) =>
  buildBatchRows(state({ mode, index: 1, flipped, results: [{ id: "a", rating: Rating.Hard }] }), lookup);

describe("buildBatchRows — status", () => {
  it("lists every card in session order with rated / current / pending", () => {
    const rows = mid("en-zh");
    expect(rows.map((r) => [r.id, r.status, r.rating])).toEqual([
      ["a", "rated", Rating.Hard],
      ["b", "current", undefined],
      ["c", "pending", undefined],
      ["d", "pending", undefined],
    ]);
  });

  it("marks new vs due from the session-start snapshot", () => {
    expect(mid("en-zh").map((r) => r.isNew)).toEqual([false, false, true, true]);
  });

  it("skips words deleted since the session started", () => {
    const rows = buildBatchRows(state({ session: ["a", "gone", "c"] }), lookup);
    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("uses the latest rating when an id was rated twice", () => {
    const rows = buildBatchRows(
      state({
        index: 1,
        results: [
          { id: "a", rating: Rating.Again },
          { id: "a", rating: Rating.Good },
        ],
      }),
      lookup
    );
    expect(rows[0].rating).toBe(Rating.Good);
  });

  it("has no current card on the done screen and reveals everything rated", () => {
    const results = (["a", "b", "c", "d"] as const).map((id, i) => ({ id, rating: (i + 1) as Rating }));
    for (const mode of CARD_MODES) {
      const rows = buildBatchRows(state({ mode, phase: "done", index: 4, results }), lookup);
      expect(rows.every((r) => r.status === "rated")).toBe(true);
      expect(rows.map((r) => r.rating)).toEqual([1, 2, 3, 4]);
      expect(rows.map((r) => r.word)).toEqual(["abandon", "bias", "candid", "deter"]);
      expect(rows.map((r) => r.zh)).toEqual(["放棄", "偏見", "坦率的", null]);
    }
  });
});

describe("buildBatchRows — never leaks the answer", () => {
  it("en-zh: shows words but hides the meaning until answered", () => {
    const rows = mid("en-zh");
    expect(rows.map((r) => r.word)).toEqual(["abandon", "bias", "candid", "deter"]);
    expect(rows.map((r) => r.zh)).toEqual(["放棄", null, null, null]);
  });

  it("zh-en: shows meanings but hides the English until answered", () => {
    const rows = mid("zh-en");
    expect(rows.map((r) => r.word)).toEqual(["abandon", null, null, null]);
    expect(rows.map((r) => r.zh)).toEqual(["放棄", "偏見", "坦率的", null]);
  });

  it("cloze: hides the word (the blank's answer), keeps the zh hint", () => {
    const rows = mid("cloze");
    expect(rows.map((r) => r.word)).toEqual(["abandon", null, null, null]);
    expect(rows.map((r) => r.zh)).toEqual(["放棄", "偏見", "坦率的", null]);
  });

  it("listen: hides both spelling and meaning until answered", () => {
    const rows = mid("listen");
    expect(rows.map((r) => r.word)).toEqual(["abandon", null, null, null]);
    expect(rows.map((r) => r.zh)).toEqual(["放棄", null, null, null]);
  });

  it("reveals the current card once flipped, but not the ones after it", () => {
    for (const mode of CARD_MODES) {
      const rows = mid(mode, true);
      expect(rows[1]).toMatchObject({ status: "current", word: "bias", zh: "偏見" });
      if (hiddenFields(mode).word) expect(rows[2].word).toBeNull();
      if (hiddenFields(mode).zh) expect(rows[2].zh).toBeNull();
    }
  });

  it("hides the first card before anything is rated", () => {
    const rows = buildBatchRows(state({ mode: "listen" }), lookup);
    expect(rows[0]).toMatchObject({ status: "current", word: null, zh: null });
  });

  it("hides at least one field in every mode", () => {
    for (const mode of CARD_MODES) {
      const h = hiddenFields(mode);
      expect(h.word || h.zh).toBe(true);
    }
  });
});

describe("briefMeaning", () => {
  it("keeps only the first line, trimmed", () => {
    expect(briefMeaning("  偏見 \n(n.) a tendency")).toBe("偏見");
    expect(briefMeaning(undefined)).toBe("");
  });
});

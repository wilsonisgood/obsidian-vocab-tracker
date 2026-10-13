import { describe, expect, it } from "vitest";
import type { VocabEntry } from "../../../../src/core/model/entry";
import {
  parseVocabMode,
  pickScenarioEntries,
  pickVocabRefs,
  vocabScenarioRequest,
  vocabScopeIds,
} from "../../../../src/ui/blocks/practice/vocabFilterModel";

const now = new Date("2026-10-13T12:00:00Z");
function e(id: string, over: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id, word: id, level: "", synonyms: "", antonyms: "", example: "", definition: "", definitionZh: "意思",
    phonetic: "", partOfSpeech: "n.", grammar: "", source: null, added: "2026-10-01 10:00:00", lastReviewed: "",
    reviews: 0, liked: true, ...over,
  } as VocabEntry;
}
const reviewed = (due: string) => ({ srs: { state: 2, due } }) as Partial<VocabEntry>;

describe("pickScenarioEntries", () => {
  it("due first (oldest due), then newest added", () => {
    const list = [
      e("old", { added: "2026-09-01 10:00:00" }),
      e("new", { added: "2026-10-10 10:00:00" }),
      e("dueLate", reviewed("2026-10-12T00:00:00Z")),
      e("dueEarly", reviewed("2026-10-01T00:00:00Z")),
      e("future", { ...reviewed("2026-12-01T00:00:00Z"), added: "2026-10-12 10:00:00" }),
    ];
    expect(pickScenarioEntries(list, {}, now).map((x) => x.id)).toEqual(["dueEarly", "dueLate", "future", "new", "old"]);
  });
  it("caps at 12 and skips no-Chinese / unliked / deleted", () => {
    const list = Array.from({ length: 20 }, (_, i) => e(`w${i}`));
    expect(pickScenarioEntries(list, {}, now)).toHaveLength(12);
    const few = [e("a", { definitionZh: " " }), e("b", { liked: false }), e("c", { deletedAt: "x" }), e("d")];
    expect(pickScenarioEntries(few, {}, now).map((x) => x.id)).toEqual(["d"]);
  });
  it("applies the pos filter; status 'new' keeps only new cards", () => {
    const list = [e("n1"), e("v1", { partOfSpeech: "v." }), e("r", reviewed("2026-10-01T00:00:00Z"))];
    expect(pickScenarioEntries(list, { pos: ["v."] }, now).map((x) => x.id)).toEqual(["v1"]);
    expect(pickScenarioEntries(list, { status: ["new"] }, now).map((x) => x.id)).toEqual(["n1", "v1"]);
  });
});

describe("vocabScopeIds (第十八波 T)", () => {
  it("covers every matching word, not just the 12 sent, and ignores review order", () => {
    const list = Array.from({ length: 20 }, (_, i) => e(`w${i}`, { added: `2026-10-01 10:00:${String(i).padStart(2, "0")}` }));
    const a = vocabScopeIds(list, {}, now);
    expect(a.size).toBe(20);
    expect(pickScenarioEntries(list, {}, now)).toHaveLength(12);
    // A review pushes a card's due date; the scope stays the same.
    const reviewedList = list.map((x, i) => (i === 3 ? { ...x, ...reviewed("2026-12-01T00:00:00Z") } : x));
    expect([...vocabScopeIds(reviewedList, {}, now)].sort()).toEqual([...a].sort());
  });
  it("still honours the filter and skips no-Chinese words", () => {
    const list = [e("n1"), e("v1", { partOfSpeech: "v." }), e("z", { definitionZh: "" })];
    expect([...vocabScopeIds(list, { pos: ["v."] }, now)]).toEqual(["v1"]);
    expect([...vocabScopeIds(list, {}, now)].sort()).toEqual(["n1", "v1"]);
  });
});

describe("refs and request", () => {
  it("maps fields; needs 3 words", () => {
    const refs = pickVocabRefs([e("a", { word: "apple", definitionZh: " 蘋果 ", partOfSpeech: "n." })], {}, now);
    expect(refs).toEqual([{ id: "a", word: "apple", zh: "蘋果", pos: "n." }]);
    expect(vocabScenarioRequest(refs)).toBeNull();
    const three = pickVocabRefs([e("a"), e("b"), e("c")], {}, now);
    expect(vocabScenarioRequest(three)).toMatchObject({ track: "vocab" });
  });
  it("parses the mode", () => {
    expect(parseVocabMode("scenario")).toBe("scenario");
    expect(parseVocabMode(null)).toBe("cards");
  });
});

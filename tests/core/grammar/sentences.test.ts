import { describe, expect, it } from "vitest";
import { isUsableSentence, patternWords, pickSentence, splitSentences, topicSentences } from "../../../src/core/grammar/sentences";
import type { GrammarSighting } from "../../../src/core/model/grammar";

const TOPIC = "present-perfect-vs-past";

function sighting(snapshot: string, extra: Partial<GrammarSighting> = {}): GrammarSighting {
  return { topicId: TOPIC, threadId: "t", turnId: "a", path: "Notes/Read.md", snapshot, at: "2026-10-01T00:00:00Z", ...extra };
}

const LOST = "I have lost my keys and I cannot get into the house tonight.";
const PAST = "She walked to the station and bought a ticket for the morning train.";

describe("splitSentences", () => {
  it("cuts at sentence ends and ignores abbreviations-free markdown noise", () => {
    expect(splitSentences("**Hello** there. [[Note|How]] are you? Fine!\nStill fine.")).toEqual([
      "Hello there.",
      "How are you?",
      "Fine!",
      "Still fine.",
    ]);
  });
  it("treats a blank line as a break and drops code, images and bullets' markers", () => {
    expect(splitSentences("- First item without an end\n\n```js\nx()\n```\n\n> Quote here.")).toEqual([
      "First item without an end",
      "Quote here.",
    ]);
  });
});

describe("isUsableSentence", () => {
  it("wants 8–40 English words, mostly English", () => {
    expect(isUsableSentence("Too short here.")).toBe(false);
    expect(isUsableSentence(LOST)).toBe(true);
    expect(isUsableSentence(Array.from({ length: 41 }, () => "word").join(" "))).toBe(false);
    expect(isUsableSentence(Array.from({ length: 40 }, () => "word").join(" "))).toBe(true);
    expect(isUsableSentence("這是一個很長的中文句子 with some English words mixed in but mostly Chinese 中文中文中文中文中文中文中文中文中文")).toBe(false);
  });
});

describe("patternWords / pickSentence", () => {
  it("keeps real words of the pattern, not verb-form placeholders", () => {
    expect(patternWords("have done / did")).toEqual(["have", "did"]);
    expect(patternWords("will be doing / will have done")).toEqual(["will", "be", "have"]);
  });
  it("prefers the sentence with the topic's words, then the longer one", () => {
    expect(pickSentence([PAST, LOST], "have done / did")).toBe(LOST);
    const longer = "I have never seen such a big crowd gather in front of this small town hall.";
    expect(pickSentence([LOST, longer], "have done / did")).toBe(longer);
  });
  it("falls back to the longest usable sentence when nothing matches", () => {
    const a = "The weather was quite warm for the time of year in that region.";
    const b = "A very long sentence about nothing in particular that just keeps going on and on.";
    expect(pickSentence(["Short one.", a, b], "xyzzy")).toBe(b);
    expect(pickSentence(["Short one."], "have done")).toBeUndefined();
  });
});

describe("topicSentences", () => {
  it("takes the highlighted sentence when there is a selection", () => {
    const s = sighting(`${PAST} ${LOST}`, { selection: "I have lost my keys" });
    expect(topicSentences([s], TOPIC)).toEqual([{ path: "Notes/Read.md", sentence: LOST }]);
  });
  it("uses a selection that is itself a sentence when the snapshot doesn't hold it", () => {
    const s = sighting("nothing useful here", { selection: LOST });
    expect(topicSentences([s], TOPIC)[0].sentence).toBe(LOST);
  });
  it("falls back to the paragraph when the highlighted sentence is too short", () => {
    const s = sighting(`Wow, it works. ${LOST}`, { selection: "Wow, it works." });
    expect(topicSentences([s], TOPIC)[0].sentence).toBe(LOST);
  });
  it("picks the sentence most likely to show the topic from the snapshot", () => {
    expect(topicSentences([sighting(`${PAST} ${LOST}`)], TOPIC)[0].sentence).toBe(LOST);
  });
  it("only looks at this topic, drops repeats and caps at max (default 3)", () => {
    const mk = (n: number) => `Number ${n} of the sentences that the learner has read in the garden today.`;
    const list = [
      sighting(mk(1), { path: "a.md" }),
      sighting(mk(1), { path: "b.md" }),
      sighting(mk(2), { topicId: "past-simple" }),
      sighting(mk(3)),
      sighting(mk(4)),
      sighting(mk(5)),
    ];
    const out = topicSentences(list, TOPIC);
    expect(out.map((x) => x.sentence)).toEqual([mk(1), mk(3), mk(4)]);
    expect(out[0].path).toBe("a.md");
    expect(topicSentences(list, TOPIC, 1)).toHaveLength(1);
  });
  it("skips a sighting with no usable sentence", () => {
    expect(topicSentences([sighting("Too short.")], TOPIC)).toEqual([]);
    expect(topicSentences([], TOPIC)).toEqual([]);
  });
});

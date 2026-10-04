import { describe, expect, it } from "vitest";
import { resolveIn, type ParagraphAnchor } from "../../../src/services/anchors/ParagraphAnchorService";
import { knownWordsIn, noteTitle, paragraphInput } from "../../../src/services/anchors/paragraphInput";

const NOTE = [
  "---", // 0
  "tags: [eng]", // 1
  "---", // 2
  "# Speech", // 3
  "", // 4
  "Hi. Hello. Hi.", // 5
  "", // 6
  "- first item", // 7
  "", // 8
  "- second item ^vt-list01", // 9
  "", // 10
  "I was wearing a ==glittery== leotard.", // 11
].join("\n");

const anchor = (blockId: string, snapshot: string): ParagraphAnchor => ({
  kind: "paragraph",
  path: "eng/Taylor Swift Speech.md",
  blockId,
  hash: "000000000000",
  snapshot,
});

describe("paragraphInput", () => {
  it("numbers paragraphs like word discussions and points at the anchored one", () => {
    const a = anchor("vt-list01", "- second item");
    const input = paragraphInput(a, resolveIn(NOTE, a), { question: "這是什麼？", selection: "second" });
    expect(input).toEqual({
      article: {
        title: "Taylor Swift Speech",
        paragraphs: ["# Speech", "Hi. Hello. Hi.", "- first item", "- second item", "I was wearing a glittery leotard."],
      },
      paragraphIndex: 3,
      question: "這是什麼？",
      selection: "second",
    });
  });

  it("orphaned threads fall back to the saved snapshot", () => {
    const a = anchor("vt-gone00", "The paragraph as it was.");
    expect(paragraphInput(a, { status: "orphan", reason: "missing-file" })).toEqual({
      article: { title: "Taylor Swift Speech", paragraphs: ["The paragraph as it was."] },
      paragraphIndex: 0,
    });
  });

  it("only sends known words that occur in the focus paragraph", () => {
    const content = "Intro with elated.\n\nI was wearing a ==glittery== leotard. ^p";
    const a = anchor("p", "");
    const input = paragraphInput(a, resolveIn(content, a), { knownWords: ["glittery", "elated", "Leotard", "leotard", " "] });
    expect(input.knownWords).toEqual(["glittery", "Leotard"]);
    expect(knownWordsIn("no matches", ["x"])).toEqual([]);
  });

  it("noteTitle", () => {
    expect(noteTitle("a/b/My Note.md")).toBe("My Note");
    expect(noteTitle("plain")).toBe("plain");
  });
});

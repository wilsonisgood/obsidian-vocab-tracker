import { describe, expect, it } from "vitest";
import { renderDiaryBody, segmentParagraph, splitSentences } from "../../../src/core/diary/segment";

describe("splitSentences", () => {
  it("splits on . ? ! before a capital", () => {
    expect(splitSentences("It rained. Was it cold? Yes! Then we left.")).toEqual(["It rained.", "Was it cold?", "Yes!", "Then we left."]);
  });
  it("does not split abbreviations", () => {
    expect(splitSentences("I met Mr. Smith and Dr. Lee on St. James Street.")).toHaveLength(1);
    expect(splitSentences("Cats vs. Dogs is old. e.g. Fido is fine.")).toEqual(["Cats vs. Dogs is old. e.g. Fido is fine."]);
  });
  it("does not split U.S. or a single capital letter", () => {
    expect(splitSentences("He visited the U.S. Army camp. Then J. Smith came.")).toEqual(["He visited the U.S. Army camp.", "Then J. Smith came."]);
  });
  it("splits after closing quote or bracket", () => {
    expect(splitSentences('She said "go." Then she left (quietly.) Nobody spoke.')).toEqual([
      'She said "go."',
      "Then she left (quietly.)",
      "Nobody spoke.",
    ]);
  });
  it("does not split when the next char is lowercase", () => {
    expect(splitSentences("It cost 3.5 dollars. and then")).toHaveLength(1);
  });
  it("splits before digits and opening quotes", () => {
    expect(splitSentences('It ended. 3 days later. "Hi," he said.')).toEqual(["It ended.", "3 days later.", '"Hi," he said.']);
  });
});

describe("segmentParagraph", () => {
  it("merges sentences of 8 words or fewer into the next", () => {
    const s = "Short one. This second sentence is long enough to stand alone now. Another quite long sentence follows right after it here.";
    expect(segmentParagraph(s)).toEqual([
      "Short one. This second sentence is long enough to stand alone now.",
      "Another quite long sentence follows right after it here.",
    ]);
  });
  it("attaches a short trailing sentence to the previous segment", () => {
    const s = "This opening sentence has more than eight words in it. The end.";
    expect(segmentParagraph(s)).toEqual(["This opening sentence has more than eight words in it. The end."]);
  });
  it("a lone short paragraph stays as one segment", () => {
    expect(segmentParagraph("Hello there.")).toEqual(["Hello there."]);
    expect(segmentParagraph("  ")).toEqual([]);
  });
});

describe("renderDiaryBody", () => {
  it("single paragraph still gets ## with 7-word heading and ellipsis", () => {
    const out = renderDiaryBody(["Yesterday I wandered through the old harbor town again, and it felt new."]);
    expect(out).toBe("## Yesterday I wandered through the old harbor…\n\nYesterday I wandered through the old harbor town again, and it felt new.");
  });
  it("no ellipsis for 7 words or fewer; strips markdown", () => {
    expect(renderDiaryBody(["**Quiet** mornings."]).split("\n")[0]).toBe("## Quiet mornings.");
  });
  it("segments stay inside their own section, blank-line separated", () => {
    const a = "The first paragraph has a fairly long opening sentence here. Another long sentence continues the first paragraph in a nice and steady way.";
    const b = "Second paragraph begins with a decently long sentence as well.";
    const out = renderDiaryBody([a, b]);
    expect(out.split("\n\n")).toEqual([
      "## The first paragraph has a fairly long…",
      "The first paragraph has a fairly long opening sentence here.",
      "Another long sentence continues the first paragraph in a nice and steady way.",
      "## Second paragraph begins with a decently long…",
      b,
    ]);
  });
  it("skips empty paragraphs", () => {
    expect(renderDiaryBody(["", "  "])).toBe("");
  });
});

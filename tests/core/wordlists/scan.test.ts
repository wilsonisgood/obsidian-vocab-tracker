import { describe, expect, it } from "vitest";
import { WordlistIndex } from "../../../src/core/wordlists/WordlistIndex";
import { proseLines, scanMarkdown, segmentText } from "../../../src/core/wordlists/scan";

const index = new WordlistIndex([
  { tag: "TOEFL", words: ["analyze", "data"] },
  { tag: "IELTS", words: ["data"] },
]);
const lookup = (w: string) => index.lookup(w);

describe("segmentText", () => {
  it("splits around list words, keeping the original text", () => {
    const segs = segmentText("We analyzed the data.", lookup)!;
    expect(segs).toEqual([
      "We ",
      { word: "analyzed", tags: ["TOEFL"] },
      " the ",
      { word: "data", tags: ["IELTS", "TOEFL"] },
      ".",
    ]);
    expect(segs.map((s) => (typeof s === "string" ? s : s.word)).join("")).toBe("We analyzed the data.");
  });

  it("returns null when nothing matches", () => {
    expect(segmentText("Nothing here", lookup)).toBeNull();
  });

  it("doesn't match inside longer or hyphenated words", () => {
    expect(segmentText("database big-data", lookup)).toBeNull();
  });
});

describe("proseLines", () => {
  it("drops frontmatter, code, URLs, link targets and comments", () => {
    const md = [
      "---", "title: data", "---",
      "Read `data` here", "```", "data", "```",
      "[label](https://x.com/data) https://data.org [[data note|alias]] %%data%%",
      "start %%", "data", "%% end",
    ].join("\n");
    const text = proseLines(md).join("\n");
    expect(text).not.toMatch(/data/);
    expect(text).toContain("alias");
    expect(text).toContain("end");
  });
});

describe("scanMarkdown", () => {
  const match = (w: string) => index.match(w);

  it("counts distinct list entries and occurrences per tag", () => {
    const r = scanMarkdown("Data, data and more DATA. We analyze it; they analyzed it.", match);
    expect(r.byTag.TOEFL).toEqual({ unique: 2, count: 5 });
    expect(r.byTag.IELTS).toEqual({ unique: 1, count: 3 });
    expect(r.uniqueWords).toBe(8); // data and more we analyze it they analyzed
  });

  it("records each entry once, at its first line and sentence", () => {
    const md = "---\ntitle: x\n---\n# Intro\n\nWe analyzed it. Then the data came.\nMore data.";
    const r = scanMarkdown(md, match);
    expect(r.hits).toEqual([
      { word: "analyze", tags: ["TOEFL"], line: 5, sentence: "We analyzed it." },
      { word: "data", tags: ["IELTS", "TOEFL"], line: 5, sentence: "Then the data came." },
    ]);
  });
});

describe("proseLines line alignment", () => {
  it("keeps one output line per input line", () => {
    const md = "---\na: 1\n---\n```\ncode\n```\n%%\nhidden\n%%\ntext";
    const lines = proseLines(md);
    expect(lines).toHaveLength(md.split("\n").length);
    expect(lines[9]).toBe("text");
  });
});

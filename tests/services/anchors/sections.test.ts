import { describe, expect, it } from "vitest";
import { isAnchorable, noteSections, sectionAt, sectionText } from "../../../src/services/anchors/sections";

const NOTE = [
  "---", // 0
  "tags: [eng]", // 1
  "---", // 2
  "# Title", // 3
  "Intro line right under the heading.", // 4
  "", // 5
  "- one", // 6
  "- two ^vt-aaaaaa", // 7
  "", // 8
  "> quoted", // 9
  "> more", // 10
  "", // 11
  "> [!note] Callout", // 12
  "> inside", // 13
  "", // 14
  "```js", // 15
  "const a = 1;", // 16
  "", // 17
  "```", // 18
  "| a | b |", // 19
  "|---|---|", // 20
  "| 1 | 2 |", // 21
  "", // 22
  "---", // 23
  "", // 24
  "Last paragraph,", // 25
  "two lines.", // 26
].join("\n");

describe("noteSections", () => {
  it("splits like Obsidian's metadataCache sections", () => {
    expect(noteSections(NOTE).map((s) => [s.type, s.lineStart, s.lineEnd])).toEqual([
      ["heading", 3, 3],
      ["paragraph", 4, 4],
      ["list", 6, 7],
      ["blockquote", 9, 10],
      ["callout", 12, 13],
      ["code", 15, 18],
      ["table", 19, 21],
      ["thematicBreak", 23, 23],
      ["paragraph", 25, 26],
    ]);
  });

  it("keeps an unterminated fence as code to the end", () => {
    expect(noteSections("Text\n\n```\ncode\n\nmore").map((s) => s.type)).toEqual(["paragraph", "code"]);
  });

  it("handles CRLF notes", () => {
    const s = noteSections("A\r\nB\r\n\r\nC");
    expect(s.map((x) => [x.lineStart, x.lineEnd, x.text])).toEqual([
      [0, 1, "A\nB"],
      [3, 3, "C"],
    ]);
  });
});

describe("helpers", () => {
  it("anchorable types", () => {
    expect(["paragraph", "list", "blockquote"].every(isAnchorable)).toBe(true);
    expect(["heading", "code", "table", "callout"].some(isAnchorable)).toBe(false);
  });

  it("sectionText / sectionAt", () => {
    expect(sectionText(NOTE, 25, 26)).toBe("Last paragraph,\ntwo lines.");
    expect(sectionAt(noteSections(NOTE), 7)?.type).toBe("list");
    expect(sectionAt(noteSections(NOTE), 5)).toBeUndefined();
  });
});

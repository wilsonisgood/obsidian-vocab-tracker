import { describe, expect, it } from "vitest";
import {
  isAnchorable,
  mergedListSections,
  noteSections,
  ownBlockIdLine,
  ownBlockIdText,
  sectionAt,
  sectionText,
} from "../../../src/services/anchors/sections";
import { TAYLOR_SWIFT_EXCERPT } from "../../fixtures/taylorSwiftExcerpt";

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

// 使用者回饋: a long list under a heading (no blank line between them) used
// to become one giant "list" section covering every item.
describe("noteSections — splitting a long list into its items (§5.1 feedback)", () => {
  const sections = noteSections(TAYLOR_SWIFT_EXCERPT);

  it("gives the heading right above the list its own section, not merged into it", () => {
    expect(sectionAt(sections, 10)).toMatchObject({ type: "heading", lineStart: 10, lineEnd: 10 });
  });

  it("splits the long list into one section per top-level item", () => {
    const items = sections.filter((s) => s.lineStart >= 11 && s.lineStart <= 13);
    expect(items.map((s) => [s.type, s.lineStart, s.lineEnd])).toEqual([
      ["list", 11, 11],
      ["list", 12, 12],
      ["list", 13, 13],
    ]);
    expect(items[0].text).toContain("Hi, I'm Taylor.");
    expect(items[1].text).toContain("Chairman of the Board of Trustees");
    expect(items[2].text).toContain("I feel so proud");
  });

  it("stops the split list at the blank line before the next heading", () => {
    const next = sectionAt(sections, 15);
    expect(next).toMatchObject({ type: "heading", lineStart: 15, lineEnd: 15 });
  });

  it("keeps the opening three-line list (short items) as one section", () => {
    const opener = sectionAt(sections, 7);
    expect(opener).toMatchObject({ type: "list", lineStart: 6, lineEnd: 8 });
  });
});

describe("ownBlockIdLine / ownBlockIdText", () => {
  it("is the section's last line for anything but a list", () => {
    const s = { type: "paragraph" as const, lineStart: 2, lineEnd: 3, text: "a\nb" };
    expect(ownBlockIdLine(s)).toBe(3);
    expect(ownBlockIdText(s)).toBe("a\nb");
  });

  it("is a list item's own last line, not a nested sub-item's", () => {
    const s = { type: "list" as const, lineStart: 5, lineEnd: 7, text: "- parent\n  wrapped\n  - child" };
    expect(ownBlockIdLine(s)).toBe(6);
    expect(ownBlockIdText(s)).toBe("- parent\n  wrapped");
  });

  it("every item in the Taylor Swift excerpt is single-line, so it's just lineEnd", () => {
    const sections = noteSections(TAYLOR_SWIFT_EXCERPT);
    const item = sectionAt(sections, 12)!;
    expect(ownBlockIdLine(item)).toBe(item.lineEnd);
  });
});

describe("mergedListSections (舊錨點相容 §5.1 feedback point 5)", () => {
  it("merges contiguous split-list items back into the block an old whole-list anchor was made against", () => {
    const sections = noteSections(TAYLOR_SWIFT_EXCERPT);
    const groups = mergedListSections(sections);
    const group = groups.find((g) => g.section.lineStart === 11)!;
    expect(group).toBeDefined();
    expect(group.section.lineStart).toBe(11); // reported against the first item
    expect(group.text).toBe(sectionText(TAYLOR_SWIFT_EXCERPT, 11, 13));
  });

  it("doesn't merge two separate split lists across the content between them", () => {
    const long = (n: number) => `- ${"x".repeat(n)}`;
    const note = [long(130), long(130), "", "Paragraph.", "", long(130), long(130)].join("\n");
    const sections = noteSections(note);
    expect(sections.map((s) => s.type)).toEqual(["list", "list", "paragraph", "list", "list"]);
    const groups = mergedListSections(sections);
    expect(groups.map((g) => g.section.lineStart)).toEqual([0, 5]);
    expect(groups[0].text).toBe(sections[0].text + "\n" + sections[1].text);
    expect(groups[1].text).toBe(sections[3].text + "\n" + sections[4].text);
  });

  it("reports nothing for a list that was never split", () => {
    expect(mergedListSections(noteSections("- one\n- two"))).toEqual([]);
  });
});

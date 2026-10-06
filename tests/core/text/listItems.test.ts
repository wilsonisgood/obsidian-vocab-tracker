import { describe, expect, it } from "vitest";
import {
  LIST_ITEM_SPLIT_CHARS,
  LIST_TOTAL_SPLIT_CHARS,
  listItemOwnEndIndex,
  shouldSplitList,
  splitListItems,
  stripLinkUrls,
  visibleLength,
} from "../../../src/core/text/listItems";

describe("splitListItems", () => {
  it("splits top-level items, keeping wrapped continuation lines with the item above", () => {
    const lines = ["- one", "  more of one", "- two"];
    expect(splitListItems(lines, 10)).toEqual([
      { lineStart: 10, lineEnd: 11, text: "- one\n  more of one" },
      { lineStart: 12, lineEnd: 12, text: "- two" },
    ]);
  });

  it("keeps a nested sub-item with its parent", () => {
    const lines = ["- parent", "  - child", "- next"];
    expect(splitListItems(lines, 0).map((i) => [i.lineStart, i.lineEnd])).toEqual([
      [0, 1],
      [2, 2],
    ]);
  });

  it("numbers/ordered markers also start a new item", () => {
    expect(splitListItems(["1. first", "2) second"], 0).map((i) => i.text)).toEqual(["1. first", "2) second"]);
  });
});

describe("shouldSplitList", () => {
  it("stays merged when every item is short and the list isn't too long overall", () => {
    expect(shouldSplitList(["- in a stadium this size", "- wearing a leotard.", "- all the trustees"])).toBe(false);
  });

  it("splits when any single item reaches the per-item threshold", () => {
    const short = "- short";
    const long = `- ${"x".repeat(LIST_ITEM_SPLIT_CHARS)}`;
    expect(shouldSplitList([short, long])).toBe(true);
    expect(shouldSplitList([short, `- ${"x".repeat(LIST_ITEM_SPLIT_CHARS - 10)}`])).toBe(false);
  });

  it("splits when no item alone is long but the whole list is", () => {
    const item = `- ${"x".repeat(30)}`; // well under the per-item threshold
    const items = Array.from({ length: Math.ceil(LIST_TOTAL_SPLIT_CHARS / item.length) + 1 }, () => item);
    expect(items.some((i) => i.length >= LIST_ITEM_SPLIT_CHARS)).toBe(false);
    expect(shouldSplitList(items)).toBe(true);
  });

  it("ignores a markdown link's URL when measuring length", () => {
    const url = "https://example.com/" + "a".repeat(200);
    const item = `- [timestamp](${url}) short text`;
    expect(shouldSplitList([item])).toBe(false);
  });
});

describe("listItemOwnEndIndex", () => {
  it("is the item's last line when it has no nested sub-item", () => {
    expect(listItemOwnEndIndex(["- one line only"])).toBe(0);
    expect(listItemOwnEndIndex(["- first", "  continuation"])).toBe(1);
  });

  it("stops before a nested sub-item, not after it", () => {
    expect(listItemOwnEndIndex(["- parent text", "  - child one", "  - child two"])).toBe(0);
    expect(listItemOwnEndIndex(["- parent", "  wrapped continuation", "  - child"])).toBe(1);
  });
});

describe("stripLinkUrls / visibleLength", () => {
  it("drops the (url) part of a markdown link", () => {
    expect(stripLinkUrls("[[00:00:09](https://youtu.be/xyz)] Hi")).toBe("[[00:00:09]] Hi");
    expect(visibleLength("[a](http://example.com)")).toBe(visibleLength("[a]"));
  });
});

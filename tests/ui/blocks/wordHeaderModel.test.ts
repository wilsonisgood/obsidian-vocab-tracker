import { describe, expect, it } from "vitest";
import { hasDictionaryData, headerVisibility, senseLines } from "../../../src/ui/blocks/wordHeaderModel";

describe("headerVisibility (1010-2 W)", () => {
  it("empty entry: nothing but the lookup button", () => {
    const v = headerVisibility({});
    expect(v).toMatchObject({ formOf: null, definition: false, definitionZh: false, infoRows: [], senses: [], showInfo: false, showLookup: true });
  });

  it("shows only filled info rows, in order; blank strings count as empty", () => {
    const v = headerVisibility({ definition: "x", phonetic: "/a/", synonyms: "  ", example: "e.g.", level: "B2" });
    expect(v.infoRows).toEqual(["phonetic", "example", "level"]);
    expect(v.definition).toBe(true);
    expect(v.definitionZh).toBe(false);
    expect(v.showInfo).toBe(true);
    expect(v.showLookup).toBe(false);
  });

  it("level alone does not count as dictionary data but still shows", () => {
    const v = headerVisibility({ level: "B2" });
    expect(v.showLookup).toBe(true);
    expect(v.infoRows).toEqual(["level"]);
  });

  it("formOf and sensesZh", () => {
    const v = headerVisibility({ definition: "d", formOf: " plural of stress ", sensesZh: "n. 壓力、重音；v. 強調" });
    expect(v.formOf).toBe("plural of stress");
    expect(v.senses).toEqual(["n. 壓力、重音", "v. 強調"]);
    expect(v.showInfo).toBe(true);
  });

  it("sensesZh counts as dictionary data", () => {
    expect(hasDictionaryData({ sensesZh: "n. 壓力" })).toBe(true);
    expect(hasDictionaryData({ sensesZh: "" })).toBe(false);
  });
});

describe("senseLines", () => {
  it("splits on ； and ; and drops blanks", () => {
    expect(senseLines("a；b; ；c")).toEqual(["a", "b", "c"]);
    expect(senseLines(undefined)).toEqual([]);
    expect(senseLines("  ")).toEqual([]);
  });
});

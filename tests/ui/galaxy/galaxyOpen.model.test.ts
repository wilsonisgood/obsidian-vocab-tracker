import { describe, expect, it } from "vitest";
import { shouldOpenAsGalaxy } from "../../../src/ui/galaxy/galaxyOpen.model";

describe("shouldOpenAsGalaxy", () => {
  const path = "單字庫/字族樹.md";

  it("markdown 開那個檔案、沒帶 vtRaw：true", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown", state: { file: path } }, path)).toBe(true);
  });

  it("帶 vtRaw: true（⋯ 選單的逃生口）：false", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown", state: { file: path, vtRaw: true } }, path)).toBe(false);
  });

  it("type 不是 markdown：false", () => {
    expect(shouldOpenAsGalaxy({ type: "vocab-galaxy-view", state: { file: path } }, path)).toBe(false);
  });

  it("開的是別的檔案：false", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown", state: { file: "別的筆記.md" } }, path)).toBe(false);
  });

  it("familiesPath 是 null：false", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown", state: { file: path } }, null)).toBe(false);
  });

  it("familiesPath 是空字串：false", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown", state: { file: path } }, "")).toBe(false);
  });

  it("vs 是 null/undefined：false", () => {
    expect(shouldOpenAsGalaxy(null, path)).toBe(false);
    expect(shouldOpenAsGalaxy(undefined, path)).toBe(false);
  });

  it("沒有 state：false", () => {
    expect(shouldOpenAsGalaxy({ type: "markdown" }, path)).toBe(false);
  });
});

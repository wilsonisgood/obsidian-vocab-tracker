import { describe, expect, it, vi } from "vitest";

// isInFolder 不碰任何 Obsidian API，但同一個檔案 import 了 MarkdownView
// （installOpenInPreview 要用），node 環境沒有真的 "obsidian" 套件可解析，
// 所以照其他 ui 測試的做法 stub 掉。
vi.mock("obsidian", () => ({ MarkdownView: class {} }));

import { isInFolder } from "../../../src/ui/reading/openInPreview";

// 1007-2 #3：單字資料夾（含子資料夾）裡的 .md 才算，非 .md、同名前綴資料夾
// （vocab-list2/ 不是 vocab-list/ 的子孫）要排除。

describe("isInFolder", () => {
  it("rejects the bare folder path (not itself a .md file)", () => {
    expect(isInFolder("vocab-list", "vocab-list")).toBe(false); // 沒有 .md 結尾
  });

  it("matches files inside the folder, including the entry files and subfolders", () => {
    expect(isInFolder("vocab-list/vocab-list.md", "vocab-list")).toBe(true); // 入口檔
    expect(isInFolder("vocab-list/字族樹.md", "vocab-list")).toBe(true); // 入口檔
    expect(isInFolder("vocab-list/words/apple.md", "vocab-list")).toBe(true); // 單字頁
    expect(isInFolder("vocab-list/sub/deep/x.md", "vocab-list")).toBe(true);
  });

  it("rejects a same-prefix sibling folder", () => {
    expect(isInFolder("vocab-list2/x.md", "vocab-list")).toBe(false);
  });

  it("rejects non-.md files even inside the folder", () => {
    expect(isInFolder("vocab-list/data.json", "vocab-list")).toBe(false);
    expect(isInFolder("vocab-list/image.png", "vocab-list")).toBe(false);
  });

  it("is case-insensitive on the .md extension", () => {
    expect(isInFolder("vocab-list/X.MD", "vocab-list")).toBe(true);
  });

  it("strips leading/trailing slashes from folder", () => {
    expect(isInFolder("vocab-list/x.md", "/vocab-list/")).toBe(true);
    expect(isInFolder("vocab-list.md", "/vocab-list/")).toBe(false); // 在 folder 外，不是子孫
  });

  it("treats an empty folder as the whole vault", () => {
    expect(isInFolder("anything/anywhere.md", "")).toBe(true);
    expect(isInFolder("top-level.md", "")).toBe(true);
    expect(isInFolder("not-md.json", "")).toBe(false);
  });
});

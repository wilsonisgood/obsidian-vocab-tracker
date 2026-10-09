import { describe, expect, it, vi } from "vitest";

// isInFolder 不碰任何 Obsidian API，但同一個檔案 import 了 MarkdownView
// （installOpenInPreview 要用），node 環境沒有真的 "obsidian" 套件可解析，
// 所以照其他 ui 測試的做法 stub 掉。
vi.mock("obsidian", () => ({ MarkdownView: class {} }));

import { isInFolder, shouldSwitchToPreview } from "../../../src/ui/reading/openInPreview";

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

// 1009 #15: 「重新打開」的判斷不再只看 file-open（漏掉在已經開著的分頁標籤
// 之間切換），改成跟上一個前景 leaf 比——leaf 換了或同一個 leaf 換了檔案
// 都算，同一個 leaf 停在同一個檔案上不算（使用者手動切回編輯模式要保持）。
describe("shouldSwitchToPreview", () => {
  const A = { leafId: "leaf-a", path: "vocab-list/a.md" };
  const B = { leafId: "leaf-a", path: "vocab-list/b.md" };
  const OTHER_LEAF = { leafId: "leaf-b", path: "vocab-list/a.md" };

  it("no previous leaf recorded (first file-open ever) counts as a reopen", () => {
    expect(shouldSwitchToPreview(null, A, "vocab-list")).toBe(true);
  });

  it("a different leaf becoming the foreground counts as a reopen, even on the same file", () => {
    expect(shouldSwitchToPreview(A, OTHER_LEAF, "vocab-list")).toBe(true);
  });

  it("the same leaf switching to a different file counts as a reopen", () => {
    expect(shouldSwitchToPreview(A, B, "vocab-list")).toBe(true);
  });

  it("the same leaf staying on the same file does not count as a reopen (a manual switch to edit mode sticks)", () => {
    expect(shouldSwitchToPreview(A, A, "vocab-list")).toBe(false);
    expect(shouldSwitchToPreview(A, { ...A }, "vocab-list")).toBe(false); // new object, same values
  });

  it("outside the folder never switches, reopen or not", () => {
    const outside = { leafId: "leaf-a", path: "elsewhere/a.md" };
    expect(shouldSwitchToPreview(null, outside, "vocab-list")).toBe(false);
    expect(shouldSwitchToPreview(OTHER_LEAF, outside, "vocab-list")).toBe(false);
  });
});

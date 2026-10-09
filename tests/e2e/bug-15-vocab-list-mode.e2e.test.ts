// (1009 #16) #15 重現：vocab-list 頁面沒有進閱讀模式。
//
// 第一段的結論（詳見回報，已確認重現，根因有明確證據）：
// src/ui/reading/openInPreview.ts 的 installOpenInPreview() 只在
// `workspace.on("file-open", ...)` 時，用 `getActiveViewOfType(MarkdownView)`
// 找「剛剛打開這個檔案的那個 view」——如果檔案是在一個「還沒成為 active leaf」的
// leaf 裡打開的（例如用 `workspace.getLeaf("tab")` 開一個新分頁、但沒有把它設成
// active leaf），`getActiveViewOfType` 拿到的其實是原本那個 active leaf 的 view，
// `view.file?.path !== file.path` 一定不相等，整個 handler 直接 return，新分頁那個
// leaf 永遠不會被切到 preview（reading）mode，就這樣卡在 source（編輯）mode。
//
// 真實對應場景：在 vocab-list/ 的檔案裡用「在新分頁開啟」開另一個 vocab-list 檔案
// （例如右鍵選單、或某些點連結的方式不會讓新分頁立刻搶走焦點）。
//
// 第一次開啟（同一個 leaf，active）跟「點連結換掉目前 active leaf 的內容」這兩種情況
// 經測試都是正常的（見 OPEN1／OPEN2 在回報裡的紀錄）——問題只在「新分頁」這個情況。
//
// 這裡用 it.fails：目前（2.0.0、以及整合前的程式碼）這個斷言會失敗，印證 bug 存在；
// 等 S／其他任務把 installOpenInPreview 改成不只看 active leaf 之後，這個斷言應該會
// 變成通過，it.fails 本身就會失敗並提示「把這裡改回普通 it()」。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, startSession, type E2eSession } from "./lib/setup";
import { screenshotPath } from "./lib/launcher";

const PORT = 9343;

describe("#15 vocab-list 頁面自動進閱讀模式", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("第一次開啟 vocab-list.md（同一個 active leaf）會自動進 preview mode", async () => {
    const mode = await session.cdp.evaluate<string>(`(async () => {
      await app.workspace.openLinkText("vocab-list/vocab-list.md", "", false);
      await new Promise((r) => setTimeout(r, 500));
      return app.workspace.activeLeaf.view.getMode?.();
    })()`);
    expect(mode).toBe("preview");
  });

  it("在 vocab-list 檔案裡點連結換到另一個 vocab-list 檔案（同一個 leaf）也會自動進 preview mode", async () => {
    const mode = await session.cdp.evaluate<string>(`(async () => {
      await app.workspace.openLinkText("Word DNA", "vocab-list/vocab-list.md", false);
      await new Promise((r) => setTimeout(r, 500));
      return app.workspace.activeLeaf.view.getMode?.();
    })()`);
    expect(mode).toBe("preview");
  });

  it.fails(
    "開新分頁看另一個 vocab-list 檔案，那個分頁也該自動進 preview mode（目前不會 —— #15 本體）",
    async () => {
      const mode = await session.cdp.evaluate<string>(`(async () => {
        const leafB = app.workspace.getLeaf("tab");
        await leafB.openFile(app.vault.getAbstractFileByPath("vocab-list/vocab-list.md"));
        await new Promise((r) => setTimeout(r, 500));
        return leafB.view.getMode?.();
      })()`);
      await session.cdp.screenshot(screenshotPath("bug15-newtab-stuck-in-source.png"));
      // 目前量到的實際值是 "source"（編輯模式）；正確行為應該是 "preview"。
      expect(mode).toBe("preview");
    }
  );
});

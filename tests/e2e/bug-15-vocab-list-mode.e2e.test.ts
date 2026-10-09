// (1009 #16 第二段) #15：vocab-list 頁面沒有進閱讀模式。
//
// 第一段發現：用 `workspace.getLeaf("tab")` 開新分頁時沒切閱讀模式。第二段追查
// 到三層一起疊加的根因（詳細記錄見 src/ui/reading/openInPreview.ts 的
// 1009 #16 第二段註解）：
// 1. `{active:false}` 在這個 Obsidian 版本（1.14.4）並不會真的讓新分頁停在背景
//    ——`getLeaf("tab")` 本身就會讓新分頁立刻變成 activeLeaf，過程中
//    activeLeaf 還會在原本那個 leaf／新分頁之間閃爍幾次，{active:false} 對這個
//    行為沒有影響（找不到能讓新分頁真的「先不前景化」的 API，等同於真實使用者
//    「在新分頁開啟」的操作感覺——新分頁一開就是前景）。
// 2. 我們的 file-open／active-leaf-change handler 在 Obsidian 自己「打開檔案」
//    內部流程還沒收尾時就被同步呼叫，當時呼叫 setViewState({mode:"preview"})
//    會先成功、但 Obsidian 收尾時晚一步又蓋回 "source"。
// 3. 收尾換掉的其實是 leaf.view 這個物件本身（新分頁第一次真正渲染完成會重建
//    view instance）。
// openInPreview.ts 現在改成輪詢重試（最多 1 秒），拿掉 it.fails，照新語意驗證：
// - 開新分頁看另一個 vocab-list 檔案，會自動進 preview mode（跟同 leaf 換檔案
//   同一套邏輯，只是這次是全新的 leaf）
// - 兩個已開的 vocab-list 分頁互相切換，都會回到 preview
// - 同一分頁手動切回 source 後，只要沒有再變成「重新前景化」，不會被切回 preview
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

  it("開新分頁看另一個 vocab-list 檔案，那個分頁也會自動進 preview mode", async () => {
    const mode = await session.cdp.evaluate<string>(`(async () => {
      window.__vtLeafB = app.workspace.getLeaf("tab");
      await window.__vtLeafB.openFile(app.vault.getAbstractFileByPath("vocab-list/vocab-list.md"));
      await new Promise((r) => setTimeout(r, 800)); // 給 openInPreview.ts 的輪詢重試機會跑完
      return window.__vtLeafB.view.getMode?.();
    })()`);
    await session.cdp.screenshot(screenshotPath("bug15-newtab-foregrounded.png"));
    expect(mode).toBe("preview");
  });

  it("在兩個已開的 vocab-list 分頁之間切換，前景那個都會回到 preview", async () => {
    const result = await session.cdp.evaluate<string>(`(async () => {
      // 延續上一個 it：目前前景是 __vtLeafB（vocab-list.md，已是 preview）。
      // leafA 是最早那個 active leaf（之前的 OPEN1/OPEN2 測試把它導到了
      // Word DNA.md），用 getLeavesOfType 找回它，不靠變數跨 it 傳遞。
      const mdLeaves = app.workspace.getLeavesOfType("markdown");
      const leafA = mdLeaves.find((l) => l !== window.__vtLeafB && l.view?.file?.path === "vocab-list/Word DNA.md");
      const leafB = window.__vtLeafB;
      if (!leafA || !leafB) throw new Error("找不到兩個分頁");

      app.workspace.setActiveLeaf(leafA, { focus: true });
      await new Promise((r) => setTimeout(r, 400));
      const modeA = leafA.view.getMode?.();

      app.workspace.setActiveLeaf(leafB, { focus: true });
      await new Promise((r) => setTimeout(r, 400));
      const modeB = leafB.view.getMode?.();
      return JSON.stringify({ modeA, modeB });
    })()`);
    const { modeA, modeB } = JSON.parse(result) as { modeA: string; modeB: string };
    expect(modeA).toBe("preview");
    expect(modeB).toBe("preview");
  });

  it("同一分頁手動切回 source 後，只要沒重新前景化就不會被切回 preview", async () => {
    const result = await session.cdp.evaluate<string>(`(async () => {
      const leafB = window.__vtLeafB; // 目前前景、preview
      const viewState = leafB.getViewState();
      await leafB.setViewState({ ...viewState, state: { ...viewState.state, mode: "source" } });
      await new Promise((r) => setTimeout(r, 600)); // 沒有任何 leaf 切換事件發生
      return leafB.view.getMode?.();
    })()`);
    expect(result).toBe("source");
  });
});

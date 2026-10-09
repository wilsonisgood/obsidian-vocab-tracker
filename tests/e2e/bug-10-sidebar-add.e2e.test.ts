// (1009 #16) #10 重現：閱讀模式加字後側欄沒馬上出現。
//
// 第一段的結論（詳見回報）：在側欄已開啟、或側欄從沒開過（冷啟動，第一次點字才觸發
// plugin.surfaces.revealWord -> activateSidebar）兩種情況下，用「文中點字 ->
// VocabSidebarView.setWord() 設 pendingWord -> 側欄畫出「＋ 加入單字庫」橫幅 -> 點
// 橫幅按鈕（跟使用者點的是同一個 DOM 節點）」這條真實路徑，側欄都在 ~100ms 內（下一個
// microtask/tick）正確顯示新列，banner 正確消失，之後也沒有再消失。在 2.0.0 build
// （git show 6181d5f）跟 worktree 目前的 build 上結果一樣。
//
// 这个測試先斷言「現在觀察到的（看起來正確的）行為」當迴歸測試。如果之後找到更精確
// 的重現步驟（例如真的用滑鼠點文字、或某個 exam 標籤組合、或非常快速連續加兩個字），
// 另外補一個 it.fails 並在回報更新根因。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, openSidebarReady, startSession, type E2eSession } from "./lib/setup";
import { screenshotPath } from "./lib/launcher";

const PORT = 9342;
const TEST_WORD = "ambivalence"; // 真的出現在 Taylor Swift 逐字稿裡的字

describe("#10 閱讀模式加字後側欄即時更新", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
    await openSidebarReady(session);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("本篇：點字 → 側欄橫幅「加入單字庫」→ 側欄列表馬上出現新列（不用手動切換/刷新）", async () => {
    await session.cdp.evaluate(`(async () => {
      const f = app.vault.getAbstractFileByPath("eng/Taylor_Swift_NYU_Speech_Transcript.md");
      await app.workspace.getLeaf(false).openFile(f, { state: { mode: "preview" } });
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    // 「在文中點一個還沒在庫的字」最終會呼叫 sidebarView().setWord(word)，把它設成
    // pendingWord，側欄畫出加入橫幅（VocabSidebarView.ts drawList()）。
    await session.cdp.evaluate(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      plugin.sidebarView().setWord(${JSON.stringify(TEST_WORD)});
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    const hasBannerBefore = await session.cdp.evaluate<boolean>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      return !!plugin.sidebarView().containerEl.querySelector(".vt-sidebar-add-prompt .vt-sidebar-add-btn");
    })()`);
    expect(hasBannerBefore).toBe(true);

    // 真的點橫幅裡的「＋ 加入單字庫」按鈕。
    await session.cdp.evaluate(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const banner = plugin.sidebarView().containerEl.querySelector(".vt-sidebar-add-prompt");
      banner.querySelector(".vt-sidebar-add-btn").click();
      return true;
    })()`);

    // 給一個 tick 讓 addWordToVocab 的 await 鏈跑完（它本身是 async function，
    // click handler 內部有 await），不是等 WRITE_DEBOUNCE_MS。
    await new Promise((r) => setTimeout(r, 200));

    const resultJson = await session.cdp.evaluate<string>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const view = plugin.sidebarView();
      const rowInDom = Array.from(view.containerEl.querySelectorAll(".vt-row-word")).some(
        (el) => el.textContent?.toLowerCase() === ${JSON.stringify(TEST_WORD)}
      );
      const entry = plugin.store.entries.find((e) => e.word.toLowerCase() === ${JSON.stringify(TEST_WORD)});
      return JSON.stringify({ rowInDom, inStore: !!entry, liked: entry?.liked ?? null });
    })()`);
    const result = JSON.parse(resultJson) as { rowInDom: boolean; inStore: boolean; liked: boolean | null };

    await session.cdp.screenshot(screenshotPath("bug10-sidebar-after-add.png"));

    expect(result.inStore).toBe(true);
    expect(result.liked).toBe(true);
    expect(result.rowInDom).toBe(true);
  });
});

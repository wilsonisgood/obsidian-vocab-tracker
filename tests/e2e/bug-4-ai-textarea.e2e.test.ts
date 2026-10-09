// (1009 #16) #4 重現：側欄單字卡的 AI 頁籤沒辦法輸入。
//
// 第一段的結論（詳見回報）：在桌面側欄、用 CDP Input.insertText 逐字打字（含
// MutationObserver 監看 row 有沒有被整個換掉），打字是正常的 —— textarea.value
// 正確累積、document.activeElement 全程是同一個 textarea node、沒有任何 DOM
// mutation。在 2.0.0 build（git show 6181d5f）跟 worktree 目前的 build 上結果一樣。
// vocab-list 總表（dashboard 變體）、iPhone emulateMobile 抽屜兩個環境只做了結構性
// 檢查（dashboard view 有載入、plugin.sheet 存在），還沒真的對著它們的 textarea 打字
// ——時間關係留給下一段。
//
// 這個測試先斷言「桌面側欄打字正常」這個目前觀察到的行為，當成之後的迴歸測試；
// 如果之後哪個環境真的重現了「打不進去」，把對應情境另外補一個 it.fails，並在
// 回報裡更新根因。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, openSidebarReady, startSession, type E2eSession } from "./lib/setup";
import { screenshotPath } from "./lib/launcher";

const PORT = 9341;

async function expandFirstRowAiTab(session: E2eSession): Promise<void> {
  await session.cdp.evaluate(`(() => {
    const plugin = app.plugins.plugins["vocab-tracker"];
    const row = plugin.sidebarView().containerEl.querySelector(".vt-row");
    row.querySelector(".vt-row-arrow").click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  await session.cdp.evaluate(`(() => {
    const plugin = app.plugins.plugins["vocab-tracker"];
    const row = plugin.sidebarView().containerEl.querySelector(".vt-row");
    const tabs = Array.from(row.querySelectorAll(".vt-tabs button.vt-tab"));
    const aiTab = tabs.find((b) => b.textContent?.includes("AI"));
    if (!aiTab) throw new Error("找不到 AI 頁籤按鈕");
    aiTab.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 400));
}

describe("#4 AI 頁籤輸入（桌面側欄）", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
    await openSidebarReady(session);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("展開第一張單字卡、切到 AI 頁籤、用 CDP 逐字打字，textarea 要正確累積文字且不失焦", async () => {
    await expandFirstRowAiTab(session);

    // 掛 MutationObserver，確認打字過程中 row 沒有被整個重新渲染掉（規格要求：
    // 用 MutationObserver 看 textarea 有沒有被換掉）。
    await session.cdp.evaluate(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const row = plugin.sidebarView().containerEl.querySelector(".vt-row");
      window.__vtMutations = [];
      window.__vtObserver = new MutationObserver((muts) => {
        for (const m of muts) window.__vtMutations.push(m.type);
      });
      window.__vtObserver.observe(row, { childList: true, subtree: true });
      window.__vtTextareaRef = row.querySelector(".vt-chat-input");
      return true;
    })()`);

    await session.cdp.focus(".vt-row.is-expanded .vt-chat-input");
    const typed = "logic is fun";
    for (const ch of typed) {
      await session.cdp.insertText(ch);
      await new Promise((r) => setTimeout(r, 80));
    }

    const resultJson = await session.cdp.evaluate<string>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const row = plugin.sidebarView().containerEl.querySelector(".vt-row");
      const textarea = row.querySelector(".vt-chat-input");
      window.__vtObserver.disconnect();
      return JSON.stringify({
        value: textarea ? textarea.value : null,
        sameNode: textarea === window.__vtTextareaRef,
        activeIsTextarea: document.activeElement === textarea,
        mutationCount: window.__vtMutations.length,
      });
    })()`);
    const result = JSON.parse(resultJson) as {
      value: string | null;
      sameNode: boolean;
      activeIsTextarea: boolean;
      mutationCount: number;
    };

    await session.cdp.screenshot(screenshotPath("bug4-sidebar-result.png"));

    expect(result.value).toBe(typed);
    expect(result.sameNode).toBe(true);
    expect(result.activeIsTextarea).toBe(true);
  });
});

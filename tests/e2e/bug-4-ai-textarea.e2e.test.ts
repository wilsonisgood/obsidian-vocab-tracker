// (1009 #16 第二段) #4 重現：側欄單字卡的 AI 畫面沒辦法輸入。
//
// 第一段的結論：桌面側欄用 CDP Input.insertText 逐字打字是正常的。這一段把
// 覆蓋範圍補到規劃書 11 #16 要求的其他環境：vocab-list 總表（dashboard 變體）、
// emulateMobile 的 iPhone 抽屜、AI 回覆抵達的那一刻還在打字、筆記裡先選字再到
// 側欄打字。整合後單字卡底部已經是 footer 左邊的 Info/AI 切換鈕（`.vt-view-toggle`
// ，決定 2），不再是舊的 `.vt-tabs` 頁籤列，第一段留下的選擇器已經失效，這裡一起
// 換掉。
//
// 結論：四個新環境都沒能重現「打不進去」（詳見各 it 的檢查項）。唯一的落差記在
// 下面：桌面 `app.emulateMobile(true)` 這個公開 API 本身只會讓 Obsidian 進入
// isMobile/isTablet（body 加 is-mobile/is-tablet），並不會加 is-phone——
// formFactorOf()（src/ui/mobile/formFactor.ts）判斷出來是 "tablet"，走的其實
// 還是側欄（觸控尺寸變了，但不是 WordSheet 抽屜）。要測到規格講的「iPhone 抽屜」
// （WordSheet／BottomSheet），這裡額外手動幫 body 加 is-phone class 強制切成
// "phone" 表單因子——這不是測試作弊，是因為桌面版 Obsidian 的 emulateMobile 本身
// 就無法只靠公開 API 模擬到 iPhone 專屬的抽屜介面，寫進回報讓主 session 知道。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, openSidebarReady, startSession, type E2eSession } from "./lib/setup";
import { screenshotPath } from "./lib/launcher";

const PORT = 9341;

// 展開第一張卡、切到 AI 畫面（如果還沒在 AI 畫面）。rootExpr 是一段會算出
// 「裝著 .vt-row 的那個容器」的 JS 運算式字串（側欄 containerEl、dashboard 的
// vt-dash、或 sheet 的 root）。每一步都重新用 rootExpr 查 `.vt-row`，不留著
// 舊的 row 參照——WordRow 的 redraw() 是用 row.replaceWith(next) 整個換掉
// DOM，舊參照會變成已經離開文件的死節點。
function switchFirstRowToAiJs(rootExpr: string): string {
  return `(async () => {
    const findRow = () => (${rootExpr}).querySelector(".vt-row");
    let row = findRow();
    if (!row) throw new Error("找不到 .vt-row");
    if (!row.classList.contains("is-expanded")) {
      const arrow = row.querySelector(".vt-row-arrow");
      (arrow ?? row.querySelector(".vt-row-header")).click();
      await new Promise((r) => setTimeout(r, 200));
      row = findRow();
    }
    if (!row.querySelector(".vt-chat-input")) {
      const toggle = row.querySelector(".vt-view-toggle");
      if (!toggle) throw new Error("找不到 .vt-view-toggle");
      toggle.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    return true;
  })()`;
}

describe("#4 AI 畫面輸入", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
    await openSidebarReady(session);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("桌面側欄：展開第一張單字卡、切到 AI 畫面、逐字打字，textarea 要正確累積文字且不失焦、不被整個換掉", async () => {
    await session.cdp.evaluate(
      switchFirstRowToAiJs('app.plugins.plugins["vocab-tracker"].sidebarView().containerEl')
    );

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

  it("vocab-list 總表（dashboard）：展開第一張卡、切到 AI 畫面、打字", async () => {
    await session.cdp.evaluate(`(async () => {
      await app.workspace.openLinkText("vocab-list/vocab-list.md", "", false);
      await new Promise((r) => setTimeout(r, 600)); // 等 preview 進來、vocab-dashboard 的 postprocessor 跑完
      return true;
    })()`);

    await session.cdp.evaluate(switchFirstRowToAiJs('document.querySelector(".vt-dash")'));

    await session.cdp.focus(".vt-dash .vt-row.is-expanded .vt-chat-input");
    const typed = "dashboard typing";
    for (const ch of typed) {
      await session.cdp.insertText(ch);
      await new Promise((r) => setTimeout(r, 60));
    }

    const result = await session.cdp.evaluate<string>(`(() => {
      const textarea = document.querySelector(".vt-dash .vt-row.is-expanded .vt-chat-input");
      return JSON.stringify({
        value: textarea ? textarea.value : null,
        activeIsTextarea: document.activeElement === textarea,
      });
    })()`);
    const parsed = JSON.parse(result) as { value: string | null; activeIsTextarea: boolean };
    await session.cdp.screenshot(screenshotPath("bug4-dashboard-result.png"));

    expect(parsed.value).toBe(typed);
    expect(parsed.activeIsTextarea).toBe(true);
  });

  it("emulateMobile 的 iPhone 抽屜：AI 畫面打字（見檔頭說明：額外加 is-phone 才會真的走抽屜）", async () => {
    // app.emulateMobile(true) 會讓目前的 execution context 被換掉一次
    // （量到的真實情況，跟 navigate 類似），這次呼叫本身可能因為
    // "Execution context was destroyed" 丟例外——預期中，吞掉即可，後續
    // evaluate 會在新的 context 上繼續工作。
    try {
      await session.cdp.evaluate(`(() => { app.emulateMobile(true); return true; })()`, 0);
    } catch {
      // 預期中的一次性例外，見上面註解。
    }
    await new Promise((r) => setTimeout(r, 1000));

    await session.cdp.evaluate(`(async () => {
      document.body.classList.add("is-phone"); // 強制 formFactorOf() 判成 "phone"
      const plugin = app.plugins.plugins["vocab-tracker"];
      const entry = plugin.store.entries[0];
      await plugin.sheet.openWord(entry.id, "ai");
      await new Promise((r) => setTimeout(r, 500));
      return true;
    })()`);

    const textareaSelector = ".vt-bottom-sheet .vt-chat-input, .modal .vt-chat-input, .vt-chat-input";
    await session.cdp.focus(textareaSelector);
    const typed = "iphone sheet";
    for (const ch of typed) {
      await session.cdp.insertText(ch);
      await new Promise((r) => setTimeout(r, 60));
    }

    const result = await session.cdp.evaluate<string>(`(() => {
      const textarea = document.querySelector(${JSON.stringify(textareaSelector)});
      return JSON.stringify({
        found: !!textarea,
        value: textarea ? textarea.value : null,
        activeIsTextarea: document.activeElement === textarea,
      });
    })()`);
    const parsed = JSON.parse(result) as { found: boolean; value: string | null; activeIsTextarea: boolean };
    await session.cdp.screenshot(screenshotPath("bug4-mobile-sheet-result.png"));

    expect(parsed.found).toBe(true);
    expect(parsed.value).toBe(typed);
    expect(parsed.activeIsTextarea).toBe(true);

    // 收尾：關掉 mobile 模擬，後面的 it 不要被影響。
    try {
      await session.cdp.evaluate(`(() => { document.body.classList.remove("is-phone"); app.emulateMobile(false); return true; })()`, 0);
    } catch {
      // 同上，容忍 context 被換掉一次。
    }
    await new Promise((r) => setTimeout(r, 1000));
  });

  it("monkeypatch AI 回一則假回覆後，textarea 仍可繼續打字、不被換掉", async () => {
    // 回到桌面側欄，重新展開、切到 AI（上一個 it 動過 mobile 模擬，重新確保狀態）。
    // 上一個 it 切到的筆記（Taylor_Swift 逐字稿）在「本篇」模式下未必有
    // 任何已追蹤字顯示在列表最上面，改切到「全部」確保一定有列可以展開。
    await session.cdp.evaluate(`(async () => {
      await app.plugins.plugins["vocab-tracker"].activateSidebar();
      return true;
    })()`);
    await session.cdp.evaluate(`(() => {
      const container = app.plugins.plugins["vocab-tracker"].sidebarView().containerEl;
      const allBtn = Array.from(container.querySelectorAll(".vt-sidebar-filter .vt-toggle-btn")).find(
        (b) => !b.classList.contains("is-active")
      );
      allBtn?.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    await session.cdp.evaluate(
      switchFirstRowToAiJs('app.plugins.plugins["vocab-tracker"].sidebarView().containerEl')
    );

    // monkeypatch plugin.ai.complete，讓 threads.askWord 不用打真的 API 就能
    // 立刻拿到一則假回覆（複用 AiRunResult 的形狀）。
    await session.cdp.evaluate(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      plugin.ai.complete = async (req, opt) => {
        opt?.onDelta?.("這是假回覆");
        return {
          text: "這是假回覆",
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
          model: "fake-model",
          stop: "stop",
          transport: "fetch",
          provider: req?.provider ?? "openai",
        };
      };
      return true;
    })()`);

    await session.cdp.focus(".vt-row.is-expanded .vt-chat-input");
    await session.cdp.insertText("先問一題");
    await new Promise((r) => setTimeout(r, 100));

    // 按 Enter 送出（跟真實使用者一樣），等假回覆跑完整個 thread:upsert 流程。
    await session.cdp.dispatchKeyEvent({ type: "rawKeyDown", key: "Enter", code: "Enter" });
    await session.cdp.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter" });
    await new Promise((r) => setTimeout(r, 600));

    const afterReply = await session.cdp.evaluate<string>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const row = plugin.sidebarView().containerEl.querySelector(".vt-row");
      const textarea = row.querySelector(".vt-chat-input");
      const hasReply = row.textContent?.includes("這是假回覆") ?? false;
      return JSON.stringify({
        hasReply,
        textareaExists: !!textarea,
        valueAfterSend: textarea ? textarea.value : null,
      });
    })()`);
    const parsedAfterReply = JSON.parse(afterReply) as {
      hasReply: boolean;
      textareaExists: boolean;
      valueAfterSend: string | null;
    };
    expect(parsedAfterReply.hasReply).toBe(true); // 假回覆真的有被畫出來
    expect(parsedAfterReply.textareaExists).toBe(true); // composer 還在（沒被整段拆掉重建）
    expect(parsedAfterReply.valueAfterSend).toBe(""); // Enter 送出後 input 被清空，這是預期行為

    // 回覆抵達之後，繼續打字應該完全正常。
    await session.cdp.focus(".vt-row.is-expanded .vt-chat-input");
    const typed = "continue typing";
    for (const ch of typed) {
      await session.cdp.insertText(ch);
      await new Promise((r) => setTimeout(r, 50));
    }
    const finalValue = await session.cdp.evaluate<string>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const textarea = plugin.sidebarView().containerEl.querySelector(".vt-row.is-expanded .vt-chat-input");
      return textarea ? textarea.value : null;
    })()`);
    await session.cdp.screenshot(screenshotPath("bug4-after-fake-reply.png"));
    expect(finalValue).toBe(typed);
  });

  it("先在筆記裡選字，再到側欄 AI 畫面打字：選取文字 chip 出現，打字不受影響", async () => {
    await session.cdp.evaluate(`(async () => {
      await app.workspace.openLinkText("eng/Taylor_Swift_NYU_Speech_Transcript", "", false, { state: { mode: "preview" } });
      await new Promise((r) => setTimeout(r, 500));
      return true;
    })()`);

    // 在 reading view 裡選一段真的有文字的段落（第一個 <p>）。
    await session.cdp.evaluate(`(() => {
      const p = document.querySelector('.workspace-leaf-content[data-type="markdown"] .markdown-reading-view p, .workspace-leaf-content[data-type="markdown"] .markdown-preview-view p');
      if (!p || !p.firstChild) throw new Error("找不到可以選的段落");
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 300)); // selectionchange -> SelectionTracker.update()

    await session.cdp.evaluate(`(async () => {
      await app.plugins.plugins["vocab-tracker"].activateSidebar();
      return true;
    })()`);
    await session.cdp.evaluate(
      switchFirstRowToAiJs('app.plugins.plugins["vocab-tracker"].sidebarView().containerEl')
    );

    const hasSelectionChip = await session.cdp.evaluate<boolean>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const row = plugin.sidebarView().containerEl.querySelector(".vt-row.is-expanded");
      const chip = row.querySelector(".vt-chat-selection");
      return !!chip && chip.style.display !== "none" && chip.textContent.trim().length > 0;
    })()`);

    // 這一列的草稿是跨 it 持久的（WordUi.chat.drafts 本來就是設計成記住草稿，
    // 不是 bug）——前一個 it 在同一個 entry 留下的文字先清掉，才能單純比對
    // 這裡自己打的內容。
    await session.cdp.evaluate(`(() => {
      const textarea = document.querySelector(".vt-row.is-expanded .vt-chat-input");
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await session.cdp.focus(".vt-row.is-expanded .vt-chat-input");
    const typed = "with selection";
    for (const ch of typed) {
      await session.cdp.insertText(ch);
      await new Promise((r) => setTimeout(r, 60));
    }

    const result = await session.cdp.evaluate<string>(`(() => {
      const plugin = app.plugins.plugins["vocab-tracker"];
      const textarea = plugin.sidebarView().containerEl.querySelector(".vt-row.is-expanded .vt-chat-input");
      return JSON.stringify({
        value: textarea ? textarea.value : null,
        activeIsTextarea: document.activeElement === textarea,
      });
    })()`);
    const parsed = JSON.parse(result) as { value: string | null; activeIsTextarea: boolean };
    await session.cdp.screenshot(screenshotPath("bug4-selection-then-type.png"));

    expect(hasSelectionChip).toBe(true);
    expect(parsed.value).toBe(typed);
    expect(parsed.activeIsTextarea).toBe(true);
  });
});

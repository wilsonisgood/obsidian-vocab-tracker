// (1009 #16) e2e 矩陣：加入／like／取消 like 在各頁面的一致性。
//
// 範圍依主 session 中途縮小（見回報「不確定／沒做」）：原規劃書 11 §16／派工
// prompt 要求 9 個環境，實際只測 4 個「like 邏輯真的不同」的環境：
//   ① 閱讀模式點字 + 側欄本篇（預覽卡：關掉不留資料、按 ♡ = 加入且 liked:true）
//   ② 字族樹星系（節點 ♡，決定 4／#8）
//   ③ vocab-list 總表（dashboard，沒有「加入」入口，只測 like/取消 like）
//   ④ iPhone 抽屜（is-phone，WordSheet 的預覽卡）
// 拿掉的環境（側欄全部、字族樹清單、Word DNA、單字頁）跟上面共用同一套
// WordRow／pageGroups／FamilyService 元件，風險低，略過不測。
//
// 整個矩陣只開一次 Obsidian（known flaky: 短時間內重開多次 openSidebarReady
// 容易卡滿 timeout，見 tests/e2e/lib/setup.ts）。每個環境結束後用 plugin
// API 把動到的 entry 復原（刪掉這次新加的、liked 狀態改回去），不重啟。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, openSidebarReady, startSession, type E2eSession } from "./lib/setup";

const PORT = 10042;

// ── 小工具：store 側的查詢／復原，全部走 plugin API ────────────────────
async function entryInfo(
  session: E2eSession,
  word: string
): Promise<{ exists: boolean; liked: boolean | null; id: string | null; level: string | null }> {
  const json = await session.cdp.evaluate<string>(`(() => {
    const plugin = app.plugins.plugins["vocab-tracker"];
    const e = plugin.store.entries.find((x) => x.word.toLowerCase() === ${JSON.stringify(word.toLowerCase())});
    return JSON.stringify({ exists: !!e, liked: e ? e.liked : null, id: e ? e.id : null, level: e ? e.level : null });
  })()`);
  return JSON.parse(json);
}

// 這個字在這個環境測試開始前本來就不在庫：測完後直接刪掉（soft-delete，
// store.entries 不會再看到），讓下一個環境拿到乾淨的 fixture 狀態。
async function deleteIfExists(session: E2eSession, word: string): Promise<void> {
  await session.cdp.evaluate(`(async () => {
    const plugin = app.plugins.plugins["vocab-tracker"];
    const e = plugin.store.entries.find((x) => x.word.toLowerCase() === ${JSON.stringify(word.toLowerCase())});
    if (e) await plugin.store.deleteEntry(e.id);
    return true;
  })()`);
}

// 這個字原本就在庫，只是 liked 被測試動過：改回原來的值（不刪除）。
async function restoreLiked(session: E2eSession, word: string, liked: boolean): Promise<void> {
  await session.cdp.evaluate(`(async () => {
    const plugin = app.plugins.plugins["vocab-tracker"];
    const e = plugin.store.entries.find((x) => x.word.toLowerCase() === ${JSON.stringify(word.toLowerCase())});
    if (e && e.liked !== ${liked}) await plugin.store.setLiked(e, ${liked});
    return true;
  })()`);
}

describe("#16 e2e 矩陣：加入／like／取消 like", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
    await openSidebarReady(session, 90000); // 這台機器常態高記憶體壓力，拉長 timeout（見 vitest.e2e.config.ts 註解）
  });

  afterAll(async () => {
    await endSession(session);
  });

  // ── ① 閱讀模式點字 + 側欄本篇 ──────────────────────────────────────
  describe("① 閱讀模式點字 + 側欄本篇", () => {
    it("有考試標籤的字（qualified）：關掉不留資料 → 點 ♡ 加入且 liked:true → 取消 like 刪除", async () => {
      const word = "qualified";
      const before = await entryInfo(session, word);
      expect(before.exists).toBe(false);

      // 在逐字稿裡把這個字包成 ==qualified==（模擬使用者手動 highlight），
      // 真的點那個 <mark> 觸發 revealWord，跟 processMarks() 的真實路徑一致。
      // 文件很長，reading view 是漸進渲染／虛擬化（捲到哪才有哪段的 DOM，
      // 捲過去又會被收掉）——一路往下捲，邊捲邊找，找到就停在那裡再點。
      const clicked = await session.cdp.evaluate<boolean>(`(async () => {
        const path = "eng/Taylor_Swift_NYU_Speech_Transcript.md";
        const file = app.vault.getAbstractFileByPath(path);
        const text = await app.vault.read(file);
        if (!/==qualified==/i.test(text)) await app.vault.modify(file, text.replace(/\\bqualified\\b/, "==qualified=="));
        await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
        await new Promise((r) => setTimeout(r, 500));
        const findMark = () => Array.from(document.querySelectorAll(".vt-tracked-mark")).find(
          (m) => m.textContent?.trim().toLowerCase() === "qualified"
        );
        const scroller = document.querySelector(".markdown-reading-view .markdown-preview-view, .markdown-preview-view");
        for (let y = 0; y <= (scroller?.scrollHeight ?? 0); y += 400) {
          if (scroller) scroller.scrollTop = y;
          await new Promise((r) => setTimeout(r, 60));
          if (findMark()) break;
        }
        const mark = findMark();
        if (!mark) return false;
        mark.scrollIntoView();
        await new Promise((r) => setTimeout(r, 60));
        mark.click();
        return true;
      })()`);
      expect(clicked).toBe(true);
      await new Promise((r) => setTimeout(r, 300));

      // 側欄：預覽卡出現，空心 ♡。
      const previewState = await session.cdp.evaluate<string>(`(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        const view = plugin.sidebarView();
        const preview = view.containerEl.querySelector(".vt-sidebar-preview");
        const heart = preview?.querySelector(".vt-row-like");
        return JSON.stringify({ hasPreview: !!preview, heartText: heart?.textContent ?? null });
      })()`);
      expect(JSON.parse(previewState)).toEqual({ hasPreview: true, heartText: "♡" });

      // 關掉（x）不按愛心：store 不留資料（1009-2 #1）。
      await session.cdp.evaluate(`(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        plugin.sidebarView().containerEl.querySelector(".vt-sidebar-preview .vt-close-btn").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 150));
      expect((await entryInfo(session, word)).exists).toBe(false);

      // 重新點字 → 這次按 ♡：加入且 liked:true。
      const clicked2 = await session.cdp.evaluate<boolean>(`(async () => {
        const findMark = () => Array.from(document.querySelectorAll(".vt-tracked-mark")).find(
          (m) => m.textContent?.trim().toLowerCase() === "qualified"
        );
        const scroller = document.querySelector(".markdown-reading-view .markdown-preview-view, .markdown-preview-view");
        let mark = findMark();
        for (let y = 0; !mark && scroller && y <= scroller.scrollHeight; y += 400) {
          scroller.scrollTop = y;
          await new Promise((r) => setTimeout(r, 60));
          mark = findMark();
        }
        if (!mark) return false;
        mark.click();
        return true;
      })()`);
      expect(clicked2).toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      await session.cdp.evaluate(`(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        plugin.sidebarView().containerEl.querySelector(".vt-sidebar-preview .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);
      expect(afterAdd.level).toContain("TOEFL");

      const sidebarRow = await session.cdp.evaluate<boolean>(`(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        const view = plugin.sidebarView();
        return Array.from(view.containerEl.querySelectorAll(".vt-row-word")).some(
          (el) => el.textContent?.toLowerCase() === "qualified"
        );
      })()`);
      expect(sidebarRow).toBe(true);

      // 取消 like：有考試標籤，只取消 like，entry 還在。
      await session.cdp.evaluate(`(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        const view = plugin.sidebarView();
        const row = Array.from(view.containerEl.querySelectorAll(".vt-row")).find(
          (r) => r.querySelector(".vt-row-word")?.textContent?.toLowerCase() === "qualified"
        );
        row.querySelector(".vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));
      const afterUnlike = await entryInfo(session, word);
      expect(afterUnlike.exists).toBe(true);
      expect(afterUnlike.liked).toBe(false);

      await deleteIfExists(session, word); // 復原：這個字本來不在庫。
    });

    it("沒有考試標籤的字（stadium）：加入且 liked:true → 取消 like 直接刪除（可復原的軟刪除）", async () => {
      const word = "stadium";
      expect((await entryInfo(session, word)).exists).toBe(false);

      const clickedStadium = await session.cdp.evaluate<boolean>(`(async () => {
        const path = "eng/Taylor_Swift_NYU_Speech_Transcript.md";
        const file = app.vault.getAbstractFileByPath(path);
        const text = await app.vault.read(file);
        if (!/==stadium==/i.test(text)) await app.vault.modify(file, text.replace(/\\bstadium\\b/, "==stadium=="));
        await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
        await new Promise((r) => setTimeout(r, 500));
        const findMark = () => Array.from(document.querySelectorAll(".vt-tracked-mark")).find(
          (m) => m.textContent?.trim().toLowerCase() === "stadium"
        );
        const scroller = document.querySelector(".markdown-reading-view .markdown-preview-view, .markdown-preview-view");
        let mark = findMark();
        for (let y = 0; !mark && scroller && y <= scroller.scrollHeight; y += 400) {
          scroller.scrollTop = y;
          await new Promise((r) => setTimeout(r, 60));
          mark = findMark();
        }
        if (!mark) return false;
        mark.click();
        return true;
      })()`);
      expect(clickedStadium).toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      await session.cdp.evaluate(`(() => {
        app.plugins.plugins["vocab-tracker"].sidebarView().containerEl.querySelector(".vt-sidebar-preview .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);
      expect(afterAdd.level === "" || afterAdd.level === null).toBe(true);

      await session.cdp.evaluate(`(() => {
        const view = app.plugins.plugins["vocab-tracker"].sidebarView();
        const row = Array.from(view.containerEl.querySelectorAll(".vt-row")).find(
          (r) => r.querySelector(".vt-row-word")?.textContent?.toLowerCase() === "stadium"
        );
        row.querySelector(".vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      // 沒有考試標籤：取消 like 直接刪掉（店 entries 排除 soft-delete）。
      expect((await entryInfo(session, word)).exists).toBe(false);
      // 已經是「不在庫」狀態，跟 fixture 原始狀態一致，不用再復原。
    });
  });

  // ── ② 字族樹星系（節點愛心） ────────────────────────────────────────
  describe("② 字族樹星系（節點愛心）", () => {
    beforeAll(async () => {
      await session.cdp.evaluate(`(async () => {
        await app.workspace.openLinkText("vocab-list/字族樹.md", "", false);
        await new Promise((r) => setTimeout(r, 1000));
        const topic = Array.from(document.querySelectorAll(".vt-gx-topic")).find((b) => /finance/i.test(b.className) || b.textContent?.includes("💰"));
        topic?.click();
        await new Promise((r) => setTimeout(r, 500));
        return true;
      })()`);
    });

    async function clickHeart(word: string): Promise<boolean> {
      return session.cdp.evaluate<boolean>(`(() => {
        const node = Array.from(document.querySelectorAll(".vt-gx-node")).find(
          (n) => n.querySelector(".vt-gx-w")?.textContent?.toLowerCase() === ${JSON.stringify(word.toLowerCase())}
        );
        const heart = node?.querySelector(".vt-gx-heart");
        if (!heart) return false;
        heart.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      })()`);
    }

    async function heartGlyph(word: string): Promise<string | null> {
      return session.cdp.evaluate<string | null>(`(() => {
        const node = Array.from(document.querySelectorAll(".vt-gx-node")).find(
          (n) => n.querySelector(".vt-gx-w")?.textContent?.toLowerCase() === ${JSON.stringify(word.toLowerCase())}
        );
        return node?.querySelector(".vt-gx-heart-glyph")?.textContent ?? null;
      })()`);
    }

    it("有考試標籤的字（revenue，finance 家族）：♡ 加入且 liked:true → 再點取消 like（還在庫）", async () => {
      const word = "revenue";
      expect((await entryInfo(session, word)).exists).toBe(false);
      expect(await clickHeart(word)).toBe(true);
      await new Promise((r) => setTimeout(r, 400));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);
      expect(afterAdd.level).toMatch(/TOEFL|TOEIC|IELTS/);
      expect(await heartGlyph(word)).toBe("♥");

      // 側欄：這個字應該已經不是 vt-page-suggest 建議列了。
      const sidebarAfterAdd = await session.cdp.evaluate<boolean>(`(() => {
        const view = app.plugins.plugins["vocab-tracker"].sidebarView();
        const suggest = view.containerEl.querySelector('.vt-page-suggest[data-word="revenue"]');
        return !suggest;
      })()`);
      expect(sidebarAfterAdd).toBe(true);

      expect(await clickHeart(word)).toBe(true);
      await new Promise((r) => setTimeout(r, 400));
      const afterUnlike = await entryInfo(session, word);
      expect(afterUnlike.exists).toBe(true);
      expect(afterUnlike.liked).toBe(false);
      expect(await heartGlyph(word)).toBe("♡");

      await deleteIfExists(session, word);
    });

    it("沒有考試標籤的字（investment，finance 家族）：♡ 加入且 liked:true → 取消 like 刪除後節點變回建議字", async () => {
      const word = "investment";
      expect((await entryInfo(session, word)).exists).toBe(false);
      expect(await clickHeart(word)).toBe(true);
      await new Promise((r) => setTimeout(r, 400));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);
      expect(await heartGlyph(word)).toBe("♥");

      expect(await clickHeart(word)).toBe(true);
      await new Promise((r) => setTimeout(r, 400));

      // 沒有考試標籤：entry 被刪掉，但節點還在頁面上，變回灰色建議字 ♡（規格 #7）。
      expect((await entryInfo(session, word)).exists).toBe(false);
      expect(await heartGlyph(word)).toBe("♡");

      const sidebarAfterDelete = await session.cdp.evaluate<boolean>(`(() => {
        const view = app.plugins.plugins["vocab-tracker"].sidebarView();
        return !!view.containerEl.querySelector('.vt-page-suggest[data-word="investment"]');
      })()`);
      expect(sidebarAfterDelete).toBe(true); // 側欄的建議列也還在，沒有消失。
    });
  });

  // ── ③ vocab-list 總表（dashboard，沒有「加入」入口） ───────────────
  describe("③ vocab-list 總表", () => {
    beforeAll(async () => {
      await session.cdp.evaluate(`(async () => {
        await app.workspace.openLinkText("vocab-list/vocab-list.md", "", false);
        await new Promise((r) => setTimeout(r, 800));
        return true;
      })()`);
    });

    it("有考試標籤、還沒 like 的字（graduate）：like → 取消 like（因為有標籤，還留在清單上）", async () => {
      const word = "graduate";
      const before = await entryInfo(session, word);
      expect(before.exists).toBe(true);
      expect(before.liked).toBe(false);

      const likeOnce = async () =>
        session.cdp.evaluate<boolean>(`(() => {
          const row = Array.from(document.querySelectorAll(".vt-dash .vt-row")).find(
            (r) => r.querySelector(".vt-row-word")?.textContent?.toLowerCase() === ${JSON.stringify(word)}
          );
          const heart = row?.querySelector(".vt-row-like");
          if (!heart) return false;
          heart.click();
          return true;
        })()`);

      expect(await likeOnce()).toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      expect((await entryInfo(session, word)).liked).toBe(true);

      expect(await likeOnce()).toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      const after = await entryInfo(session, word);
      expect(after.exists).toBe(true); // 有標籤，取消 like 不會刪掉。
      expect(after.liked).toBe(false);

      const stillInDash = await session.cdp.evaluate<boolean>(`(() => Array.from(document.querySelectorAll(".vt-dash .vt-row-word")).some(
        (el) => el.textContent?.toLowerCase() === ${JSON.stringify(word)}
      ))()`);
      expect(stillInDash).toBe(true);
      await restoreLiked(session, word, false); // 已經是原始值，保險起見仍呼叫一次。
    });

    // bug（不修，標 it.fails）：renderDashboard()（src/ui/blocks/dashboard.ts
    // 約 27 行）用 `const allEntries = plugin.store.entries;` 在 codeblock 剛
    // render 時只拿一次快照，之後 drawList()/filteredEntries() 都是過濾這個
    // 舊陣列；isListed() 本身也沒有排除 deletedAt。取消 like 的字如果沒有考試
    // 標籤會被 unlikeEntry 整個刪掉（store.deleteEntry → deletedAt），store
    // 這邊馬上生效（plugin.store.entries 會排除它），但 dashboard 的 DOM 因為
    // 吃的是那份舊快照，那一列還是留著，要整個 codeblock 重新渲染（例如切出
    // 去再切回來）才會消失。重現步驟：vocab-list.md 開著 dashboard，點一個
    // 沒有考試標籤、已經 like 的字的 ♡ 取消 like → store 已刪除，畫面上那一
    // 列還在。
    it.fails("沒有考試標籤、已經 like 的字（ethos）：取消 like 直接從清單消失（軟刪除） → 用 store API 復原", async () => {
      const word = "ethos";
      const before = await entryInfo(session, word);
      expect(before.exists).toBe(true);
      expect(before.liked).toBe(true);
      const id = before.id as string;

      await session.cdp.evaluate(`(() => {
        const row = Array.from(document.querySelectorAll(".vt-dash .vt-row")).find(
          (r) => r.querySelector(".vt-row-word")?.textContent?.toLowerCase() === ${JSON.stringify(word)}
        );
        row.querySelector(".vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      expect((await entryInfo(session, word)).exists).toBe(false);
      await new Promise((r) => setTimeout(r, 500));
      const goneFromDash = await session.cdp.evaluate<boolean>(`(() => !Array.from(document.querySelectorAll(".vt-dash .vt-row-word")).some(
        (el) => el.textContent?.toLowerCase() === ${JSON.stringify(word)}
      ))()`);
      expect(goneFromDash).toBe(true); // 預期失敗：見上面 bug 說明，DOM 不會馬上消失。

      // 復原：soft-delete，store.restoreEntry() 原路復原（不是重新 addEntry）。
      await session.cdp.evaluate(`(async () => {
        await app.plugins.plugins["vocab-tracker"].store.restoreEntry(${JSON.stringify(id)});
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 200));
      const restored = await entryInfo(session, word);
      expect(restored.exists).toBe(true);
      expect(restored.liked).toBe(true);
    });
  });

  // ── ④ iPhone 抽屜（is-phone） ───────────────────────────────────────
  describe("④ iPhone 抽屜（is-phone）", () => {
    beforeAll(async () => {
      await session.cdp.evaluate(`(() => { document.body.classList.add("is-phone"); return true; })()`);
    });
    afterAll(async () => {
      await session.cdp.evaluate(`(() => { document.body.classList.remove("is-phone"); return true; })()`);
    });

    it("有考試標籤的字（navigating）：預覽卡 ♡ 加入且 liked:true → 取消 like（還在庫）", async () => {
      const word = "navigating";
      expect((await entryInfo(session, word)).exists).toBe(false);

      await session.cdp.evaluate(`(async () => {
        await app.plugins.plugins["vocab-tracker"].surfaces.revealWord(${JSON.stringify(word)});
        await new Promise((r) => setTimeout(r, 400));
        return true;
      })()`);

      const previewHeart = await session.cdp.evaluate<string | null>(`(() => {
        const sel = ".vt-sheet .vt-row-like, .modal .vt-row-like";
        return document.querySelector(sel)?.textContent ?? null;
      })()`);
      expect(previewHeart).toBe("♡");

      await session.cdp.evaluate(`(() => {
        document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);
      expect(afterAdd.level).toContain("TOEFL");

      const sheetHeartAfterAdd = await session.cdp.evaluate<string | null>(`(() => document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like")?.textContent ?? null)()`);
      expect(sheetHeartAfterAdd).toBe("♥");

      await session.cdp.evaluate(`(() => {
        document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));
      const afterUnlike = await entryInfo(session, word);
      expect(afterUnlike.exists).toBe(true);
      expect(afterUnlike.liked).toBe(false);

      await deleteIfExists(session, word);
    });

    it("沒有考試標籤的字（board）：預覽卡 ♡ 加入且 liked:true → 取消 like 刪除、回到預覽卡", async () => {
      const word = "board";
      expect((await entryInfo(session, word)).exists).toBe(false);

      await session.cdp.evaluate(`(async () => {
        await app.plugins.plugins["vocab-tracker"].surfaces.revealWord(${JSON.stringify(word)});
        await new Promise((r) => setTimeout(r, 400));
        document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      const afterAdd = await entryInfo(session, word);
      expect(afterAdd.exists).toBe(true);
      expect(afterAdd.liked).toBe(true);

      await session.cdp.evaluate(`(() => {
        document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like").click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      expect((await entryInfo(session, word)).exists).toBe(false);
      // 回到「沒存」的預覽卡：heart 應該變回空心（如果 sheet 還開著）。
      const heartAfterDelete = await session.cdp.evaluate<string | null>(`(() => document.querySelector(".vt-sheet .vt-row-like, .modal .vt-row-like")?.textContent ?? null)()`);
      if (heartAfterDelete !== null) expect(heartAfterDelete).toBe("♡");
    });
  });
});

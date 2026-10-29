// 1030 #4 「複習這篇筆記」的位置（閱讀模式、Live Preview 各一次）＋ #5 標題收合
// 時點側欄單字的定位。只看 DOM／收合狀態，失敗才截圖。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { screenshotPath } from "./lib/launcher";
import { endSession, startSession, type E2eSession } from "./lib/setup";

const PORT = 9355;
const NOTE = "eng/Note review e2e.md";
const BODY = [
  "# Note review",
  "",
  "## Part one",
  "",
  "Sodium is abundant in sea water.",
  "",
  "## Part two",
  "",
  "Grid operators value cheap cells.",
  "",
  "Engineers trade density for cost here.",
  "",
].join("\n");

describe("複習這篇筆記 + 收合定位", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("panel sits under the title in both modes; locating a word inside a folded heading unfolds it", async () => {
    try {
      const r = await session.cdp.evaluate<string>(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const t0 = Date.now();
        while (!app.plugins.plugins["vocab-tracker"]?.noteGlosses) {
          if (Date.now() - t0 > 20000) throw new Error("plugin not ready");
          await sleep(200);
        }
        const plugin = app.plugins.plugins["vocab-tracker"];
        await app.vault.createFolder("eng").catch(() => {});
        const file = await app.vault.create(${JSON.stringify(NOTE)}, ${JSON.stringify(BODY)});
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file, { state: { mode: "preview" } });
        await plugin.addWordToVocab("trade", { sentence: "Engineers trade density for cost here." }, { reveal: false, enrich: false });
        await sleep(1500);
        const view = leaf.view;
        const where = () => {
          const p = view.containerEl.querySelector(".vt-note-review");
          if (!p) return "none";
          const prev = p.previousElementSibling;
          return (p.parentElement?.className.split(" ")[0] ?? "?") + " after " + (prev ? prev.className.split(" ")[0] : "(first)");
        };
        const reading = where();
        await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "source", source: false } });
        await sleep(1200);
        const live = where();

        // Open it: two tabs.
        view.containerEl.querySelector(".vt-note-review .vt-nr-head")?.click();
        await sleep(400);
        const tabs = view.containerEl.querySelectorAll(".vt-note-review .vt-nr-tab").length;

        // Fold 「Part two」 (lines 6..11) and locate the word in it.
        const entry = plugin.store.entries.find((e) => e.word === "trade");
        const mode = view.currentMode;
        const info = mode.getFoldInfo?.() ?? { folds: [], lines: 12 };
        mode.applyFoldInfo({ ...info, folds: [{ from: 6, to: 11 }], lines: 12 });
        await sleep(300);
        const foldedBefore = (mode.getFoldInfo?.()?.folds ?? []).length;
        await plugin.locator.locate(entry);
        await sleep(300);
        const foldedAfter = (mode.getFoldInfo?.()?.folds ?? []).length;
        const sel = view.editor.getSelection();
        return JSON.stringify({ reading, live, tabs, foldedBefore, foldedAfter, sel });
      })()`);
      const out = JSON.parse(r) as Record<string, unknown>;
      console.log("[note-review]", out);
      expect(out.reading).toBe("mod-header after inline-title");
      expect(out.live).toBe("cm-sizer after inline-title");
      expect(out.tabs).toBe(2);
      expect(out.foldedBefore).toBe(1);
      expect(out.foldedAfter).toBe(0);
      expect(String(out.sel)).toContain("trade");
    } catch (e) {
      await session.cdp.screenshot(screenshotPath("note-review-fail.png"));
      throw e;
    }
  });
});

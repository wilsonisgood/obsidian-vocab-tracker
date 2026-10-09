// (1009 #16) 第一段 spike：
// 1. 使用者的 Obsidian 開著時，--user-data-dir 開出的獨立 instance 能不能跟它共存、
//    互不干擾（只 pgrep 看使用者的，絕不碰）。
// 2. 能不能用 CDP 讀到 app.plugins.plugins["vocab-tracker"].store.entries。
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isProcessAlive, screenshotPath } from "./lib/launcher";
import { endSession, startSession, type E2eSession } from "./lib/setup";

const PORT = 9333;

function userObsidianPids(): number[] {
  // 只讀，不動：確認使用者自己的 Obsidian（如果開著）在整個 spike 過程中都還活著。
  try {
    const out = execSync("pgrep -f '/Applications/Obsidian.app/Contents/MacOS/Obsidian'", {
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
  } catch {
    return []; // pgrep 找不到任何符合的行程時會以非 0 退出
  }
}

describe("e2e spike", () => {
  let session: E2eSession;
  const pidsBefore = userObsidianPids();

  beforeAll(async () => {
    console.log(`[spike] 啟動前，使用者自己的 Obsidian pid: [${pidsBefore.join(", ")}]`);
    session = await startSession(PORT);
    console.log(`[spike] fixture: ${session.fixtureLabel}`);
    console.log(`[spike] build: ${session.buildLabel}`);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("這個 shell 開出的 Obsidian instance 有自己的 pid，跟使用者的不同", () => {
    expect(session.launched.pid).toBeTypeOf("number");
    expect(pidsBefore).not.toContain(session.launched.pid);
  });

  it("啟動後，使用者原本開著的 Obsidian pid（若有）仍然存在", () => {
    for (const pid of pidsBefore) {
      expect(isProcessAlive(pid)).toBe(true);
    }
    if (pidsBefore.length === 0) {
      console.log(
        "[spike] 啟動前 pgrep 沒找到使用者的 Obsidian 在跑，共存這一項本次無法直接觀察（見回報）"
      );
    }
  });

  it("CDP 可以讀到 vocab-tracker plugin 的 store.entries", async () => {
    const entryWords = await session.cdp.evaluate<string[]>(
      `(() => {
        const plugin = app.plugins.plugins["vocab-tracker"];
        if (!plugin) throw new Error("vocab-tracker plugin 沒有載入");
        if (!plugin.store) throw new Error("plugin.store 不存在");
        return plugin.store.entries.map((e) => e.word);
      })()`
    );

    expect(Array.isArray(entryWords)).toBe(true);
    expect(entryWords.length).toBeGreaterThan(0);
    console.log(`[spike] 讀到 ${entryWords.length} 個 entries，前 5 個：`, entryWords.slice(0, 5));

    await session.cdp.screenshot(screenshotPath("spike-loaded.png"));
  });
});

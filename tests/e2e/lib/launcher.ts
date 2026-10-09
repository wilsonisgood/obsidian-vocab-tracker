// (1009 #16) 開一個獨立的 Obsidian instance：專屬的 --user-data-dir profile、
// 專屬的測試 vault，兩者都在 .claude/e2e/ 底下，跟使用者真正的 vault／Obsidian 設定
// 完全分開（安全規則，見派工 prompt）。
import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertInsideE2E,
  FIXTURES_DIR,
  OUT_DIR,
  profileDirFor,
  SYNTHETIC_FIXTURES_DIR,
  vaultDirFor,
} from "./paths";
import { resolvePluginBuild } from "./build";

const OBSIDIAN_BIN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";

function pickFixtureSource(): { dir: string; label: string } {
  if (fs.existsSync(path.join(FIXTURES_DIR, ".obsidian/plugins/vocab-tracker/data.json"))) {
    return { dir: FIXTURES_DIR, label: "real-vault fixture (.claude/e2e/fixtures)" };
  }
  return { dir: SYNTHETIC_FIXTURES_DIR, label: "synthetic fixture (tests/e2e/fixtures/synthetic)" };
}

// 每次跑測試前把 fixture 整份複製成全新的 .claude/e2e/vault-<port>/（測試會改
// 資料，不能讓上一輪的殘留影響下一輪），再把要測的 plugin build 放進去、寫
// community-plugins.json。回傳 vault 路徑跟用的 build 標籤方便寫進回報/log。
export function prepareVault(port: number): { vaultDir: string; fixtureLabel: string; buildLabel: string } {
  const vaultDir = vaultDirFor(port);
  assertInsideE2E(vaultDir);
  fs.rmSync(vaultDir, { recursive: true, force: true });

  const { dir: fixtureDir, label: fixtureLabel } = pickFixtureSource();
  fs.mkdirSync(vaultDir, { recursive: true });
  fs.cpSync(fixtureDir, vaultDir, { recursive: true });

  const pluginDir = path.join(vaultDir, ".obsidian", "plugins", "vocab-tracker");
  fs.mkdirSync(pluginDir, { recursive: true });

  fs.writeFileSync(
    path.join(vaultDir, ".obsidian", "community-plugins.json"),
    JSON.stringify(["vocab-tracker"], null, 2)
  );

  const { label: buildLabel, files } = resolvePluginBuild();
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(pluginDir, name), content);
  }

  return { vaultDir, fixtureLabel, buildLabel };
}

// 在 profile 裡預先寫好 obsidian.json，只登記這一個測試 vault，且是 open 狀態
// ——這樣啟動時不會跳「選 vault」畫面，也不會意外去碰使用者的 vault 清單（這份
// obsidian.json 跟使用者的 ~/Library/Application Support/obsidian/obsidian.json 是
// 完全不同的檔案，在獨立的 --user-data-dir 底下）。profile 本身也按 port 分開
// （見 paths.ts profileDirFor 的註解）。
//
// 故意不每次清掉重建：explore 階段查到 obsidian.log 顯示，全新 profile 第一次
// 啟動時 Obsidian 會去 GitHub 檢查/下載更新（"Checking for update using Github" ->
// 下載 ~9MB 的 obsidian-<ver>.asar.gz），這是 bug-4 測試偶爾卡到 sidebarView()
// 30–45 秒都不 ready 的主要可疑根因（網路相關的不定延遲，甚至可能讓 app 中途重
// 啟一次）。profile 留著不砍，第一次之後的更新檢查會因為版本已經最新而跳過下載，
// 開機快很多也穩很多。vault 還是每次都整個重建（見 prepareVault），所以測試資料
// 不會跨 run 殘留，只有 Obsidian 自己的 app-level cache/設定會留著。
export function prepareProfile(port: number, vaultDir: string): string {
  const profileDir = profileDirFor(port);
  assertInsideE2E(profileDir);
  fs.mkdirSync(profileDir, { recursive: true });
  const vaultId = crypto.randomBytes(8).toString("hex"); // 16 hex chars
  const obsidianJson = {
    vaults: {
      [vaultId]: { path: vaultDir, ts: Date.now(), open: true },
    },
    // (1009 #16 第二段) 全新 profile 每次啟動都會 "Checking for update using Github"
    // 並下載 asar（obsidian.log 可見，單次量到花了超過 5 分鐘），是 openSidebarReady
    // 偶發 timeout 的主因。obsidian.asar 的主行程把這個欄位讀成 updateDisabled，
    // ipcMain "disable-update" handler 寫的也是同一個頂層欄位，所以直接預先寫進
    // obsidian.json 關閉掉（不用等 app 跑起來再呼叫 IPC）。
    updateDisabled: true,
  };
  fs.writeFileSync(
    path.join(profileDir, "obsidian.json"),
    JSON.stringify(obsidianJson, null, 2)
  );
  return profileDir;
}

export interface LaunchedObsidian {
  proc: ChildProcess;
  pid: number;
  port: number;
}

// 用 --user-data-dir 開一個跟使用者真正的 Obsidian 完全隔離的 instance。這個 shell
// 繼承了 ELECTRON_RUN_AS_NODE=1（CLAUDE.md 通用注意事項），一定要在子行程的 env 裡
// 拿掉，否則 Obsidian 的主程式會被當成純 node 執行，不會真的開視窗。
export function launchObsidian(port: number, profileDir: string): LaunchedObsidian {
  assertInsideE2E(profileDir);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const proc = spawn(
    OBSIDIAN_BIN,
    [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`],
    { env, stdio: "ignore", detached: false }
  );
  if (!proc.pid) throw new Error("Obsidian 沒有拿到 pid，啟動失敗");
  return { proc, pid: proc.pid, port };
}

// SIGTERM 對 Electron app 不保證準時生效（explore 階段撞到過：SIGTERM 送出、等
// 1000ms 就收工，結果行程其實還在收尾，vitest 行程自己先結束，留下孤兒）。這裡
// SIGTERM 之後實際輪詢到行程真的消失，超過時限還沒死才用 SIGKILL —— 寧可多等，
// 不要留下開著使用者真實 ~/Library/Application Support/obsidian 以外、但一樣是
// 整個 Obsidian GUI 的孤兒行程。
export async function stopObsidian(launched: LaunchedObsidian, timeoutMs = 8000): Promise<void> {
  try {
    process.kill(launched.pid, "SIGTERM");
  } catch {
    return; // 行程可能已經自己結束了。
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(launched.pid)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    process.kill(launched.pid, "SIGKILL");
  } catch {
    // 已經死了，忽略。
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// (1009 #16 spike 發現) 全新 profile 第一次開某個 vault 時，就算
// community-plugins.json 已經預先登記 vocab-tracker，Obsidian 還是會在
// app.plugins.setEnable(true) 之後跳出「您信任此儲存庫的作者嗎？」modal（這是 Obsidian
// 內建的安全機制，不是 restricted-mode 設定檔能繞過的）。CDP 呼叫本身不會被這個 modal
// 擋住（store.entries 讀得到），但 modal 會疊在畫面上，擋住後面要點的 UI，所以每次
// enable 完都呼叫這個把它關掉。回傳是否真的有 modal 需要關。
export async function dismissTrustDialogIfPresent(evaluate: <T>(expr: string) => Promise<T>): Promise<boolean> {
  return evaluate<boolean>(
    `(() => {
      const buttons = Array.from(document.querySelectorAll(".modal-button-container button"));
      const trustBtn = buttons.find((b) => b.textContent?.includes("信任作者") || b.textContent?.includes("Trust author"));
      if (trustBtn) { trustBtn.click(); return true; }
      return false;
    })()`
  );
}

export function screenshotPath(name: string): string {
  assertInsideE2E(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, name);
}

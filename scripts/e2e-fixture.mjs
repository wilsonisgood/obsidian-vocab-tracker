#!/usr/bin/env node
/* global console */
// (1009 #16) 產生 e2e 測試用 fixture：從使用者「真正的」Obsidian vault 複製少量資料
// （只讀，絕不寫回 real vault），輸出到 .claude/e2e/fixtures/（gitignored，每次跑測試
// 前會被整份複製成全新的 .claude/e2e/vault/，詳見 tests/e2e/lib/launcher.ts）。
//
// 用法：node scripts/e2e-fixture.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---- 安全邊界：來源永遠是這個常數，不吃 argv／env，避免不小心指到別的路徑 ----
const REAL_VAULT = "/Users/will/Documents/Obsidian Vault";

function repoRoot() {
  // 不管在哪個 worktree 底下跑，.claude/e2e 都要落在「主倉庫」根目錄
  // （.claude/ 本身沒被 git 追蹤，worktree 的 .git 是指到主倉庫的 .git/worktrees/...，
  // git-common-dir 永遠指回主倉庫的 .git）。
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  }).trim();
  return path.dirname(path.resolve(commonDir));
}

const E2E_ROOT = path.join(repoRoot(), ".claude", "e2e");
const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures");

function assertInsideE2E(p) {
  const resolved = path.resolve(p);
  const root = path.resolve(E2E_ROOT) + path.sep;
  if (!resolved.startsWith(root)) {
    throw new Error(`refusing to touch path outside .claude/e2e: ${resolved}`);
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  (skip, not found) ${src}`);
    return;
  }
  assertInsideE2E(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function fakeKeysInDataJson(destDataJsonPath) {
  const raw = fs.readFileSync(destDataJsonPath, "utf8");
  const data = JSON.parse(raw);

  const aiSection = data.settings?.ai;
  if (!aiSection) {
    console.warn("  (data.json 沒有 settings.ai，略過假金鑰替換)");
    return;
  }

  // 只印欄位名，不印值 —— 確認要改的是哪些 key，不洩漏真的金鑰。
  console.log("  settings.ai 欄位:", Object.keys(aiSection));
  const providers = aiSection.providers ?? {};
  console.log("  settings.ai.providers 欄位:", Object.keys(providers));

  const FAKE_KEY = "sk-ant-e2e-fake";
  for (const providerId of Object.keys(providers)) {
    if (typeof providers[providerId]?.apiKey === "string") {
      providers[providerId].apiKey = FAKE_KEY;
    }
  }
  // 讓 AI 狀態走到 "ready"（isMissingKey 看 apiKey；enabled 要 true；provider 選
  // anthropic，見 src/services/ai/AiService.ts status()）—— 輸入框會出現，但測試
  // 本身不會按送出，不會真的打 API。
  aiSection.enabled = true;
  aiSection.provider = "anthropic";

  fs.writeFileSync(destDataJsonPath, JSON.stringify(data, null, 2));
}

function main() {
  if (!fs.existsSync(REAL_VAULT)) {
    throw new Error(`real vault not found at ${REAL_VAULT} — 不產生 fixture`);
  }

  console.log(`[e2e-fixture] 來源（只讀）：${REAL_VAULT}`);
  console.log(`[e2e-fixture] 輸出：${FIXTURES_DIR}`);

  assertInsideE2E(FIXTURES_DIR);
  fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const pluginSrc = path.join(REAL_VAULT, ".obsidian", "plugins", "vocab-tracker");
  const pluginDest = path.join(FIXTURES_DIR, ".obsidian", "plugins", "vocab-tracker");

  console.log("[e2e-fixture] 複製 data.json ...");
  copyRecursive(path.join(pluginSrc, "data.json"), path.join(pluginDest, "data.json"));
  fakeKeysInDataJson(path.join(pluginDest, "data.json"));

  console.log("[e2e-fixture] 複製 store/ ...");
  copyRecursive(path.join(pluginSrc, "store"), path.join(pluginDest, "store"));

  console.log("[e2e-fixture] 複製 eng/Taylor_Swift_NYU_Speech_Transcript.md ...");
  copyRecursive(
    path.join(REAL_VAULT, "eng", "Taylor_Swift_NYU_Speech_Transcript.md"),
    path.join(FIXTURES_DIR, "eng", "Taylor_Swift_NYU_Speech_Transcript.md")
  );

  console.log("[e2e-fixture] 複製 vocab-list/ ...");
  copyRecursive(path.join(REAL_VAULT, "vocab-list"), path.join(FIXTURES_DIR, "vocab-list"));

  console.log("[e2e-fixture] 複製 vocab-wordlists/ ...");
  copyRecursive(
    path.join(REAL_VAULT, "vocab-wordlists"),
    path.join(FIXTURES_DIR, "vocab-wordlists")
  );

  console.log("[e2e-fixture] 完成。main.js／manifest.json／styles.css 不複製 —— 那是測試要");
  console.log("[e2e-fixture] 裝的 build（見 tests/e2e/lib/build.ts），不是使用者資料。");
}

main();

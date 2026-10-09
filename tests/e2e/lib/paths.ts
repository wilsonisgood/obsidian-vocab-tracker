// (1009 #16) 共用路徑解析。不管從哪個 worktree 底下跑，.claude/e2e/** 都要落在
// 「主倉庫」根目錄，這樣不同波次的 worktree 才會共用同一份 profile／vault／fixtures
// ——這些東西本來就不該跟著某個分支的程式碼走。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRoot(): string {
  // git-common-dir 永遠指回主倉庫的 .git，不管目前 cwd 是主倉庫還是某個
  // .claude/worktrees/<wt>（worktree 的 .git 只是一個指到它的文字檔）。
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  }).trim();
  return path.dirname(path.resolve(commonDir));
}

// 目前這個 TS 檔自己所在的 worktree 根目錄（= 要跑 build 的那份原始碼）。
export const WORKTREE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const REPO_ROOT = repoRoot();
export const E2E_ROOT = path.join(REPO_ROOT, ".claude", "e2e");
// profile／vault 都按 CDP port 分開（而不是全部共用同一份）：explore 階段發現，
// 連續幾次用同一個 --user-data-dir 快速重啟 Obsidian，偶爾會出現
// sidebarView() 遲遲不 ready 的情況（Electron 自己的 session/cache 殘留？沒有
// 100% 查清楚根因），分開之後每次都是全新的 profile，比較不會互相干擾。
export function profileDirFor(port: number): string {
  return path.join(E2E_ROOT, `profile-${port}`);
}
export function vaultDirFor(port: number): string {
  return path.join(E2E_ROOT, `vault-${port}`);
}
export const FIXTURES_DIR = path.join(E2E_ROOT, "fixtures");
export const OUT_DIR = path.join(E2E_ROOT, "out");
export const SYNTHETIC_FIXTURES_DIR = path.join(
  WORKTREE_ROOT,
  "tests/e2e/fixtures/synthetic"
);

// 安全邊界：任何會被測試「寫入／刪除」的路徑，都必須先過這關。絕對不准落在
// .claude/e2e/ 之外（尤其是使用者真正的 vault 跟 ~/Library/Application Support/obsidian）。
export function assertInsideE2E(p: string): string {
  const resolved = path.resolve(p);
  const root = path.resolve(E2E_ROOT) + path.sep;
  if (resolved !== path.resolve(E2E_ROOT) && !resolved.startsWith(root)) {
    throw new Error(
      `refusing to touch path outside .claude/e2e: ${resolved} (root: ${E2E_ROOT})`
    );
  }
  return resolved;
}

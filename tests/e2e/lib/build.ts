// (1009 #16) 解析這次測試要裝進 vault 的 plugin build：main.js／manifest.json／
// styles.css 三個檔案的內容。
//
// - 預設：目前這個 worktree 自己 npm run build 出來的產物（根目錄的 main.js 等）。
// - E2E_BUILD=2.0.0：用 `git show 6181d5f:<file>` 取 2.0.0 release 當時的版本
//   （6181d5f 是地基 commit 26c0184 的上一個 commit，見 .claude/tmp/w11-rules.md）。
//   第十一波第一段用這個版本重現三個 bug；第二段整合完會改用整合後的 build。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { WORKTREE_ROOT } from "./paths";

export interface PluginBuildFiles {
  "main.js": string;
  "manifest.json": string;
  "styles.css": string;
}

const BUILD_FILES = ["main.js", "manifest.json", "styles.css"] as const;
const RELEASE_2_0_0_COMMIT = "6181d5f";

function readFromWorktree(): PluginBuildFiles {
  const out: Partial<PluginBuildFiles> = {};
  for (const file of BUILD_FILES) {
    const p = path.join(WORKTREE_ROOT, file);
    if (!fs.existsSync(p)) {
      throw new Error(
        `${p} 不存在 —— 先在 worktree 根目錄跑 npm run build（或改用 E2E_BUILD=2.0.0）`
      );
    }
    out[file] = fs.readFileSync(p, "utf8");
  }
  return out as PluginBuildFiles;
}

function readFromGitShow(ref: string): PluginBuildFiles {
  const out: Partial<PluginBuildFiles> = {};
  for (const file of BUILD_FILES) {
    out[file] = execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: WORKTREE_ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 64,
    });
  }
  return out as PluginBuildFiles;
}

// 讀一次環境變數決定的 build；呼叫端負責把這三個檔案寫進 vault 的
// .obsidian/plugins/vocab-tracker/。
export function resolvePluginBuild(): { label: string; files: PluginBuildFiles } {
  const requested = process.env.E2E_BUILD;
  if (requested === "2.0.0") {
    return { label: "2.0.0 (git show 6181d5f)", files: readFromGitShow(RELEASE_2_0_0_COMMIT) };
  }
  return { label: "worktree (npm run build)", files: readFromWorktree() };
}

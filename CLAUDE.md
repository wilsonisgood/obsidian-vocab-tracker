# Vocab Tracker（Obsidian 插件）

狀態：active。一律用繁體中文跟使用者溝通。

## 開發流程（2026-10-10 使用者訂定）

**適用範圍**：任何邏輯修改，包括 `src/`、`main.ts`、`tests/`、`styles*`、`scripts/`、
`esbuild`/設定檔等。只改規劃文件（`docs/` 底下的規劃書、report）不受此限，可以直接在
目前分支上改。

1. **從最新的發版分支開新分支**
   - 先 `git fetch`。在遠端的 `release/*`、`pre-release/*` 裡，挑 commit 時間最新的一條當基底
     （`git for-each-ref --sort=-committerdate refs/remotes`）。
   - 用 `git switch -c <分支名> origin/<基底>` 開分支；要並行開發時改用 worktree，放在
     `.claude/worktrees/`。⛔ 不要直接在發版分支或 `main` 上 commit。
2. **開發 + 測試**：`npm run check`（typecheck → lint → test → build）要全過才算完成。
3. **commit**：把重新 build 的 `main.js` 一起 commit 進去。
4. **部署到本機 vault**：先確認 Obsidian 已經完全關閉，才把檔案複製到
   `~/Documents/Obsidian Vault/.obsidian/plugins/vocab-tracker/`，再用 `diff -q` 確認一致。
   Obsidian 還開著時，在背景等它關閉再部署，不用問使用者。
5. **回報 commit**：除了本機部署，還要給使用者 **commit hash** 和分支名。使用者會自己把它
   merge 進發版分支（`Merge commit '<hash>' into <發版分支>`），也會自己跑 `./release.sh`。
   ⛔ 以下三件事 Claude 都不做：merge 進發版分支、push、執行 `release.sh`。

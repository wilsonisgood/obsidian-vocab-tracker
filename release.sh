#!/usr/bin/env bash
# 第十波 R — 一鍵發版 (1007-2 #1 #2)。
#
# 用法：./release.sh <X.Y.Z|patch|minor|major> [--dry-run]
#
# 在「目前分支」一路做到發佈完成：檢查 → npm run check → 改版號 → commit →
# push 分支 → 打 tag → push tag → 等 GitHub Actions 把正式 release 發出來。
# 不依賴 gh；不打 tag／push 的事只有使用者自己執行這支腳本才會發生。
#
# 版號只用純數字 X.Y.Z（不接受 2.0.0-beta.1 這種帶 "-" 的版號，BRAT 挑遠端
# 最大版號，混用會讓舊的穩定版被新的測試版蓋過去）。
#
# 相容性：macOS 內建 bash 3.2、BSD 工具，所以版號比較不用 sort -V，改用
# `sort -t. -k1,1n -k2,2n -k3,3n`（三個數字欄位各自當數字排序，純 X.Y.Z 版號
# 保證可用）。
set -euo pipefail

# ── 顏色（不支援顏色的終端機會印出看得懂的逸出碼，不影響功能） ──────────
c_yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
c_red() { printf '\033[31m%s\033[0m\n' "$1" >&2; }
c_green() { printf '\033[32m%s\033[0m\n' "$1"; }

die() {
  c_red "錯誤：$1"
  exit 1
}

usage() {
  cat <<'EOF'
用法：./release.sh <X.Y.Z|patch|minor|major> [--dry-run]

  X.Y.Z          直接指定版號（純數字，例如 2.0.0）
  patch|minor|major   從 manifest.json 目前版號算下一版
  --dry-run      只做檢查、印出會執行的步驟，不改任何檔案、不 push
EOF
}

# ── 參數解析 ─────────────────────────────────────────────────────────
DRY_RUN=false
VERSION_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "不認識的參數：$arg"
      ;;
    *)
      if [ -n "$VERSION_ARG" ]; then
        die "多餘的參數：$arg（只接受一個版號／bump 關鍵字）"
      fi
      VERSION_ARG="$arg"
      ;;
  esac
done

if [ -z "$VERSION_ARG" ]; then
  usage
  exit 1
fi

cd "$(dirname "$0")"

[ -f manifest.json ] || die "找不到 manifest.json，請在 repo 根目錄執行這支腳本。"

OLD_VERSION=$(jq -r '.version' manifest.json)

# ── 算出新版號 ───────────────────────────────────────────────────────
if [[ "$VERSION_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$VERSION_ARG"
elif [ "$VERSION_ARG" = "patch" ] || [ "$VERSION_ARG" = "minor" ] || [ "$VERSION_ARG" = "major" ]; then
  # 照 semver 的 inc() 規則：目前版號帶 -xxx 測試版後綴時，bump 先看
  # major/minor/patch 是不是已經「夠格」代表下一版——夠格就只去掉後綴、不
  # 再往上加一（2.0.0-beta.1 的 patch/minor/major 都只會得到 2.0.0，因為
  # minor、patch 都還是 0，這個 beta 本來就是在代表「即將發的 2.0.0」）。
  # 沒有後綴（已經是正式版）就是單純的 +1。
  case "$OLD_VERSION" in
    *-*) HAS_PRERELEASE=true; BASE_VERSION="${OLD_VERSION%%-*}" ;;
    *) HAS_PRERELEASE=false; BASE_VERSION="$OLD_VERSION" ;;
  esac
  IFS='.' read -r MAJ MIN PAT <<< "$BASE_VERSION"
  MAJ=$((10#$MAJ)); MIN=$((10#$MIN)); PAT=$((10#$PAT))
  case "$VERSION_ARG" in
    patch)
      if [ "$HAS_PRERELEASE" = true ]; then
        NEW_VERSION="${MAJ}.${MIN}.${PAT}"
      else
        NEW_VERSION="${MAJ}.${MIN}.$((PAT + 1))"
      fi
      ;;
    minor)
      if [ "$HAS_PRERELEASE" = true ] && [ "$PAT" -eq 0 ]; then
        NEW_VERSION="${MAJ}.${MIN}.0"
      else
        NEW_VERSION="${MAJ}.$((MIN + 1)).0"
      fi
      ;;
    major)
      if [ "$HAS_PRERELEASE" = true ] && [ "$MIN" -eq 0 ] && [ "$PAT" -eq 0 ]; then
        NEW_VERSION="${MAJ}.0.0"
      else
        NEW_VERSION="$((MAJ + 1)).0.0"
      fi
      ;;
  esac
else
  die "版號格式錯誤：$VERSION_ARG（要 X.Y.Z 純數字，或 patch｜minor｜major）"
fi

if [[ "$NEW_VERSION" == *-* ]]; then
  die "新版號不能含 \"-\"：$NEW_VERSION"
fi

# ── 蒐集摘要用的資訊 ─────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current || true)

git remote get-url origin >/dev/null 2>&1 || die "沒有 origin 這個 remote。"

RAW_REMOTE_TAGS=$(git ls-remote --tags origin 2>/dev/null) \
  || die "git ls-remote --tags origin 失敗（檢查網路連線／origin 設定）。"

ALL_REMOTE_TAGS=$(printf '%s\n' "$RAW_REMOTE_TAGS" \
  | awk '{print $2}' | sed -E 's#^refs/tags/##' | sed 's/\^{}$//' | sort -u)

PURE_REMOTE_TAGS=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  if [[ "$t" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PURE_REMOTE_TAGS="${PURE_REMOTE_TAGS}${t}
"
  fi
done <<< "$ALL_REMOTE_TAGS"

if [ -n "$PURE_REMOTE_TAGS" ]; then
  MAX_REMOTE_TAG=$(printf '%s' "$PURE_REMOTE_TAGS" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
else
  MAX_REMOTE_TAG=""
fi

# ── 開頭摘要（沒有互動確認） ─────────────────────────────────────────
echo "== 一鍵發版 =="
echo "目前分支：${CURRENT_BRANCH:-（detached HEAD）}"
echo "版號：${OLD_VERSION} → ${NEW_VERSION}"
echo "遠端（origin）最大 tag：${MAX_REMOTE_TAG:-（目前沒有純數字 tag）}"
echo

# ── 檢查 ─────────────────────────────────────────────────────────────
[ -n "$CURRENT_BRANCH" ] || die "目前是 detached HEAD，請先切到一個分支。"

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "已追蹤的檔案有未 commit 的修改，請先 commit 或還原（untracked 檔案不受影響）。"
fi

if printf '%s\n' "$ALL_REMOTE_TAGS" | grep -qx "$NEW_VERSION"; then
  die "tag ${NEW_VERSION} 在 origin 上已經存在。"
fi

if [ -n "$MAX_REMOTE_TAG" ]; then
  if [ "$NEW_VERSION" = "$MAX_REMOTE_TAG" ]; then
    die "新版號 ${NEW_VERSION} 跟遠端最大的 tag 一樣，沒有變大。"
  fi
  TOP=$(printf '%s\n%s\n' "$MAX_REMOTE_TAG" "$NEW_VERSION" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
  if [ "$TOP" != "$NEW_VERSION" ]; then
    die "新版號 ${NEW_VERSION} 沒有大於遠端最大的 tag ${MAX_REMOTE_TAG}（BRAT 挑最大版號，不能變小）。"
  fi
fi

# ── CHANGELOG（只提醒，不擋） ─────────────────────────────────────────
if [ -f CHANGELOG.md ] && grep -qF "## [${NEW_VERSION}]" CHANGELOG.md; then
  :
else
  c_yellow "提醒：CHANGELOG.md 還沒有 \"## [${NEW_VERSION}]\" 這一節（GitHub release notes 會抓這段，沒有就只會留一行提示）。"
fi

# ── dry-run 到此為止：不改任何檔案、不 push ──────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo
  echo "（--dry-run，以下步驟在正式執行時才會做）"
  cat <<EOF
  1. npm run check  （typecheck + lint + test + build；失敗就停，版號不動）
  2. npm version ${NEW_VERSION}  （改 package.json / manifest.json / versions.json）
  3. git add package.json manifest.json versions.json main.js styles.css（逐檔）
     git commit -m "chore: release ${NEW_VERSION}"
  4. git push origin HEAD
     git tag ${NEW_VERSION}
     git push origin ${NEW_VERSION}
  5. 每 10 秒查一次 GitHub release，最多 5 分鐘
EOF
  exit 0
fi

# ── 正式執行 ─────────────────────────────────────────────────────────
# check 先跑、通過才改版號：失敗時工作區只有 build 產物（main.js／styles.css）
# 會變，版號檔不動，修好直接重跑就行。
if ! npm run check; then
  c_red "npm run check 失敗，版號還沒改。修好後 \`git checkout -- main.js styles.css\` 再重跑一次。"
  exit 1
fi

restore_version() {
  git reset -q HEAD -- package.json manifest.json versions.json
  git checkout -- package.json manifest.json versions.json
}
if ! npm version "$NEW_VERSION"; then
  restore_version
  die "npm version 失敗，版號檔已還原。"
fi

git add package.json
git add manifest.json
git add versions.json
git add main.js
git add styles.css
git commit -m "chore: release ${NEW_VERSION}"

git push origin HEAD
git tag "$NEW_VERSION"
git push origin "$NEW_VERSION"

# ── 解析 owner/repo，等 GitHub Actions 把正式 release 發出來 ─────────
REMOTE_URL=$(git remote get-url origin)
OWNER_REPO=$(printf '%s' "$REMOTE_URL" | sed -E 's#^git@github\.com:##; s#^https://github\.com/##; s#\.git$##')

echo
echo "等 GitHub Actions 發佈 ${NEW_VERSION}（最多等 5 分鐘）..."
DEADLINE=$(($(date +%s) + 300))
FOUND=false
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  RESP=$(curl -s "https://api.github.com/repos/${OWNER_REPO}/releases/tags/${NEW_VERSION}" || true)
  DRAFT=$(printf '%s' "$RESP" | jq -r '.draft // empty' 2>/dev/null || true)
  HTML_URL=$(printf '%s' "$RESP" | jq -r '.html_url // empty' 2>/dev/null || true)
  if [ -n "$HTML_URL" ] && [ "$DRAFT" = "false" ]; then
    c_green "Release 已發佈：${HTML_URL}"
    FOUND=true
    break
  fi
  sleep 10
done

if [ "$FOUND" = false ]; then
  c_yellow "逾時還沒看到正式 release，請到 Actions 頁看進度：https://github.com/${OWNER_REPO}/actions"
fi

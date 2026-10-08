// 第十波 R — 單字資料夾裡的 .md 打開時預設閱讀模式 (1007-2 #3)。
//
// 只在「這個分頁換成這個檔案」(file-open) 那一刻切一次：使用者之後手動切回
// 編輯模式，在同一個分頁停在同一個檔案期間不再干涉；換到別的檔案、或關掉
// 分頁再重新打開，才算「重新打開」而再切一次。
//
// isInFolder 是純函式，單獨測試；installOpenInPreview 接 Obsidian 的事件。

import { MarkdownView, type Plugin, type WorkspaceLeaf } from "obsidian";

// `path` 是不是 `folder`（去掉頭尾斜線）本身或其子孫，且是 .md 檔。
// folder 整理後是空字串 → 整個 vault 都算（等於沒有限制資料夾）。
export function isInFolder(path: string, folder: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  const trimmed = folder.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return true;
  return path === trimmed || path.startsWith(`${trimmed}/`);
}

export function installOpenInPreview(plugin: Plugin, folder: () => string): void {
  const lastSeen = new WeakMap<WorkspaceLeaf, string>();

  plugin.registerEvent(
    plugin.app.workspace.on("file-open", (file) => {
      if (!file) return;
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file?.path !== file.path) return;

      const leaf = view.leaf;
      const isReopen = lastSeen.get(leaf) !== file.path;
      if (isReopen && isInFolder(file.path, folder()) && view.getMode() === "source") {
        const viewState = leaf.getViewState();
        void leaf.setViewState({ ...viewState, state: { ...viewState.state, mode: "preview" } });
      }
      lastSeen.set(leaf, file.path);
    })
  );
}

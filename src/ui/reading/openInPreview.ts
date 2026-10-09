// 第十波 R — 單字資料夾裡的 .md 打開時預設閱讀模式 (1007-2 #3)。
//
// 1009 #15: 「重新打開」的判斷從「這個 leaf 上次的檔案」改成「這個 leaf
// 剛變成前景，或換了檔案」——只看 file-open 漏掉「在已經開著的分頁標籤之間
// 切換」(沒有新開檔案，只是換前景 leaf，不會發 file-open，只發
// active-leaf-change)。兩個事件都聽，但判斷依據是同一顆 shouldSwitchToPreview
// 純函式：跟「上一個前景 leaf＋它的檔案」比，leaf 換了或檔案換了都算重新
// 打開；同一個 leaf 停在同一個檔案期間（手動切回編輯模式之後）不算，不會
// 再被切一次。file-open／active-leaf-change 若為同一次切換都觸發，第二次
// 算出來的 prev 已經等於 next，不會重複切換。
//
// isInFolder／shouldSwitchToPreview 都是純函式，單獨測試；
// installOpenInPreview 接 Obsidian 的事件。

import { MarkdownView, type Plugin, type WorkspaceLeaf } from "obsidian";

// `path` 是不是 `folder`（去掉頭尾斜線）本身或其子孫，且是 .md 檔。
// folder 整理後是空字串 → 整個 vault 都算（等於沒有限制資料夾）。
export function isInFolder(path: string, folder: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  const trimmed = folder.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") return true;
  return path === trimmed || path.startsWith(`${trimmed}/`);
}

export interface ActiveLeafFile {
  leafId: string;
  path: string;
}

// 1009 #15: 「重新打開」＝這個前景 leaf 跟上一次記錄的不是同一個（leaf 換
// 了，或同一個 leaf 換了檔案）；同一個 leaf 停在同一個檔案上則不算，不管
// 中間使用者有沒有手動切過模式。再疊上 isInFolder——資料夾外一律不切。
export function shouldSwitchToPreview(prev: ActiveLeafFile | null, next: ActiveLeafFile, folder: string): boolean {
  const reopened = !prev || prev.leafId !== next.leafId || prev.path !== next.path;
  return reopened && isInFolder(next.path, folder);
}

export function installOpenInPreview(plugin: Plugin, folder: () => string): void {
  // leaf 物件本身沒有公開的穩定 id（Obsidian 型別沒有宣告），自己配一個，
  // WeakMap 讓沒用到的 leaf 可以被 GC。
  const leafIds = new WeakMap<WorkspaceLeaf, string>();
  let nextLeafId = 0;
  const idOf = (leaf: WorkspaceLeaf): string => {
    let id = leafIds.get(leaf);
    if (id === undefined) {
      id = `leaf-${nextLeafId++}`;
      leafIds.set(leaf, id);
    }
    return id;
  };

  let lastActive: ActiveLeafFile | null = null;

  const handle = (): void => {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;
    const leaf = view.leaf;
    const next: ActiveLeafFile = { leafId: idOf(leaf), path: view.file.path };
    const switchNow = shouldSwitchToPreview(lastActive, next, folder());
    lastActive = next;
    if (switchNow && view.getMode() === "source") {
      const viewState = leaf.getViewState();
      void leaf.setViewState({ ...viewState, state: { ...viewState.state, mode: "preview" } });
    }
  };

  // 打開檔案、點連結都會先發 file-open；在已經開著的分頁標籤之間切換不會
  // （沒有新開檔），只發 active-leaf-change——兩個都聽，shouldSwitchToPreview
  // 本身的比對擋掉同一次切換被處理兩次。
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", (file) => {
      if (file) handle();
    })
  );
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", () => handle()));
}

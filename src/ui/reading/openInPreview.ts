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

  // 用 view 已經就位的 leaf 來判斷／切換模式，跟上面純函式用的介面一致。
  const processLeaf = (leaf: WorkspaceLeaf): void => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) return;
    const next: ActiveLeafFile = { leafId: idOf(leaf), path: view.file.path };
    const switchNow = shouldSwitchToPreview(lastActive, next, folder());
    lastActive = next;
    if (!switchNow) return;
    // 1009 #16 第二段 e2e 查到三層一起疊加的坑，才會讓「開新分頁」這條路
    // 線一直停在 "source"：
    // 1. `getLeaf("tab")` 開新分頁時，Obsidian 自己「打開檔案」的內部流程
    //    還沒收尾，我們的 file-open／active-leaf-change handler 就已經被
    //    同步呼叫——這時呼叫 `leaf.setViewState({mode:"preview"})` 會先
    //    成功，但 Obsidian 收尾時晚一步又把它蓋回 "source"，蓋回的時間點
    //    不固定（量到的案例裡，單次 setTimeout(0) 的下一個 macrotask還不
    //    夠）。
    // 2. 收尾換掉的其實是 `leaf.view` 這個物件本身（新分頁第一次真正渲染
    //    完成時會整個重建一次 view instance）——重試如果判斷「要不要再切
    //    一次」用的是這個函式一開始捕捉的 `view` 這份舊參照，會一直讀到
    //    蓋回去那一刻的 "source"，setViewState 呼叫的對象（`leaf`）雖然是
    //    活的，但看起來像完全沒作用。要每次重試都重新讀 `leaf.view`。
    // 3. 整段「開新分頁」過程中，Obsidian 自己會讓 `app.workspace.activeLeaf`
    //    在原本那個 leaf／新分頁之間閃爍幾次（量到的真實情況），每次閃爍
    //    都會經過 handle() 把全域 `lastActive` 改寫成閃過去那個 leaf——如
    //    果拿「`lastActive` 還是不是這次要切的那個」當重試的放手條件，幾
    //    乎每次都會在閃回來、真正輪到我們重試之前就先放棄。改成只看這個
    //    leaf 自己現在是否還停在同一個檔案（leaf 被收掉或換了別的檔案才放
    //    手），不管全域 lastActive 這段時間被誰改寫過。
    // 試到真的穩定在 "preview"，或試了 20 次（約 1 秒）才放棄。一般「打開
    // 檔案」這條最常見的路徑（不是這種新分頁的特殊情況）第一次嘗試就會成
    // 功，不會感覺到額外延遲。
    const stable = next;
    const tryApply = (attempt: number): void => {
      if (attempt > 20) return;
      const currentView = leaf.view;
      // leaf 已經不是停在我們要切的那個檔案（被收掉、換了別的檔案，或這個
      // leaf 中途又被拿去開了別的東西）——這份重試已經不適用，放手。不拿
      // 全域 lastActive 當放手條件：開新分頁這整段過程 Obsidian 自己會讓
      // activeLeaf 在原本那個 leaf／新分頁之間閃爍幾次（量到的真實情況），
      // 每次閃爍都會讓 lastActive 被改寫成別的 leaf，如果拿它當放手條件，
      // 這個重試幾乎每次都會在閃回來之前就先放棄，實際上從沒機會真正重試。
      if (!(currentView instanceof MarkdownView) || currentView.file?.path !== stable.path) return;
      if (currentView.getMode() !== "source") return; // 已經是 preview，穩了。
      const viewState = leaf.getViewState();
      void leaf
        .setViewState({ ...viewState, state: { ...viewState.state, mode: "preview" } })
        .then(() => {
          window.setTimeout(() => tryApply(attempt + 1), 50);
        });
    };
    tryApply(0);
  };

  // 1009 #16 第二段 e2e 發現：用 getLeaf("tab") 開的新分頁，即使立刻變成
  // activeLeaf，它的 view 一開始是 Obsidian 1.7+ 的 DeferredView 佔位物件
  // （WorkspaceLeaf.isDeferred），不是 MarkdownView——這時 instanceof 檢查
  // 失敗，handle() 什麼都不做，這個 leaf 就永遠卡在預設的 source 模式，連
  // 之後再度前景化也不會補切（因為 lastActive 已經被跳過、沒機會重新判斷
  // 「重新打開」）。改成先用 `plugin.app.workspace.activeLeaf`（不管
  // deferred 與否都拿得到）、deferred 的話先 `await leaf.loadIfDeferred()`
  // 讓它真的變成 MarkdownView 再判斷。
  const handle = (): void => {
    const leaf = plugin.app.workspace.activeLeaf;
    if (!leaf) return;
    if (leaf.isDeferred) {
      void leaf.loadIfDeferred().then(() => processLeaf(leaf));
      return;
    }
    processLeaf(leaf);
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

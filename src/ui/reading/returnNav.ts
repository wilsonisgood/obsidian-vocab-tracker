// 第八波 R2 — 從單字頁返回 (1006-2 #15 #16)。
//
// main.ts 的 openWordPage() 在開單字頁之前呼叫 remember(entry)：記下目前在
// 看哪篇筆記、捲到哪裡（用 MarkdownSubView.getScroll()，編輯／閱讀模式都
// 有，近似當作「行號」）。Obsidian 內建的返回（leaf history back）通常會自
// 己還原捲動位置，但這裡沒辦法在 Obsidian 裡實測，所以直接做保險：監聽
// "file-open"，同一個 leaf 「回到」那篇筆記時自己還原捲動＋呼叫
// locator.flash() 高亮離原本位置最近的一處 (#16)；還原一次後就清掉記錄。
//
// remember() 之後的第一次 file-open 是 openWordPage() 自己換過去單字頁造成
// 的，不是「使用者在同一個 leaf 開了別的檔」，也不是「回來」——忽略，從第
// 二次 file-open 才開始判斷是回來了還是去了別的地方。

import { MarkdownView, type App, type EventRef, type WorkspaceLeaf } from "obsidian";
import type { VocabEntry } from "../../core/model/entry";
import { activeMarkdownView } from "./locateWord";
import type { WordLocator } from "./locateWord";

export interface ReturnNav {
  remember(entry: Pick<VocabEntry, "id" | "word">): void;
  dispose(): void;
}

interface Pending {
  leaf: WorkspaceLeaf;
  path: string;
  scroll: number;
  entry: Pick<VocabEntry, "id" | "word">;
}

export function createReturnNav(app: App, locator: WordLocator): ReturnNav {
  let pending: Pending | null = null;
  // remember() 剛記完、還沒看到「離開」那一次 file-open（開單字頁本身造成
  // 的）之前，不要去判斷「回來了沒」。
  let left = false;

  function restore(p: Pending): void {
    const view = p.leaf.view;
    if (view instanceof MarkdownView && view.file?.path === p.path) {
      try {
        view.currentMode.applyScroll(p.scroll);
      } catch {
        // 還原捲動失敗就算了，不要擋住下面的 flash (#16)。
      }
      void locator.flash(p.entry, { line: Math.round(p.scroll) });
    }
  }

  function onFileOpen(): void {
    if (!pending) return;
    if (!left) {
      // 這是 openWordPage() 自己造成的第一次換檔，不是回來、也不是使用者
      // 另外開了別的檔，忽略。
      left = true;
      return;
    }
    const leaf = app.workspace.getMostRecentLeaf();
    const current = pending;
    if (!leaf || leaf !== current.leaf) return; // 不是那個 leaf，不影響記錄
    const view = leaf.view;
    pending = null; // 還原一次（或判定成放棄）後就清掉 (#15)
    if (view instanceof MarkdownView && view.file?.path === current.path) {
      restore(current);
    }
    // else：同一個 leaf 開了別的檔（不是回來）——不還原，記錄已經清掉了。
  }

  const ref: EventRef = app.workspace.on("file-open", onFileOpen);

  return {
    remember(entry) {
      const view = activeMarkdownView(app);
      if (!view?.file || !view.leaf) {
        pending = null;
        return;
      }
      pending = {
        leaf: view.leaf,
        path: view.file.path,
        scroll: view.currentMode.getScroll(),
        entry,
      };
      left = false;
    },

    dispose() {
      app.workspace.offref(ref);
      pending = null;
    },
  };
}

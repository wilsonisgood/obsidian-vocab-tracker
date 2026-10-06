// 第八波 R2 — 在筆記裡定位單字 (1006-2 #7 #8 #9)。
//
// 側欄收合列點單字字串 → locate()：捲到畫面中間，閱讀模式高亮三秒；編輯模式
// （Live Preview／Source，Obsidian 的 getMode() 兩者都回 "source"）改成選取
// 該範圍，不高亮。同一個字、同一篇筆記再點一次 → 跳到下一處（循環）；換字或
// 換筆記就從頭開始。這篇沒出現這個字 → Notice 提示 (#9)。
//
// returnNav.ts 用的 flash()：不循環，挑離指定行最近的一處，其他行為跟
// locate() 一樣（高亮／選取、容錯）。
//
// 斷詞／變化形規則單獨抽成 ../../core/text/occurrences.ts 的純函式
// （findOccurrences 等），這裡只處理「怎麼在目前這篇筆記的畫面上呈現」。

import { MarkdownView, Notice, type App } from "obsidian";
import {
  findOccurrences,
  matchesWord,
  nearestOccurrenceIndex,
  nextOccurrenceIndex,
  occurrenceIndexInLine,
  type Occurrence,
} from "../../core/text/occurrences";
import type { VocabEntry } from "../../core/model/entry";

// main.ts／i18n 共用檔還沒接上正式字串，先用暫時的 const L（整合事項：搬進
// src/core/i18n/{zh-TW,en}.ts，例如 key "locate.notInNote"）。
const L = {
  notInNote: "這篇沒有出現",
};

export interface WordLocator {
  // (#7) 捲到目前筆記裡這個字的位置；同一個字再點一次跳到下一處（循環）。
  locate(entry: Pick<VocabEntry, "id" | "word">): Promise<void>;
  // (#16) 不循環，挑離 near.line 最近的一處。near 省略時當作第 0 行。
  flash(entry: Pick<VocabEntry, "id" | "word">, near?: { line: number }): Promise<void>;
}

const FLASH_MS = 3000;
const FLASH_CLS = "vt-locate-flash";
// 閱讀模式是虛擬化渲染，捲過去後段落可能還沒進 DOM——用短 retry 等它渲染出
// 來，有上限，逾時就放棄 DOM 高亮（至少已經捲到那一行了）。
const RENDER_RETRY_LIMIT = 8;

const WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

// 跟 examHighlight.ts 同一份清單：不要去已經不是「正文」的地方找字（code、
// link、已經追蹤的 ==mark==、這個外掛自己的區塊…）。
const SKIP = [
  "code",
  "pre",
  "a",
  "mark",
  "button",
  "input",
  "textarea",
  "script",
  "style",
  ".math",
  ".tag",
  ".internal-link",
  ".external-link",
  ".frontmatter",
  ".frontmatter-container",
  ".metadata-container",
  "[class*='block-language-']",
  `.${FLASH_CLS}`,
].join(", ");

// 點側欄時 active leaf 常常是側欄本身，getActiveViewOfType(MarkdownView) 會
// 是 null——退而找「主區域最近用過的 leaf」（側欄被點擊時仍然算數）。
export function activeMarkdownView(app: App): MarkdownView | null {
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active) return active;
  const leaf = app.workspace.getMostRecentLeaf();
  return leaf?.view instanceof MarkdownView ? leaf.view : null;
}

function isSourceMode(view: MarkdownView): boolean {
  return view.getMode() === "source";
}

// 編輯模式：選取該範圍並捲到畫面中間，不高亮 (#8)。
function selectInEditor(view: MarkdownView, occ: Occurrence): void {
  const from = { line: occ.line, ch: occ.ch };
  const to = { line: occ.line, ch: occ.ch + occ.length };
  view.editor.setSelection(from, to);
  view.editor.scrollIntoView({ from, to }, true);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// 在 root 底下的文字節點裡，依照跟 findOccurrences 一樣的斷詞／變化形規則，
// 數到第 k 個（0-based）符合 target 的詞，回傳那個文字節點＋在節點裡的起點
// 和長度。Obsidian 沒有公開 API 把「某一行」對應回閱讀模式渲染出來的 DOM，
// 這裡退而求其次：k 用 occurrenceIndexInLine 算出來的「這一處排同一行第幾
// 個」，近似當成「目前已經渲染出來的內容裡第幾個」——還沒渲染出來的段落本
// 來就不在 DOM 裡，不會被算進去；如果同一行前面有已經渲染但使用者看不到的
// 內容，數字可能會偏掉，這是已知的近似，找不到就放棄 DOM 高亮，不丟錯。
function findNthMatch(
  root: HTMLElement,
  target: string,
  inflections: boolean,
  k: number
): { node: Text; start: number; length: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(SKIP) || !/[A-Za-z]/.test(n.nodeValue ?? "")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let seen = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n as Text).nodeValue ?? "";
    for (const m of text.matchAll(WORD_RE)) {
      if (!matchesWord(m[0], target, inflections)) continue;
      if (seen === k) return { node: n as Text, start: m.index!, length: m[0].length };
      seen++;
    }
  }
  return null;
}

// 把文字節點裡 [start, start+length) 包成暫時的 <span>，原節點拆成最多三段
// （前／span／後）插回同一個位置。回傳那個 span。
function wrapRange(node: Text, start: number, length: number): HTMLElement {
  const text = node.nodeValue ?? "";
  const before = text.slice(0, start);
  const hit = text.slice(start, start + length);
  const after = text.slice(start + length);
  const parent = node.parentNode;
  if (!parent) throw new Error("text node has no parent");
  const span = document.createElement("span");
  span.className = FLASH_CLS;
  span.textContent = hit;
  if (before) parent.insertBefore(document.createTextNode(before), node);
  parent.insertBefore(span, node);
  if (after) parent.insertBefore(document.createTextNode(after), node);
  parent.removeChild(node);
  return span;
}

function flashSpan(span: HTMLElement): void {
  span.scrollIntoView({ block: "center" });
  setTimeout(() => {
    // 高亮只是暫時的視覺效果，三秒後把 span 拆掉還原成普通文字節點，不留
    // 痕跡在 DOM 裡。
    span.replaceWith(document.createTextNode(span.textContent ?? ""));
  }, FLASH_MS);
}

async function flashInPreview(view: MarkdownView, occ: Occurrence, k: number, word: string, inflections: boolean): Promise<void> {
  view.previewMode.applyScroll(occ.line);
  let hit: ReturnType<typeof findNthMatch> = null;
  for (let i = 0; i < RENDER_RETRY_LIMIT && !hit; i++) {
    await nextFrame();
    hit = findNthMatch(view.previewMode.containerEl, word, inflections, k);
  }
  if (!hit) return; // 至少已經捲到那一行了 (#8 的容錯)
  flashSpan(wrapRange(hit.node, hit.start, hit.length));
}

async function goTo(view: MarkdownView, occurrences: Occurrence[], index: number, word: string, inflections: boolean): Promise<void> {
  const occ = occurrences[index];
  if (isSourceMode(view)) {
    selectInEditor(view, occ);
    return;
  }
  const k = occurrenceIndexInLine(occurrences, index);
  await flashInPreview(view, occ, k, word, inflections);
}

interface Resolved {
  view: MarkdownView;
  path: string;
  occurrences: Occurrence[];
}

export function createWordLocator(app: App, opts: { inflections: () => boolean }): WordLocator {
  // (#7) 循環狀態：同字、同筆記再點一次才 +1，換字或換筆記重設為 0。
  let last: { entryId: string; path: string; index: number } | null = null;

  function resolve(entry: Pick<VocabEntry, "id" | "word">): Resolved | null {
    const view = activeMarkdownView(app);
    const path = view?.file?.path;
    if (!view || !path) return null;
    const markdown = view.getViewData();
    const occurrences = findOccurrences(markdown, entry.word, opts.inflections());
    if (occurrences.length === 0) {
      new Notice(L.notInNote); // (#9)
      return null;
    }
    return { view, path, occurrences };
  }

  return {
    async locate(entry) {
      const resolved = resolve(entry);
      if (!resolved) return;
      const { view, path, occurrences } = resolved;
      const sameSpot = last !== null && last.entryId === entry.id && last.path === path;
      const index = sameSpot ? nextOccurrenceIndex(last!.index, occurrences.length) : 0;
      last = { entryId: entry.id, path, index };
      await goTo(view, occurrences, index, entry.word, opts.inflections());
    },

    async flash(entry, near) {
      const resolved = resolve(entry);
      if (!resolved) return;
      const { view, occurrences } = resolved;
      const index = nearestOccurrenceIndex(occurrences, near?.line ?? 0);
      if (index < 0) return;
      await goTo(view, occurrences, index, entry.word, opts.inflections());
    },
  };
}

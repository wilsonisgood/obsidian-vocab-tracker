import { getLocale } from "../../core/i18n";

// Temporary strings for the paragraph discussion UI (M5, 規劃書 07 §2.3):
// moved into core/i18n/{zh-TW,en}.ts at integration — the keys below are
// the dictionary keys to use there, so callers only swap `L(` for `t(`.

const zhTW = {
  "paragraph.list.title": "段落討論（{n}）",
  "paragraph.list.hint": "在閱讀模式中，把游標移到段落右側的 ✦ 就能針對那一段提問。",
  "paragraph.list.count": "{n} 則",
  "paragraph.list.orphan": "原文中找不到這段",
  "paragraph.list.edited": "原文已修改",
  "paragraph.list.orphanTitle": "孤立的段落討論（{n}）",
  "paragraph.list.missingNote": "筆記已刪除或移走：{path}",
  "paragraph.action.rebind": "重新綁定",
  "paragraph.action.delete": "刪除",
  "paragraph.action.confirmDelete": "確定刪除？",
  "paragraph.pane.back": "返回",
  "paragraph.pane.title": "段落討論 · ¶{n}",
  "paragraph.pane.titleNoNumber": "段落討論",
  "paragraph.pane.jump": "跳到原文",
  "paragraph.pane.delete": "刪除這串討論",
  "paragraph.pane.placeholder": "追問這一段…",
  "paragraph.pane.edited": "原文已修改：這串討論是針對修改前的文字開始的。",
  "paragraph.pane.orphanParagraph": "原文中找不到這段了（段落被刪除，或在 hash 模式下文字被修改）。可以重新綁定到另一段，或刪除這串討論。",
  "paragraph.pane.orphanFile": "找不到原本的筆記了（已刪除或移走）。可以重新綁定到另一段，或刪除這串討論。",
  "paragraph.pane.hashAnchor": "這段討論用文字比對定位（hash 模式）；段落文字一改就會找不到。",
  "paragraph.notice.blockId":
    "第一次對一段提問時，會在這段最後加上一個看不見的標記（例如 ^vt-k3x9q2），讓段落搬移後討論還找得到它。不想修改筆記的話，可以改用 hash 模式：用文字比對定位，不寫入筆記，但段落文字一改就會找不到。",
  "paragraph.notice.ok": "知道了",
  "paragraph.notice.useHash": "改用 hash 模式（不修改筆記）",
  "paragraph.notice.hashOn": "已改用 hash 模式，之後不會修改你的筆記。",
  "paragraph.rebind.banner": "點選閱讀模式中段落右側的 ✦，把這串討論綁定到那一段。",
  "paragraph.rebind.cancel": "取消",
  "paragraph.rebind.done": "已重新綁定到新的段落",
  "paragraph.rebind.failed": "無法綁定到這一段：{error}",
  "paragraph.deleted": "已刪除段落討論",
  "paragraph.badge.open": "討論這一段",
  "paragraph.badge.count": "這一段有 {n} 則討論",
  "paragraph.error.notAnchorable": "這種區塊（標題、程式碼、表格、callout）還不能討論。",
  "word.discussions": "{n} 則討論",
} as const;

export type ParagraphStringKey = keyof typeof zhTW;

const en: Record<ParagraphStringKey, string> = {
  "paragraph.list.title": "Paragraph discussions ({n})",
  "paragraph.list.hint": "In reading view, hover a paragraph and click the ✦ on its right to ask about it.",
  "paragraph.list.count": "{n} questions",
  "paragraph.list.orphan": "Paragraph not found",
  "paragraph.list.edited": "Text changed",
  "paragraph.list.orphanTitle": "Orphaned paragraph discussions ({n})",
  "paragraph.list.missingNote": "Note deleted or moved: {path}",
  "paragraph.action.rebind": "Rebind",
  "paragraph.action.delete": "Delete",
  "paragraph.action.confirmDelete": "Delete for good?",
  "paragraph.pane.back": "Back",
  "paragraph.pane.title": "Paragraph · ¶{n}",
  "paragraph.pane.titleNoNumber": "Paragraph discussion",
  "paragraph.pane.jump": "Jump to the paragraph",
  "paragraph.pane.delete": "Delete this discussion",
  "paragraph.pane.placeholder": "Ask about this paragraph…",
  "paragraph.pane.edited": "The text has changed since this discussion started.",
  "paragraph.pane.orphanParagraph":
    "This paragraph can't be found any more (deleted, or edited while in hash mode). Rebind the discussion to another paragraph, or delete it.",
  "paragraph.pane.orphanFile":
    "The note this discussion belongs to is gone (deleted or moved). Rebind the discussion to another paragraph, or delete it.",
  "paragraph.pane.hashAnchor": "Found by matching its text (hash mode): editing the paragraph will lose it.",
  "paragraph.notice.blockId":
    "The first question about a paragraph adds a small marker at its end (e.g. ^vt-k3x9q2), so the discussion still finds the paragraph after it moves. If you'd rather not have your notes changed, use hash mode: paragraphs are matched by their text and nothing is written, but editing a paragraph loses its discussion.",
  "paragraph.notice.ok": "Got it",
  "paragraph.notice.useHash": "Use hash mode (don't change notes)",
  "paragraph.notice.hashOn": "Hash mode is on — your notes won't be changed.",
  "paragraph.rebind.banner": "Click the ✦ next to a paragraph in reading view to attach this discussion to it.",
  "paragraph.rebind.cancel": "Cancel",
  "paragraph.rebind.done": "Discussion moved to the new paragraph",
  "paragraph.rebind.failed": "Couldn't attach to that paragraph: {error}",
  "paragraph.deleted": "Paragraph discussion deleted",
  "paragraph.badge.open": "Discuss this paragraph",
  "paragraph.badge.count": "{n} questions about this paragraph",
  "paragraph.error.notAnchorable": "Headings, code, tables and callouts can't be discussed yet.",
  "word.discussions": "{n} questions",
};

export function L(key: ParagraphStringKey, params?: Record<string, string | number>): string {
  const template = getLocale() === "zh-TW" ? zhTW[key] : en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// For the integration report / tests: both dictionaries.
export const PARAGRAPH_STRINGS = { "zh-TW": zhTW as Record<ParagraphStringKey, string>, en };

import { getLocale } from "../../core/i18n";

// Temporary strings for task M (M8 mobile) — to be moved into
// core/i18n/{en,zh-TW}.ts under the same keys at integration (07 §2.3),
// after which lm(key) becomes t(key).
const L = {
  "mobile.sheet.close": { en: "Close", "zh-TW": "關閉" },
  "mobile.sheet.label.word": { en: "Word card: {word}", "zh-TW": "單字卡：{word}" },
  "mobile.sheet.label.paragraph": { en: "Paragraph discussion", "zh-TW": "段落討論" },
  "mobile.sheet.notTracked": { en: "Not in your vocab list yet.", "zh-TW": "還沒有加入單字庫。" },
  "mobile.row.confirmDelete": { en: "Tap again to delete", "zh-TW": "再按一次刪除" },
  "mobile.save.added": { en: "Added “{word}”", "zh-TW": "已加入「{word}」" },
  "mobile.save.undo": { en: "Undo", "zh-TW": "復原" },
  "mobile.save.undone": { en: "Removed “{word}”", "zh-TW": "已移除「{word}」" },
  "mobile.menu.add": { en: "Add “{word}” to Vocab Tracker", "zh-TW": "把「{word}」加入單字庫" },
  "mobile.menu.open": { en: "Open “{word}” in Vocab Tracker", "zh-TW": "在單字追蹤開啟「{word}」" },
  "mobile.menu.added": { en: "Added “{word}” to vocab list", "zh-TW": "已把「{word}」加入單字庫" },
  "mobile.mark.label": { en: "Track “{word}” in Vocab Tracker", "zh-TW": "在單字追蹤查看「{word}」" },
  "mobile.livePreview.text": {
    en: "Tapping a word to save it only works in reading view.",
    "zh-TW": "點字加入單字庫只在「閱讀模式」有效。",
  },
  "mobile.livePreview.switch": { en: "Switch to reading view", "zh-TW": "切換到閱讀模式" },
  "mobile.livePreview.never": { en: "Don’t show again", "zh-TW": "不再提示" },
  "mobile.rebind.pick": {
    en: "Tap the ✦ next to a paragraph to move this discussion there.",
    "zh-TW": "點段落旁的 ✦，把這串討論綁定到那一段。",
  },
  "settings.section.reading": { en: "Tapping words", "zh-TW": "點字動作" },
  "settings.reading.tapAction.name": { en: "Tap a word (desktop)", "zh-TW": "點一下單字（桌面）" },
  "settings.reading.tapAction.desc": {
    en: "What clicking an English word in reading view does on desktop.",
    "zh-TW": "在桌面版閱讀模式點英文單字時要做什麼。",
  },
  "settings.reading.tapActionMobile.name": { en: "Tap a word (iPhone / iPad)", "zh-TW": "點一下單字（iPhone／iPad）" },
  "settings.reading.tapActionMobile.desc": {
    en: "What tapping an English word in reading view does on mobile. On iPhone, cards open in a sheet at the bottom instead of the sidebar.",
    "zh-TW": "在行動裝置閱讀模式點英文單字時要做什麼。iPhone 上單字卡會從底部抽屜打開，不會蓋住全文。",
  },
  "settings.reading.tap.menu": { en: "Show a menu", "zh-TW": "跳出選單" },
  "settings.reading.tap.save": { en: "Save it right away", "zh-TW": "直接存成單字" },
  "settings.reading.tap.open": { en: "Open its card (don’t save)", "zh-TW": "打開單字卡（不儲存）" },
  "settings.reading.livePreviewHint.name": { en: "Live Preview hint", "zh-TW": "Live Preview 提示" },
  "settings.reading.livePreviewHint.desc": {
    en: "On mobile, tell me once per session when I tap a word in Live Preview, where tapping can’t save words.",
    "zh-TW": "在行動裝置的 Live Preview（即時預覽）點字時，每次開啟提醒一次：點字只在閱讀模式有效。",
  },
} as const;

export type MobileKey = keyof typeof L;

export function lm(key: MobileKey, params?: Record<string, string | number>): string {
  const template: string = L[key][getLocale()] ?? L[key].en;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// For the integration report: every key with both texts.
export const MOBILE_STRINGS = L;

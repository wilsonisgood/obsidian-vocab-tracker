// Exam-word highlighting settings (規劃書 03 §3.2). Lists themselves live
// as files in the vault (`folder`), so they sync like any other note; only
// display preferences are stored here.

export interface WordlistTagSettings {
  enabled?: boolean;
  color?: string;
}

export interface WordlistSettings {
  // Per-section sync stamp (see SectionStamp in ./settings). Deliberately
  // not copied by resolveWordlistSettings: main.ts compares resolved
  // settings as JSON to decide whether lists need reloading, and a
  // stamp-only change must not trigger that.
  updatedAt?: string;
  // Vault folder holding one list file per tag.
  folder: string;
  // Master switch for reading-view underlines (the sidebar stats still run).
  highlight: boolean;
  // Also match inflected forms ("analyzed" → "analyze").
  inflections: boolean;
  // Add a note's list words to the vocab list the first time it's opened.
  autoImport: boolean;
  // Per-tag overrides; a tag missing here is enabled with its default colour.
  tags: Record<string, WordlistTagSettings>;
  // Wave 8 S (1006-2 #4, #5)：側欄／dashboard／用法總表共用的「Like」chip
  // 開關——跟 tags[tag].enabled 同一類，但不綁某個 tag，獨立一個布林。預設
  // 開（跟現有「liked 的字一律列出」的行為一致），按淡後只隱藏「靠 liked
  // 撐著、沒有任何亮著標籤」的字（見 core/model/like.ts 的 isListed()）。
  likeEnabled?: boolean;
}

export const DEFAULT_WORDLIST_FOLDER = "vocab-wordlists";

export function resolveWordlistSettings(partial: Partial<WordlistSettings> | undefined): WordlistSettings {
  const folder = typeof partial?.folder === "string" ? partial.folder.trim().replace(/^\/+|\/+$/g, "") : "";
  return {
    folder: folder || DEFAULT_WORDLIST_FOLDER,
    highlight: partial?.highlight ?? true,
    inflections: partial?.inflections ?? true,
    autoImport: partial?.autoImport ?? true,
    tags: partial?.tags && typeof partial.tags === "object" ? partial.tags : {},
    likeEnabled: partial?.likeEnabled ?? true,
  };
}

// Well-known exams get a fixed, recognisable colour; anything else hashes
// into the palette so a tag keeps its colour as lists come and go.
const KNOWN: [RegExp, string][] = [
  [/toefl/i, "#3b82f6"],
  [/ielts/i, "#10b981"],
  [/toeic/i, "#f59e0b"],
  [/gept|全民/i, "#8b5cf6"],
  [/\b(gre|gmat|sat)\b/i, "#ef4444"],
];

const PALETTE = ["#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48", "#a855f7"];

export function defaultTagColor(tag: string): string {
  for (const [re, color] of KNOWN) if (re.test(tag)) return color;
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function tagColor(s: WordlistSettings, tag: string): string {
  return s.tags[tag]?.color || defaultTagColor(tag);
}

export function tagEnabled(s: WordlistSettings, tag: string): boolean {
  return s.tags[tag]?.enabled !== false;
}

// Wave 8 S (1006-2 #4)：Like chip 亮不亮，跟 tagEnabled() 同一種「預設開、
// 顯式 false 才關」語意，餵給 core/model/like.ts 的 IsListedContext.likeOn。
export function likeChipOn(s: WordlistSettings): boolean {
  return s.likeEnabled !== false;
}

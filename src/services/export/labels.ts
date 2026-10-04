import type { ExportLabels } from "./types";

// Headings and fixed text written into exported notes. Temporary home (規劃書
// 07 §2 rule 3): these move into core/i18n as `export.*` keys at
// integration, and ExportService then builds its labels with t().

export const EXPORT_LABELS_ZH: ExportLabels = {
  families: "字族",
  familiesEmpty: "還沒有字族。",
  usage: "用法",
  usageEmpty: "還沒有用法。",
  usageRelated: "相關片語",
  trivia: "冷知識收藏",
  triviaEmpty: "還沒有收藏。",
  triviaMentionedIn: "也提到這個字",
  discussion: "AI 討論",
  discussionEmpty: "還沒有討論。",
  userNotesHint: "以下是你的筆記，插件不會改動",
  paragraphsEmpty: "還沒有段落討論。",
  paragraphOrphaned: "原文中找不到這段",
  wordsLearned: "這篇學到的單字",
  wordsEmpty: "這篇還沒有加入單字。",
  wordQuestions: "{n} 則討論",
  favorites: "收藏",
  favoritesEmpty: "還沒有收藏。",
  aborted: "（已停止）",
};

export const EXPORT_LABELS_EN: ExportLabels = {
  families: "Word families",
  familiesEmpty: "No word families yet.",
  usage: "Usage",
  usageEmpty: "No usage notes yet.",
  usageRelated: "Related phrases",
  trivia: "Saved trivia",
  triviaEmpty: "Nothing saved yet.",
  triviaMentionedIn: "Also mentioned in",
  discussion: "AI discussion",
  discussionEmpty: "No discussion yet.",
  userNotesHint: "Your notes below — the plugin never changes them",
  paragraphsEmpty: "No paragraph discussions yet.",
  paragraphOrphaned: "Paragraph no longer found in the note",
  wordsLearned: "Words from this note",
  wordsEmpty: "No words added from this note yet.",
  wordQuestions: "{n} questions",
  favorites: "Saved",
  favoritesEmpty: "Nothing saved yet.",
  aborted: "(stopped)",
};

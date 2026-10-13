// 常用多義詞 (第十七波, 規劃書 12 L3, docs/feature/1013-polysemy-map.md).

// A 介系詞與小品詞 · B 萬用動詞 · C 多義名詞 · D 形容詞與副詞 · E 連接詞與功能詞
export type PolyCategory = "A" | "B" | "C" | "D" | "E";
export type PolyLevel = 1 | 2 | 3;

export interface PolySense {
  // "<word>.<slug>", e.g. "get.arrive". Permanent.
  id: string;
  word: string;
  // 意思 (Chinese gloss).
  zh: string;
  // The shortest collocation showing it.
  example: string;
  // 判斷線索: what around the word gives this sense away.
  cue: string;
  // 1 基礎 / 2 中級 / 3 進階.
  level: PolyLevel;
}

export interface PolyWord {
  word: string;
  category: PolyCategory;
  senses: PolySense[];
  // Common phrases: wrong options and explanation material only (P3).
  phrases: string[];
}

// The 常用字 tab's filter (stored as LearnerStore.filter("poly")).
export interface PolyFilter {
  // Words to practise. Empty = nothing chosen yet.
  words: string[];
  // Sense levels to test. Empty = every level.
  levels: PolyLevel[];
  // Sense ids unticked in the sense map: sent as 「參考」 (wrong options /
  // story only), never tested.
  excluded: string[];
}

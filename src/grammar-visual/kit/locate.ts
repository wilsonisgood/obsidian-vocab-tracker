import type { Mark, MarkTone, MarkedSentence } from "../types";

// 比對用：不分大小寫，彎引號當直引號（’ ‘ → '，“ ” → "）。每個字元一對一
// 換掉，長度不變，找到的位置可以直接用在原句上。
function fold(s: string): string {
  return s.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"');
}

// 在句子裡找一個字：優先找「前後不是英文字母」的完整單字，找不到才退回一般子字串。
export function locate(text: string, word: string): number {
  if (word === "") return -1;
  const t = fold(text);
  const w = fold(word.trim());
  if (w === "") return -1;
  const isWordChar = (c: string): boolean => /[a-z]/.test(c);
  for (let from = 0; ; ) {
    const i = t.indexOf(w, from);
    if (i < 0) break;
    const before = i === 0 ? "" : t[i - 1];
    const after = t[i + w.length] ?? "";
    const startOk = !isWordChar(w[0]) || !isWordChar(before);
    const endOk = !isWordChar(w[w.length - 1]) || !isWordChar(after);
    if (startOk && endOk) return i;
    from = i + 1;
  }
  return t.indexOf(w);
}

// 句子裡實際寫的那一段（大小寫、引號照原句），找不到回 null。
export function located(text: string, word: string): string | null {
  const i = locate(text, word);
  return i < 0 ? null : text.slice(i, i + fold(word.trim()).length);
}

// 把幾個字標成同一種顏色，回傳可以直接丟給 sentence() 的句子；重疊或找不到的略過。
export function markWords(text: string, words: readonly string[], tone: MarkTone): MarkedSentence {
  const hits = words
    .map((w) => ({ i: locate(text, w), w: located(text, w) ?? "" }))
    .filter((h) => h.i >= 0 && h.w !== "")
    .sort((a, b) => a.i - b.i);
  const marks: Mark[] = [];
  let end = 0;
  for (const h of hits) {
    if (h.i < end) continue;
    marks.push({ text: h.w, tone });
    end = h.i + h.w.length;
  }
  return { text, marks };
}

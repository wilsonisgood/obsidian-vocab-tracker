import type { Mark, MarkTone, MarkedSentence } from "../types";

// 在句子裡找一個字：優先找「前後不是英文字母」的完整單字，找不到才退回一般子字串。
export function locate(text: string, word: string): number {
  if (word === "") return -1;
  let from = 0;
  for (;;) {
    const i = text.indexOf(word, from);
    if (i < 0) return -1;
    const before = i === 0 ? "" : text[i - 1];
    const after = text[i + word.length] ?? "";
    const isWordChar = (c: string): boolean => /[A-Za-z]/.test(c);
    const startOk = !isWordChar(word[0]) || !isWordChar(before);
    const endOk = !isWordChar(word[word.length - 1]) || !isWordChar(after);
    if (startOk && endOk) return i;
    from = i + 1;
  }
}

// 把幾個字標成同一種顏色，回傳可以直接丟給 sentence() 的句子；重疊或找不到的略過。
export function markWords(text: string, words: readonly string[], tone: MarkTone): MarkedSentence {
  const hits = words
    .map((w) => ({ w, i: locate(text, w) }))
    .filter((h) => h.i >= 0)
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

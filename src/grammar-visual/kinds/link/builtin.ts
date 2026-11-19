import type { LinkVisual } from "../../types";

export const BUILTIN: Record<string, LinkVisual> = {
  "personal-pronouns": {
    kind: "link",
    sentence: { text: "Mia lost her keys, so she looked for them.", marks: [{ text: "she", tone: "accent" }] },
    explain: "代名詞要指回前面提過的人事物；主詞位置用主格 she，放在名詞前說明誰的用所有格 her，受詞位置用受格 them。",
    links: [
      { from: "she", to: "Mia", kind: "refer", why: "主詞位置用主格 she，不是 her" },
      { from: "her", to: "Mia", kind: "modify", why: "her 是所有格，說明是誰的鑰匙" },
      { from: "them", to: "keys", kind: "refer", why: "keys 是複數，所以用受格 them" },
    ],
  },
  "reflexive-pronouns": {
    kind: "link",
    sentence: { text: "Tom cut himself while he was cooking by himself.", marks: [{ text: "himself", tone: "accent" }] },
    explain: "動作回到做動作的人身上，就用反身代名詞；by himself 則表示「自己一個人」。",
    links: [
      { from: "himself", to: "Tom", kind: "refer", why: "主詞和受詞是同一個人，受詞用 himself" },
      { from: "he", to: "Tom", kind: "refer", why: "he 是一般主格代名詞，不是反身" },
      { from: "by himself", to: "Tom", kind: "refer", why: "by himself 表示獨自、沒人幫忙" },
    ],
  },
  "possessive-s": {
    kind: "link",
    sentence: { text: "Tom's sister borrowed the boys' bikes.", marks: [{ text: "Tom's", tone: "accent" }] },
    explain: "單數名詞加 's，複數名詞（已經有 s）只加 '；所有格的字都連到「被擁有」的東西。",
    links: [
      { from: "Tom's", to: "sister", kind: "modify", why: "單數 Tom 加 's，表示這個姊姊是 Tom 的" },
      { from: "boys'", to: "bikes", kind: "modify", why: "複數 boys 已經有 s，只加 '" },
    ],
  },
  demonstratives: {
    kind: "link",
    sentence: { text: "These apples are fresh, but those over there are old.", marks: [{ text: "These", tone: "accent" }] },
    explain: "近的用 this / these，遠的用 that / those；單複數要跟後面的名詞一致，單獨出現時就是代名詞。",
    links: [
      { from: "These", to: "apples", kind: "modify", why: "apples 是複數又在近處，用 These" },
      { from: "those", to: "apples", kind: "refer", why: "those 單獨當代名詞，指遠處那些蘋果" },
      { from: "over there", to: "those", kind: "modify", why: "over there 表示距離遠，所以用 those" },
    ],
  },
  "ellipsis-substitution": {
    kind: "link",
    sentence: {
      text: "Tom likes tea, and so does Amy, but I don't, and neither does Ben.",
      marks: [{ text: "so does", tone: "accent" }],
    },
    explain: "so does Amy 取代「Amy 也喜歡茶」，neither does Ben 取代「Ben 也不喜歡」，不用重複前面整句。",
    links: [
      { from: "so does Amy", to: "likes tea", kind: "refer", why: "肯定句後面用 so + 助動詞 + 主詞，表示「也是」" },
      { from: "neither does Ben", to: "don't", kind: "refer", why: "否定句後面用 neither + 助動詞 + 主詞，表示「也不」" },
    ],
  },
  "adjectives-adverbs": {
    kind: "link",
    sentence: { text: "Mia is a careful driver, and she drives carefully.", marks: [{ text: "careful", tone: "amber" }] },
    explain: "形容詞修飾名詞，副詞（通常是形容詞加 -ly）修飾動作；兩個長得像，但連到的字不同。",
    links: [
      { from: "careful", to: "driver", kind: "modify", why: "形容詞修飾名詞 driver" },
      { from: "carefully", to: "drives", kind: "modify", why: "副詞修飾動作 drives" },
      { from: "she", to: "Mia", kind: "refer", why: "she 指回前面的 Mia" },
    ],
  },
};

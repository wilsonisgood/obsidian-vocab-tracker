import type { AgreementVisual } from "../../types";

export const BUILTIN: Record<string, AgreementVisual> = {
  "be-verb": {
    kind: "agreement",
    sentence: {
      text: "My sister and I are in the same class.",
      marks: [
        { text: "sister and I", tone: "accent" },
        { text: "are", tone: "accent" },
      ],
    },
    explain: "用 and 連起來的兩個人是複數，所以不管裡面有沒有 I，都用 are，不用 am。",
    head: "sister and I",
    number: "plural",
    skip: "",
    verb: "are",
    steps: [
      "找主詞：sister and I，兩個人用 and 連起來",
      "兩個以上用 and 連接 → 複數",
      "複數主詞配 are，不是 am / is",
    ],
    traps: [
      { example: "Are you ready?", note: "疑問句把 be 提前，仍然看 you 來選 are" },
      { example: "She is not tired.", note: "否定的 not 放在 be 動詞後面" },
      { example: "I am a student.", note: "只有 I 配 am，其他單數用 is" },
    ],
  },
  "there-is-are": {
    kind: "agreement",
    sentence: {
      text: "There are two cats on the sofa.",
      marks: [
        { text: "are", tone: "accent" },
        { text: "cats", tone: "accent" },
        { text: "on the sofa", tone: "strike" },
      ],
    },
    explain: "there 只是引出句子，真正的主詞在 be 動詞後面；動詞要跟後面的名詞 cats 一致。",
    head: "cats",
    number: "plural",
    skip: "on the sofa",
    verb: "are",
    steps: [
      "there 不是主詞，先跳過",
      "看 be 動詞後面的名詞：two cats，核心是 cats（複數）",
      "on the sofa 只說明位置，先劃掉",
      "動詞跟 cats 配 → are",
    ],
    traps: [
      { example: "There is a cat and two dogs.", note: "口語常看離動詞最近的名詞，正式寫法看全部" },
      { example: "Is there any milk?", note: "疑問句把 is 提前，milk 不可數用 is" },
      { example: "There aren't any seats.", note: "否定句 not 加在 be 後面" },
    ],
  },
  "agreement-difficult": {
    kind: "agreement",
    sentence: {
      text: "The number of students in the classes is growing.",
      marks: [
        { text: "number", tone: "accent" },
        { text: "of students in the classes", tone: "strike" },
        { text: "is", tone: "accent" },
      ],
    },
    explain: "the number of 的核心是 number（單數）；students 離動詞再近也只是修飾，所以用 is。",
    head: "number",
    number: "singular",
    skip: "of students in the classes",
    verb: "is",
    steps: [
      "找主詞的核心名詞：number（單數）",
      "中間的 of students in the classes 只是修飾，先劃掉",
      "動詞跟 number 配 → is",
    ],
    traps: [
      { example: "A number of students are late.", note: "a number of 等於「很多」，動詞看 students，用複數" },
      { example: "The team is winning. / The team are arguing.", note: "集合名詞視為一體用單數，強調每個人用複數" },
      { example: "Each of them has a key.", note: "核心是 each，單數" },
    ],
  },
};

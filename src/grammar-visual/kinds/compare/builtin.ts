import type { CompareVisual } from "../../types";

export const BUILTIN: Record<string, CompareVisual> = {
  "comparatives-superlatives": {
    kind: "compare",
    sentence: {
      text: "Tom is taller than Amy, but Ben is the tallest.",
      marks: [
        { text: "taller than", tone: "accent" },
        { text: "the tallest", tone: "accent" },
      ],
    },
    explain: "兩個人比用 taller than；三個以上挑出第一名用 the tallest，前面一定有 the。",
    items: [
      { label: "Amy", value: 50, note: "" },
      { label: "Tom", value: 70, note: "比 Amy 高" },
      { label: "Ben", value: 85, note: "全部裡最高" },
    ],
    relation: "comparative",
    focus: "Tom",
    forms: ["tall", "taller", "tallest"],
  },
  "comparison-advanced": {
    kind: "compare",
    sentence: {
      text: "The red bag is as expensive as the blue bag, but less expensive than the black one.",
      marks: [
        { text: "as expensive as", tone: "accent" },
        { text: "less expensive than", tone: "amber" },
      ],
    },
    explain: "as ... as 表示兩者一樣；less ... than 表示比較少，和 more ... than 剛好相反。",
    items: [
      { label: "Red", value: 60, note: "和 Blue 一樣貴" },
      { label: "Blue", value: 60, note: "和 Red 一樣貴" },
      { label: "Black", value: 90, note: "最貴" },
    ],
    relation: "equal",
    focus: "Red",
    forms: ["expensive", "as expensive as", "less expensive than"],
  },
};

import type { ClauseVisual } from "../../types";

export const CLAUSE_BUILTIN: Record<string, ClauseVisual> = {
  "relative-clauses-basic": {
    kind: "clause",
    sentence: { text: "The woman who lives next door is a doctor.", marks: [{ text: "who lives next door", tone: "amber" }] },
    explain: "關係子句緊跟在被修飾的名詞後面；人用 who，事物用 which，that 兩者都可以。拿掉黃色那段，主幹仍然成立。",
    core: "The woman … is a doctor.",
    clauses: [{ text: "who lives next door", type: "關係子句（限定）", attachTo: "The woman", gloss: "住在隔壁的（那位女士）", depth: 1 }],
  },
  "relative-clauses-defining-non": {
    kind: "clause",
    sentence: { text: "My brother, who lives in Tokyo, is a nurse.", marks: [{ text: "who lives in Tokyo", tone: "amber" }] },
    explain: "有逗號的是非限定子句，只是補充資訊，拿掉不影響你知道是誰；沒有逗號的限定子句則是辨識用的，拿掉就不知道指哪一個。",
    core: "My brother … is a nurse.",
    clauses: [{ text: "who lives in Tokyo", type: "關係子句（非限定）", attachTo: "My brother", gloss: "補充：他住在東京", depth: 1 }],
  },
  "advanced-relative-clauses": {
    kind: "clause",
    sentence: {
      text: "I know the author whose book, which won a prize, was translated into ten languages.",
      marks: [{ text: "whose book, which won a prize, was translated into ten languages", tone: "amber" }],
    },
    explain: "whose 表示所屬，後面接名詞；子句裡還可以再套一個關係子句（which won a prize 修飾 book），一層一層往內讀。",
    core: "I know the author.",
    clauses: [
      { text: "whose book was translated into ten languages", type: "關係子句（whose）", attachTo: "the author", gloss: "（那位作者）他的書被翻成十種語言", depth: 1 },
      { text: "which won a prize", type: "關係子句（非限定）", attachTo: "book", gloss: "那本書得過獎", depth: 2 },
    ],
  },
  "noun-clauses": {
    kind: "clause",
    sentence: { text: "I don't know what she wants.", marks: [{ text: "what she wants", tone: "amber" }] },
    explain: "名詞子句整段當一個名詞用，這裡是 know 的受詞。疑問詞引導的名詞子句用陳述語序（what she wants），不用問句語序。",
    core: "I don't know …",
    clauses: [{ text: "what she wants", type: "名詞子句（受詞）", attachTo: "know", gloss: "她想要什麼（當作 know 的受詞）", depth: 1 }],
  },
  "participle-clauses-intro": {
    kind: "clause",
    sentence: { text: "Walking down the street, I met an old friend.", marks: [{ text: "Walking down the street", tone: "amber" }] },
    explain: "-ing 分詞子句表示主動、同時發生；它的意義主詞必須和主句的主詞一樣，這裡走路的人就是 I。",
    core: "I met an old friend.",
    clauses: [{ text: "Walking down the street", type: "分詞子句（-ing）", attachTo: "I met", gloss: "我走在街上的時候（= While I was walking…）", depth: 1 }],
  },
  "participle-reduced-clauses": {
    kind: "clause",
    sentence: { text: "Having finished the report, she went home.", marks: [{ text: "Having finished the report", tone: "amber" }] },
    explain: "Having done 表示這個動作比主句先完成，縮減自 After she had finished…；分詞的意義主詞要和主句主詞一致，否則會造成誤會。",
    core: "She went home.",
    clauses: [{ text: "Having finished the report", type: "分詞子句（完成）", attachTo: "She went", gloss: "寫完報告之後（= After she had finished…）", depth: 1 }],
  },
  nominalization: {
    kind: "clause",
    sentence: {
      text: "The rapid expansion of the company surprised everyone.",
      marks: [{ text: "rapid expansion of the company", tone: "amber" }],
    },
    explain: "名詞化把整件事壓成一個名詞片語。讀不懂時把它還原：the company expanded rapidly（誰做了什麼），句子就攤開了。",
    core: "The … surprised everyone.",
    clauses: [{ text: "rapid expansion of the company", type: "名詞化", attachTo: "The", gloss: "還原：公司快速擴張（The company expanded rapidly）", depth: 1 }],
  },
};

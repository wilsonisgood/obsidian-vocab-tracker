import type { ConnectorVisual, Relation } from "../../types";

type Cmp = [string, string, string];
const v = (
  text: string,
  link: string,
  relation: Relation,
  explainText: string,
  left: [string, string],
  right: [string, string],
  compare: Cmp[]
): ConnectorVisual => ({
  kind: "connector",
  sentence: { text, marks: [{ text: link, tone: "accent" }] },
  explain: explainText,
  relation,
  link: link.toLowerCase(),
  left: { text: left[0], note: left[1] },
  right: { text: right[0], note: right[1] },
  compare: compare.map(([word, form, example]) => ({ word, form, example })),
});

export const BUILTIN: Record<string, ConnectorVisual> = {
  "basic-conjunctions": v(
    "It rained, so we stayed home.",
    "so",
    "cause",
    "so 引出結果，because 引出原因，兩者只是換個位置說同一件事。連接兩個完整的句子時，前面常加逗號。",
    ["下雨了", "原因"],
    ["我們待在家", "結果"],
    [
      ["so", "放在結果前面", "It rained, so we stayed home."],
      ["because", "+ 子句", "We stayed home because it rained."],
      ["because of", "+ 名詞", "because of the rain"],
    ]
  ),
  "concession-contrast": v(
    "Although it rained, we went hiking.",
    "Although",
    "contrast",
    "although 後面接完整子句，despite 後面接名詞；however 則是另起一句的轉折副詞，前面要斷句。",
    ["下雨了", "通常會讓人不出門"],
    ["我們還是去爬山", "結果跟預期相反"],
    [
      ["although", "+ 子句", "although it rained"],
      ["despite", "+ 名詞 / V-ing", "despite the rain"],
      ["however", "另起一句", "It rained. However, we went hiking."],
    ]
  ),
  "unless-in-case-as-long-as": v(
    "Take an umbrella in case it rains.",
    "in case",
    "condition",
    "in case 是「以防萬一」，先做準備；unless 等於 if ... not；as long as 是「只要」。它們後面都接子句，且不用 will。",
    ["帶傘", "先做的準備"],
    ["可能會下雨", "還沒發生"],
    [
      ["in case", "+ 子句（以防）", "in case it rains"],
      ["unless", "+ 子句（除非）", "unless it stops raining"],
      ["as long as", "+ 子句（只要）", "as long as it stays dry"],
    ]
  ),
  "purpose-to-infinitive": v(
    "We left early to catch the train.",
    "to",
    "purpose",
    "to + 原形動詞說明做這件事的目的。for 後面接名詞（for a walk）；想連接完整子句時用 so that。",
    ["我們提早出門", "做的事"],
    ["趕上火車", "想達到的目的"],
    [
      ["to", "+ 原形動詞", "to catch the train"],
      ["in order to", "+ 原形動詞（較正式）", "in order to catch the train"],
      ["so that", "+ 子句", "so that we could catch it"],
    ]
  ),
  "future-time-clauses": v(
    "When I get home, I will call you.",
    "When",
    "sequence",
    "談未來時，when、after、before、until、as soon as 後面的時間子句用現在式，不用 will；will 只放在主要子句。",
    ["我到家", "時間子句用現在式"],
    ["我會打給你", "主要子句用 will"],
    [
      ["when", "+ 現在式（表未來）", "when I get home"],
      ["as soon as", "+ 現在式（一…就…）", "as soon as I arrive"],
      ["until", "+ 現在式（直到）", "until she comes back"],
    ]
  ),
  "discourse-connectors": v(
    "Tom likes tea, whereas Anna prefers coffee.",
    "whereas",
    "contrast",
    "whereas 和 while 把兩個並列的事物拿來對比，語氣偏正式；notwithstanding 是更正式的讓步，後面接名詞。",
    ["Tom 喜歡茶", "對比的一方"],
    ["Anna 比較愛咖啡", "對比的另一方"],
    [
      ["whereas", "+ 子句（對比，較正式）", "whereas Anna prefers coffee"],
      ["while", "+ 子句（對比）", "while Anna prefers coffee"],
      ["notwithstanding", "+ 名詞（正式讓步）", "notwithstanding the rain"],
    ]
  ),
};

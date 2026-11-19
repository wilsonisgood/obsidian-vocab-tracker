import type { ConnectorSet, MarkedSentence, Relation } from "../../types";

export const RELATIONS: readonly Relation[] = ["cause", "contrast", "condition", "purpose", "addition", "sequence"];

export const RELATION_LABEL: Record<Relation, { name: string; sym: string }> = {
  cause: { name: "因果", sym: "→" },
  contrast: { name: "轉折", sym: "⇄" },
  condition: { name: "條件", sym: "⊣" },
  purpose: { name: "目的", sym: "⟶" },
  addition: { name: "並列", sym: "+" },
  sequence: { name: "時間先後", sym: "⋯" },
};

export interface RelationExample {
  sentence: MarkedSentence;
  set: ConnectorSet;
}

const ex = (
  pre: string,
  link: string,
  post: string,
  set: ConnectorSet
): RelationExample => ({ sentence: { text: pre + link + post, marks: [{ text: link, tone: "accent" }] }, set });

// 六種關係的內建例句：切換鈕切到不是這句的關係時，顯示這裡的資料。
export const RELATION_EXAMPLES: Record<Relation, RelationExample> = {
  cause: ex("", "Because", " it rained, we stayed home.", {
    relation: "cause",
    link: "because",
    left: { text: "下雨了", note: "原因" },
    right: { text: "我們待在家", note: "結果" },
    compare: [
      { word: "because", form: "+ 子句", example: "because it rained" },
      { word: "because of", form: "+ 名詞", example: "because of the rain" },
      { word: "so", form: "放在結果前面", example: "It rained, so we stayed home." },
    ],
  }),
  contrast: ex("", "Although", " it rained, we went hiking.", {
    relation: "contrast",
    link: "although",
    left: { text: "下雨了", note: "通常會讓人不出門" },
    right: { text: "我們還是去爬山", note: "結果跟預期相反" },
    compare: [
      { word: "although", form: "+ 子句", example: "although it rained" },
      { word: "despite", form: "+ 名詞 / V-ing", example: "despite the rain" },
      { word: "however", form: "另起一句", example: "It rained. However, …" },
    ],
  }),
  condition: ex("", "If", " it rains, we will stay home.", {
    relation: "condition",
    link: "if",
    left: { text: "如果下雨", note: "條件" },
    right: { text: "我們就待在家", note: "條件成立才會發生" },
    compare: [
      { word: "if", form: "+ 子句（如果）", example: "if it rains" },
      { word: "unless", form: "+ 子句（除非）", example: "unless it stops raining" },
      { word: "in case", form: "+ 子句（以防）", example: "in case it rains" },
    ],
  }),
  purpose: ex("We left early ", "to", " catch the train.", {
    relation: "purpose",
    link: "to",
    left: { text: "我們提早出門", note: "做的事" },
    right: { text: "趕上火車", note: "想達到的結果" },
    compare: [
      { word: "to", form: "+ 原形動詞", example: "to catch the train" },
      { word: "in order to", form: "+ 原形動詞（較正式）", example: "in order to catch the train" },
      { word: "so that", form: "+ 子句", example: "so that we could catch it" },
    ],
  }),
  addition: ex("She sings ", "and", " plays the piano.", {
    relation: "addition",
    link: "and",
    left: { text: "她會唱歌", note: "一件事" },
    right: { text: "她會彈琴", note: "再加一件" },
    compare: [
      { word: "and", form: "連接兩個詞或子句", example: "sings and plays" },
      { word: "both … and", form: "兩個都，語氣較強", example: "both sings and plays" },
      { word: "not only … but also", form: "不只…還…", example: "not only sings but also plays" },
    ],
  }),
  sequence: ex("", "After", " we had lunch, we went hiking.", {
    relation: "sequence",
    link: "after",
    left: { text: "吃完午餐", note: "先發生" },
    right: { text: "去爬山", note: "後發生" },
    compare: [
      { word: "after", form: "+ 子句 / 名詞", example: "after lunch" },
      { word: "before", form: "+ 子句 / 名詞", example: "before it got dark" },
      { word: "when", form: "+ 子句（同時或緊接著）", example: "when we arrived" },
    ],
  }),
};

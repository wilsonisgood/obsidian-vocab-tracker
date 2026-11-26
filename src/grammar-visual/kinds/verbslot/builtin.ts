import type { MarkTone, VerbSlotCard, VerbSlotVisual } from "../../types";

type P = [string, "plain" | "stop" | "accent"];
const c = (pattern: string, meaning: string, picture: P[], current = false): VerbSlotCard => ({
  pattern,
  meaning,
  picture: picture.map(([text, tone]) => ({ text, tone })),
  current,
});
const v = (
  text: string,
  marks: [string, MarkTone][],
  explainText: string,
  verb: string,
  cards: VerbSlotCard[],
  family: string[]
): VerbSlotVisual => ({
  kind: "verbslot",
  sentence: { text, marks: marks.map(([t, tone]) => ({ text: t, tone })) },
  explain: explainText,
  verb,
  cards,
  family,
});

export const BUILTIN: Record<string, VerbSlotVisual> = {
  "gerund-infinitive-intro": v(
    "She enjoys swimming.",
    [["enjoys swimming", "accent"]],
    "enjoy 後面只能接動名詞（-ing），不能接 to do。finish、mind、avoid 也一樣；want、hope、decide 則反過來只接 to do。",
    "enjoy",
    [
      c("enjoy doing", "後面接 -ing", [["enjoy", "plain"], ["swimming", "accent"]], true),
      c("enjoy to do", "不能這樣用", []),
    ],
    ["finish", "mind", "avoid", "keep", "practise"]
  ),
  "gerund-vs-infinitive-meaning": v(
    "He stopped to buy coffee.",
    [["stopped to buy", "accent"]],
    "to 有「往前、目的」的感覺，所以 stop to buy 是停下來之後要去買咖啡；stop buying 才是不再買了。",
    "stop",
    [
      c("stop doing", "停掉正在做的事", [["走路", "stop"]]),
      c("stop to do", "停下來，為了去做另一件事", [["走路", "stop"], ["買咖啡", "accent"]], true),
    ],
    ["remember", "forget", "try", "regret", "go on"]
  ),
  "verb-preposition": v(
    "It depends on the weather.",
    [["depends on", "accent"]],
    "depend 固定搭配 on，後面接名詞；介系詞後面如果是動作，要用動名詞：depend on getting there early。",
    "depend",
    [
      c("depend on + 名詞", "取決於某個事物", [["depend", "plain"], ["on", "accent"], ["the weather", "plain"]], true),
      c("depend on + V-ing", "介系詞後面的動作用 -ing", [["depend", "plain"], ["on", "accent"], ["getting there", "plain"]]),
    ],
    ["belong to", "listen to", "wait for", "look at", "worry about"]
  ),
  "adjective-preposition": v(
    "She is interested in history.",
    [["interested in", "accent"]],
    "形容詞要記整組搭配：interested in、afraid of、good at。介系詞後面接名詞，或是動名詞：interested in learning。",
    "interested",
    [
      c("interested in + 名詞", "對某事物有興趣", [["interested", "plain"], ["in", "accent"], ["history", "plain"]], true),
      c("interested in + V-ing", "對做某事有興趣", [["interested", "plain"], ["in", "accent"], ["learning", "plain"]]),
    ],
    ["afraid of", "good at", "keen on", "proud of", "tired of"]
  ),
  "used-to-be-used-to": v(
    "I am used to getting up early.",
    [["am used to getting", "accent"]],
    "used to + 原形動詞是過去的習慣，現在已經不做；be used to + -ing 是已經習慣；get used to + -ing 是逐漸習慣中。這裡的 to 是介系詞。",
    "used to",
    [
      c("used to + 原形", "以前常做，現在不做了", [["以前常做", "plain"], ["現在不做", "stop"]]),
      c("be used to + -ing", "已經習慣了", [["已經習慣", "accent"]], true),
      c("get used to + -ing", "逐漸習慣中", [["還不習慣", "plain"], ["慢慢習慣", "accent"]]),
    ],
    []
  ),
};

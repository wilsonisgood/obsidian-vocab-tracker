import type { MarkTone, PathStep, PathVisual } from "../../types";

const s = (q: string, note: string, result: string): PathStep => ({ q, note, result });
const v = (
  text: string,
  marks: [string, MarkTone][],
  explainText: string,
  steps: PathStep[],
  stopAt: number
): PathVisual => ({
  kind: "path",
  sentence: { text, marks: marks.map(([t, tone]) => ({ text: t, tone })) },
  explain: explainText,
  steps,
  stopAt,
});

export const BUILTIN: Record<string, PathVisual> = {
  "articles-basic": v(
    "I saw a dog in the park. The dog was barking.",
    [["a dog", "accent"], ["The dog", "accent"]],
    "同一隻狗，第一次出現時聽的人還不認識，用 a；第二次已經認識了，就換成 the。a / an 看後面字的發音：an hour、a university。",
    [
      s("聽的人知道是哪一隻嗎？", "知道：前一句剛提過", "the"),
      s("是可數名詞的單數嗎？", "第一次提到時走這一步；母音發音開頭用 an", "a / an"),
      s("是複數或不可數，而且是泛指？", "Dogs are loyal. / I like music.", "不加冠詞"),
    ],
    0
  ),
  "articles-advanced": v(
    "Dogs are loyal animals.",
    [["Dogs", "accent"]],
    "泛指整個類別時，複數名詞直接說就好，不加冠詞；單數泛指可以說 A dog is loyal。固定搭配要整組記：in hospital、at school、the sea。",
    [
      s("是雙方都知道、或獨一無二的特定對象嗎？", "the sun / the Internet / the dog we saw", "the"),
      s("是固定搭配嗎？", "in hospital、at school；但 the sea、the cinema", "照固定搭配用"),
      s("是複數或不可數名詞的泛指嗎？", "Dogs are loyal. / Music helps me relax.", "不加冠詞"),
      s("是單數可數名詞的泛指嗎？", "A dog is loyal.", "a / an"),
    ],
    2
  ),
  "countable-uncountable": v(
    "We need some information.",
    [["some information", "accent"]],
    "information 是不可數名詞：不加 a、沒有 -s，動詞用單數。要說「一份」就借單位詞：a piece of information。",
    [
      s("可以直接數成 one、two、three 嗎？", "a book / two books", "可數：a / an 或加 -s"),
      s("是液體、材料、抽象概念或集合嗎？", "water、rice、advice、information", "不可數：不加 a、不加 -s"),
      s("還想說「一份、一杯」嗎？", "a piece of / a cup of / a bottle of", "用單位詞"),
    ],
    1
  ),
  "some-any-much-many": v(
    "Do you have any money?",
    [["any money", "accent"]],
    "疑問句與否定句用 any；肯定句用 some。要問或說「多少」時，可數用 many，不可數用 much；肯定句常改用 a lot of。",
    [
      s("是肯定句嗎？", "I have some money.", "some"),
      s("是否定句或疑問句嗎？", "Do you have any money? / I don't have any.", "any"),
      s("要談多少，名詞可數嗎？", "可數 many books；不可數 much money", "many / much"),
    ],
    1
  ),
  "all-both-each": v(
    "Both of my parents work.",
    [["Both of my parents", "accent"]],
    "剛好兩個、而且兩個都包含時用 both；三個以上全部用 all；想一個一個分開看用 each，後面接單數。",
    [
      s("剛好兩個，而且兩個都包含嗎？", "Both of my parents work. / Both books are new.", "both + 複數"),
      s("三個以上，整體全部嗎？", "All the students passed.", "all + 複數或不可數"),
      s("要一個一個分開看嗎？", "Each student has a book.", "each + 單數"),
    ],
    0
  ),
  "determiners-reference": v(
    "Neither answer is correct.",
    [["Neither answer", "accent"]],
    "兩個選項時，either 是「任一個」，neither 是「兩個都不」，後面都接單數名詞與單數動詞。三個以上才用 each 與 every。",
    [
      s("只有兩個選項，而且選其中任一個嗎？", "You can take either road.", "either + 單數"),
      s("只有兩個選項，而且兩個都不是嗎？", "Neither answer is correct.", "neither + 單數"),
      s("三個以上，一個一個分開看嗎？", "Each student has a desk.", "each + 單數"),
      s("三個以上，泛指每一個嗎？", "Every student has a desk.", "every + 單數"),
    ],
    1
  ),
  "noun-plurals": v(
    "There are three boxes on the table.",
    [["three boxes", "accent"]],
    "先看是不是不規則複數（child → children）；字尾是 s、x、z、ch、sh 要加 -es；子音加 y 要變成 -ies；其餘直接加 -s。",
    [
      s("是不規則複數嗎？", "child → children、man → men、person → people", "用不規則形"),
      s("字尾是 s、x、z、ch、sh 嗎？", "box → boxes、watch → watches", "加 -es"),
      s("字尾是「子音 + y」嗎？", "city → cities、baby → babies", "y 改成 -ies"),
      s("以上都不是嗎？", "book → books", "直接加 -s"),
    ],
    1
  ),
};

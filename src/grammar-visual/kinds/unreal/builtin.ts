import type { Mark, UnrealCase, UnrealVisual } from "../../types";

type Time = UnrealCase["time"];
const kase = (label: string, time: Time, real: string, hypo: string, shifts: [string, string][] = []): UnrealCase => ({
  label,
  time,
  real,
  hypo,
  shifts: shifts.map(([from, to]) => ({ from, to })),
});
function un(text: string, marks: Mark[], explain: string, current: UnrealCase, others: UnrealCase[]): UnrealVisual {
  return { kind: "unreal", sentence: { text, marks }, explain, current, others };
}
const amb = (text: string): Mark => ({ text, tone: "amber" });

const SECOND = kase("跟現在相反（第二型）", "present", "I don't have time.", "If I had time, I would help you.", [
  ["have", "had"],
  ["will", "would"],
]);
const THIRD = kase("跟過去相反（第三型）", "past", "I didn't know about it.", "If I had known, I would have told you.", [
  ["knew", "had known"],
  ["would tell", "would have told"],
]);
const FIRST = kase("真實的未來（第一型）", "future", "If it rains tomorrow, I will stay home.", "");
const ZERO = kase("普遍事實（零型）", "present", "If you heat ice, it melts.", "");

export const unrealBuiltin: Record<string, UnrealVisual> = {
  "conditionals-basic": un(
    "If it rains, I will stay home.",
    [amb("If it rains"), { text: "will stay", tone: "accent" }],
    "這是真的有可能發生的情況：if 子句用現在式，結果用 will + 原形動詞。if 子句放前面時，後面要加逗號。",
    kase("真實的未來（第一型）", "future", "If it rains, I will stay home.", ""),
    [SECOND, THIRD]
  ),
  "conditionals-real": un(
    "If you heat ice, it melts.",
    [amb("If you heat ice"), { text: "it melts", tone: "accent" }],
    "真實條件句談的是事實或有可能發生的事，動詞照常，不需要往過去退一格。零型講普遍的規律，第一型講未來可能的情況。",
    ZERO,
    [FIRST, SECOND]
  ),
  "conditionals-unreal": un(
    "If I had known, I would have called you.",
    [amb("had known"), { text: "would have called", tone: "accent" }],
    "第三型條件句談已經無法改變的過去：事實是我不知道、所以沒打，用過去完成式和 would have done 想像相反的結果。",
    kase("跟過去相反（第三型）", "past", "I didn't know, so I didn't call you.", "If I had known, I would have called you.", [
      ["didn't know", "had known"],
      ["would call", "would have called"],
    ]),
    [SECOND, FIRST]
  ),
  "mixed-conditionals": un(
    "If I had taken the job, I would be rich now.",
    [amb("had taken"), { text: "would be rich now", tone: "accent" }],
    "混合條件句的條件和結果發生在不同時間：過去沒做的事（條件，過去完成式），造成現在的結果（would + 原形動詞）。",
    kase("過去的條件、現在的結果", "mixed", "I didn't take the job, so I'm not rich now.", "If I had taken the job, I would be rich now.", [
      ["didn't take", "had taken"],
      ["am not rich", "would be rich"],
    ]),
    [
      kase("現在的狀況、過去的結果", "mixed", "I'm not careful, so I made that mistake.", "If I were more careful, I wouldn't have made that mistake.", [
        ["am not", "were"],
        ["made", "wouldn't have made"],
      ]),
      THIRD,
    ]
  ),
  "wish-if-only": un(
    "I wish I had more time.",
    [{ text: "wish", tone: "amber" }, { text: "had", tone: "accent" }],
    "wish 後面的動詞要往過去退一格：對現在的願望用過去式，對過去的遺憾用過去完成式，想要別人改變行為則用 would。",
    kase("對現在的願望", "present", "I don't have enough time.", "I wish I had more time.", [["have", "had"]]),
    [
      kase("對過去的遺憾", "past", "I didn't study harder.", "I wish I had studied harder.", [["studied", "had studied"]]),
      kase("對別人的不滿", "future", "He keeps interrupting me.", "I wish he would stop interrupting me.", [["will", "would"]]),
    ]
  ),
  "formal-conditional-inversion": un(
    "Had I known, I would have called you.",
    [{ text: "Had I known", tone: "amber" }, { text: "would have called", tone: "accent" }],
    "把 if 省掉，改把 had 搬到主詞前面，意思不變但更正式。第二型用 Were ... to，第一型的「萬一」用 Should ...。",
    kase("Had I known（跟過去相反）", "past", "I didn't know, so I didn't call you.", "Had I known, I would have called you.", [
      ["If I had known", "Had I known"],
    ]),
    [
      kase("Were ... to（假設的未來）", "future", "He hasn't asked me yet.", "Were he to ask me, I would help him.", [
        ["If he asked", "Were he to ask"],
      ]),
      kase("Should ...（萬一）", "future", "You may need help later.", "Should you need help, please call me.", [
        ["If you need", "Should you need"],
      ]),
    ]
  ),
};

import type { FocusCard, FocusRole, FocusVisual, MarkTone } from "../../types";

type R = [string, FocusRole];
const c = (label: string, text: string, roles: R[], focus: FocusRole, current = false): FocusCard => ({
  label,
  text,
  roles: roles.map(([t, role]) => ({ text: t, role })),
  focus,
  current,
});
const v = (text: string, marks: [string, MarkTone][], explainText: string, cards: FocusCard[]): FocusVisual => ({
  kind: "focus",
  sentence: { text, marks: marks.map(([t, tone]) => ({ text: t, tone })) },
  explain: explainText,
  cards,
});

export const BUILTIN: Record<string, FocusVisual> = {
  "passive-basic": v(
    "The bridge was built in 1932.",
    [["was built", "accent"]],
    "這句在講橋的歷史，誰蓋的不重要，所以把橋放到最前面，做事的人可以整個省略。時態放在 be 上：was / has been / will be。",
    [
      c("主動", "先看到做事的人", [["Workers", "doer"], ["built", "action"], ["the bridge", "receiver"]], "doer"),
      c("被動", "先看到被蓋的橋", [["The bridge", "receiver"], ["was built", "action"], ["(by workers)", "doer"]], "receiver", true),
    ]
  ),
  "passive-advanced": v(
    "The new road is being built.",
    [["is being built", "accent"]],
    "被動語態把時態放在 be 上：進行式是 is being + 過去分詞，完成式是 has been + 過去分詞，情態動詞是 must be + 過去分詞。",
    [
      c("主動（進行式）", "先看到做事的人", [["The council", "doer"], ["is building", "action"], ["the new road", "receiver"]], "doer"),
      c("被動（進行式）", "先看到正在被蓋的路", [["The new road", "receiver"], ["is being built", "action"], ["(by the council)", "doer"]], "receiver", true),
    ]
  ),
  "impersonal-passive": v(
    "He is said to work too hard.",
    [["is said to work", "accent"]],
    "想表達「大家都說」又不指明是誰時，把被談論的人放到句首：He is said to ...。若動作發生得更早，用 to have done。",
    [
      c("主動", "先看到說話的人", [["People", "doer"], ["say", "action"], ["he works too hard", "receiver"]], "doer"),
      c("被動", "先看到被談論的他", [["He", "receiver"], ["is said to work", "action"], ["too hard", "action"]], "receiver", true),
    ]
  ),
  "causative-perception-verbs": v(
    "I had my hair cut.",
    [["had my hair cut", "accent"]],
    "have + 受詞 + 過去分詞，表示「讓別人替我做這件事」。做事的人藏在括號裡，重點放在頭髮被剪這件事。",
    [
      c("自己做", "先看到做事的人", [["I", "doer"], ["cut", "action"], ["my hair", "receiver"]], "doer"),
      c("使役：讓別人做", "先看到被剪的頭髮", [["I", "doer"], ["had", "action"], ["my hair", "receiver"], ["cut", "action"], ["(by someone)", "doer"]], "receiver", true),
    ]
  ),
  "participle-adjectives": v(
    "The film was boring.",
    [["boring", "accent"]],
    "-ing 形容詞描述「造成感受的事物」，-ed 形容詞描述「感受到的人」。電影讓人無聊，所以電影是 boring；我是感受的人，所以是 bored。",
    [
      c("-ing：造成感受", "先看到造成無聊的電影", [["The film", "cause"], ["was boring", "action"]], "cause", true),
      c("-ed：感受到", "先看到覺得無聊的人", [["I", "feeler"], ["was bored", "action"]], "feeler"),
    ]
  ),
};

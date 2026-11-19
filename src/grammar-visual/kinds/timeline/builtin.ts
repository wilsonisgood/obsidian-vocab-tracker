import type { Mark, TimelineEvent, TimelineShape, TimelineVisual } from "../../types";

function ev(label: string, shape: TimelineShape, at: number, to: number, focus: boolean): TimelineEvent {
  return { label, shape, at, to, focus };
}

function tl(
  text: string,
  marks: Mark[],
  explain: string,
  events: TimelineEvent[],
  ref: { at: number; label: string } = { at: 0, label: "現在" }
): TimelineVisual {
  return { kind: "timeline", sentence: { text, marks }, explain, events, ref };
}
const acc = (text: string): Mark => ({ text, tone: "accent" });

export const timelineBuiltin: Record<string, TimelineVisual> = {
  "present-simple": tl(
    "She works at a bank every day.",
    [acc("works")],
    "一般現在式講的是反覆發生的習慣或固定的事實，不是「只有此刻」。所以在時間軸上是一串點，把現在包在中間。",
    [ev("每天上班（習慣）", "repeat", -2, 2, true)]
  ),
  "present-continuous": tl(
    "She is working right now.",
    [acc("is working")],
    "現在進行式描述此刻正在進行、而且是暫時的事：這一段包住現在，過去和未來都不一定這樣。",
    [ev("此刻正在工作", "span", -1, 1, true), ev("平常的習慣", "repeat", -3, 3, false)]
  ),
  "past-simple": tl(
    "I visited my aunt last week.",
    [acc("visited"), { text: "last week", tone: "amber" }],
    "一般過去式說已經結束的過去事件，通常搭配 last week、yesterday 等明確的過去時間，跟現在已經沒有連線。",
    [ev("上週拜訪阿姨", "point", -2, -2, true)]
  ),
  "used-to-past-habit": tl(
    "I used to play the piano when I was a child.",
    [acc("used to play"), { text: "when I was a child", tone: "amber" }],
    "used to 說過去反覆出現、但現在已經不是這樣的習慣或狀態。軸上是過去的一串點，到現在就沒有了。",
    [ev("小時候常彈琴", "repeat", -3, -2, true), ev("現在不彈了", "point", 0, 0, false)]
  ),
  "present-perfect-intro": tl(
    "I have lived here since 2018.",
    [acc("have lived"), { text: "since 2018", tone: "amber" }],
    "現在完成式把過去連到現在：從 2018 年住到現在，這條線一直畫到「現在」才停，since 標出起點。",
    [ev("從 2018 年住到現在", "span-to-now", -2, 0, true)]
  ),
  "present-perfect-vs-past": tl(
    "I have lost my keys, so I can't get in.",
    [acc("have lost"), { text: "can't get in", tone: "amber" }],
    "動作本身發生在過去，但說話者在意的是對現在的影響（現在進不去），所以用現在完成式；只講過去那一刻才用過去式。",
    [ev("弄丟鑰匙", "point", -1, -1, true), ev("進不去（影響到現在）", "span-to-now", -1, 0, false)]
  ),
  "present-perfect-continuous": tl(
    "She has been waiting for an hour.",
    [acc("has been waiting"), { text: "for an hour", tone: "amber" }],
    "線從一小時前畫到現在，而且還沒斷，可能還會繼續：這就是現在完成進行式，強調持續了多久。",
    [ev("一小時前開始等", "ongoing", -2, 0, true)]
  ),
  "past-perfect": tl(
    "When I arrived, the film had already started.",
    [{ text: "When I arrived", tone: "amber" }, acc("had already started")],
    "過去完成式用在兩個過去事件裡「比較早發生」的那一個：電影先開始，我才到，所以早的那件用 had started。",
    [ev("電影開始", "point", -2, -2, true), ev("我到達", "point", -1, -1, false)],
    { at: -1, label: "我到的時候" }
  ),
  "future-continuous-perfect": tl(
    "By 6 p.m., I will have finished the report.",
    [{ text: "By 6 p.m.", tone: "amber" }, acc("will have finished")],
    "will have done 站在未來的某個時間點往回看：到那一刻，事情已經做完。will be doing 則是那一刻正在進行。",
    [ev("報告完成", "point", 2, 2, true)],
    { at: 3, label: "下午六點" }
  ),
  "future-will-going-to": tl(
    "Look at those clouds. It is going to rain.",
    [acc("is going to rain")],
    "現在就看得到跡象（烏雲）時用 be going to；沒有跡象、只是當下的決定或推測才用 will。",
    [ev("烏雲（現在的跡象）", "point", 0, 0, false), ev("下雨", "point", 1, 1, true)]
  ),
  "perfect-vs-progressive-nuance": tl(
    "I have been painting the fence, so I'm covered in paint.",
    [acc("have been painting"), { text: "covered in paint", tone: "amber" }],
    "完成進行式強調「一直在做」的活動本身，而且看得見的痕跡還在；若只在意做完的結果，會改用 have painted。",
    [ev("一直在油漆（強調活動）", "ongoing", -2, 0, true), ev("滿身油漆（看得到的結果）", "point", 0, 0, false)]
  ),
  "future-in-the-past": tl(
    "I was going to call you, but I forgot.",
    [acc("was going to call"), { text: "but I forgot", tone: "amber" }],
    "說話者站在過去的某一刻往後看：當時的「未來」其實也已經過去了。was going to 常表示原本的打算沒有實現。",
    [ev("本來要打電話（沒打）", "point", -1, -1, true)],
    { at: -2, label: "當時的我" }
  ),
};

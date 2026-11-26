import type { KindModule, TimelineEvent, TimelineShape, TimelineVisual } from "../../types";
import { arr, base, baseSchema, bool, int, obj, oneOf, sArr, sBool, sEnum, sInt, sObj, sStr, str, SHORT_MAX } from "../../kit/parse";
import { add, explain, sentence } from "../../kit/dom";
import { timelineBuiltin } from "./builtin";

const SHAPES: readonly TimelineShape[] = ["point", "span", "span-to-now", "repeat", "ongoing"];
const SHAPE_NAME: Record<TimelineShape, string> = {
  point: "一個點",
  span: "一段",
  "span-to-now": "延續到現在",
  repeat: "反覆發生",
  ongoing: "還在持續",
};

function parseEvent(raw: unknown): TimelineEvent | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label, SHORT_MAX);
  const shape = oneOf(o.shape, SHAPES);
  const at = int(o.at, -3, 3);
  const to = int(o.to, -3, 3);
  const focus = bool(o.focus);
  if (label === null || shape === null || at === null || to === null || focus === null) return null;
  // point 的終點就是起點；span 起訖顛倒就對調。
  if (shape === "point") return { label, shape, at, to: at, focus };
  return { label, shape, at: Math.min(at, to), to: Math.max(at, to), focus };
}

function parse(raw: unknown): TimelineVisual | null {
  const b = base(raw, "timeline");
  if (!b) return null;
  const events = arr(b.o.events, 1, 4, parseEvent);
  const ro = obj(b.o.ref);
  if (events === null || !ro) return null;
  const at = int(ro.at, -3, 3);
  const label = str(ro.label, SHORT_MAX);
  if (at === null || label === null) return null;
  // 沒標「這句」的就當第一件是。
  if (!events.some((e) => e.focus)) events[0] = { ...events[0], focus: true };
  return { kind: "timeline", sentence: b.sentence, explain: b.explain, events, ref: { at, label } };
}

const schema = sObj({
  ...baseSchema("timeline"),
  events: sArr(
    sObj({
      label: sStr("這件事的簡短繁中說明，例如「一小時前開始等」"),
      shape: sEnum(
        SHAPES,
        "point＝一個點（did / will do）；span＝一段（was doing）；span-to-now＝從過去持續到現在（have done）；repeat＝反覆（do / used to）；ongoing＝到現在還沒結束、可能繼續（have been doing）"
      ),
      at: sInt("起點在軸上的位置，-3（很久以前）到 3（很久以後），0＝現在"),
      to: sInt("終點位置。point 必須跟 at 相同；其他形狀要大於等於 at"),
      focus: sBool("這句在講的就是這一件事填 true，其餘（對照用）填 false；至少一個 true"),
    }),
    "軸上的事件，1 到 4 個；先放這句的重點，再放對照用的"
  ),
  ref: sObj(
    {
      at: sInt("說話者站的時間點：一般填 0（現在）；過去完成、過去觀點的未來、未來完成要填那個參考時間點"),
      label: sStr("這個時間點的簡短繁中名稱，例如「現在」「我到的時候」"),
    },
    "說話者所站的時間點"
  ),
});

const guide = `時間軸版面：用一條橫軸說明這句的時態在時間上是「一個點、一段、反覆，還是延續到現在」。
- sentence：英文例句；marks 標出動詞片語（accent）與時間詞（amber）。
- events：軸上的事件 1–4 個。這句在講的那一件 focus=true，對照用的（例如結果、另一個過去事件）focus=false。shape 要選對：一次性的動作用 point；有起訖的用 span；從過去一路到現在用 span-to-now；到現在還在進行用 ongoing；習慣、反覆用 repeat。
- at / to：位置整數 -3 到 3，0 是現在，負數是過去，正數是未來。point 的 to 必須等於 at；其他形狀 to ≥ at。
- ref：說話者所站的時間點。多數句子填 {at:0, label:"現在"}；過去完成式填較晚的那個過去時間點；過去觀點的未來填「當時」；未來完成填未來的參考點。
- explain：一兩句繁中白話，說明為什麼畫成這個形狀。
常見錯誤：所有事件都標 focus；point 的 to 與 at 不同；把「現在」放在 -1 或 1。`;

function pct(at: number): number {
  return 8 + ((at + 3) / 6) * 84;
}

function setX(e: HTMLElement, name: string, at: number): void {
  e.style.setProperty(name, `${pct(at).toFixed(2)}%`);
}

export const timelineKind: KindModule<"timeline"> = {
  kind: "timeline",
  parse,
  schema,
  guide,
  render(parent, v, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const board = add(parent, ctx, "div", "gv-tl-board");
    board.setAttribute("role", "group");
    board.setAttribute("aria-label", "時間軸");
    const nowLine = add(board, ctx, "div", "gv-tl-now");
    setX(nowLine, "--gv-x", 0);
    if (v.ref.at !== 0) {
      const refLine = add(board, ctx, "div", "gv-tl-ref");
      setX(refLine, "--gv-x", v.ref.at);
    }

    for (const e of v.events) {
      const row = add(board, ctx, "div", ["gv-tl-row", `is-${e.shape}`, e.focus ? "is-focus" : "is-dim"]);
      row.setAttribute("aria-label", `${e.label}：${SHAPE_NAME[e.shape]}`);
      const x1 = pct(e.at);
      const x2 = pct(e.to);
      const lab = add(row, ctx, "div", "gv-tl-label", e.label);
      if ((x1 + x2) / 2 > 60) {
        lab.classList.add("is-right");
        lab.style.setProperty("--gv-x", `${(100 - x2).toFixed(2)}%`);
      } else {
        lab.style.setProperty("--gv-x", `${x1.toFixed(2)}%`);
      }
      const line = add(row, ctx, "div", "gv-tl-axis");
      line.setAttribute("aria-hidden", "true");
      if (e.shape === "point") {
        setX(add(row, ctx, "span", "gv-tl-dot"), "--gv-x", e.at);
      } else if (e.shape === "repeat") {
        const n = e.at === e.to ? 1 : 5;
        for (let i = 0; i < n; i++) {
          const dot = add(row, ctx, "span", ["gv-tl-dot", "is-small"]);
          dot.style.setProperty("--gv-x", `${(x1 + (n === 1 ? 0 : ((x2 - x1) * i) / (n - 1))).toFixed(2)}%`);
        }
      } else {
        const bar = add(row, ctx, "div", "gv-tl-bar");
        bar.style.setProperty("--gv-x", `${x1.toFixed(2)}%`);
        bar.style.setProperty("--gv-w", `${Math.max(x2 - x1, 3).toFixed(2)}%`);
        if (e.shape === "span-to-now" || e.shape === "ongoing") {
          const tail = add(row, ctx, "div", ["gv-tl-tail", e.shape === "ongoing" ? "is-open" : ""]);
          tail.style.setProperty("--gv-x", `${Math.max(x2, x1 + 3).toFixed(2)}%`);
        }
      }
    }

    const foot = add(board, ctx, "div", "gv-tl-foot");
    const nowText = add(foot, ctx, "span", "gv-tl-tick", v.ref.at === 0 ? v.ref.label : "現在");
    setX(nowText, "--gv-x", 0);
    if (v.ref.at !== 0) {
      const t = add(foot, ctx, "span", ["gv-tl-tick", "is-ref"], v.ref.label);
      setX(t, "--gv-x", v.ref.at);
    }
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: timelineBuiltin,
};

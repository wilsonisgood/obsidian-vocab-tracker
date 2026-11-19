import type { KindModule, PathStep, PathVisual } from "../../types";
import { arr, base, baseSchema, int, obj, sArr, sInt, sObj, sStr, SHORT_MAX, str } from "../../kit/parse";
import { add, badge, explain, sentence } from "../../kit/dom";
import { BUILTIN } from "./builtin";

function parseStep(x: unknown): PathStep | null {
  const o = obj(x);
  if (!o) return null;
  const q = str(o.q, SHORT_MAX);
  const note = str(o.note, SHORT_MAX, true);
  const result = str(o.result, SHORT_MAX);
  return q !== null && note !== null && result !== null ? { q, note, result } : null;
}

function parse(raw: unknown): PathVisual | null {
  const b = base(raw, "path");
  if (!b) return null;
  const steps = arr(b.o.steps, 2, 6, parseStep);
  if (steps === null) return null;
  const stopAt = int(b.o.stopAt, 0, steps.length - 1);
  if (stopAt === null) return null;
  return { kind: "path", sentence: b.sentence, explain: b.explain, steps, stopAt };
}

const schema = sObj({
  ...baseSchema("path"),
  steps: sArr(
    sObj({
      q: sStr("這一步要問的問題，例如「聽的人知道是哪一隻嗎？」"),
      note: sStr("走到這一步時，這句的狀況或例子；沒有就給 \"\""),
      result: sStr("這一步成立時的答案，例如「the」「不加」「both + 複數名詞」"),
    }),
    "由上往下的判斷步驟，2 到 6 步，要照真正該問的順序"
  ),
  stopAt: sInt("這句停在第幾步（0 起算，必須在 steps 範圍內）"),
});

const guide = `這個版面把「該用哪個字」畫成一條由上往下的判斷路徑，適合冠詞、可數與不可數、量詞、all / both / each、限定詞、名詞單複數。
- steps：2 到 6 步，每步是一個要問的問題 q，成立時的答案是 result。順序要照真正的判斷順序，前面的步驟不成立才走到後面。
- note：走到這一步時這句的狀況，或一個小例子（Dogs are loyal.）；沒有就給 ""。
- stopAt：這句的答案在第幾步成立（0 起算）。前面的步驟會顯示為「不是」，後面的步驟會淡掉。
- result 要簡短：只寫答案與必要的搭配，例如「the」「a / an」「不加冠詞」「many + 複數名詞」。
常見錯誤：stopAt 超出步驟數；步驟順序顛倒，導致前面的問題其實也成立；q 寫成陳述句。`;

function render(parent: HTMLElement, v: PathVisual, ctx: Parameters<KindModule<"path">["render"]>[2]): void {
  const root = add(parent, ctx, "div", "gv-path-root");
  root.appendChild(sentence(ctx, v.sentence));
  const ol = add(root, ctx, "ol", "gv-path-steps");
  ol.setAttribute("aria-label", "判斷路徑");
  v.steps.forEach((s, i) => {
    const state = i < v.stopAt ? "is-skip" : i === v.stopAt ? "is-hit" : "is-after";
    const li = add(ol, ctx, "li", ["gv-path-step", state]);
    add(li, ctx, "span", "gv-path-num", String(i + 1));
    const body = add(li, ctx, "div", "gv-path-body");
    add(body, ctx, "div", "gv-path-q", s.q);
    if (s.note) add(body, ctx, "div", "gv-note", s.note);
    const res = add(li, ctx, "div", "gv-path-result");
    if (i < v.stopAt) add(res, ctx, "span", "gv-note", "不是，往下");
    else res.appendChild(badge(ctx, `是 → ${s.result}`, i === v.stopAt ? "accent" : "plain"));
  });
  root.appendChild(explain(ctx, v.explain));
}

export const pathKind: KindModule<"path"> = {
  kind: "path",
  parse,
  schema,
  guide,
  render,
  builtin: BUILTIN,
};

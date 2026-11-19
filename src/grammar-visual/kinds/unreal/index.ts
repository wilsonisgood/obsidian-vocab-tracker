import type { KindModule, UnrealCase, UnrealVisual } from "../../types";
import { arr, base, baseSchema, obj, oneOf, sArr, sEnum, sObj, sStr, str, SENTENCE_MAX, SHORT_MAX } from "../../kit/parse";
import { add, badge, card, chips, explain, sentence, stateful } from "../../kit/dom";
import { unrealBuiltin } from "./builtin";

const TIMES: readonly UnrealCase["time"][] = ["present", "past", "future", "mixed"];
const TIME_NAME: Record<UnrealCase["time"], string> = {
  present: "現在",
  past: "過去",
  future: "未來",
  mixed: "過去與現在混合",
};

function parseCase(raw: unknown): UnrealCase | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label, SHORT_MAX);
  const time = oneOf(o.time, TIMES);
  const real = str(o.real, SENTENCE_MAX);
  const hypo = str(o.hypo, SENTENCE_MAX, true);
  const shifts = arr(o.shifts, 0, 3, (s) => {
    const so = obj(s);
    if (!so) return null;
    const from = str(so.from, SHORT_MAX);
    const to = str(so.to, SHORT_MAX);
    return from !== null && to !== null ? { from, to } : null;
  });
  if (label === null || time === null || real === null || hypo === null || shifts === null) return null;
  return { label, time, real, hypo, shifts };
}

function parse(raw: unknown): UnrealVisual | null {
  const b = base(raw, "unreal");
  if (!b) return null;
  const current = parseCase(b.o.current);
  const others = arr(b.o.others, 0, 3, parseCase);
  return current && others ? { kind: "unreal", sentence: b.sentence, explain: b.explain, current, others } : null;
}

const caseSchema = sObj(
  {
    label: sStr("這種條件句的名稱，例如「跟現在相反（第二型）」"),
    time: sEnum(TIMES, "假設的時間：present＝跟現在；past＝跟過去；future＝未來；mixed＝過去與現在混合"),
    real: sStr("現實那張卡：真實的狀況，英文一句，例如 I don't have time.；真實條件句則填條件句本身"),
    hypo: sStr("假設那張卡：想像出來的英文句子；真實條件句（零型、第一型）沒有假設，填空字串"),
    shifts: sArr(
      sObj({ from: sStr("現實的動詞形式"), to: sStr("假設裡退了一格的形式，例如 have → had") }),
      "動詞往過去退一格的對照，0 到 3 組；沒有就給 []"
    ),
  },
  "一種條件句的現實與假設對照"
);

const schema = sObj({
  ...baseSchema("unreal"),
  current: caseSchema,
  others: sArr(caseSchema, "切換鈕上的其他條件句類型，0 到 3 個；沒有就給 []"),
});

const guide = `現實與假設版面：左邊放現實，右邊放想像，中間標出動詞往過去退一格。
- sentence：例句，marks 把 if 子句或 wish 子句標 amber、結果子句的動詞標 accent。
- current：這句的類型。label 寫類型名稱；time 選現在／過去／未來／混合；real 是現實的事實（英文一句，用現實的時態，例如 I don't have time.）；hypo 是想像中的句子（通常就是例句本身）；shifts 列出退了一格的動詞，例如 have → had、will → would。
- 零型與第一型是真的會發生的事，沒有假設世界：hypo 填 ""，shifts 填 []，real 放條件句本身。
- others：其他類型的對照（例如第二型、第三型），格式和 current 相同，最多 3 個；沒有就給 []。切換鈕會用它們的 label。
- explain：一兩句繁中白話，說明這句為什麼動詞要退一格、或為什麼不用。
常見錯誤：real 寫成假設；假設句的動詞沒有退格；第一型也填了 hypo。`;

export const unrealKind: KindModule<"unreal"> = {
  kind: "unreal",
  parse,
  schema,
  guide,
  render(parent, v, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const cases = [v.current, ...v.others];
    const host = add(parent, ctx, "div", "gv-un-host");
    stateful<number>(host, 0, (h, idx, set) => {
      if (cases.length > 1) {
        h.appendChild(
          chips(ctx, { label: "條件句類型", options: cases.map((c) => c.label), selected: idx, onSelect: set })
        );
      }
      const c = cases[idx];
      const grid = add(h, ctx, "div", ["gv-un-grid", c.hypo === "" ? "is-single" : ""]);
      const real = card(ctx, c.hypo === "" ? "accent" : "plain", c.hypo === "" ? "可能成真的事" : "現實世界");
      add(real, ctx, "div", "gv-un-text", c.real);
      add(
        real,
        ctx,
        "div",
        "gv-note",
        c.hypo === "" ? "動詞照常，不用往過去退一格" : `${TIME_NAME[c.time]}的事實，用真實的時態`
      );
      grid.appendChild(real);
      if (c.hypo !== "") {
        const arrow = add(grid, ctx, "div", "gv-un-arrow", ctx.mobile ? "↓ 動詞往過去退一格" : "往過去退一格 →");
        arrow.setAttribute("aria-hidden", "true");
        const hypo = card(ctx, "amber", "假設世界");
        add(hypo, ctx, "div", "gv-un-text", c.hypo);
        add(hypo, ctx, "div", "gv-note", "往過去退一格：表示「不是真的」");
        grid.appendChild(hypo);
        if (c.shifts.length > 0) {
          const row = add(h, ctx, "ul", "gv-un-shifts");
          for (const s of c.shifts) add(row, ctx, "li", "gv-un-shift").appendChild(badge(ctx, `${s.from} → ${s.to}`, "amber"));
        }
      }
    });
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: unrealBuiltin,
};

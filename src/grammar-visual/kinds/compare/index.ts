import type { CompareVisual, KindModule } from "../../types";
import { SHORT_MAX, arr, base, baseSchema, num, obj, oneOf, sArr, sEnum, sNum, sObj, sStr, str } from "../../kit/parse";
import { add, chips, explain, sentence, stateful } from "../../kit/dom";
import { BUILTIN } from "./builtin";

const RELATIONS = ["comparative", "equal", "superlative"] as const;
const RELATION_LABEL: Record<(typeof RELATIONS)[number], string> = {
  comparative: "比較",
  equal: "一樣",
  superlative: "最高",
};
// 切換鈕只換這一行說明的重點，不改資料。
const RELATION_HINT: Record<(typeof RELATIONS)[number], string> = {
  comparative: "兩者相比：形容詞加 -er（或 more）再接 than，看誰比較多。",
  equal: "程度一樣：as + 形容詞 + as，兩條長度一樣。",
  superlative: "三者以上挑第一名：the + -est（或 the most），前面一定有 the。",
};

function parse(raw: unknown): CompareVisual | null {
  const b = base(raw, "compare");
  if (!b) return null;
  const items = arr(b.o.items, 2, 6, (x) => {
    const o = obj(x);
    if (!o) return null;
    const label = str(o.label, 20);
    const value = num(o.value, 1, 100);
    const note = str(o.note, SHORT_MAX, true);
    return label !== null && value !== null && note !== null ? { label, value, note } : null;
  });
  const relation = oneOf(b.o.relation, RELATIONS);
  const focus = str(b.o.focus, 20);
  const forms = arr(b.o.forms, 0, 4, (x) => str(x, 30));
  if (!items || !relation || focus === null || !forms) return null;
  // 重點對不到任何一條長條，就用第一條。
  const hit = items.some((it) => it.label === focus) ? focus : items[0].label;
  return { kind: "compare", sentence: b.sentence, explain: b.explain, items, relation, focus: hit, forms };
}

export const compareKind: KindModule<"compare"> = {
  kind: "compare",
  parse,
  schema: sObj({
    ...baseSchema("compare"),
    items: sArr(
      sObj({
        label: sStr("比較對象的名字，20 字以內，例如 Amy"),
        value: sNum("長條長度，1–100，依真實大小比例；「一樣」的兩者填相同的值"),
        note: sStr("長條旁的短說明，例如「比 Amy 高」；不需要填 \"\""),
      }),
      "2–6 個比較對象，由小到大排列"
    ),
    relation: sEnum(RELATIONS, "這句在比什麼：comparative＝兩者比較；equal＝一樣；superlative＝最高級"),
    focus: sStr("這句主要在講的那一個，必須等於 items 裡某個 label"),
    forms: sArr(sStr("形容詞的一種變化，例如 taller"), "形容詞的變化，如 tall、taller、tallest；沒有填 []"),
  }),
  guide:
    "用橫向長條表達「誰比較多」。sentence 放一句比較句，marks 標出 taller than、as ... as、the tallest 這類比較結構（accent）。" +
    "items 放句中提到的對象，value 是 1–100 的長度，要和句子意思一致（較高的值較大；as ... as 的兩者值相同）。" +
    "note 是長條旁的一行小字，例如「比 Amy 高」「全部裡最高」，不需要填 \"\"。focus 必須是 items 裡的一個 label，" +
    "即句子的主角。relation 填這句屬於哪一類。forms 放形容詞的變化（tall, taller, tallest），沒有就 []。" +
    "常見錯誤：value 與句意相反、focus 不在 items 裡、items 放了句子沒提到的對象。",
  render(parent, v, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const host = add(parent, ctx, "div", "gv-compare-host");
    stateful<number>(host, RELATIONS.indexOf(v.relation), (h, sel, set) => {
      const rel = RELATIONS[sel];
      const bars = add(h, ctx, "div", "gv-compare-bars");
      bars.setAttribute("role", "list");
      const max = Math.max(...v.items.map((it) => it.value));
      for (const it of v.items) {
        const isFocus = it.label === v.focus;
        const isTop = it.value === max;
        const row = add(bars, ctx, "div", ["gv-compare-row", isFocus ? "is-focus" : "", isTop ? "is-top" : ""]);
        row.setAttribute("role", "listitem");
        add(row, ctx, "span", "gv-compare-label", it.label);
        const track = add(row, ctx, "div", "gv-compare-track");
        const bar = add(track, ctx, "div", "gv-compare-bar");
        bar.style.width = `${it.value}%`;
        if (it.note) add(track, ctx, "span", "gv-compare-note", it.note);
      }
      add(h, ctx, "div", "gv-explain", RELATION_HINT[rel]);
      h.appendChild(
        chips(ctx, {
          label: "切換比較方式",
          options: RELATIONS.map((r) => RELATION_LABEL[r]),
          selected: sel,
          onSelect: set,
        })
      );
    });
    parent.appendChild(explain(ctx, v.explain));
    if (v.forms.length > 0) {
      const f = add(parent, ctx, "div", "gv-compare-forms");
      f.setAttribute("aria-label", "形容詞變化");
      add(f, ctx, "span", "gv-compare-form", v.forms.join(" → "));
    }
  },
  builtin: BUILTIN,
};

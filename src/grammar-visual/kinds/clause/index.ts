import type { ClausePart, ClauseVisual, KindModule } from "../../types";
import { add, card, chips, explain, sentence, stateful } from "../../kit/dom";
import { arr, base, baseSchema, int, obj, sArr, sInt, sObj, sStr, str, SENTENCE_MAX, SHORT_MAX } from "../../kit/parse";
import { CLAUSE_BUILTIN } from "./builtin";

export const clauseKind: KindModule<"clause"> = {
  kind: "clause",
  parse(raw) {
    const b = base(raw, "clause");
    if (!b) return null;
    const core = str(b.o.core, SENTENCE_MAX);
    let prev = 0;
    let ok = true;
    const clauses = arr(b.o.clauses, 1, 4, (x): ClausePart | null => {
      const o = obj(x);
      if (!o) return null;
      const text = str(o.text, SENTENCE_MAX);
      const type = str(o.type, SHORT_MAX);
      const attachTo = str(o.attachTo, SHORT_MAX);
      const gloss = str(o.gloss, SENTENCE_MAX);
      const depth = int(o.depth, 1, 3);
      if (text === null || type === null || attachTo === null || gloss === null || depth === null) return null;
      // 套疊要一層一層來：不能一下跳兩層。
      if (depth > prev + 1) ok = false;
      prev = depth;
      return { text, type, attachTo, gloss, depth };
    });
    if (core === null || clauses === null || !ok) return null;
    return { kind: "clause", sentence: b.sentence, explain: b.explain, core, clauses };
  },
  schema: sObj({
    ...baseSchema("clause"),
    core: sStr("主幹：把子句拿掉、用 … 標出缺口，例如「The book … was great.」"),
    clauses: sArr(
      sObj({
        text: sStr("子句原文，必須是例句裡的一段"),
        type: sStr("種類名稱，例如「關係子句（限定）」「名詞子句（受詞）」「分詞子句（-ing）」「名詞化」"),
        attachTo: sStr("掛在哪個字或片語後面"),
        gloss: sStr("這一段的白話意思（繁中；名詞化要寫出還原後的句子）"),
        depth: sInt("套疊層次：直接掛在主幹是 1，掛在子句裡面是 2，最多 3"),
      }),
      "子句 1–4 個，依出現順序；層次不能一次跳兩層"
    ),
  }),
  guide:
    "子句套疊：先看主幹，再看每個子句掛在哪裡。\n" +
    "sentence 是完整例句，marks 用 amber 標出子句。\n" +
    "core 是拿掉子句後的主幹，缺口用「…」表示，例如「The book … was great.」。\n" +
    "clauses 依出現順序，每個有 text（原文）、type（種類名稱）、attachTo（掛在哪個字後面）、gloss（白話意思）、depth（直接掛主幹＝1；掛在子句裡面＝2；最多 3）。\n" +
    "名詞化（the rapid expansion of…）也用這個版面：text 填名詞化片語，gloss 寫還原成「誰做了什麼」的句子。\n" +
    "常見錯誤：depth 一次跳兩層、core 沒拿掉子句、gloss 寫成文法術語。",
  render(parent, v: ClauseVisual, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const host = add(parent, ctx, "div", "gv-clause-host");
    stateful(host, true, (h, expanded, set) => {
      h.appendChild(
        chips(ctx, { label: "顯示方式", options: ["展開子句", "只看主幹"], selected: expanded ? 0 : 1, onSelect: (i) => set(i === 0) })
      );
      const main = card(ctx, "accent", "主幹（先讀這個）");
      main.classList.add("gv-clause-core");
      add(main, ctx, "div", "gv-clause-core-text", v.core);
      h.appendChild(main);
      if (!expanded) {
        add(h, ctx, "div", "gv-note", "子句先收起來了；按「展開子句」看它們掛在哪裡。");
        return;
      }
      for (const c of v.clauses) {
        const row = add(h, ctx, "div", ["gv-clause-row", `gv-clause-d${c.depth}`]);
        const link = add(row, ctx, "div", "gv-clause-link");
        add(link, ctx, "span", "gv-clause-arrow", "↳");
        const at = add(link, ctx, "span", undefined, "掛在 ");
        add(at, ctx, "strong", undefined, c.attachTo);
        at.appendChild(ctx.doc.createTextNode(" 後面"));
        const box = card(ctx, "amber", `子句 · ${c.type}`);
        add(box, ctx, "div", "gv-clause-text", c.text);
        add(box, ctx, "div", "gv-note", `= ${c.gloss}`);
        row.appendChild(box);
      }
    });
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: CLAUSE_BUILTIN,
};

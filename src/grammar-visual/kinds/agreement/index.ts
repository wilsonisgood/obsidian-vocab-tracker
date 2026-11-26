import type { AgreementVisual, KindModule } from "../../types";
import { SHORT_MAX, arr, base, baseSchema, obj, oneOf, sArr, sEnum, sObj, sStr, str } from "../../kit/parse";
import { add, badge, explain, sentence } from "../../kit/dom";
import { BUILTIN } from "./builtin";

const NUMBERS = ["singular", "plural"] as const;

function parse(raw: unknown): AgreementVisual | null {
  const b = base(raw, "agreement");
  if (!b) return null;
  const head = str(b.o.head, 30);
  const number = oneOf(b.o.number, NUMBERS);
  const skip = str(b.o.skip, SHORT_MAX, true);
  const verb = str(b.o.verb, 20);
  const steps = arr(b.o.steps, 2, 5, (x) => str(x, SHORT_MAX + 20));
  const traps = arr(b.o.traps, 0, 4, (x) => {
    const o = obj(x);
    if (!o) return null;
    const example = str(o.example, SHORT_MAX + 20);
    const note = str(o.note, SHORT_MAX);
    return example !== null && note !== null ? { example, note } : null;
  });
  if (head === null || !number || skip === null || verb === null || !steps || !traps) return null;
  const text = b.sentence.text;
  if (!text.includes(head) || !text.includes(verb) || (skip !== "" && !text.includes(skip))) return null;
  return { kind: "agreement", sentence: b.sentence, explain: b.explain, head, number, skip, verb, steps, traps };
}

export const agreementKind: KindModule<"agreement"> = {
  kind: "agreement",
  parse,
  schema: sObj({
    ...baseSchema("agreement"),
    head: sStr("主詞的核心名詞，必須原樣出現在例句中"),
    number: sEnum(NUMBERS, "核心名詞是單數還是複數"),
    skip: sStr("要先劃掉的修飾（例如 of ... 片語），必須原樣出現在例句中；沒有填 \"\""),
    verb: sStr("該跟核心名詞配對的動詞，必須原樣出現在例句中"),
    steps: sArr(sStr("一個判斷步驟，繁中"), "2–5 個判斷步驟：找核心、劃掉修飾、配動詞；最後一步是結論"),
    traps: sArr(
      sObj({ example: sStr("容易看錯的英文例子"), note: sStr("一行繁中說明為什麼") }),
      "容易看錯的例子，最多 4 個；沒有填 []"
    ),
  }),
  guide:
    "這個版面回答「動詞要跟哪個字配」。sentence 放一句主詞動詞一致的例句，marks 依序標出核心名詞（accent）、" +
    "該劃掉的修飾（strike）、動詞（accent）。head 是核心名詞，number 是它的單複數，skip 是中間被劃掉的修飾片語（沒有填 \"\"），" +
    "verb 是配對的動詞；三者都必須原樣出現在例句中。steps 寫 2–5 步判斷過程，最後一步是結論，例如「動詞跟 list 配 → is」。" +
    "traps 放 0–4 個容易看錯的例子，每個附一行 note。常見錯誤：head 填成離動詞最近的名詞、marks 的順序不是由左到右。",
  render(parent, v, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const info = add(parent, ctx, "div", "gv-agreement-core");
    info.appendChild(badge(ctx, v.number === "singular" ? "單數" : "複數", "accent"));
    add(info, ctx, "span", "gv-agreement-pair", `${v.head} → ${v.verb}`);
    const ol = add(parent, ctx, "ol", "gv-agreement-steps");
    ol.setAttribute("aria-label", "判斷步驟");
    v.steps.forEach((s, i) => {
      const last = i === v.steps.length - 1;
      const li = add(ol, ctx, "li", ["gv-agreement-step", last ? "is-last" : ""]);
      add(li, ctx, "strong", "gv-agreement-no", `${i + 1}.`);
      li.appendChild(ctx.doc.createTextNode(` ${s}`));
    });
    parent.appendChild(explain(ctx, v.explain));
    if (v.traps.length > 0) {
      add(parent, ctx, "div", "gv-label", `容易看錯的 ${v.traps.length} 種`);
      const ul = add(parent, ctx, "ul", "gv-agreement-traps");
      for (const t of v.traps) {
        const li = add(ul, ctx, "li", "gv-agreement-trap");
        add(li, ctx, "div", "gv-agreement-example", t.example);
        add(li, ctx, "div", "gv-note", t.note);
      }
    }
  },
  builtin: BUILTIN,
};

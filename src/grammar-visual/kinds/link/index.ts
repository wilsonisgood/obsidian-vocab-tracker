import type { KindModule, LinkVisual } from "../../types";
import { SHORT_MAX, arr, base, baseSchema, obj, oneOf, sArr, sEnum, sObj, sStr, str } from "../../kit/parse";
import { add, explain, sentence, stateful } from "../../kit/dom";
import { BUILTIN } from "./builtin";
import { locate, markWords } from "../../kit/locate";

const KINDS = ["refer", "modify"] as const;

function parse(raw: unknown): LinkVisual | null {
  const b = base(raw, "link");
  if (!b) return null;
  const links = arr(b.o.links, 1, 6, (x) => {
    const o = obj(x);
    if (!o) return null;
    const from = str(o.from, 40);
    const to = str(o.to, 40);
    const kind = oneOf(o.kind, KINDS);
    const why = str(o.why, SHORT_MAX);
    if (from === null || to === null || kind === null || why === null) return null;
    // 兩端的字都要真的出現在句子裡，點下去才有東西可以亮。
    if (locate(b.sentence.text, from) < 0 || locate(b.sentence.text, to) < 0) return null;
    return { from, to, kind, why };
  });
  if (!links) return null;
  return { kind: "link", sentence: b.sentence, explain: b.explain, links };
}

export const linkKind: KindModule<"link"> = {
  kind: "link",
  parse,
  schema: sObj({
    ...baseSchema("link"),
    links: sArr(
      sObj({
        from: sStr("被追問的那個字（例如代名詞或副詞），必須原樣出現在例句中"),
        to: sStr("它連到的字（指回的名詞或被修飾的字），必須原樣出現在例句中"),
        kind: sEnum(KINDS, "refer＝指回某人事物（代名詞）；modify＝修飾某個字（形容詞、副詞、指示詞）"),
        why: sStr("為什麼這樣連，一行繁中，60 字以內"),
      }),
      "1–6 條連線，由重要到次要"
    ),
  }),
  guide:
    "這個版面回答「這個字指誰、修飾誰」。sentence 放一句有代名詞、反身代名詞、所有格、指示詞、替代詞或形容詞副詞的英文例句。" +
    "links 每一條是一個 from → to：from 是被問的字，to 是它連到的字，兩個都必須原樣出現在例句裡（大小寫一致）。" +
    "kind 填 refer（指回人事物）或 modify（修飾）。why 用一行繁中說明為什麼這樣連，也可以點出用錯的常見原因。" +
    "第一條放最重要的，使用者會先看到它。常見錯誤：from 或 to 沒出現在句子裡、一句塞太多連線（超過 6 條）。",
  render(parent, v, ctx) {
    const host = add(parent, ctx, "div", "gv-link-host");
    stateful<number>(host, 0, (h, sel, set) => {
      const cur = v.links[sel];
      const words = [cur.from, cur.to].filter((w, i, a) => a.indexOf(w) === i);
      h.appendChild(sentence(ctx, markWords(v.sentence.text, words, cur.kind === "refer" ? "accent" : "amber")));
      const list = add(h, ctx, "ul", "gv-link-list");
      list.setAttribute("aria-label", "連線清單");
      v.links.forEach((l, i) => {
        const li = add(list, ctx, "li", "gv-link-item");
        const btn = add(li, ctx, "button", ["gv-link-row", `is-${l.kind}`, i === sel ? "is-on" : ""]);
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-pressed", String(i === sel));
        add(btn, ctx, "span", "gv-link-pair", `${l.from} → ${l.to}`);
        add(btn, ctx, "span", "gv-link-kind", l.kind === "refer" ? "指回" : "修飾");
        if (i === sel) add(btn, ctx, "span", "gv-link-why", l.why);
        btn.addEventListener("click", () => {
          if (i !== sel) set(i);
        });
      });
    });
    parent.appendChild(explain(ctx, v.explain));
    add(parent, ctx, "div", "gv-note", "點一列，句子裡兩端的字會一起亮起來。指回人事物用紫色，修飾用黃色。");
  },
  builtin: BUILTIN,
};

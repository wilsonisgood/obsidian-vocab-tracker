import type { ConnectorVisual, KindModule, MarkedSentence, Relation, ConnectorSet } from "../../types";
import { arr, base, baseSchema, obj, oneOf, sArr, sEnum, sObj, sStr, SHORT_MAX, str } from "../../kit/parse";
import { add, card, chips, explain, sentence, stateful } from "../../kit/dom";
import { BUILTIN } from "./builtin";
import { RELATIONS, RELATION_EXAMPLES, RELATION_LABEL } from "./relations";

function side(x: unknown): { text: string; note: string } | null {
  const o = obj(x);
  if (!o) return null;
  const text = str(o.text, SHORT_MAX);
  const note = str(o.note, SHORT_MAX, true);
  return text !== null && note !== null ? { text, note } : null;
}

function parse(raw: unknown): ConnectorVisual | null {
  const b = base(raw, "connector");
  if (!b) return null;
  const relation = oneOf(b.o.relation, RELATIONS);
  const link = str(b.o.link, SHORT_MAX);
  const left = side(b.o.left);
  const right = side(b.o.right);
  const compare = arr(b.o.compare, 2, 4, (x) => {
    const o = obj(x);
    if (!o) return null;
    const word = str(o.word, SHORT_MAX);
    const form = str(o.form, SHORT_MAX);
    const example = str(o.example, SHORT_MAX);
    return word !== null && form !== null && example !== null ? { word, form, example } : null;
  });
  if (relation === null || link === null || !left || !right || compare === null) return null;
  return { kind: "connector", sentence: b.sentence, explain: b.explain, relation, link, left, right, compare };
}

const sSide = (what: string): Record<string, unknown> =>
  sObj({ text: sStr(`${what}，繁體中文`), note: sStr("一個短語說明這件事的角色，例如「原因」「結果」；沒有就給 \"\"") });

const schema = sObj({
  ...baseSchema("connector"),
  relation: sEnum(RELATIONS, "兩件事的關係：cause 因果、contrast 轉折、condition 條件、purpose 目的、addition 並列、sequence 時間先後"),
  link: sStr("這句用的連接詞，小寫，例如 although"),
  left: sSide("前面那件事"),
  right: sSide("後面那件事"),
  compare: sArr(
    sObj({
      word: sStr("同一種關係的連接詞"),
      form: sStr("後面接什麼，例如「+ 子句」「+ 名詞」「另起一句」"),
      example: sStr("英文短例"),
    }),
    "2 到 4 個同一種關係、接法不同的字；第一個是這句用的"
  ),
});

const guide = `這個版面說明「兩件事是什麼關係，連接詞後面接句子還是名詞」。
- relation：只能從六種挑一種：cause（因果）、contrast（轉折）、condition（條件）、purpose（目的）、addition（並列）、sequence（時間先後）。
- link：例句裡用的連接詞（小寫）。例句 marks 要把它標成 accent。
- left / right：把句子拆成「前面那件事」和「後面那件事」，用繁體中文寫；note 寫它在這個關係裡的角色（原因／結果、先發生／後發生…）。
- compare：2 到 4 個同一種關係的連接詞，重點是「後面接的東西不一樣」，form 寫接法，example 給短英文例子。第一個必須是這句用的字。
畫面上還有六種關係的切換鈕，其他五種由程式內建，不用你填。
常見錯誤：relation 與 link 不一致；compare 第一個不是例句用的字；form 寫成整句解釋。`;

function render(parent: HTMLElement, v: ConnectorVisual, ctx: Parameters<KindModule<"connector">["render"]>[2]): void {
  const root = add(parent, ctx, "div", "gv-connector-root");
  stateful<Relation>(root, v.relation, (host, picked, set) => {
    host.appendChild(
      chips(ctx, {
        label: "切換關係種類",
        options: RELATIONS.map((r) => `${RELATION_LABEL[r].name} ${RELATION_LABEL[r].sym}`),
        selected: RELATIONS.indexOf(picked),
        onSelect: (i) => set(RELATIONS[i]),
      })
    );
    const own = picked === v.relation;
    const s: MarkedSentence = own ? v.sentence : RELATION_EXAMPLES[picked].sentence;
    const d: ConnectorSet = own ? v : RELATION_EXAMPLES[picked].set;
    host.appendChild(sentence(ctx, s));
    const flow = add(host, ctx, "div", "gv-connector-flow");
    for (const [i, part] of [d.left, d.right].entries()) {
      if (i === 1) {
        const mid = add(flow, ctx, "div", "gv-connector-rel");
        add(mid, ctx, "span", ["gv-badge", "is-accent"], RELATION_LABEL[picked].name);
        add(mid, ctx, "span", "gv-connector-sym", RELATION_LABEL[picked].sym).setAttribute("aria-hidden", "true");
      }
      const k = card(ctx, "plain");
      k.classList.add("gv-connector-side");
      add(k, ctx, "div", "gv-connector-text", part.text);
      if (part.note) add(k, ctx, "div", "gv-note", part.note);
      flow.appendChild(k);
    }
    const cmp = add(host, ctx, "div", "gv-connector-compare");
    add(cmp, ctx, "div", "gv-label", `同樣是${RELATION_LABEL[picked].name}，後面接的東西不一樣`);
    d.compare.forEach((row, i) => {
      const r = add(cmp, ctx, "div", ["gv-connector-row", i === 0 ? "is-first" : ""]);
      add(r, ctx, "strong", "gv-connector-word", row.word);
      add(r, ctx, "span", "gv-connector-form", row.form);
      add(r, ctx, "span", "gv-note", row.example);
    });
    if (own) host.appendChild(explain(ctx, v.explain));
  });
}

export const connectorKind: KindModule<"connector"> = {
  kind: "connector",
  parse,
  schema,
  guide,
  render,
  builtin: BUILTIN,
};

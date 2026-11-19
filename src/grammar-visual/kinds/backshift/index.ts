import type { BackshiftVisual, KindModule } from "../../types";
import { SHORT_MAX, SENTENCE_MAX, arr, base, baseSchema, obj, oneOf, sArr, sEnum, sObj, sStr, str } from "../../kit/parse";
import { add, el, explain, sentence } from "../../kit/dom";
import { locate, markWords } from "../link/locate";
import { BUILTIN } from "./builtin";

const TYPES = ["tense", "person", "time", "place"] as const;
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = {
  tense: "時態",
  person: "人稱",
  time: "時間詞",
  place: "地點詞",
};

function parse(raw: unknown): BackshiftVisual | null {
  const b = base(raw, "backshift");
  if (!b) return null;
  const direct = str(b.o.direct, SENTENCE_MAX);
  const swaps = arr(b.o.swaps, 1, 6, (x) => {
    const o = obj(x);
    if (!o) return null;
    const from = str(o.from, 30);
    const to = str(o.to, 30);
    const type = oneOf(o.type, TYPES);
    const why = str(o.why, SHORT_MAX);
    return from !== null && to !== null && type !== null && why !== null ? { from, to, type, why } : null;
  });
  if (direct === null || !swaps) return null;
  for (const s of swaps) if (locate(direct, s.from) < 0 || locate(b.sentence.text, s.to) < 0) return null;
  return { kind: "backshift", sentence: b.sentence, explain: b.explain, direct, swaps };
}

export const backshiftKind: KindModule<"backshift"> = {
  kind: "backshift",
  parse,
  schema: sObj({
    ...baseSchema("backshift"),
    direct: sStr("原本直接說的那句話（不含引號）"),
    swaps: sArr(
      sObj({
        from: sStr("原話裡要換掉的字，必須原樣出現在 direct 中"),
        to: sStr("轉述後換成的字，必須原樣出現在例句（轉述句）中"),
        type: sEnum(TYPES, "tense＝時態；person＝人稱；time＝時間詞；place＝地點詞"),
        why: sStr("為什麼要換，一行繁中"),
      }),
      "1–6 組要換的字，依在句中出現的順序"
    ),
  }),
  guide:
    "這個版面比較「原話」和「轉述後」。sentence 放轉述後的句子（例如 She said she would call me the next day.），" +
    "marks 標出換過的字（accent）。direct 放原本直接說的那句話，不含引號。swaps 每一組是 from（原話裡的字）→ to（轉述句裡的字），" +
    "from 必須原樣出現在 direct、to 必須原樣出現在 sentence。type 填 tense、person、time 或 place，" +
    "why 一行繁中說明為什麼要換，例如「說話的時間已經過去」。explain 用一兩句講出共通的道理。" +
    "常見錯誤：swaps 漏掉人稱或時間詞、from / to 拼法和句子不一致、把沒變的字也列進去。",
  render(parent, v, ctx) {
    const talk = add(parent, ctx, "div", "gv-backshift-talk");
    const said = add(talk, ctx, "div", "gv-backshift-bubble");
    add(said, ctx, "div", "gv-note", "原本說的");
    said.appendChild(sentence(ctx, markWords(v.direct, v.swaps.map((s) => s.from), "muted"), "gv-backshift-direct"));
    const rep = add(talk, ctx, "div", ["gv-backshift-bubble", "is-reported"]);
    add(rep, ctx, "div", "gv-note", "轉述時");
    rep.appendChild(sentence(ctx, v.sentence));
    const table = add(parent, ctx, "div", "gv-backshift-swaps");
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", "要換的字");
    for (const s of v.swaps) {
      const row = add(table, ctx, "div", "gv-backshift-row");
      row.setAttribute("role", "row");
      const pair = add(row, ctx, "div", "gv-backshift-pair");
      add(pair, ctx, "strong", "gv-backshift-from", s.from);
      pair.appendChild(el(ctx, "span", "gv-backshift-arrow", " → "));
      add(pair, ctx, "strong", "gv-backshift-to", s.to);
      add(row, ctx, "div", "gv-note", `${TYPE_LABEL[s.type]}：${s.why}`);
    }
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: BUILTIN,
};

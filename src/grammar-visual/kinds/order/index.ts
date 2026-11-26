import type { KindModule, OrderToken, OrderVisual } from "../../types";
import { add, explain, sentence } from "../../kit/dom";
import { arr, base, baseSchema, int, oneOf, sArr, sEnum, sInt, sObj, sStr, str, SHORT_MAX } from "../../kit/parse";
import { ORDER_BUILTIN } from "./builtin";

const ROLES = ["plain", "moved", "aux"] as const;
const NUMS = "①②③④⑤⑥";

function parseTokens(raw: unknown, steps: number): OrderToken[] | null {
  return arr(raw, 2, 12, (x): OrderToken | null => {
    if (x === null || typeof x !== "object" || Array.isArray(x)) return null;
    const o = x as Record<string, unknown>;
    const text = str(o.text, SHORT_MAX);
    const role = oneOf(o.role, ROLES);
    const step = int(o.step, 0, steps);
    if (text === null || role === null || step === null) return null;
    // 步驟編號說了算：0＝沒動（plain）；有編號卻標 plain 的當成 moved。
    if (step === 0) return { text, role: "plain", step };
    return { text, role: role === "plain" ? "moved" : role, step };
  });
}

const tokenSchema = sObj({
  text: sStr("這一格的文字，例如 Rarely、have、seen such a view."),
  role: sEnum(ROLES, "plain＝沒動；moved＝被搬走的成分；aux＝助動詞、代名詞或補進來的功能字"),
  step: sInt("對應搬移步驟的編號（從 1 起算）；plain 填 0，其他一定要 ≥ 1"),
});

export const orderKind: KindModule<"order"> = {
  kind: "order",
  parse(raw) {
    const b = base(raw, "order");
    if (!b) return null;
    const baseLabel = str(b.o.baseLabel, SHORT_MAX);
    const resultLabel = str(b.o.resultLabel, SHORT_MAX);
    const steps = arr(b.o.steps, 1, 6, (s) => str(s, SHORT_MAX));
    if (baseLabel === null || resultLabel === null || steps === null) return null;
    const tokens = parseTokens(b.o.base, steps.length);
    const result = parseTokens(b.o.result, steps.length);
    if (tokens === null || result === null) return null;
    return { kind: "order", sentence: b.sentence, explain: b.explain, baseLabel, base: tokens, resultLabel, result, steps };
  },
  schema: sObj({
    ...baseSchema("order"),
    baseLabel: sStr("一般語序那一列的標籤，例如「一般語序」「主句」"),
    base: sArr(tokenSchema, "一般語序，由左到右切成 2–12 格"),
    resultLabel: sStr("搬移後那一列的標籤，例如「倒裝後」「問句」"),
    result: sArr(tokenSchema, "搬移後的語序，由左到右切成 2–12 格"),
    steps: sArr(sStr("一個搬移步驟，一行白話繁中"), "搬移步驟，1–6 個，依順序"),
  }),
  guide:
    "語序搬移：先給一般（陳述）語序，再說明哪些字被搬到哪裡，最後是例句的語序。\n" +
    "sentence 是搬移後的句子，marks 標出被搬動的那一段。\n" +
    "base 與 result 把句子切成 2–12 格；沒搬動的格用 role=plain、step=0；被搬走的成分用 moved；補進來或跟著跳位的助動詞、it 等用 aux；moved / aux 的 step 對應 steps 的編號（從 1 起算）。\n" +
    "steps 一個步驟一行，白話說明「什麼搬到哪」，每個步驟編號都必須在 result 出現至少一次。\n" +
    "常見錯誤：base 切太細、plain 卻填了步驟編號、steps 寫成文法術語堆疊。base 若本身不是通順句子（例如還原語序），baseLabel 要說清楚。",
  render(parent, v: OrderVisual, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const row = (label: string, tokens: OrderToken[], isResult: boolean): void => {
      const r = add(parent, ctx, "div", ["gv-order-row", isResult ? "is-result" : ""]);
      add(r, ctx, "div", "gv-order-label", label);
      const list = add(r, ctx, "div", "gv-order-tokens");
      for (const t of tokens) {
        const prefix = isResult && t.step > 0 ? `${NUMS[t.step - 1] ?? t.step} ` : "";
        add(list, ctx, "span", ["gv-order-tok", `is-${t.role}`], prefix + t.text);
      }
    };
    row(v.baseLabel, v.base, false);
    const ol = add(parent, ctx, "ol", "gv-order-steps");
    v.steps.forEach((s, i) => add(ol, ctx, "li", "gv-order-step", `${NUMS[i] ?? i + 1} ${s}`));
    row(v.resultLabel, v.result, true);
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: ORDER_BUILTIN,
};

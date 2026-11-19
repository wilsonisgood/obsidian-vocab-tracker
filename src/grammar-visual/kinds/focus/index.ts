import type { FocusCard, FocusRole, FocusVisual, KindModule } from "../../types";
import { arr, base, baseSchema, bool, obj, oneOf, sArr, sBool, sEnum, sObj, sStr, SHORT_MAX, str } from "../../kit/parse";
import { add, card, explain, sentence } from "../../kit/dom";
import { BUILTIN } from "./builtin";

export const FOCUS_ROLES: readonly FocusRole[] = ["doer", "action", "receiver", "cause", "feeler"];
const ROLE_NAME: Record<FocusRole, string> = {
  doer: "做事的人",
  action: "動作",
  receiver: "承受的人事物",
  cause: "造成感受的",
  feeler: "感受到的人",
};

function parseCard(x: unknown): FocusCard | null {
  const o = obj(x);
  if (!o) return null;
  const label = str(o.label, SHORT_MAX);
  const text = str(o.text, SHORT_MAX);
  const focus = oneOf(o.focus, FOCUS_ROLES);
  const current = bool(o.current);
  const roles = arr(o.roles, 2, 5, (r) => {
    const ro = obj(r);
    if (!ro) return null;
    const t = str(ro.text, SHORT_MAX);
    const role = oneOf(ro.role, FOCUS_ROLES);
    return t !== null && role !== null ? { text: t, role } : null;
  });
  if (label === null || text === null || focus === null || current === null || roles === null) return null;
  return { label, text, roles, focus, current };
}

function parse(raw: unknown): FocusVisual | null {
  const b = base(raw, "focus");
  if (!b) return null;
  const cards = arr(b.o.cards, 2, 3, parseCard);
  if (cards === null || cards.filter((c) => c.current).length !== 1) return null;
  return { kind: "focus", sentence: b.sentence, explain: b.explain, cards };
}

const schema = sObj({
  ...baseSchema("focus"),
  cards: sArr(
    sObj({
      label: sStr("這張卡的名稱，例如「主動」「被動」「-ing：造成感受」"),
      text: sStr("一行說明這個說法會先讓人看到誰，例如「先看到被蓋的橋」"),
      roles: sArr(
        sObj({
          text: sStr("這個片段的英文，由左到右照句子順序；省略的做事者可寫成 (by workers)"),
          role: sEnum(FOCUS_ROLES, "doer＝做事的人；action＝動作；receiver＝承受的人事物；cause＝造成感受的；feeler＝感受到的人"),
        }),
        "這個說法的片段，2 到 5 個"
      ),
      focus: sEnum(FOCUS_ROLES, "這個說法把焦點放在哪個角色（要出現在 roles 裡）"),
      current: sBool("例句用的是這張就填 true；全部卡片中剛好一張 true"),
    }),
    "2 到 3 張卡：把同一件事的不同說法並排比較"
  ),
});

const guide = `這個版面用來比較「同一件事的不同說法，焦點放在誰身上」，適合被動語態、使役與感官動詞、-ing / -ed 形容詞。
- cards：2 到 3 張，每張是一種說法（例如主動與被動）。例句用的那一張 current 填 true，其餘 false，剛好一張。
- roles：把該說法的英文拆成 2 到 5 個片段，依句子順序，每段標角色。做事者被省略時可寫成 (by workers) 之類的括號形式。
- focus：該說法想讓讀者先看到的角色，通常是 roles 裡的第一個。
- 分詞形容詞用 cause（造成感受的事物）與 feeler（感受到的人），不要用 doer / receiver。
- text 一行說明「先看到誰」，不要重複整句例句。
常見錯誤：current 沒有或超過一張；focus 填的角色沒有出現在 roles；片段合起來不是完整的句子。`;

function render(parent: HTMLElement, v: FocusVisual, ctx: Parameters<KindModule<"focus">["render"]>[2]): void {
  const root = add(parent, ctx, "div", "gv-focus-root");
  root.appendChild(sentence(ctx, v.sentence));
  const list = add(root, ctx, "div", "gv-focus-cards");
  for (const c of v.cards) {
    const k = card(ctx, c.current ? "accent" : "plain");
    k.classList.add("gv-focus-card");
    const head = add(k, ctx, "div", "gv-focus-head");
    add(head, ctx, "span", "gv-card-title", c.label + (c.current ? "（這句）" : ""));
    add(head, ctx, "span", "gv-note", c.text);
    const row = add(k, ctx, "ol", "gv-focus-row");
    for (const r of c.roles) {
      const li = add(row, ctx, "li", ["gv-focus-role", `is-${r.role}`, r.role === c.focus ? "is-focus" : ""]);
      add(li, ctx, "span", "gv-focus-text", r.text);
      add(li, ctx, "span", "gv-focus-tag", ROLE_NAME[r.role]);
    }
    list.appendChild(k);
  }
  root.appendChild(explain(ctx, v.explain));
}

export const focusKind: KindModule<"focus"> = {
  kind: "focus",
  parse,
  schema,
  guide,
  render,
  builtin: BUILTIN,
};


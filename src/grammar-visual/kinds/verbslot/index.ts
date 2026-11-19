import type { KindModule, VerbSlotCard, VerbSlotVisual } from "../../types";
import { arr, base, baseSchema, bool, obj, oneOf, sArr, sBool, sEnum, sObj, sStr, SHORT_MAX, str } from "../../kit/parse";
import { add, badge, card, explain, sentence } from "../../kit/dom";
import { BUILTIN } from "./builtin";

const TONES = ["plain", "stop", "accent"] as const;

function parseCard(x: unknown): VerbSlotCard | null {
  const o = obj(x);
  if (!o) return null;
  const pattern = str(o.pattern, SHORT_MAX);
  const meaning = str(o.meaning, SHORT_MAX);
  const current = bool(o.current);
  const picture = arr(o.picture, 0, 5, (p) => {
    const po = obj(p);
    if (!po) return null;
    const t = str(po.text, SHORT_MAX);
    const tone = oneOf(po.tone, TONES);
    return t !== null && tone !== null ? { text: t, tone } : null;
  });
  if (pattern === null || meaning === null || current === null || picture === null) return null;
  return { pattern, meaning, picture, current };
}

function parse(raw: unknown): VerbSlotVisual | null {
  const b = base(raw, "verbslot");
  if (!b) return null;
  const verb = str(b.o.verb, SHORT_MAX);
  const cards = arr(b.o.cards, 1, 4, parseCard);
  const family = arr(b.o.family, 0, 6, (x) => str(x, SHORT_MAX));
  if (verb === null || cards === null || family === null) return null;
  if (cards.filter((c) => c.current).length !== 1) return null;
  return { kind: "verbslot", sentence: b.sentence, explain: b.explain, verb, cards, family };
}

const schema = sObj({
  ...baseSchema("verbslot"),
  verb: sStr("這組在講的動詞或詞組，例如 stop、depend、used to"),
  cards: sArr(
    sObj({
      pattern: sStr("接法，例如「stop doing」「depend on + 名詞」"),
      meaning: sStr("一行說明這種接法的意思；不能這樣用的接法寫「不能這樣用」"),
      picture: sArr(
        sObj({
          text: sStr("小圖的一格，例如「走路」「買咖啡」"),
          tone: sEnum(TONES, "plain＝一般；stop＝停掉或打叉；accent＝接著去做的事或重點"),
        }),
        "小圖：一串方塊，0 到 5 格；沒有畫面就給 []"
      ),
      current: sBool("例句用的是這張就填 true；全部卡片中剛好一張 true"),
    }),
    "1 到 4 張卡：這個動詞不同接法的對照"
  ),
  family: sArr(sStr("同一組的另一個動詞"), "同一組的其他動詞，最多 6 個；沒有給 []"),
});

const guide = `這個版面用來說明「動詞後面接什麼」：動名詞與不定詞、動詞加介系詞、形容詞加介系詞、used to 系列。
- verb：這組的主角，例如 stop、depend、interested、used to。
- cards：1 到 4 張，每張是一種接法。例句用的那張 current 為 true，剛好一張。
- pattern 寫出接法（stop to do、depend on + 名詞）；meaning 一行白話說明意思。
- picture 是小圖：用一串方塊表達動作順序。stop 標被停掉的事（會打叉），accent 標接著去做或重點的事，plain 是一般。沒有畫面的搭配給 []。
- 只能接一種的動詞（enjoy doing）：再放一張「enjoy to do」，meaning 寫「不能這樣用」，picture 給 []。
- family：同一組容易混的其他動詞，沒有就給 []。
常見錯誤：current 超過一張；picture 超過 5 格；meaning 寫成整段文章。`;

function render(parent: HTMLElement, v: VerbSlotVisual, ctx: Parameters<KindModule<"verbslot">["render"]>[2]): void {
  const root = add(parent, ctx, "div", "gv-verbslot-root");
  root.appendChild(sentence(ctx, v.sentence));
  const list = add(root, ctx, "div", "gv-verbslot-cards");
  for (const c of v.cards) {
    const off = c.meaning.startsWith("不能");
    const k = card(ctx, c.current ? "accent" : "plain");
    k.classList.add("gv-verbslot-card");
    if (off) k.classList.add("is-off");
    const head = add(k, ctx, "div", "gv-verbslot-head");
    add(head, ctx, "span", "gv-verbslot-pattern", c.pattern);
    if (c.current) head.appendChild(badge(ctx, "這句"));
    if (c.picture.length > 0) {
      const pic = add(k, ctx, "ol", "gv-verbslot-pic");
      c.picture.forEach((p, i) => {
        const li = add(pic, ctx, "li", ["gv-verbslot-box", `is-${p.tone}`]);
        add(li, ctx, "span", "gv-verbslot-box-text", p.text);
        if (p.tone === "stop") add(li, ctx, "span", "gv-verbslot-x", "✕").setAttribute("aria-hidden", "true");
        if (i < c.picture.length - 1) li.classList.add("has-next");
      });
    }
    add(k, ctx, "div", "gv-note", c.meaning);
    list.appendChild(k);
  }
  if (v.family.length > 0) {
    const fam = add(root, ctx, "div", "gv-verbslot-family");
    add(fam, ctx, "span", "gv-label", "同一組：");
    add(fam, ctx, "span", "gv-note", v.family.join(" / "));
  }
  root.appendChild(explain(ctx, v.explain));
}

export const verbslotKind: KindModule<"verbslot"> = {
  kind: "verbslot",
  parse,
  schema,
  guide,
  render,
  builtin: BUILTIN,
};

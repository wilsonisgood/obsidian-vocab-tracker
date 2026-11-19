import type { KindModule, ScaleSet, ScaleStep, ScaleType, ScaleVisual } from "../../types";
import { arr, base, baseSchema, int, obj, oneOf, sArr, sEnum, sInt, sObj, sStr, str, SENTENCE_MAX, SHORT_MAX } from "../../kit/parse";
import { add, chips, explain, sentence, stateful } from "../../kit/dom";
import { scaleBuiltin } from "./builtin";

const TYPES: readonly ScaleType[] = ["certainty", "obligation", "frequency", "amount", "formality", "politeness", "polarity"];

const TYPE_NAME: Record<ScaleType, string> = {
  certainty: "推論：有多確定",
  obligation: "義務：有多必要",
  frequency: "頻率：多常發生",
  amount: "數量：多少",
  formality: "語體：多正式",
  politeness: "客氣：多委婉",
  polarity: "否定：多強",
};
// 由高到低兩端的名稱。
const ENDS: Record<ScaleType, [string, string]> = {
  certainty: ["越確定", "越不確定"],
  obligation: ["越必要", "越不必"],
  frequency: ["越常發生", "越少發生"],
  amount: ["越多", "越少"],
  formality: ["越正式", "越口語"],
  politeness: ["越客氣", "越直接"],
  polarity: ["越強烈", "越輕微"],
};

function parseStep(raw: unknown): ScaleStep | null {
  const o = obj(raw);
  if (!o) return null;
  const word = str(o.word, SHORT_MAX);
  const gloss = str(o.gloss, SHORT_MAX);
  return word !== null && gloss !== null ? { word, gloss } : null;
}

function parseSet(raw: unknown): ScaleSet | null {
  const o = obj(raw);
  if (!o) return null;
  const scale = oneOf(o.scale, TYPES);
  const steps = arr(o.steps, 2, 6, parseStep);
  if (scale === null || steps === null) return null;
  const pick = int(o.pick, 0, steps.length - 1);
  return pick === null ? null : { scale, steps, pick };
}

function parse(raw: unknown): ScaleVisual | null {
  const b = base(raw, "scale");
  if (!b) return null;
  const main = parseSet(b.o);
  const evidence = str(b.o.evidence, SENTENCE_MAX, true);
  const alt = arr(b.o.alt, 0, 1, parseSet);
  if (!main || evidence === null || alt === null) return null;
  return { kind: "scale", sentence: b.sentence, explain: b.explain, ...main, evidence, alt };
}

const setProps = {
  scale: sEnum(
    TYPES,
    "量尺種類：certainty＝推論的確定程度；obligation＝義務與必要；frequency＝頻率；amount＝數量；formality＝語體正式程度；politeness＝客氣與委婉；polarity＝否定的強弱"
  ),
  steps: sArr(
    sObj({
      word: sStr("這一格的英文字或片語"),
      gloss: sStr("這一格的繁中意思，10 字以內"),
    }),
    "由高（最確定／最強／最常／最多／最正式／最客氣）排到低，2 到 6 格"
  ),
  pick: sInt("這句落在 steps 的第幾格，從 0 起算"),
};

const schema = sObj({
  ...baseSchema("scale"),
  ...setProps,
  evidence: sStr("推論的證據，要原樣出自例句；不是推論或沒有證據就填空字串"),
  alt: sArr(
    sObj(setProps),
    "可切換的另一把量尺（例如推論 ↔ 義務、可數 ↔ 不可數）；沒有就給 []，最多 1 個"
  ),
});

const guide = `程度量尺版面：把這句用的字放在一把量尺上，讓人看出它跟同類字的強弱差別。
- scale：選對量尺種類。情態動詞的推論用 certainty，義務與必要用 obligation；頻率副詞用 frequency；few / little 用 amount；正式與口語用 formality；命令句與請求的客氣程度用 politeness；anything but、far from 這類否定用 polarity；引述立場副詞（reportedly、allegedly）用 certainty。
- steps：2–6 格，由高排到低（最確定／最強／最常在最前面）。word 是英文字或片語，gloss 是 10 字內的繁中意思。每一格都要是同一把尺上的東西，不要混進別的概念。
- pick：這句用的字在 steps 的第幾格（0 起算），一定要真的是例句裡用的那個字。
- evidence：只有推論句才填，原樣取自例句中當證據的那一段；其他填 ""。
- alt：同一個字還能放在另一把量尺上時才填一把（例如 must 既可推論也可表義務、few 與 little）；否則給 []。
- explain：一兩句繁中白話，說明為什麼落在這一格、跟相鄰的字差在哪。
常見錯誤：steps 排反方向；pick 超出範圍；alt 與主量尺內容重複。`;

function altLabel(sets: ScaleSet[], i: number): string {
  const s = sets[i];
  const dup = sets.some((o, j) => j !== i && o.scale === s.scale);
  return dup ? `${TYPE_NAME[s.scale].split("：")[0]}（${s.steps[s.pick].word}）` : TYPE_NAME[s.scale];
}

interface State {
  idx: number;
  peek: number | null;
}

export const scaleKind: KindModule<"scale"> = {
  kind: "scale",
  parse,
  schema,
  guide,
  render(parent, v, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    if (v.evidence !== "") {
      const ev = add(parent, ctx, "div", "gv-sc-evidence");
      add(ev, ctx, "span", "gv-label", "證據");
      add(ev, ctx, "span", "gv-sc-evtext", v.evidence);
    }
    const sets: ScaleSet[] = [v, ...v.alt];
    const host = add(parent, ctx, "div", "gv-sc-host");
    stateful<State>(host, { idx: 0, peek: null }, (h, s, set) => {
      if (sets.length > 1) {
        h.appendChild(
          chips(ctx, {
            label: "量尺種類",
            options: sets.map((_, i) => altLabel(sets, i)),
            selected: s.idx,
            onSelect: (i) => set({ idx: i, peek: null }),
          })
        );
      }
      const cur = sets[s.idx];
      const ends = ENDS[cur.scale];
      const caption = add(h, ctx, "div", "gv-sc-ends");
      if (ctx.mobile) {
        add(caption, ctx, "span", "gv-note", `上：${ends[0]}`);
        add(caption, ctx, "span", "gv-note", `下：${ends[1]}`);
      } else {
        add(caption, ctx, "span", "gv-note", `← ${ends[1]}`);
        add(caption, ctx, "span", "gv-note", `${ends[0]} →`);
      }
      if (ctx.mobile) drawVertical(h, cur, s, set);
      else drawHorizontal(h, cur);
    });

    function drawHorizontal(h: HTMLElement, cur: ScaleSet): void {
      const n = cur.steps.length;
      const board = add(h, ctx, "div", "gv-sc-board");
      board.setAttribute("role", "group");
      board.setAttribute("aria-label", TYPE_NAME[cur.scale]);
      const track = add(board, ctx, "div", "gv-sc-track");
      const pos = (i: number): number => 10 + (i / (n - 1)) * 80;
      // 顯示順序：低在左、高在右；steps 是由高到低，所以 steps 的第 k 格顯示在 n-1-k。
      const pickX = pos(n - 1 - cur.pick);
      const fill = add(track, ctx, "div", "gv-sc-fill");
      fill.style.setProperty("--gv-w", `${(pickX - 4).toFixed(2)}%`);
      cur.steps.forEach((step, k) => {
        const x = pos(n - 1 - k);
        const on = k === cur.pick;
        const item = add(board, ctx, "div", ["gv-sc-step", on ? "is-pick" : ""]);
        item.style.setProperty("--gv-x", `${x.toFixed(2)}%`);
        item.style.setProperty("--gv-sw", `${(80 / (n - 1)).toFixed(2)}%`);
        if (on) item.setAttribute("aria-current", "true");
        add(item, ctx, "span", "gv-sc-dot");
        add(item, ctx, "div", "gv-sc-word", step.word);
        add(item, ctx, "div", "gv-sc-gloss", step.gloss);
        if (on) add(item, ctx, "div", "gv-sc-here", "這句");
      });
    }

    function drawVertical(h: HTMLElement, cur: ScaleSet, s: State, set: (n: State) => void): void {
      const wrap = add(h, ctx, "div", "gv-sc-vwrap");
      add(wrap, ctx, "div", "gv-sc-gradient").setAttribute("aria-hidden", "true");
      const list = add(wrap, ctx, "ol", "gv-sc-list");
      cur.steps.forEach((step, k) => {
        const li = add(list, ctx, "li", "gv-sc-li");
        const b = add(li, ctx, "button", ["gv-sc-row", k === cur.pick ? "is-pick" : "", s.peek === k ? "is-peek" : ""]);
        b.setAttribute("type", "button");
        b.setAttribute("aria-pressed", String(s.peek === k));
        add(b, ctx, "span", "gv-sc-word", step.word);
        add(b, ctx, "span", "gv-sc-gloss", k === cur.pick ? `${step.gloss} ← 這句` : step.gloss);
        b.addEventListener("click", () => set({ idx: s.idx, peek: s.peek === k ? null : k }));
      });
      if (s.peek !== null) {
        const p = cur.steps[s.peek];
        add(h, ctx, "div", ["gv-note", "gv-sc-peek"], `把 ${p.word} 放進這句：${p.gloss}`);
      }
    }

    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: scaleBuiltin,
};

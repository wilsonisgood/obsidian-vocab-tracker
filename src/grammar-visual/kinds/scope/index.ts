import type { KindModule, ScopeSet, ScopeVisual } from "../../types";
import { add, chips, explain, sentence, stateful } from "../../kit/dom";
import { arr, base, baseSchema, int, oneOf, sArr, sEnum, sInt, sObj, sStr, str, SHORT_MAX, type Obj, obj } from "../../kit/parse";
import { SCOPE_BUILTIN } from "./builtin";

const DOMAINS = ["time", "place", "abstract"] as const;

function parseSet(o: Obj): ScopeSet | null {
  const domain = oneOf(o.domain, DOMAINS);
  const levels = arr(o.levels, 2, 3, (x) => {
    const lo = obj(x);
    if (!lo) return null;
    const word = str(lo.word, SHORT_MAX);
    const examples = str(lo.examples, SHORT_MAX);
    const gloss = str(lo.gloss, SHORT_MAX);
    return word !== null && examples !== null && gloss !== null ? { word, examples, gloss } : null;
  });
  if (domain === null || levels === null) return null;
  const hit = int(o.hit, 0, levels.length - 1);
  return hit === null ? null : { domain, levels, hit };
}

const setProps = {
  domain: sEnum(DOMAINS, "time＝時間；place＝地點；abstract＝抽象關係"),
  levels: sArr(
    sObj({
      word: sStr("這一層的介系詞，例如 in"),
      examples: sStr("這一層的 2–3 個例子，用 · 隔開"),
      gloss: sStr("這一層是什麼範圍，繁中短句"),
    }),
    "由大（外層）到小（內層）2–3 層"
  ),
  hit: sInt("這句用到的是第幾層（從 0 起算）"),
};

const DOMAIN_LABEL = { time: "時間", place: "地點" } as const;

function setLabel(s: ScopeSet): string {
  return s.domain === "abstract" ? s.levels.map((l) => l.word).filter((w, i, a) => a.indexOf(w) === i).join(" / ") : DOMAIN_LABEL[s.domain];
}

export const scopeKind: KindModule<"scope"> = {
  kind: "scope",
  parse(raw) {
    const b = base(raw, "scope");
    if (!b) return null;
    const main = parseSet(b.o);
    const alt = arr(b.o.alt, 0, 1, (x) => {
      const ao = obj(x);
      return ao ? parseSet(ao) : null;
    });
    if (main === null || alt === null) return null;
    return { kind: "scope", sentence: b.sentence, explain: b.explain, ...main, alt };
  },
  schema: sObj({
    ...baseSchema("scope"),
    ...setProps,
    alt: sArr(sObj(setProps), "切換鈕的另一組（例如時間 ↔ 地點）；沒有就給 []，最多 1 個"),
  }),
  guide:
    "範圍大小：用層層套疊的框表示範圍由大到小，大的在外。\n" +
    "domain 填 time、place 或 abstract；levels 由大到小 2–3 層，每層有 word（介系詞）、examples（2–3 個例子用 · 隔開）、gloss（這層是什麼範圍）；hit 是這句用到的那一層（從 0 起算）。\n" +
    "alt 放另一組可切換的框（例如主組是時間，alt 放地點），沒有就給 []。\n" +
    "sentence 的 marks 標出用到的介系詞片語。\n" +
    "常見錯誤：levels 不是由大到小、hit 超出層數、例子太長。例外（at night、in time / on time）寫進 explain。",
  render(parent, v: ScopeVisual, ctx) {
    parent.appendChild(sentence(ctx, v.sentence));
    const sets: ScopeSet[] = [{ domain: v.domain, levels: v.levels, hit: v.hit }, ...v.alt];
    const host = add(parent, ctx, "div", "gv-scope-host");
    stateful(host, 0, (h, idx, set) => {
      const s = sets[idx];
      if (sets.length > 1) h.appendChild(chips(ctx, { label: "切換範圍", options: sets.map(setLabel), selected: idx, onSelect: set }));
      let box = add(h, ctx, "div", "gv-scope-outer");
      box.setAttribute("aria-label", "範圍由大到小");
      s.levels.forEach((lv, i) => {
        const isHit = i === s.hit;
        const layer = add(box, ctx, "div", ["gv-scope-layer", isHit ? "is-hit" : "", i === s.levels.length - 1 ? "is-last" : ""]);
        const head = add(layer, ctx, "div", "gv-scope-head");
        if (i === s.levels.length - 1) add(head, ctx, "span", "gv-scope-dot");
        add(head, ctx, "strong", "gv-scope-word", lv.word);
        add(head, ctx, "span", "gv-scope-examples", lv.examples);
        add(head, ctx, "span", "gv-scope-gloss", isHit ? `${lv.gloss}（這句）` : lv.gloss);
        box = layer;
      });
    });
    parent.appendChild(explain(ctx, v.explain));
  },
  builtin: SCOPE_BUILTIN,
};

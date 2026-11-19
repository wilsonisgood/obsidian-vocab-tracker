import type { MarkedSentence, RenderCtx } from "../types";

// 畫版面用的 DOM 小工具。只用標準 DOM（document.createElement 等），
// 不用 Obsidian 的 createDiv / setIcon，模組才搬得走。
// class 一律 gv- 開頭，樣式在 ../styles.css 與各版面的 style.css。

export function el<K extends keyof HTMLElementTagNameMap>(
  ctx: RenderCtx,
  tag: K,
  cls?: string | string[],
  text?: string
): HTMLElementTagNameMap[K] {
  const e = ctx.doc.createElement(tag);
  // 「a b」這種含空白的字串也拆開（真的 DOM 的 classList.add 遇到空白會丟錯）。
  if (cls) for (const c of (Array.isArray(cls) ? cls : [cls]).flatMap((x) => x.split(/\s+/))) if (c) e.classList.add(c);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function add<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  ctx: RenderCtx,
  tag: K,
  cls?: string | string[],
  text?: string
): HTMLElementTagNameMap[K] {
  return parent.appendChild(el(ctx, tag, cls, text));
}

export interface Piece {
  text: string;
  tone: MarkedSentence["marks"][number]["tone"] | null;
}

// 例句切成一段一段：marks 依序由左到右找，找不到或跟前一段重疊就略過。
export function sentencePieces(s: MarkedSentence): Piece[] {
  const out: Piece[] = [];
  let pos = 0;
  for (const m of s.marks) {
    const i = s.text.indexOf(m.text, pos);
    if (i < 0 || m.text === "") continue;
    if (i > pos) out.push({ text: s.text.slice(pos, i), tone: null });
    out.push({ text: m.text, tone: m.tone });
    pos = i + m.text.length;
  }
  if (pos < s.text.length) out.push({ text: s.text.slice(pos), tone: null });
  return out;
}

// 標好顏色的例句（每種版面最上面那一行）。
export function sentence(ctx: RenderCtx, s: MarkedSentence, cls?: string): HTMLElement {
  const box = el(ctx, "div", ["gv-sentence", cls ?? ""]);
  for (const p of sentencePieces(s)) {
    if (p.tone === null) box.appendChild(ctx.doc.createTextNode(p.text));
    else box.appendChild(el(ctx, p.tone === "accent" ? "strong" : "span", ["gv-mark", `is-${p.tone}`], p.text));
  }
  return box;
}

export function explain(ctx: RenderCtx, text: string): HTMLElement {
  return el(ctx, "div", "gv-explain", text);
}

// 卡片：plain（白底）、accent（這句，紫框）、amber（假設／修飾那側）。
export function card(ctx: RenderCtx, tone: "plain" | "accent" | "amber" = "plain", title?: string): HTMLElement {
  const c = el(ctx, "div", ["gv-card", `is-${tone}`]);
  if (title) add(c, ctx, "div", "gv-card-title", title);
  return c;
}

export function badge(ctx: RenderCtx, text: string, tone: "accent" | "amber" | "plain" = "accent"): HTMLElement {
  return el(ctx, "span", ["gv-badge", `is-${tone}`], text);
}

// 切換鈕一組（尺寸跟插件的 .vt-pr-chip 一樣，手機版 44px 高）。
// 點了只呼叫 onSelect，重畫由呼叫端做。
export function chips(
  ctx: RenderCtx,
  opts: { label: string; options: readonly string[]; selected: number; onSelect(i: number): void }
): HTMLElement {
  const g = el(ctx, "div", "gv-chips");
  g.setAttribute("role", "group");
  g.setAttribute("aria-label", opts.label);
  opts.options.forEach((text, i) => {
    const b = add(g, ctx, "button", ["gv-chip", i === opts.selected ? "is-on" : ""], text);
    b.setAttribute("type", "button");
    b.setAttribute("aria-pressed", String(i === opts.selected));
    b.addEventListener("click", () => {
      if (i !== opts.selected) opts.onSelect(i);
    });
  });
  return g;
}

// 有切換狀態的版面：每次狀態變了就清掉 host 重畫。
export function stateful<S>(host: HTMLElement, initial: S, draw: (host: HTMLElement, state: S, set: (next: S) => void) => void): void {
  let state = initial;
  const set = (next: S): void => {
    state = next;
    redraw();
  };
  const redraw = (): void => {
    while (host.firstChild) host.removeChild(host.firstChild);
    draw(host, state, set);
  };
  redraw();
}

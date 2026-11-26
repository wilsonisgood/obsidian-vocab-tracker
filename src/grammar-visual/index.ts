// 文法概念版面（grammar-visual）的對外介面。插件只從這個檔案 import。
//
//   const v = parseVisualJson(text) ?? builtinVisual(topicId);
//   if (v) renderGrammarVisual(container, v, { mobile });
//
// 樣式：把 ./styles.css 一起打包（vocab-tracker 由 src/styles/index.css 引入）。

import { KINDS } from "./kinds";
import { LAYOUT_TITLES, layoutOf } from "./layouts";
import { obj } from "./kit/parse";
import { el } from "./kit/dom";
import { LAYOUT_KINDS, type JsonSchema, type LayoutKind, type RenderCtx, type Visual } from "./types";

export * from "./types";
export { LAYOUT_TITLES, layoutOf, mappedTopics, topicsOfLayout } from "./layouts";

function isKind(x: unknown): x is LayoutKind {
  return typeof x === "string" && (LAYOUT_KINDS as readonly string[]).includes(x);
}

// 依 kind 分派給該版面的 parse；不認得或不合格回 null。
export function parseVisual(raw: unknown): Visual | null {
  const o = obj(raw);
  if (!o || !isKind(o.kind)) return null;
  try {
    return KINDS[o.kind].parse(raw);
  } catch {
    return null;
  }
}

export function parseVisualJson(text: string): Visual | null {
  try {
    return parseVisual(JSON.parse(text));
  } catch {
    return null;
  }
}

export function builtinVisual(topicId: string): Visual | null {
  const kind = layoutOf(topicId);
  return kind ? (KINDS[kind].builtin[topicId] ?? null) : null;
}

export function visualSchema(kind: LayoutKind): JsonSchema {
  return KINDS[kind].schema;
}

export function visualGuide(kind: LayoutKind): string {
  return KINDS[kind].guide;
}

export interface RenderOptions {
  mobile?: boolean;
  // 版面左上角的小標（預設是版面名稱）；"" 不顯示。
  heading?: string;
}

// 畫進 parent，回傳外框。畫的時候出錯就退回只顯示文字說明。
export function renderGrammarVisual(parent: HTMLElement, v: Visual, opts: RenderOptions = {}): HTMLElement {
  const ctx: RenderCtx = { doc: parent.ownerDocument, mobile: !!opts.mobile };
  const root = el(ctx, "section", ["gv", `gv-${v.kind}`, ctx.mobile ? "is-mobile" : ""]);
  root.setAttribute("aria-label", LAYOUT_TITLES[v.kind]);
  const heading = opts.heading ?? LAYOUT_TITLES[v.kind];
  if (heading) root.appendChild(el(ctx, "div", "gv-head", heading));
  const body = el(ctx, "div", "gv-body");
  root.appendChild(body);
  try {
    renderKind(body, v, ctx);
  } catch {
    while (body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(el(ctx, "div", "gv-explain", v.explain));
  }
  parent.appendChild(root);
  return root;
}

function renderKind<K extends LayoutKind>(body: HTMLElement, v: Extract<Visual, { kind: K }>, ctx: RenderCtx): void {
  (KINDS[v.kind as K] as { render(p: HTMLElement, x: typeof v, c: RenderCtx): void }).render(body, v, ctx);
}

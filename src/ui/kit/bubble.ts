import { setIcon } from "obsidian";
import type { KitAction } from "./emptyState";

export interface BubbleOptions {
  role: "user" | "assistant";
  text: string;
  // Markdown renderer for assistant answers (MarkdownRenderer.render needs
  // app + component, which only the caller has). Plain text when omitted.
  render?: (el: HTMLElement, markdown: string) => void;
  // Shows the blinking cursor while an answer is still streaming.
  streaming?: boolean;
  // e.g. 釘選到文法提示 / 複製 / 重試.
  actions?: KitAction[];
  // Error line under a failed answer (from aiErrorText()).
  error?: string;
}

// Design C1 「討論泡泡」. Returns the bubble element; the body is
// `.vt-bubble-body` so a streaming ChatPanel (M4) can update just that node
// instead of re-rendering the thread.
export function bubble(opts: BubbleOptions): HTMLElement {
  const el = createDiv({ cls: `vt-bubble is-${opts.role}` });
  el.toggleClass("is-streaming", !!opts.streaming);
  const body = el.createDiv({ cls: "vt-bubble-body" });
  if (opts.render && opts.role === "assistant") opts.render(body, opts.text);
  else body.setText(opts.text);
  if (opts.streaming) el.createSpan({ cls: "vt-cursor" });
  if (opts.error) el.createDiv({ cls: "vt-bubble-error", text: opts.error });

  if (opts.actions?.length) {
    const bar = el.createDiv({ cls: "vt-bubble-actions" });
    for (const a of opts.actions) {
      const btn = bar.createEl("button", { cls: "vt-bubble-action clickable-icon" });
      if (a.icon) setIcon(btn.createSpan(), a.icon);
      btn.createSpan({ text: a.label });
      btn.addEventListener("click", a.onClick);
    }
  }
  return el;
}

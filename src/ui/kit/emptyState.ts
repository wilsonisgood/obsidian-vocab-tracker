import { setIcon } from "obsidian";

export interface KitAction {
  label: string;
  icon?: string;
  onClick: () => void;
  // Bubble actions only: a toggle's pressed state (👍 👎), and showing just
  // the icon (the label becomes its aria-label).
  active?: boolean;
  iconOnly?: boolean;
}

// Design C1 「空白狀態」: one-line title, a sentence, optional primary action
// (D6 「設定 AI 後才能討論」 is the canonical use).
export function emptyState(opts: { icon?: string; title: string; body?: string; action?: KitAction }): HTMLElement {
  const el = createDiv({ cls: "vt-empty" });
  if (opts.icon) setIcon(el.createSpan({ cls: "vt-empty-icon" }), opts.icon);
  el.createDiv({ cls: "vt-empty-title", text: opts.title });
  if (opts.body) el.createDiv({ cls: "vt-empty-body", text: opts.body });
  if (opts.action) {
    const { action } = opts;
    const btn = el.createDiv({ cls: "vt-empty-action" }).createEl("button", { cls: "mod-cta vt-btn" });
    if (action.icon) setIcon(btn.createSpan({ cls: "vt-btn-icon" }), action.icon);
    btn.createSpan({ text: action.label });
    btn.addEventListener("click", action.onClick);
  }
  return el;
}

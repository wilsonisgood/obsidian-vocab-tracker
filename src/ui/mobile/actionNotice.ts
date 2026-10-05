import { Notice } from "obsidian";

export interface NoticeAction {
  label: string;
  run(): void;
}

// A Notice with buttons, e.g. 「已加入 glittery ＋ 復原」 (規劃書 01 §3.2).
// A button hides the Notice after running. Buttons are ≥ 44pt on mobile
// (mobile.css).
export function actionNotice(text: string, actions: NoticeAction[], durationMs = 5000): Notice {
  const frag = createFragment((f) => {
    const wrap = f.createDiv({ cls: "vt-action-notice" });
    wrap.createSpan({ cls: "vt-action-notice-text", text });
    const bar = wrap.createDiv({ cls: "vt-action-notice-actions" });
    for (const a of actions) {
      const btn = bar.createEl("button", { cls: "vt-action-notice-btn", text: a.label });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        notice.hide();
        a.run();
      });
    }
  });
  const notice = new Notice(frag, durationMs);
  return notice;
}

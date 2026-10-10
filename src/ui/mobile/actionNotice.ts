import { Notice } from "obsidian";

export interface NoticeAction {
  label: string;
  run(): void;
}

// A Notice with buttons, e.g. 「已加入 glittery ＋ 復原」 (規劃書 01 §3.2).
// A button hides the Notice after running. Buttons are ≥ 44pt on mobile
// (mobile.css).
export function actionNotice(text: string, actions: NoticeAction[], durationMs = 5000, onTap?: () => void): Notice {
  const frag = createFragment((f) => {
    const wrap = f.createDiv({ cls: "vt-action-notice" });
    const label = wrap.createSpan({ cls: "vt-action-notice-text", text });
    // Tapping the text itself runs onTap (1010 #G2: 點提示才打開單字info).
    if (onTap) {
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        notice.hide();
        onTap();
      });
    }
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

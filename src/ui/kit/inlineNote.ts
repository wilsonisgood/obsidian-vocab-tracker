import { setIcon } from "obsidian";

export type NoteTone = "info" | "offline" | "error";

const TONE_ICON: Record<NoteTone, string> = {
  info: "info",
  offline: "wifi-off",
  error: "alert-circle",
};

// Design C1 「提示」: icon + one or two sentences. `offline` is D7's
// 「目前離線。之前的討論可以看…」 note above the disabled composer.
export function inlineNote(opts: { tone?: NoteTone; text: string; icon?: string }): HTMLElement {
  const tone = opts.tone ?? "info";
  const el = createDiv({ cls: `vt-note is-${tone}` });
  setIcon(el.createSpan({ cls: "vt-note-icon" }), opts.icon ?? TONE_ICON[tone]);
  el.createDiv({ cls: "vt-note-text", text: opts.text });
  return el;
}

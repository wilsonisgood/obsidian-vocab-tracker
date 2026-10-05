import { isMobileForm, type FormFactor } from "./formFactor";
import { lm } from "./strings";

// Obsidian mobile opens notes in Live Preview, where tapping a word does
// nothing — saving words only works in reading view (規劃書 01 §3.4, the
// simple version). The first time per session a word is tapped there, a
// Notice says so, with 「切換到閱讀模式」 and 「不再提示」.

export interface ClosestTarget {
  closest(selector: string): unknown;
}

// A tap on the editable text of a Live Preview editor — not on the
// rendered bits inside it (callouts, embeds, tables…), where the reading
// click handler already works.
export function isLivePreviewText(target: ClosestTarget): boolean {
  if (!target.closest(".markdown-source-view.is-live-preview .cm-content")) return false;
  return !target.closest(".markdown-rendered, .cm-embed-block, .cm-widgetBuffer, a, button, input, textarea");
}

export interface HintAction {
  label: string;
  run(): void;
}

export interface LivePreviewHintDeps {
  form(): FormFactor;
  // The ui.livePreviewHint setting.
  enabled(): boolean;
  notify(text: string, actions: HintAction[]): void;
  switchToReading(): void;
  // 「不再提示」: turns the setting off.
  disable(): void;
}

export class LivePreviewHint {
  private shownThisSession = false;

  constructor(private deps: LivePreviewHintDeps) {}

  // `hasWord` is only asked once everything cheaper said yes (it reads the
  // caret position under the finger).
  maybeShow(target: ClosestTarget, hasWord: () => boolean): boolean {
    if (this.shownThisSession || !isMobileForm(this.deps.form()) || !this.deps.enabled()) return false;
    if (!isLivePreviewText(target) || !hasWord()) return false;
    this.shownThisSession = true;
    this.deps.notify(lm("mobile.livePreview.text"), [
      { label: lm("mobile.livePreview.switch"), run: () => this.deps.switchToReading() },
      { label: lm("mobile.livePreview.never"), run: () => this.deps.disable() },
    ]);
    return true;
  }
}

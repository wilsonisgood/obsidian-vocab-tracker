export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedOptions<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  ariaLabel?: string;
  onChange(value: T): void;
}

// Small pill-tab group (new kit primitive; first used by Word DNA's
// 字首／字尾／字根 tabs, 規劃書 09 §7). Its CSS lives in styles/dna.css for
// now since that's its only caller this wave — any later caller (e.g.
// Galaxy's 星系／清單 toggle) gets it for free once that stylesheet is
// imported globally (see dna.ts's integration note).
export function segmented<T extends string>(parent: HTMLElement, opts: SegmentedOptions<T>): HTMLElement {
  const el = parent.createDiv({ cls: "vt-seg" });
  el.setAttr("role", "group");
  if (opts.ariaLabel) el.setAttr("aria-label", opts.ariaLabel);
  for (const opt of opts.options) {
    const btn = el.createEl("button", { cls: "vt-seg-btn", text: opt.label, attr: { type: "button" } });
    const active = opt.value === opts.value;
    btn.setAttr("aria-pressed", String(active));
    btn.toggleClass("is-active", active);
    btn.addEventListener("click", () => {
      if (opt.value !== opts.value) opts.onChange(opt.value);
    });
  }
  return el;
}

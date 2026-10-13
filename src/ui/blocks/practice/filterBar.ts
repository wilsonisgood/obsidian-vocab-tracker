import { learnButton } from "../learnUi";
import { toggleOption, type FilterGroup, type FilterValue, type QuickPick } from "./filterBarModel";

export type { FilterGroup, QuickPick } from "./filterBarModel";

// The shared filter bar of the practice hub (第十六波 E; every tab uses it).
// Collapsed it's one line 「出題參考 · <summary> ›」; open it shows the chip
// groups and the quick picks. Phones start collapsed.

const L = {
  title: { zh: "出題參考", en: "Question filter" },
  quick: { zh: "快選", en: "Quick picks" },
};

export interface FilterBarOptions {
  groups: FilterGroup[];
  quick?: QuickPick[];
  value: FilterValue;
  summary(value: FilterValue): string;
  onChange(value: FilterValue): void;
  // Interface language of the fixed labels.
  lang?: "zh" | "en";
}

export function renderFilterBar(el: HTMLElement, opts: FilterBarOptions): { update(value: FilterValue): void } {
  const lang = opts.lang ?? "zh";
  const root = el.createDiv({ cls: "vt-pr-filter" });
  let value = opts.value;
  let open = !document.body.classList.contains("is-mobile");

  const change = (next: FilterValue) => {
    value = next;
    render();
    opts.onChange(next);
  };

  const render = () => {
    root.empty();
    root.toggleClass("is-open", open);
    const head = root.createEl("button", {
      cls: "vt-pr-filter-head",
      attr: { type: "button", "aria-expanded": String(open) },
    });
    head.createSpan({ cls: "vt-pr-filter-title", text: `${L.title[lang]} · ${opts.summary(value)}` });
    head.createSpan({ cls: "vt-pr-filter-caret", text: "›" });
    head.addEventListener("click", () => {
      open = !open;
      render();
    });
    if (!open) return;

    const body = root.createDiv({ cls: "vt-pr-filter-body" });
    for (const g of opts.groups) {
      const row = body.createDiv({ cls: "vt-pr-filter-group" });
      row.createSpan({ cls: "vt-pr-filter-label", text: g.label });
      const chips = row.createDiv({ cls: "vt-pr-chips" });
      const sel = value[g.id] ?? [];
      for (const o of g.options) {
        const on = sel.includes(o.id);
        const chip = chips.createEl("button", {
          cls: "vt-pr-chip",
          text: o.label,
          attr: { type: "button", "aria-pressed": String(on) },
        });
        chip.toggleClass("is-on", on);
        chip.addEventListener("click", () => change(toggleOption(value, g, o.id)));
      }
    }
    if (opts.quick && opts.quick.length > 0) {
      const row = body.createDiv({ cls: "vt-pr-filter-group" });
      row.createSpan({ cls: "vt-pr-filter-label", text: L.quick[lang] });
      const btns = row.createDiv({ cls: "vt-pr-chips" });
      for (const q of opts.quick) {
        learnButton(btns, { label: q.label, ghost: true, onClick: () => change(q.apply(value)) });
      }
    }
  };

  render();
  return {
    update(next) {
      value = next;
      render();
    },
  };
}

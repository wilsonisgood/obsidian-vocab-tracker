import { t } from "../../../core/i18n";
import { learnButton } from "../learnUi";
import { pruneValue, sameFilter, toggleOption, type FilterGroup, type FilterValue, type QuickPick } from "./filterBarModel";

export type { FilterGroup, QuickPick } from "./filterBarModel";

// The shared filter bar of the practice hub (第十六波 E; every tab uses it).
// Collapsed it's one line 「出題參考 · <summary> ›」; open it shows the chip
// groups and the quick picks. Phones start collapsed.


export interface FilterBarOptions {
  groups: FilterGroup[];
  // Groups that depend on the draft (e.g. 字 chips follow the category).
  groupsFor?(value: FilterValue): FilterGroup[];
  quick?: QuickPick[];
  value: FilterValue;
  summary(value: FilterValue): string;
  onChange(value: FilterValue): void;
}

export function renderFilterBar(el: HTMLElement, opts: FilterBarOptions): { update(value: FilterValue): void } {
  const root = el.createDiv({ cls: "vt-pr-filter" });
  let applied = opts.value;
  let draft = opts.value;
  let open = !document.body.classList.contains("is-mobile");

  const groupsOf = () => (opts.groupsFor ? opts.groupsFor(draft) : opts.groups);

  // Chips and quick picks only edit the draft; the button applies it.
  const edit = (next: FilterValue) => {
    draft = opts.groupsFor ? pruneValue(next, opts.groupsFor(next)) : next;
    render();
  };

  const render = () => {
    root.empty();
    root.toggleClass("is-open", open);
    const dirty = !sameFilter(draft, applied);
    const head = root.createEl("button", {
      cls: "vt-pr-filter-head",
      attr: { type: "button", "aria-expanded": String(open) },
    });
    head.createSpan({ cls: "vt-pr-filter-title", text: `${t("practice.filter.title")} · ${opts.summary(draft)}${dirty ? t("practice.filter.unapplied") : ""}` });
    head.createSpan({ cls: "vt-pr-filter-caret", text: "›" });
    head.addEventListener("click", () => {
      open = !open;
      render();
    });
    if (!open) return;

    const body = root.createDiv({ cls: "vt-pr-filter-body" });
    const groups = groupsOf();
    for (const g of groups) {
      const row = body.createDiv({ cls: "vt-pr-filter-group" });
      row.createSpan({ cls: "vt-pr-filter-label", text: g.label });
      const chips = row.createDiv({ cls: "vt-pr-chips" });
      const sel = draft[g.id] ?? [];
      for (const o of g.options) {
        const on = sel.includes(o.id);
        const chip = chips.createEl("button", {
          cls: "vt-pr-chip",
          text: o.label,
          attr: { type: "button", "aria-pressed": String(on) },
        });
        chip.toggleClass("is-on", on);
        chip.addEventListener("click", () => edit(toggleOption(draft, g, o.id)));
      }
    }
    if (opts.quick && opts.quick.length > 0) {
      const row = body.createDiv({ cls: "vt-pr-filter-group" });
      row.createSpan({ cls: "vt-pr-filter-label", text: t("practice.filter.quick") });
      const btns = row.createDiv({ cls: "vt-pr-chips" });
      for (const q of opts.quick) {
        learnButton(btns, { label: q.label, ghost: true, onClick: () => edit(q.apply(draft)) });
      }
    }
    if (dirty) {
      const foot = body.createDiv({ cls: "vt-pr-filter-apply" });
      learnButton(foot, {
        label: t("practice.filter.apply"),
        cta: true,
        onClick: () => {
          applied = draft;
          render();
          opts.onChange(draft);
        },
      });
    }
  };

  render();
  return {
    update(next) {
      applied = next;
      draft = next;
      render();
    },
  };
}

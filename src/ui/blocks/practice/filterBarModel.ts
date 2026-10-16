// Pure logic of the shared filter bar (第十六波 E). No DOM, so it's testable
// in Node.

export interface FilterGroup {
  id: string;
  label: string;
  options: { id: string; label: string }[];
  multi: boolean;
}

export type FilterValue = Record<string, string[]>;

export interface QuickPick {
  id: string;
  label: string;
  apply(value: FilterValue): FilterValue;
}

export function selectedIds(value: FilterValue, groupId: string): string[] {
  return value[groupId] ?? [];
}

// A chip was clicked. Multi groups toggle the option; single groups select
// it, or clear the group when it was already the selection. Returns a new
// value, never mutates; empty groups are dropped.
export function toggleOption(value: FilterValue, group: FilterGroup, optionId: string): FilterValue {
  const cur = selectedIds(value, group.id);
  let next: string[];
  if (group.multi) next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
  else next = cur.includes(optionId) ? [] : [optionId];
  const out: FilterValue = { ...value };
  if (next.length > 0) out[group.id] = next;
  else delete out[group.id];
  return out;
}

// The labels of everything selected in `group`, in option order.
export function selectedLabels(value: FilterValue, group: FilterGroup): string[] {
  const sel = selectedIds(value, group.id);
  return group.options.filter((o) => sel.includes(o.id)).map((o) => o.label);
}

export function hasSelection(value: FilterValue): boolean {
  return Object.values(value).some((v) => v.length > 0);
}

// Accepts whatever the store gave back (undefined, an older shape, junk) and
// returns a clean string-array record.
export function parseFilterValue(raw: unknown): FilterValue {
  const out: FilterValue = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const ids = v.filter((x): x is string => typeof x === "string" && x !== "");
    if (ids.length > 0) out[k] = [...new Set(ids)];
  }
  return out;
}

// Drops selections that no group/option offers any more (a level tag that
// vanished with its last word would otherwise filter everything out while
// showing no chip to turn it off).
export function pruneValue(value: FilterValue, groups: readonly FilterGroup[]): FilterValue {
  const out: FilterValue = {};
  for (const g of groups) {
    const ok = new Set(g.options.map((o) => o.id));
    const kept = selectedIds(value, g.id).filter((id) => ok.has(id));
    if (kept.length > 0) out[g.id] = g.multi ? kept : kept.slice(0, 1);
  }
  return out;
}

// Draft vs applied (第十九波 P): same selection, ignoring array order and
// empty groups.
export function sameFilter(a: FilterValue, b: FilterValue): boolean {
  const norm = (v: FilterValue) =>
    Object.keys(v)
      .filter((k) => v[k].length > 0)
      .sort()
      .map((k) => `${k}=${[...new Set(v[k])].sort().join(",")}`)
      .join("|");
  return norm(a) === norm(b);
}

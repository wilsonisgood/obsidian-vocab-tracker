import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState, RowOptions } from "./WordRow";
import { renderVocabRow } from "./WordRow";

// The group a word is listed under: its source note's name.
export function groupTitle(entry: VocabEntry): string {
  return entry.source?.path ? entry.source.path.split("/").pop()!.replace(/\.md$/, "") : "(no note)";
}

// ── Shared grouped list: dashboard + sidebar "All" tab both use this ──
//
// Groups rows by source note title into collapsible sections, each
// showing its word count — the sidebar/dashboard" second level of
// organization" on top of each row's own collapsed/half/full state.
export function renderGroupedVocabList(
  plugin: VocabTrackerPlugin,
  container: HTMLElement,
  rows: VocabEntry[],
  collapsedGroups: Set<string>,
  expandState: Map<string, ExpandState>,
  refresh: () => void,
  rowOpts: RowOptions = {}
) {
  const groups = new Map<string, VocabEntry[]>();
  for (const entry of rows) {
    const title = groupTitle(entry);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(entry);
  }

  const titles = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const title of titles) {
    const groupRows = groups.get(title)!;
    const isCollapsed = collapsedGroups.has(title);

    const heading = container.createEl("div", { cls: "vt-group-heading" });
    const arrow = heading.createEl("span", { cls: "vt-group-arrow" });
    setIcon(arrow, isCollapsed ? "chevron-up" : "chevron-down");
    heading.createEl("span", { text: title, cls: "vt-group-title", attr: { "aria-label": title } });
    heading.createEl("span", { cls: "vt-group-spacer" });
    heading.createEl("span", { text: String(groupRows.length), cls: "vt-group-count" });
    heading.onclick = () => {
      if (isCollapsed) collapsedGroups.delete(title);
      else collapsedGroups.add(title);
      refresh();
    };

    if (isCollapsed) continue;

    for (const entry of groupRows) {
      const state = expandState.get(entry.id) ?? "collapsed";
      renderVocabRow(
        plugin,
        container,
        entry,
        state,
        (s) => expandState.set(entry.id, s),
        refresh,
        rowOpts
      );
    }
  }
}

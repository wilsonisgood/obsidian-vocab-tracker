import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState } from "./WordRow";
import { renderVocabRow } from "./WordRow";

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
  refresh: () => void
) {
  const groups = new Map<string, VocabEntry[]>();
  for (const entry of rows) {
    const title = entry.source?.path
      ? entry.source.path.split("/").pop()!.replace(/\.md$/, "")
      : "(no note)";
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(entry);
  }

  const titles = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const title of titles) {
    const groupRows = groups.get(title)!;
    const isCollapsed = collapsedGroups.has(title);

    const heading = container.createEl("div", { cls: "vocab-tracker-group-heading" });
    const arrow = heading.createEl("span", { cls: "vocab-tracker-group-arrow" });
    setIcon(arrow, isCollapsed ? "chevron-up" : "chevron-down");
    heading.createEl("span", { text: title, cls: "vocab-tracker-group-title", title });
    heading.createEl("span", { cls: "vocab-tracker-group-spacer" });
    heading.createEl("span", { text: String(groupRows.length), cls: "vocab-tracker-group-count" });
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
        refresh
      );
    }
  }
}

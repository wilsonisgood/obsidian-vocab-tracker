import { setIcon } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import type { VocabEntry } from "../../core/model/entry";
import type { ExpandState, RowOptions } from "./WordRow";
import { renderVocabRow } from "./WordRow";
import { t } from "../../core/i18n";
import { groupEntries, groupOf, noteTitle, type GroupOrder, type GroupRef } from "./wordOrder";

// The key of the group a word is listed under (its collapsed state is
// stored by it): the source note, or — for words that came from no note —
// where they came from (1005 回饋 13).
export function groupKey(entry: VocabEntry): string {
  return groupOf(entry).key;
}

type FamilyLookup = Pick<VocabTrackerPlugin["learn"], "family" | "ensureLoaded">;

// The heading of a group. Family names come from learn.json (read only).
// `settled`: learn.json has been read, so a family that isn't there was
// removed (重新分群 / deleted) — until then it shows as 「字族樹：…」.
export function groupTitle(g: GroupRef, learn?: Pick<FamilyLookup, "family">, settled = true): string {
  switch (g.kind) {
    case "note":
      return noteTitle(g.path as string);
    case "family": {
      const f = learn?.family(g.familyId as string);
      if (f) return t("sidebar.group.family", { name: f.label || f.topic });
      return settled ? t("sidebar.group.familyGone") : t("sidebar.group.family", { name: "…" });
    }
    case "dna":
      return t("sidebar.group.dna");
    case "wordlist":
      return t("sidebar.group.wordlist");
    case "none":
      return t("sidebar.group.none");
  }
}

export interface GroupOptions {
  // "recent" (sidebar): most recently changed first, groups too.
  // "title" (dashboard, the default): groups A→Z.
  order?: GroupOrder;
}

// ── Shared grouped list: dashboard + sidebar "All" tab both use this ──
//
// Groups rows by source note (or, for words from no note, by where they
// came from) into collapsible sections, each showing its word count — the
// sidebar/dashboard "second level of organization" on top of each row's
// own collapsed/half/full state.
export function renderGroupedVocabList(
  plugin: VocabTrackerPlugin,
  container: HTMLElement,
  rows: VocabEntry[],
  collapsedGroups: Set<string>,
  expandState: Map<string, ExpandState>,
  // Called with the word whose card asked for it (an edit, a fold), so the
  // host can keep that card in view when the order changes.
  refresh: (entryId?: string) => void,
  rowOpts: RowOptions = {},
  groupOpts: GroupOptions = {}
) {
  const learn = plugin.learn;
  const groups = groupEntries(rows, groupOpts.order ?? "title", (g) => groupTitle(g, learn, false));
  // Family titles waiting for learn.json (it loads lazily).
  const pendingTitles: { el: HTMLElement; group: GroupRef }[] = [];

  for (const group of groups) {
    const { key } = group;
    const isCollapsed = collapsedGroups.has(key);
    const known = group.kind !== "family" || !!learn.family(group.familyId as string);
    const title = groupTitle(group, learn, known);

    const heading = container.createEl("div", { cls: "vt-group-heading" });
    heading.setAttr("data-group-key", key);
    const arrow = heading.createEl("span", { cls: "vt-group-arrow" });
    setIcon(arrow, isCollapsed ? "chevron-up" : "chevron-down");
    const titleEl = heading.createEl("span", { text: title, cls: "vt-group-title", attr: { "aria-label": title } });
    if (group.kind === "family") {
      // The family's name opens 字族樹.md.
      titleEl.addClass("vt-group-title-link");
      titleEl.setAttr("aria-label", t("sidebar.group.familyOpen"));
      titleEl.setAttr("role", "link");
      titleEl.onclick = (e) => {
        e.stopPropagation();
        void plugin.openEntryFile("families");
      };
      if (!known) pendingTitles.push({ el: titleEl, group });
    }
    if (group.kind === "dna") {
      // 1007-2 #9: words added from Word DNA's morpheme suggestions get
      // their own group (「Word DNA」), not 「（沒有來源筆記）」 — the title
      // opens Word DNA.md, same pattern as 字族樹.
      titleEl.addClass("vt-group-title-link");
      titleEl.setAttr("aria-label", t("sidebar.group.dnaOpen"));
      titleEl.setAttr("role", "link");
      titleEl.onclick = (e) => {
        e.stopPropagation();
        void plugin.openEntryFile("dna");
      };
    }
    heading.createEl("span", { cls: "vt-group-spacer" });
    heading.createEl("span", { text: String(group.entries.length), cls: "vt-group-count" });
    heading.onclick = () => {
      if (isCollapsed) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      refresh();
    };

    if (isCollapsed) continue;

    for (const entry of group.entries) {
      const state = expandState.get(entry.id) ?? "collapsed";
      renderVocabRow(plugin, container, entry, state, (s) => expandState.set(entry.id, s), () => refresh(entry.id), rowOpts);
    }
  }

  // Names in place once learn.json is read — no redraw, so nothing typed
  // in an open card is lost.
  if (pendingTitles.length) {
    void learn.ensureLoaded().then(() => {
      for (const { el, group } of pendingTitles) {
        if (el.isConnected) el.setText(groupTitle(group, learn));
      }
    });
  }
}

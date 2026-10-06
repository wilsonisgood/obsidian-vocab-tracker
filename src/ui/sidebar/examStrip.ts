import { setIcon, TFile } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { likeChipOn, resolveWordlistSettings, tagColor, tagEnabled, type WordlistSettings } from "../../core/model/wordlists";
import { tagLabel } from "../../core/wordlists/parse";
import { examTags } from "../../core/model/like";
import type { FilterMode } from "./sections";

// Wave 8 S (1006-2 #1): new strings — `t()` doesn't have these keys yet
// (src/core/i18n/{zh-TW,en}.ts is a shared file, see the wave's report for
// the integration patch). zh-TW text chosen to match the existing
// "like.like"/"like.unlike" wording.
const L = {
  likeChip: "Like",
  likeChipHide: "隱藏「Like」篩選",
  likeChipShow: "顯示「Like」篩選",
};

// ── Shared chip-row component (1006-2 #4, #5, #6) ──────────────────────
//
// Reused by the sidebar (renderExamStrip below), the vocab-list dashboard
// (src/ui/blocks/dashboard.ts) and U2's usage table. Pure rendering only —
// every caller supplies the chips' counts and on/off state, because that
// differs by context (本篇 scan hits vs library-wide counts; the Like
// chip's 本篇 count needs a note scope only the sidebar caches — see
// VocabSidebarView.noteScopeFor/likeCountFor, recomputing it here would
// reintroduce the full-text rescan perf regression Wave 7 fixed).
export interface FilterChipSpec {
  key: string;
  label: string;
  count: number;
  on: boolean;
  // Tag chips get a colour dot (defaultTagColor/tagColor); the Like chip
  // gets a heart icon instead (set `icon`, not `color`).
  color?: string;
  icon?: string;
  // Full aria-label text for each state — the builder picks the wording
  // (tag chips talk about underlines, the Like chip doesn't), so this
  // component stays generic and never calls t() itself.
  ariaOn: string;
  ariaOff: string;
  onClick: () => void;
}

export function renderFilterChips(root: HTMLElement, chips: readonly FilterChipSpec[]): void {
  const strip = root.createDiv({ cls: "vt-exam-strip" });
  const chipsEl = strip.createDiv({ cls: "vt-exam-chips" });
  for (const spec of chips) {
    const chip = chipsEl.createSpan({ cls: "vt-exam-chip" });
    chip.toggleClass("is-off", !spec.on);
    if (spec.icon) {
      chip.addClass("vt-exam-chip-like");
      setIcon(chip.createSpan({ cls: "vt-exam-chip-dot" }), spec.icon);
    } else {
      chip.style.setProperty("--vt-exam-color", spec.color ?? "");
      chip.createSpan({ cls: "vt-exam-chip-dot" });
    }
    chip.createSpan({ text: spec.label });
    chip.createSpan({ cls: "vt-exam-chip-count", text: String(spec.count) });
    chip.setAttr("role", "button");
    chip.setAttr("aria-label", spec.on ? spec.ariaOn : spec.ariaOff);
    chip.onclick = spec.onClick;
  }
}

// Builds the exam-tag chips' specs — same settings, same toggle action
// (plugin.toggleExamTag) regardless of who's drawing them.
export function tagChipSpecs(
  plugin: VocabTrackerPlugin,
  tags: readonly string[],
  settings: WordlistSettings,
  countOf: (tag: string) => number
): FilterChipSpec[] {
  return tags.map((tag) => {
    const on = settings.highlight && tagEnabled(settings, tag);
    const label = tagLabel(tag);
    return {
      key: tag,
      label,
      count: countOf(tag),
      on,
      color: tagColor(settings, tag),
      ariaOn: t("exam.strip.hide", { tag: label }),
      ariaOff: t("exam.strip.show", { tag: label }),
      onClick: () => void plugin.toggleExamTag(tag),
    };
  });
}

// Builds the Like chip's spec — writes WordlistSettings.likeEnabled through
// the same plugin.updateWordlistSettings() path the tag chips use (#5: one
// shared setting, one shared sync/redraw path).
export function likeChipSpec(plugin: VocabTrackerPlugin, settings: WordlistSettings, count: number): FilterChipSpec {
  const on = likeChipOn(settings);
  return {
    key: "like",
    label: L.likeChip,
    count,
    on,
    icon: "heart",
    ariaOn: L.likeChipHide,
    ariaOff: L.likeChipShow,
    onClick: () => void plugin.updateWordlistSettings({ likeEnabled: !on }),
  };
}

export function tagCountInLibrary(plugin: VocabTrackerPlugin, tag: string): number {
  let n = 0;
  for (const e of plugin.store.entries) {
    if (examTags(e, [tag]).length > 0) n++;
  }
  return n;
}

export function likeCountInLibrary(plugin: VocabTrackerPlugin): number {
  let n = 0;
  for (const e of plugin.store.entries) if (e.liked === true) n++;
  return n;
}

// ── Sidebar's own strip (規劃書 03；1006report.md #5, 1006-2 #4) ─────────
//
// Exam-tag chips, at the top of the 單字 section, now with a trailing Like
// chip. The chips' own numbers change meaning with the top-level 本篇／全部
// switch (#9): 本篇 counts how many of this note's words carry the
// tag/are liked (the background scan's per-note stats for tags; for Like,
// whatever scope the caller resolved — see `likeCount`); 全部 counts the
// whole (non-deleted) vocab library.
//
// `likeCount` is a callback instead of a number so this function can tell
// the caller which scope it actually used (it may fall back to "all" even
// in 本篇 mode — no active note, a non-md file, …) without the two of them
// duplicating that branch.
export function renderExamStrip(
  root: HTMLElement,
  plugin: VocabTrackerPlugin,
  file: TFile | null,
  mode: FilterMode,
  likeCount: (scope: "note" | "all") => number
): void {
  const service = plugin.wordlists;
  const index = service.index;
  const settings = resolveWordlistSettings(plugin.store.settings.wordlists);
  const isNoteFile = file instanceof TFile && file.extension === "md";
  const scope: "note" | "all" = mode === "all" || !isNoteFile ? "all" : "note";
  const likeSpec = () => likeChipSpec(plugin, settings, likeCount(scope));

  // Like chip shows even with no exam wordlist loaded at all (#4 made it a
  // general like-filter, independent of the exam-word feature).
  if (index.isEmpty) {
    renderFilterChips(root, [likeSpec()]);
    return;
  }

  if (scope === "all") {
    renderFilterChips(root, [...tagChipSpecs(plugin, index.tags, settings, (tag) => tagCountInLibrary(plugin, tag)), likeSpec()]);
    return;
  }

  const result = service.cachedScan(file!.path, file!.stat.mtime);
  if (!result) {
    root.createDiv({ cls: "vt-exam-strip-scanning", text: t("exam.strip.scanning") });
    // The sidebar re-renders on the "scanned" event (main.ts → refreshExamStrip).
    void plugin.scanNote(file!);
    return;
  }
  renderFilterChips(root, [...tagChipSpecs(plugin, index.tags, settings, (tag) => result.byTag[tag]?.unique ?? 0), likeSpec()]);
}

import { TFile } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { resolveWordlistSettings, tagColor, tagEnabled } from "../../core/model/wordlists";
import { tagLabel } from "../../core/wordlists/parse";
import { examTags } from "../../core/model/like";
import type { FilterMode } from "./sections";

// Exam-tag chips, now living at the top of the 單字 section (1006report.md
// #5): the "本篇考試字彙 · 全文 N 個不同的字" title line is gone, and so is
// the per-note "(99)" count label — only the chips (the underline toggles)
// stay. Clicking a chip turns that list's underlines on/off (unchanged).
//
// The chip's own number changes meaning with the top-level 本篇／全部
// switch (#9): 本篇 counts how many of this note's words carry the tag
// (the background scan's per-note stats, same as before); 全部 counts how
// many words in the whole (non-deleted) vocab library carry it.
export function renderExamStrip(root: HTMLElement, plugin: VocabTrackerPlugin, file: TFile | null, mode: FilterMode): void {
  const service = plugin.wordlists;
  const index = service.index;
  if (index.isEmpty) return;

  const settings = resolveWordlistSettings(plugin.store.settings.wordlists);

  // 全部模式，或本篇模式但沒開筆記（規格 #11：沒開筆記的行為不變——這裡沒
  // 有「這篇」可以掃，一律退到庫存計數，而不是整條不顯示）：不需要掃描這
  // 篇筆記，直接用單字庫裡每個 tag 的字數。
  if (mode === "all" || !(file instanceof TFile) || file.extension !== "md") {
    drawChips(root, plugin, index.tags, settings, (tag) => countTagInLibrary(plugin, tag));
    return;
  }

  const result = service.cachedScan(file.path, file.stat.mtime);
  if (!result) {
    root.createDiv({ cls: "vt-exam-strip-scanning", text: t("exam.strip.scanning") });
    // The sidebar re-renders on the "scanned" event (main.ts → refreshExamStrip).
    void plugin.scanNote(file);
    return;
  }
  drawChips(root, plugin, index.tags, settings, (tag) => result.byTag[tag]?.unique ?? 0);
}

function countTagInLibrary(plugin: VocabTrackerPlugin, tag: string): number {
  let n = 0;
  for (const e of plugin.store.entries) {
    if (examTags(e, [tag]).length > 0) n++;
  }
  return n;
}

function drawChips(
  root: HTMLElement,
  plugin: VocabTrackerPlugin,
  tags: readonly string[],
  settings: ReturnType<typeof resolveWordlistSettings>,
  countOf: (tag: string) => number
): void {
  const strip = root.createDiv({ cls: "vt-exam-strip" });
  const chips = strip.createDiv({ cls: "vt-exam-chips" });
  for (const tag of tags) {
    const on = settings.highlight && tagEnabled(settings, tag);
    const chip = chips.createSpan({ cls: "vt-exam-chip" });
    chip.toggleClass("is-off", !on);
    chip.style.setProperty("--vt-exam-color", tagColor(settings, tag));
    chip.createSpan({ cls: "vt-exam-chip-dot" });
    chip.createSpan({ text: tagLabel(tag) });
    chip.createSpan({ cls: "vt-exam-chip-count", text: String(countOf(tag)) });
    chip.setAttr("role", "button");
    chip.setAttr("aria-label", t(on ? "exam.strip.hide" : "exam.strip.show", { tag: tagLabel(tag) }));
    chip.onclick = () => void plugin.toggleExamTag(tag);
  }
}

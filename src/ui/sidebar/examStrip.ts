import { TFile } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { t } from "../../core/i18n";
import { resolveWordlistSettings, tagColor, tagEnabled } from "../../core/model/wordlists";
import { tagLabel } from "../../core/wordlists/parse";

// "Exam words in this note": one chip per loaded list with how many of its
// words the note uses. Clicking a chip turns that list's underlines on/off.
// Renders nothing until at least one word list is loaded.
export function renderExamStrip(root: HTMLElement, plugin: VocabTrackerPlugin, file: TFile | null): void {
  const service = plugin.wordlists;
  const index = service.index;
  if (index.isEmpty || !(file instanceof TFile) || file.extension !== "md") return;

  const strip = root.createDiv({ cls: "vt-exam-strip" });
  const title = strip.createDiv({ cls: "vt-exam-strip-title" });

  const result = service.cachedScan(file.path, file.stat.mtime);
  if (!result) {
    title.setText(t("exam.strip.scanning"));
    // The sidebar re-renders on the "scanned" event (main.ts).
    void plugin.scanNote(file);
    return;
  }
  title.setText(t("exam.strip.title", { total: result.uniqueWords }));

  const settings = resolveWordlistSettings(plugin.store.settings.wordlists);
  const chips = strip.createDiv({ cls: "vt-exam-chips" });
  for (const tag of index.tags) {
    const stats = result.byTag[tag];
    const on = settings.highlight && tagEnabled(settings, tag);
    const chip = chips.createSpan({ cls: "vt-exam-chip" });
    chip.toggleClass("is-off", !on);
    chip.style.setProperty("--vt-exam-color", tagColor(settings, tag));
    chip.createSpan({ cls: "vt-exam-chip-dot" });
    chip.createSpan({ text: tagLabel(tag) });
    chip.createSpan({ cls: "vt-exam-chip-count", text: String(stats?.unique ?? 0) });
    chip.title = t(on ? "exam.strip.hide" : "exam.strip.show", { tag: tagLabel(tag) });
    chip.onclick = () => void plugin.toggleExamTag(tag);
  }
}

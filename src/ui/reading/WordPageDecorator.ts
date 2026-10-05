import { setIcon, type MarkdownPostProcessorContext } from "obsidian";
import { t } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { aiDebugOf, isAiError } from "../../services/ai/errors";
import { exportLabels } from "../../services/export/labels";
import type { FamilyService } from "../../services/learn/FamilyService";
import type { TriviaService } from "../../services/learn/TriviaService";
import type { VerbUsageService } from "../../services/learn/VerbUsageService";
import { debugReportText } from "../kit/aiDebug";
import { aiErrorText } from "../kit/aiState";

// ── Word page heading buttons (規劃書 06 §8.2, W1/W2) ──
//
// A reading-mode post-processor. On notes whose frontmatter says
// `vocab-tracker: word`, it puts a button next to the heading of each
// managed section: 字族 →「找字族」, 用法 →「產生 / 重新產生」(verbs only),
// 冷知識收藏 →「來一則」, AI 討論 →「在側欄開啟」. Other notes are left alone.
// Only adds elements to the rendered view; the note itself is never
// touched (the generated content reaches the page via ExportService).

type Key =
  | "findFamilies"
  | "generateUsage"
  | "regenerateUsage"
  | "trivia"
  | "openSidebar"
  | "familiesNone"
  | "familiesSaved"
  | "usageSaved"
  | "failed";

function l(key: Key, vars?: Record<string, string | number>): string {
  return t(`wordPage.${key}`, vars);
}

export type WordSection = "families" | "usage" | "trivia" | "discussion";
const SECTIONS: readonly WordSection[] = ["families", "usage", "trivia", "discussion"];

export interface WordPageDeps {
  entry(id: string): VocabEntry | undefined;
  // Frontmatter of a note, when ctx.frontmatter isn't there (metadataCache).
  frontmatterOf(path: string): Record<string, unknown> | null | undefined;
  families: Pick<FamilyService, "generate" | "save">;
  verbs: Pick<VerbUsageService, "canGenerate" | "generate">;
  // ask("next", { entryId }) runs after openTrivia, so the answer streams
  // into the vocab-trivia block the user is looking at.
  trivia: Pick<TriviaService, "ask">;
  openTrivia(): Promise<unknown>;
  // The word's card in the sidebar, on its AI tab.
  openInSidebar(entry: VocabEntry, tab: "ai"): unknown;
  notify(message: string): void;
}

// The word page's entry id, or null when the note isn't a word page.
export function wordPageEntryId(frontmatter: Record<string, unknown> | null | undefined): string | null {
  if (!frontmatter || frontmatter["vocab-tracker"] !== "word") return null;
  const id = frontmatter["vocab-tracker-id"];
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

const BEGIN = /^[ \t]*%%[ \t]*vt:begin[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*%%[ \t]*$/;

// Which managed section a heading at `line` (0-based) opens: the nearest
// non-blank line above it must be that section's begin marker. Works in
// any language, unlike matching the heading's text.
export function sectionAtHeading(text: string, line: number): WordSection | null {
  const lines = text.split(/\r?\n/);
  for (let i = line - 1; i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    const m = BEGIN.exec(lines[i]);
    const name = m?.[1] as WordSection | undefined;
    return name && SECTIONS.includes(name) ? name : null;
  }
  return null;
}

// Fallback when there's no section info: the heading's text, in the
// current language (what the export wrote, unless the language changed).
export function sectionByTitle(title: string): WordSection | null {
  const labels = exportLabels();
  const text = title.trim();
  return SECTIONS.find((s) => labels[s] === text) ?? null;
}

// entryId:section → the action running, so buttons drawn again meanwhile
// (reading view re-renders sections freely) show it as busy too.
const running = new Set<string>();

export function createWordPageDecorator(deps: WordPageDeps) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const fm = (ctx.frontmatter as Record<string, unknown> | undefined) ?? deps.frontmatterOf(ctx.sourcePath);
    const entryId = wordPageEntryId(fm);
    if (!entryId) return;
    const headings = [...(el.matches("h2") ? [el] : []), ...Array.from(el.querySelectorAll("h2"))];
    if (!headings.length) return;
    const info = ctx.getSectionInfo(el);
    for (const h of headings) {
      if (h.querySelector(".vt-wp-actions")) continue;
      const section = info ? sectionAtHeading(info.text, info.lineStart) : sectionByTitle(h.textContent ?? "");
      if (!section) continue;
      const entry = deps.entry(entryId);
      if (!entry) continue;
      decorate(h, section, entry, deps);
    }
  };
}

interface Action {
  icon: string;
  label: string;
  run: () => Promise<unknown> | unknown;
}

function actionFor(section: WordSection, entry: VocabEntry, deps: WordPageDeps): Action | null {
  switch (section) {
    case "families":
      return {
        icon: "git-fork",
        label: l("findFamilies"),
        run: async () => {
          const candidates = await deps.families.generate({ seedEntryIds: [entry.id] });
          if (!candidates.length) return deps.notify(l("familiesNone"));
          const { families } = await deps.families.save(candidates);
          deps.notify(l("familiesSaved", { n: families.length }));
        },
      };
    case "usage":
      if (!deps.verbs.canGenerate(entry)) return null;
      return {
        icon: "sparkles",
        label: entry.usage ? l("regenerateUsage") : l("generateUsage"),
        run: async () => {
          await deps.verbs.generate(entry);
          deps.notify(l("usageSaved"));
        },
      };
    case "trivia":
      return {
        icon: "lightbulb",
        label: l("trivia"),
        run: async () => {
          await deps.openTrivia();
          await deps.trivia.ask("next", { entryId: entry.id });
        },
      };
    case "discussion":
      return { icon: "panel-right", label: l("openSidebar"), run: () => deps.openInSidebar(entry, "ai") };
  }
}

function decorate(h: HTMLElement, section: WordSection, entry: VocabEntry, deps: WordPageDeps): void {
  const action = actionFor(section, entry, deps);
  if (!action) return;
  h.addClass("vt-wp-heading");
  const box = h.createSpan({ cls: ["vt", "vt-wp-actions"] });
  const btn = box.createEl("button", { cls: "vt-wp-btn" });
  setIcon(btn.createSpan({ cls: "vt-wp-btn-icon" }), action.icon);
  btn.createSpan({ text: action.label });
  const key = `${entry.id}:${section}`;
  const setBusy = (busy: boolean) => {
    btn.toggleClass("is-busy", busy);
    btn.disabled = busy;
  };
  setBusy(running.has(key));
  btn.addEventListener("click", (e) => {
    // Not the plugin's reading-mode word click (it'd offer to add the
    // button's word), not the heading's fold toggle.
    e.preventDefault();
    e.stopPropagation();
    if (running.has(key)) return;
    running.add(key);
    setBusy(true);
    void Promise.resolve()
      .then(action.run)
      .catch((err: unknown) => {
        const message = isAiError(err) ? aiErrorText(err) : err instanceof Error ? err.message : String(err);
        // An unreadable answer: the prompt and the raw output go to the
        // console (a Notice can't hold them; 字族樹 / 動詞用法 show them
        // in a folded box).
        const debug = aiDebugOf(err);
        if (debug) console.error(`Vocab Tracker: unreadable AI answer\n\n${debugReportText(debug)}`);
        deps.notify(l("failed", { error: message }));
      })
      .finally(() => {
        running.delete(key);
        if (btn.isConnected) setBusy(false);
      });
  });
}

import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { t, type I18nKey } from "../../core/i18n";
import type { VocabStore } from "../../core/store/VocabStore";
import type { AiService } from "../../services/ai/AiService";
import type { ApiKeys } from "../../services/ai/keys";
import type { WordlistService } from "../../services/wordlists/WordlistService";
import type { BackupService } from "../../services/backup/BackupService";

// Everything a settings section may need. Sections get services, never the
// plugin instance, so they stay testable and don't reach into main.ts.
export interface SettingsContext {
  app: App;
  store: VocabStore;
  ai: AiService;
  keys: ApiKeys;
  wordlists: WordlistService;
  // 備份與還原. Optional so a context built without it just skips the section.
  backups?: BackupService;
  // Re-applies the interface language after the locale setting changes.
  applyLocale: () => void;
  // After a word-list setting changed: "display" = colours/toggles only,
  // "scan" = cached note scans are stale too, "reload" = re-read the lists.
  onWordlistsChanged: (change: "display" | "scan" | "reload") => void;
  // After AI was switched on or off (the paragraph ✦ badges follow it).
  onAiEnabledChanged?: () => void;
  // Re-renders the whole tab (e.g. after switching provider, whose fields differ).
  redisplay: () => void;
}

// One heading + its settings. Adding a section (M2's SRS, M6's export…) is
// a new file under sections/ plus one entry in main.ts's list.
export interface SettingsSection {
  id: string;
  title: I18nKey;
  render(el: HTMLElement, ctx: SettingsContext): void;
}

// The tab's container and every ancestor that can scroll (Obsidian's settings
// pane scrolls one of them, depending on version / platform).
function scrollableChain(start: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [start];
  for (let el = start.parentElement; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) out.push(el);
  }
  return out;
}

export class VocabSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private ctx: Omit<SettingsContext, "redisplay">,
    private sections: SettingsSection[]
  ) {
    super(app, plugin);
  }

  display(): void {
    this.render(false);
  }

  // `keepScroll`: a redisplay() from inside the tab (1010 #S5) — put the page
  // back where it was. A fresh open from Obsidian starts at the top.
  private render(keepScroll: boolean): void {
    const { containerEl } = this;
    const scrollers = keepScroll ? scrollableChain(containerEl).map((el) => [el, el.scrollTop] as const) : [];
    containerEl.empty();
    containerEl.addClass("vt-settings");
    const ctx: SettingsContext = { ...this.ctx, redisplay: () => this.render(true) };
    for (const section of this.sections) {
      new Setting(containerEl).setName(t(section.title)).setHeading();
      section.render(containerEl.createDiv({ cls: `vt-settings-section vt-settings-${section.id}` }), ctx);
    }
    // Emptying shrinks the page and the browser clamps scrollTop to 0; restore
    // now, and once more next frame in case layout (e.g. fonts) settles late.
    const restore = () => {
      for (const [el, top] of scrollers) el.scrollTop = top;
    };
    restore();
    if (scrollers.length) requestAnimationFrame(restore);
  }
}

// Shared helper: numeric text input that ignores junk and clamps at 0.
export function parseNonNegativeInt(value: string): number | null {
  const n = Number(value.trim().replace(/[,_\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

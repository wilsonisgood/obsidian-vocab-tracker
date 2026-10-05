import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { t, type I18nKey } from "../../core/i18n";
import type { VocabStore } from "../../core/store/VocabStore";
import type { AiService } from "../../services/ai/AiService";
import type { ApiKeys } from "../../services/ai/keys";
import type { WordlistService } from "../../services/wordlists/WordlistService";

// Everything a settings section may need. Sections get services, never the
// plugin instance, so they stay testable and don't reach into main.ts.
export interface SettingsContext {
  app: App;
  store: VocabStore;
  ai: AiService;
  keys: ApiKeys;
  wordlists: WordlistService;
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
  // A dictionary key, or a function for a section whose strings aren't in
  // the dictionary yet (ui/mobile/strings.ts, until integration).
  title: I18nKey | (() => string);
  render(el: HTMLElement, ctx: SettingsContext): void;
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
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vt-settings");
    const ctx: SettingsContext = { ...this.ctx, redisplay: () => this.display() };
    for (const section of this.sections) {
      const title = typeof section.title === "function" ? section.title() : t(section.title);
      new Setting(containerEl).setName(title).setHeading();
      section.render(containerEl.createDiv({ cls: `vt-settings-section vt-settings-${section.id}` }), ctx);
    }
  }
}

// Shared helper: numeric text input that ignores junk and clamps at 0.
export function parseNonNegativeInt(value: string): number | null {
  const n = Number(value.trim().replace(/[,_\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

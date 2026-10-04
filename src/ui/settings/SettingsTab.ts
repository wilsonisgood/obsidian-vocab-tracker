import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { t, type I18nKey } from "../../core/i18n";
import type { VocabStore } from "../../core/store/VocabStore";
import type { AiService } from "../../services/ai/AiService";
import type { ApiKeys } from "../../services/ai/keys";

// Everything a settings section may need. Sections get services, never the
// plugin instance, so they stay testable and don't reach into main.ts.
export interface SettingsContext {
  app: App;
  store: VocabStore;
  ai: AiService;
  keys: ApiKeys;
  // Re-applies the interface language after the locale setting changes.
  applyLocale: () => void;
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
      new Setting(containerEl).setName(t(section.title)).setHeading();
      section.render(containerEl.createDiv({ cls: `vt-settings-section vt-settings-${section.id}` }), ctx);
    }
  }
}

// Shared helper: numeric text input that ignores junk and clamps at 0.
export function parseNonNegativeInt(value: string): number | null {
  const n = Number(value.trim().replace(/[,_\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

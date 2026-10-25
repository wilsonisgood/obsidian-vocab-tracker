import { Component, MarkdownRenderChild, type Events, type MarkdownPostProcessorContext } from "obsidian";
import { parseBlockParams } from "./params";
import { pickTab, rememberedTab, TAB_EVENT, TAB_KEY, type TabLike } from "./practice/practiceModel";
import type { PracticeHost, PracticeTabDef } from "./practice/types";
import { vocabTab } from "./practice/vocabTab";

// ── vocab-practice code block (第十六波 E, 規劃書 12) ─────────────
//
//   ```vocab-practice
//   tab: vocab     # optional: lock to one tab, no tab bar
//   ```
//
// Practice.md: a tab bar (單字／文法／常用字／混合／換句話說) over the active tab.
// Only the vocab tab is built in; the others register through
// PracticeHost.tabs() and a tab nobody registered isn't shown. The last
// tab is remembered on this device only (localStorage).

export function renderPractice(
  host: PracticeHost,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  ctx.addChild(new PracticeBlock(el, host, source));
}

class PracticeBlock extends MarkdownRenderChild {
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private tabs: PracticeTabDef[] = [];
  private active: PracticeTabDef | undefined;
  private mounted: Component | null = null;
  private locked = false;

  constructor(containerEl: HTMLElement, private host: PracticeHost, private source: string) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: ["vt", "vt-pr"] });
    // Same reason as flashcards: don't let the reading-mode click handler
    // pop its "add word" menu on clicks inside the block.
    this.registerDomEvent(root, "click", (e) => e.stopPropagation());

    const builtin = vocabTab(this.host, this.host.vocabScenario?.());
    const extra = this.host.tabs().filter((t) => t.id !== builtin.id);
    this.tabs = [builtin, ...extra].sort((a, b) => a.order - b.order);

    const wanted = parseBlockParams(this.source).tab;
    const forced = wanted ? pickTab(this.tabs, wanted) : undefined;
    this.locked = !!forced;
    if (forced) this.tabs = [forced as PracticeTabDef];

    this.tabsEl = root.createDiv({ cls: "vt-pr-tabs", attr: { role: "tablist" } });
    if (this.locked) this.tabsEl.hide();
    this.bodyEl = root.createDiv({ cls: "vt-pr-body" });

    const remembered = this.locked ? undefined : rememberedTab(this.tabs, this.loadTab());
    this.select(remembered ?? this.tabs[0]);

    // 「練這個主題」/「用這段練換句話說」 while this hub is already open.
    // A custom event, so Workspace's typed overloads don't cover it.
    const workspace = this.host.app.workspace as unknown as Events;
    if (!this.locked && typeof workspace?.on === "function") {
      this.registerEvent(
        workspace.on(TAB_EVENT, (id: unknown) => {
          const tab = rememberedTab(this.tabs, id);
          if (tab) this.select(tab);
        })
      );
    }
  }

  onunload(): void {
    this.mounted = null;
  }

  private loadTab(): unknown {
    const app = this.host.app;
    return typeof app.loadLocalStorage === "function" ? app.loadLocalStorage(TAB_KEY) : null;
  }

  private select(tab: PracticeTabDef): void {
    if (this.active === tab && this.mounted) return;
    if (this.mounted) this.removeChild(this.mounted);
    this.active = tab;
    if (!this.locked && typeof this.host.app.saveLocalStorage === "function") {
      this.host.app.saveLocalStorage(TAB_KEY, tab.id);
    }
    this.renderTabs();
    this.bodyEl.empty();
    const component = new Component();
    this.mounted = this.addChild(component);
    tab.mount(this.bodyEl, { app: this.host.app, filters: this.host.filters, component });
  }

  private renderTabs(): void {
    this.tabsEl.empty();
    for (const tab of this.tabs as (PracticeTabDef & TabLike)[]) {
      const on = tab === this.active;
      const btn = this.tabsEl.createEl("button", {
        cls: "vt-pr-tab",
        text: tab.label,
        attr: { type: "button", role: "tab", "aria-selected": String(on) },
      });
      btn.toggleClass("is-active", on);
      btn.addEventListener("click", () => this.select(tab));
    }
  }
}

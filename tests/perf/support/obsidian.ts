/* eslint-disable @typescript-eslint/no-explicit-any */
// The "obsidian" module for the perf / §1.3 metric tests (規劃書 06 M8,
// task K). Importing it installs the fake DOM (./dom.ts) first, the way
// Obsidian's own helpers exist before any plugin code runs.
//
//   vi.mock("obsidian", () => import("../perf/support/obsidian"));
//
// Implements what main.ts and src/** use: Component lifecycle (load /
// unload / children / register*), Plugin, ItemView, MarkdownRenderChild,
// Events, the TFile family, Notice, debounce, normalizePath, setIcon,
// requestUrl (recorded in networkLog, always rejects) …

import { installDom, networkLog, type FakeElement, type FakeNode } from "./dom";

installDom();

type Fn = (...args: any[]) => any;

// ── Events ───────────────────────────────────────────────────────────────

export interface EventRef {
  e: Events;
  name: string;
  fn: Fn;
}

export class Events {
  private handlers = new Map<string, EventRef[]>();
  on(name: string, fn: Fn): EventRef {
    const ref = { e: this, name, fn };
    const list = this.handlers.get(name) ?? [];
    list.push(ref);
    this.handlers.set(name, list);
    return ref;
  }
  off(name: string, fn: Fn): void {
    const list = this.handlers.get(name);
    if (!list) return;
    this.handlers.set(
      name,
      list.filter((r) => r.fn !== fn)
    );
  }
  offref(ref: EventRef): void {
    const list = this.handlers.get(ref.name);
    if (!list) return;
    this.handlers.set(
      ref.name,
      list.filter((r) => r !== ref)
    );
  }
  trigger(name: string, ...args: unknown[]): void {
    for (const r of [...(this.handlers.get(name) ?? [])]) r.fn(...args);
  }
}

// ── Component ────────────────────────────────────────────────────────────

export class Component {
  _loaded = false;
  private _children: Component[] = [];
  private _cleanups: (() => void)[] = [];

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    this.onload();
    for (const c of this._children) c.load();
  }
  onload(): void {}

  // Returns onunload()'s result, so a test can await an async onunload
  // (the plugin's final flush).
  unload(): void {
    if (!this._loaded) return;
    this._loaded = false;
    for (const c of this._children.splice(0)) c.unload();
    for (const fn of this._cleanups.splice(0).reverse()) fn();
    return this.onunload();
  }
  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this._children.push(child);
    if (this._loaded) child.load();
    return child;
  }
  removeChild<T extends Component>(child: T): T {
    const i = this._children.indexOf(child);
    if (i >= 0) {
      this._children.splice(i, 1);
      child.unload();
    }
    return child;
  }
  register(cb: () => void): void {
    this._cleanups.push(cb);
  }
  registerEvent(ref: EventRef): void {
    this.register(() => ref.e.offref(ref));
  }
  registerDomEvent(el: { addEventListener: Fn; removeEventListener: Fn }, type: string, cb: Fn, opts?: unknown): void {
    el.addEventListener(type, cb, opts);
    this.register(() => el.removeEventListener(type, cb, opts));
  }
  registerInterval(id: number): number {
    this.register(() => clearInterval(id));
    return id;
  }
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super();
  }
}

export class MarkdownRenderer {
  static async render(_app: unknown, markdown: string, el: HTMLElement, _sourcePath: string, _c: Component): Promise<void> {
    for (const block of markdown.split(/\n{2,}/)) {
      if (block.trim()) (el as any).createEl("p", { text: block });
    }
  }
  static renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, c: Component): Promise<void> {
    return MarkdownRenderer.render(null, markdown, el, sourcePath, c);
  }
}

// ── files ────────────────────────────────────────────────────────────────

export class TAbstractFile {
  vault: unknown = null;
  parent: TFolder | null = null;
  constructor(public path: string) {}
  get name(): string {
    return this.path.split("/").pop() ?? this.path;
  }
}

export class TFile extends TAbstractFile {
  stat = { ctime: 0, mtime: 0, size: 0 };
  get basename(): string {
    const n = this.name;
    const i = n.lastIndexOf(".");
    return i > 0 ? n.slice(0, i) : n;
  }
  get extension(): string {
    const n = this.name;
    const i = n.lastIndexOf(".");
    return i > 0 ? n.slice(i + 1) : "";
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.path === "/" || this.path === "";
  }
}

// ── workspace / views ────────────────────────────────────────────────────

// View factories from every Plugin.registerView, so a leaf can open one.
const viewFactories = new Map<string, (leaf: WorkspaceLeaf) => View>();

export class WorkspaceLeaf extends Events {
  view: any = null;
  constructor(public app?: any) {
    super();
  }
  // Opens the registered view (activateSidebar's path): onOpen, attached
  // to the document so isConnected holds.
  async setViewState(state: { type: string }): Promise<void> {
    const factory = viewFactories.get(state.type);
    if (!factory) return;
    const view = factory(this);
    this.view = view;
    (globalThis as any).document.body.appendChild(view.containerEl);
    view.load();
    await view.onOpen();
  }
  async openFile(file: TFile): Promise<void> {
    this.app?.workspace?.openFile?.(file);
  }
  getViewState() {
    return { type: this.view?.getViewType?.() ?? "empty" };
  }
  detach(): void {}
}

export class View extends Component {
  containerEl: HTMLElement;
  app: any;
  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = leaf.app;
    const el = (globalThis as any).createDiv({ cls: "workspace-leaf-content" }) as FakeElement;
    el.createDiv({ cls: "view-header" });
    el.createDiv({ cls: "view-content" });
    this.containerEl = el as unknown as HTMLElement;
  }
  getViewType(): string {
    return "";
  }
  getDisplayText(): string {
    return "";
  }
  getIcon(): string {
    return "";
  }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class ItemView extends View {
  get contentEl(): HTMLElement {
    return (this.containerEl as any).children[1];
  }
}

export class MarkdownView extends View {
  file: TFile | null = null;
  previewMode = { rerender() {} };
}

export class Plugin extends Component {
  readonly views = new Map<string, (leaf: WorkspaceLeaf) => View>();
  readonly postProcessors: ((el: HTMLElement, ctx: any) => unknown)[] = [];
  readonly codeBlocks = new Map<string, (source: string, el: HTMLElement, ctx: any) => unknown>();
  readonly commands: { id: string }[] = [];
  readonly settingTabs: unknown[] = [];

  constructor(
    public app: any,
    public manifest: { id: string; dir?: string; version?: string; name?: string }
  ) {
    super();
  }

  private dataPath(): string {
    return `${this.manifest.dir}/data.json`;
  }
  async loadData(): Promise<any> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.dataPath()))) return null;
    return JSON.parse(await adapter.read(this.dataPath()));
  }
  async saveData(data: unknown): Promise<void> {
    await this.app.vault.adapter.write(this.dataPath(), JSON.stringify(data));
  }
  addSettingTab(tab: unknown): void {
    this.settingTabs.push(tab);
  }
  registerView(type: string, factory: (leaf: WorkspaceLeaf) => View): void {
    this.views.set(type, factory);
    viewFactories.set(type, factory);
  }
  registerMarkdownPostProcessor(fn: (el: HTMLElement, ctx: any) => unknown): void {
    this.postProcessors.push(fn);
  }
  registerMarkdownCodeBlockProcessor(lang: string, fn: (source: string, el: HTMLElement, ctx: any) => unknown): void {
    this.codeBlocks.set(lang, fn);
  }
  addCommand(cmd: { id: string }): { id: string } {
    this.commands.push(cmd);
    return cmd;
  }
  addRibbonIcon(): HTMLElement {
    return (globalThis as any).createDiv();
  }
  addStatusBarItem(): HTMLElement {
    return (globalThis as any).createDiv();
  }
}

export class PluginSettingTab {
  containerEl: HTMLElement = (globalThis as any).createDiv();
  constructor(
    public app: unknown,
    public plugin: unknown
  ) {}
  display(): void {}
  hide(): void {}
}

// Chainable no-op: every Setting method returns the setting itself.
export class Setting {
  settingEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.settingEl = (containerEl as any).createDiv({ cls: "setting-item" });
    return new Proxy(this, {
      get: (target, key) => (key in target ? (target as any)[key] : () => target),
    });
  }
}

export class Modal extends Component {
  contentEl: HTMLElement = (globalThis as any).createDiv();
  constructor(public app: unknown) {
    super();
  }
  open(): void {}
  close(): void {}
}

export class SuggestModal<T> extends Modal {
  setPlaceholder(): void {}
  getSuggestions(): T[] {
    return [];
  }
}

export class FuzzySuggestModal<T> extends SuggestModal<T> {}

export class Menu {
  items: unknown[] = [];
  addItem(cb: (item: any) => void): this {
    const item: any = new Proxy({}, { get: () => () => item });
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this {
    return this;
  }
  showAtMouseEvent(): void {}
  showAtPosition(): void {}
}

export const notices: string[] = [];
export class Notice {
  constructor(message: string | DocumentFragment) {
    notices.push(typeof message === "string" ? message : String((message as unknown as FakeNode).textContent));
  }
  setMessage(): this {
    return this;
  }
  hide(): void {}
}

export class App {}

export const Platform = {
  isMobile: false,
  isMobileApp: false,
  isDesktop: true,
  isDesktopApp: true,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: true,
};

// ── functions ────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  const out = p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return out === "" ? "/" : out;
}

export function debounce<T extends Fn>(fn: T, wait = 0, resetTimer = false) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] = [];
  const run = () => {
    timer = null;
    fn(...lastArgs);
  };
  const d = (...args: unknown[]) => {
    lastArgs = args;
    if (timer && !resetTimer) return d;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, wait);
    return d;
  };
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    return d;
  };
  d.run = () => {
    if (timer) {
      clearTimeout(timer);
      run();
    }
  };
  return d;
}

// An <svg> child, like Obsidian's lucide icons.
export function setIcon(el: HTMLElement, icon: string): void {
  const e = el as unknown as FakeElement;
  e.empty();
  e.createEl("svg", { cls: ["svg-icon", `lucide-${icon}`] });
}

export function setTooltip(el: HTMLElement, tooltip: string): void {
  (el as unknown as FakeElement).setAttr("aria-label", tooltip);
}

export async function requestUrl(req: string | { url: string }): Promise<never> {
  const url = typeof req === "string" ? req : req.url;
  networkLog.push({ via: "requestUrl", url });
  throw new Error(`network disabled in tests: ${url}`);
}

export function getLanguage(): string {
  return "zh-TW";
}

export function parseYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export { networkLog, setNetworkHandler } from "./dom";

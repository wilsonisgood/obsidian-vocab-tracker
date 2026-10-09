// Just enough of Obsidian's HTMLElement helpers (createDiv, addClass,
// setAttr…) for the bottom sheet tests — vitest runs in node, without a DOM.

type Listener = (e: FakeEvent) => void;

export interface FakeEvent {
  target: FakeEl;
  key?: string;
  isComposing?: boolean;
  pointerId?: number;
  pointerType?: string;
  button?: number;
  clientY?: number;
  timeStamp?: number;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ElOpts {
  cls?: string | string[];
  text?: string;
}

export class FakeStyle {
  props = new Map<string, string>();
  setProperty(k: string, v: string) {
    this.props.set(k, v);
  }
  removeProperty(k: string) {
    this.props.delete(k);
  }
  getPropertyValue(k: string) {
    return this.props.get(k) ?? "";
  }
}

export class FakeDocument {
  activeElement: FakeEl | null = null;
}

export class FakeEl {
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  listeners: Record<string, Listener[]> = {};
  style = new FakeStyle();
  text = "";
  disabled = false;
  offsetHeight = 0;
  ownerDocument: FakeDocument | null = null;
  scrolledIntoView = 0;
  hidden = false;

  constructor(
    public tagName = "DIV",
    opts: ElOpts = {}
  ) {
    const cls = Array.isArray(opts.cls) ? opts.cls : opts.cls ? opts.cls.split(" ") : [];
    for (const c of cls) if (c) this.classes.add(c);
    if (opts.text) this.text = opts.text;
  }

  // ── building ──
  createEl(tag: string, opts: ElOpts = {}): FakeEl {
    const el = new FakeEl(tag.toUpperCase(), opts);
    this.appendChild(el);
    return el;
  }
  createDiv(opts: ElOpts = {}) {
    return this.createEl("div", opts);
  }
  createSpan(opts: ElOpts = {}) {
    return this.createEl("span", opts);
  }
  appendChild(el: FakeEl) {
    el.detach();
    el.parentElement = this;
    el.ownerDocument = this.ownerDocument;
    this.children.push(el);
    return el;
  }
  detach() {
    const p = this.parentElement;
    if (!p) return;
    p.children = p.children.filter((c) => c !== this);
    this.parentElement = null;
  }
  remove() {
    this.detach();
  }
  empty() {
    for (const c of this.children) c.parentElement = null;
    this.children = [];
    this.text = "";
  }
  setText(t: string) {
    this.text = t;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }

  // ── classes / attributes ──
  addClass(...cls: string[]) {
    for (const c of cls) this.classes.add(c);
  }
  removeClass(...cls: string[]) {
    for (const c of cls) this.classes.delete(c);
  }
  toggleClass(c: string, on: boolean) {
    if (on) this.classes.add(c);
    else this.classes.delete(c);
  }
  hasClass(c: string) {
    return this.classes.has(c);
  }
  get classList() {
    return { contains: (c: string) => this.classes.has(c) };
  }
  setAttr(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttr(k: string) {
    return this.attrs[k] ?? null;
  }
  toggle(show: boolean) {
    this.hidden = !show;
  }

  // ── events ──
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  // Bubbles to the ancestors, like a real event.
  dispatch(type: string, init: Partial<FakeEvent> = {}) {
    let stopped = false;
    const ev: FakeEvent = {
      target: this,
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
      ...init,
    };
    for (const el of this.selfAndAncestors()) {
      if (stopped) break;
      for (const fn of el.listeners[type] ?? []) fn(ev);
    }
    return ev;
  }
  click() {
    return this.dispatch("click");
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  scrollIntoView() {
    this.scrolledIntoView++;
  }

  // ── queries (by class only) ──
  contains(el: FakeEl | null): boolean {
    for (let e = el; e; e = e.parentElement) if (e === this) return true;
    return false;
  }
  closest(sel: string): FakeEl | null {
    const cls = sel.replace(/^\./, "");
    return this.selfAndAncestors().find((e) => e.classes.has(cls)) ?? null;
  }
  selfAndAncestors(): FakeEl[] {
    const out: FakeEl[] = [this];
    for (let p = this.parentElement; p; p = p.parentElement) out.push(p);
    return out;
  }
  findAll(cls: string): FakeEl[] {
    const out: FakeEl[] = [];
    for (const c of this.children) {
      if (c.classes.has(cls)) out.push(c);
      out.push(...c.findAll(cls));
    }
    return out;
  }
  find(cls: string): FakeEl | null {
    return this.findAll(cls)[0] ?? null;
  }
}

// A window with a controllable visual viewport and manual timers.
export class FakeWindow {
  innerHeight = 844;
  keyListeners: ((e: { key: string; isComposing?: boolean; preventDefault(): void }) => void)[] = [];
  private timers = new Map<number, () => void>();
  private nextId = 1;
  visualViewport = {
    height: 844,
    offsetTop: 0,
    listeners: {} as Record<string, (() => void)[]>,
    addEventListener(type: string, fn: () => void) {
      (this.listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    },
    fire(type: string) {
      for (const fn of this.listeners[type] ?? []) fn();
    },
  };
  // Other window events (Capacitor's keyboardWillShow etc.), by type.
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  addEventListener(type: string, fn: (e: never) => void) {
    if (type === "keydown") this.keyListeners.push(fn as (e: { key: string }) => void);
    else (this.listeners[type] ??= []).push(fn as (e: unknown) => void);
  }
  removeEventListener(type: string, fn: (e: never) => void) {
    if (type === "keydown") this.keyListeners = this.keyListeners.filter((f) => f !== fn);
    else this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  key(key: string) {
    for (const fn of [...this.keyListeners]) fn({ key, preventDefault() {} });
  }
  fire(type: string, e: unknown = {}) {
    for (const fn of [...(this.listeners[type] ?? [])]) fn(e);
  }
  requestAnimationFrame(fn: () => void) {
    fn();
    return 0;
  }
  setTimeout(fn: () => void) {
    const id = this.nextId++;
    this.timers.set(id, fn);
    return id;
  }
  clearTimeout(id: number) {
    this.timers.delete(id);
  }
  runTimers() {
    const fns = [...this.timers.values()];
    this.timers.clear();
    for (const fn of fns) fn();
  }
  get pendingTimers() {
    return this.timers.size;
  }
}

// Installs Obsidian's global createDiv for code that builds detached nodes.
export function installGlobals(doc = new FakeDocument()) {
  const g = globalThis as unknown as { createDiv: (o?: ElOpts) => FakeEl };
  g.createDiv = (o?: ElOpts) => {
    const el = new FakeEl("DIV", o);
    el.ownerDocument = doc;
    return el;
  };
  return doc;
}

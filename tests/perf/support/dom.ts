/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias -- a DOM stand-in: untyped events, tree walks from `this` */
// A small in-memory DOM for the perf and §1.3 metric tests (規劃書 06 M8,
// task K). The repo has no jsdom (and installing one would change the
// lockfile-less node_modules everyone shares), so this implements just the
// DOM surface the plugin's UI touches, plus Obsidian's own helpers on
// Node/Element (createEl, createDiv, empty, addClass, setText, toggle…).
//
// Not a browser: there is no layout, no style computation and no painting.
// Timings measured on top of it cover the plugin's own JS (data work,
// element creation, selector matching), not the browser's layout/paint
// that follows — the task K report says how to read the numbers.

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_FRAGMENT_NODE = 11;

type Listener = { fn: (e: any) => void; capture: boolean };

export interface DomElementInfo {
  cls?: string | string[];
  text?: string | FakeNode;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: FakeNode;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
}

// ── selectors ────────────────────────────────────────────────────────────

interface AttrTest {
  name: string;
  op: "" | "=" | "*=" | "^=" | "$=" | "~=";
  value: string;
}
interface Compound {
  tag: string | null;
  id: string | null;
  classes: string[];
  attrs: AttrTest[];
}
// A complex selector: compounds joined by descendant (" ") or child (">").
interface Complex {
  parts: Compound[];
  combinators: (" " | ">")[];
}

const selectorCache = new Map<string, Complex[]>();

function parseCompound(src: string): Compound {
  const c: Compound = { tag: null, id: null, classes: [], attrs: [] };
  let i = 0;
  const ident = () => {
    const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i));
    if (!m) throw new Error(`fake DOM: unsupported selector "${src}"`);
    i += m[0].length;
    return m[0];
  };
  if (src[0] === "*") i = 1;
  else if (/[A-Za-z]/.test(src[0] ?? "")) c.tag = ident().toUpperCase();
  while (i < src.length) {
    const ch = src[i];
    if (ch === ".") {
      i++;
      c.classes.push(ident());
    } else if (ch === "#") {
      i++;
      c.id = ident();
    } else if (ch === "[") {
      const end = src.indexOf("]", i);
      const body = src.slice(i + 1, end);
      i = end + 1;
      const m = /^([A-Za-z0-9_-]+)\s*(?:([*^$~]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?$/.exec(body.trim());
      if (!m) throw new Error(`fake DOM: unsupported attribute selector "[${body}]"`);
      c.attrs.push({ name: m[1], op: (m[2] ?? "") as AttrTest["op"], value: m[3] ?? m[4] ?? m[5] ?? "" });
    } else {
      throw new Error(`fake DOM: unsupported selector "${src}"`);
    }
  }
  return c;
}

function parseSelector(sel: string): Complex[] {
  const hit = selectorCache.get(sel);
  if (hit) return hit;
  const out: Complex[] = [];
  for (const group of splitTop(sel, ",")) {
    const tokens = group
      .trim()
      .replace(/\s*>\s*/g, " > ")
      .split(/\s+/)
      .filter(Boolean);
    const parts: Compound[] = [];
    const combinators: (" " | ">")[] = [];
    let pendingChild = false;
    for (const tok of tokens) {
      if (tok === ">") {
        pendingChild = true;
        continue;
      }
      if (parts.length) combinators.push(pendingChild ? ">" : " ");
      pendingChild = false;
      parts.push(parseCompound(tok));
    }
    out.push({ parts, combinators });
  }
  selectorCache.set(sel, out);
  return out;
}

// Splits on `sep` outside brackets/quotes.
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function matchCompound(el: FakeElement, c: Compound): boolean {
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute("id") !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null) return false;
    switch (a.op) {
      case "":
        break;
      case "=":
        if (v !== a.value) return false;
        break;
      case "*=":
        if (!v.includes(a.value)) return false;
        break;
      case "^=":
        if (!v.startsWith(a.value)) return false;
        break;
      case "$=":
        if (!v.endsWith(a.value)) return false;
        break;
      case "~=":
        if (!v.split(/\s+/).includes(a.value)) return false;
        break;
    }
  }
  return true;
}

function matchComplex(el: FakeElement, cx: Complex): boolean {
  let i = cx.parts.length - 1;
  if (!matchCompound(el, cx.parts[i])) return false;
  let cur: FakeElement | null = el;
  while (i > 0) {
    const comb = cx.combinators[i - 1];
    i--;
    if (comb === ">") {
      cur = cur.parentElement;
      if (!cur || !matchCompound(cur, cx.parts[i])) return false;
    } else {
      cur = cur.parentElement;
      while (cur && !matchCompound(cur, cx.parts[i])) cur = cur.parentElement;
      if (!cur) return false;
    }
  }
  return true;
}

function matches(el: FakeElement, sel: string): boolean {
  for (const cx of parseSelector(sel)) if (matchComplex(el, cx)) return true;
  return false;
}

// ── nodes ────────────────────────────────────────────────────────────────

export class FakeNode {
  static readonly ELEMENT_NODE = ELEMENT_NODE;
  static readonly TEXT_NODE = TEXT_NODE;
  static readonly DOCUMENT_NODE = DOCUMENT_NODE;
  static readonly DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;
  readonly ELEMENT_NODE = ELEMENT_NODE;
  readonly TEXT_NODE = TEXT_NODE;

  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  private listeners: Map<string, Listener[]> | null = null;

  constructor(
    readonly nodeType: number,
    public ownerDocument: FakeDocument | null
  ) {}

  get parentElement(): FakeElement | null {
    const p = this.parentNode;
    return p && p.nodeType === ELEMENT_NODE ? (p as FakeElement) : null;
  }

  get nodeValue(): string | null {
    return null;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): FakeNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): FakeNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  get previousSibling(): FakeNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) - 1] ?? null;
  }

  get textContent(): string {
    let s = "";
    for (const c of this.childNodes) s += c.textContent;
    return s;
  }
  set textContent(v: string | null) {
    this.removeAll();
    if (v) this.appendChild(new FakeText(String(v), this.ownerDocument));
  }

  get isConnected(): boolean {
    let n: FakeNode | null = this;
    while (n.parentNode) n = n.parentNode;
    return n.nodeType === DOCUMENT_NODE;
  }

  protected removeAll(): void {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
  }

  private adopt(node: FakeNode): FakeNode[] {
    if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
      const kids = node.childNodes;
      node.childNodes = [];
      for (const k of kids) k.parentNode = null;
      return kids;
    }
    node.parentNode?.removeChild(node);
    return [node];
  }

  appendChild<T extends FakeNode>(node: T): T {
    for (const n of this.adopt(node)) {
      n.parentNode = this;
      this.childNodes.push(n);
    }
    return node;
  }

  insertBefore<T extends FakeNode>(node: T, ref: FakeNode | null): T {
    if (!ref) return this.appendChild(node);
    const nodes = this.adopt(node);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) throw new Error("fake DOM: insertBefore reference is not a child");
    for (const n of nodes) n.parentNode = this;
    this.childNodes.splice(i, 0, ...nodes);
    return node;
  }

  removeChild<T extends FakeNode>(node: T): T {
    const i = this.childNodes.indexOf(node);
    if (i < 0) throw new Error("fake DOM: removeChild of a non-child");
    this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }

  replaceChild<T extends FakeNode>(node: FakeNode, old: T): T {
    this.insertBefore(node, old);
    this.removeChild(old);
    return old;
  }

  contains(other: FakeNode | null): boolean {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  private toNodes(items: (FakeNode | string)[]): FakeNode {
    const frag = new FakeFragment(this.ownerDocument);
    for (const it of items) frag.appendChild(typeof it === "string" ? new FakeText(it, this.ownerDocument) : it);
    return frag;
  }

  append(...items: (FakeNode | string)[]): void {
    this.appendChild(this.toNodes(items));
  }
  prepend(...items: (FakeNode | string)[]): void {
    this.insertBefore(this.toNodes(items), this.firstChild);
  }
  before(...items: (FakeNode | string)[]): void {
    this.parentNode?.insertBefore(this.toNodes(items), this);
  }
  after(...items: (FakeNode | string)[]): void {
    this.parentNode?.insertBefore(this.toNodes(items), this.nextSibling);
  }
  replaceWith(...items: (FakeNode | string)[]): void {
    const p = this.parentNode;
    if (!p) return;
    p.insertBefore(this.toNodes(items), this);
    p.removeChild(this);
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
  replaceChildren(...items: (FakeNode | string)[]): void {
    this.removeAll();
    this.append(...items);
  }

  // ── events ──
  addEventListener(type: string, fn: ((e: any) => void) | null, opts?: boolean | { capture?: boolean }): void {
    if (!fn) return;
    this.listeners ??= new Map();
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture: typeof opts === "boolean" ? opts : !!opts?.capture });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: ((e: any) => void) | null): void {
    const list = this.listeners?.get(type);
    if (!list) return;
    const i = list.findIndex((l) => l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(e: any): boolean {
    if (!e.target) e.target = this;
    let stopped = false;
    const orig = e.stopPropagation?.bind(e);
    e.stopPropagation = () => {
      stopped = true;
      orig?.();
    };
    e.preventDefault ??= () => (e.defaultPrevented = true);
    for (let n: FakeNode | null = this; n && !stopped; n = e.bubbles === false ? null : n.parentNode) {
      e.currentTarget = n;
      for (const l of [...(n.listeners?.get(e.type) ?? [])]) l.fn.call(n, e);
      const prop = (n as any)[`on${e.type}`];
      if (typeof prop === "function") prop.call(n, e);
    }
    return !e.defaultPrevented;
  }

  // ── Obsidian's Node helpers ──
  createEl(tag: string, o?: DomElementInfo | string, cb?: (el: FakeElement) => void): FakeElement {
    const doc = this.ownerDocument ?? (this as unknown as FakeDocument);
    const el = doc.createElement(tag);
    const info: DomElementInfo = typeof o === "string" ? { cls: o } : (o ?? {});
    applyInfo(el, info);
    if (info.prepend) this.insertBefore(el, this.firstChild);
    else this.appendChild(el);
    cb?.(el);
    return el;
  }
  createDiv(o?: DomElementInfo | string, cb?: (el: FakeElement) => void): FakeElement {
    return this.createEl("div", o, cb);
  }
  createSpan(o?: DomElementInfo | string, cb?: (el: FakeElement) => void): FakeElement {
    return this.createEl("span", o, cb);
  }
  empty(): void {
    this.removeAll();
  }
  detach(): void {
    this.remove();
  }
  instanceOf<T>(type: new (...args: any[]) => T): this is T {
    return this instanceof type;
  }
}

function applyInfo(el: FakeElement, info: DomElementInfo): void {
  if (info.cls) el.addClass(...(Array.isArray(info.cls) ? info.cls : info.cls.split(" ")));
  if (info.text !== undefined) {
    if (typeof info.text === "string") el.setText(info.text);
    else el.appendChild(info.text);
  }
  if (info.attr) el.setAttrs(info.attr);
  if (info.title !== undefined) el.title = info.title;
  if (info.value !== undefined) (el as any).value = info.value;
  if (info.type !== undefined) (el as any).type = info.type;
  if (info.placeholder !== undefined) (el as any).placeholder = info.placeholder;
  if (info.href !== undefined) el.setAttribute("href", info.href);
  if (info.parent) info.parent.appendChild(el);
}

export class FakeText extends FakeNode {
  constructor(
    public data: string,
    doc: FakeDocument | null
  ) {
    super(TEXT_NODE, doc);
  }
  get nodeValue(): string {
    return this.data;
  }
  set nodeValue(v: string) {
    this.data = v;
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string | null) {
    this.data = v ?? "";
  }
  get wholeText(): string {
    return this.data;
  }
  get length(): number {
    return this.data.length;
  }
}

export class FakeFragment extends FakeNode {
  constructor(doc: FakeDocument | null) {
    super(DOCUMENT_FRAGMENT_NODE, doc);
  }
  querySelector(sel: string): FakeElement | null {
    return queryFirst(this, sel);
  }
  querySelectorAll(sel: string): FakeElement[] {
    return queryAll(this, sel);
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((n): n is FakeElement => n.nodeType === ELEMENT_NODE);
  }
}

class ClassList {
  private set = new Set<string>();
  get length(): number {
    return this.set.size;
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
  add(...cs: string[]): void {
    for (const c of cs) if (c) this.set.add(c);
  }
  remove(...cs: string[]): void {
    for (const c of cs) this.set.delete(c);
  }
  toggle(c: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  get value(): string {
    return [...this.set].join(" ");
  }
  set value(v: string) {
    this.set = new Set(v.split(/\s+/).filter(Boolean));
  }
  [Symbol.iterator](): Iterator<string> {
    return this.set[Symbol.iterator]();
  }
}

class Style {
  [key: string]: any;
  private props = new Map<string, string>();
  setProperty(name: string, value: string | null): void {
    if (value === null || value === "") this.props.delete(name);
    else this.props.set(name, value);
  }
  getPropertyValue(name: string): string {
    return this.props.get(name) ?? "";
  }
  removeProperty(name: string): string {
    const v = this.props.get(name) ?? "";
    this.props.delete(name);
    return v;
  }
}

function camelToData(key: string): string {
  return "data-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

export class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly localName: string;
  readonly classList = new ClassList();
  readonly style = new Style();
  private attrs = new Map<string, string>();
  private datasetProxy: Record<string, string> | null = null;
  title = "";
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 0;
  clientHeight = 0;
  clientWidth = 0;
  offsetHeight = 0;
  offsetWidth = 0;
  tabIndex = -1;
  hidden = false;

  constructor(tag: string, doc: FakeDocument | null) {
    super(ELEMENT_NODE, doc);
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
  }

  get nodeName(): string {
    return this.tagName;
  }

  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  set id(v: string) {
    this.setAttribute("id", v);
  }

  get className(): string {
    return this.classList.value;
  }
  set className(v: string) {
    this.classList.value = v;
  }

  get dataset(): Record<string, string> {
    this.datasetProxy ??= new Proxy({} as Record<string, string>, {
      get: (_t, key) => (typeof key === "string" ? (this.getAttribute(camelToData(key)) ?? undefined) : undefined),
      set: (_t, key, value) => {
        if (typeof key === "string") this.setAttribute(camelToData(key), String(value));
        return true;
      },
      deleteProperty: (_t, key) => {
        if (typeof key === "string") this.removeAttribute(camelToData(key));
        return true;
      },
    });
    return this.datasetProxy;
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((n): n is FakeElement => n.nodeType === ELEMENT_NODE);
  }
  get childElementCount(): number {
    return this.children.length;
  }
  get firstElementChild(): FakeElement | null {
    for (const n of this.childNodes) if (n.nodeType === ELEMENT_NODE) return n as FakeElement;
    return null;
  }
  get lastElementChild(): FakeElement | null {
    for (let i = this.childNodes.length - 1; i >= 0; i--) {
      if (this.childNodes[i].nodeType === ELEMENT_NODE) return this.childNodes[i] as FakeElement;
    }
    return null;
  }
  get nextElementSibling(): FakeElement | null {
    for (let n = this.nextSibling; n; n = n.nextSibling) if (n.nodeType === ELEMENT_NODE) return n as FakeElement;
    return null;
  }
  get previousElementSibling(): FakeElement | null {
    for (let n = this.previousSibling; n; n = n.previousSibling) if (n.nodeType === ELEMENT_NODE) return n as FakeElement;
    return null;
  }

  get innerText(): string {
    return this.textContent;
  }
  set innerText(v: string) {
    this.textContent = v;
  }
  get innerHTML(): string {
    return this.textContent;
  }
  set innerHTML(v: string) {
    // Only clearing is supported (nothing in the plugin writes markup).
    if (v) throw new Error("fake DOM: innerHTML with markup is not supported");
    this.removeAll();
  }

  getAttribute(name: string): string | null {
    if (name === "class") return this.classList.length ? this.classList.value : null;
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    if (name === "class") this.classList.value = String(value);
    else this.attrs.set(name, String(value));
  }
  removeAttribute(name: string): void {
    if (name === "class") this.classList.value = "";
    else this.attrs.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, "");
    else this.removeAttribute(name);
    return on;
  }

  matches(sel: string): boolean {
    return matches(this, sel);
  }
  closest(sel: string): FakeElement | null {
    for (let n: FakeElement | null = this; n; n = n.parentElement) if (matches(n, sel)) return n;
    return null;
  }
  querySelector(sel: string): FakeElement | null {
    return queryFirst(this, sel);
  }
  querySelectorAll(sel: string): FakeElement[] {
    return queryAll(this, sel);
  }
  getElementsByTagName(tag: string): FakeElement[] {
    return queryAll(this, tag);
  }

  focus(): void {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
  blur(): void {
    if (this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
  }
  click(): void {
    this.dispatchEvent({ type: "click", bubbles: true });
  }
  scrollIntoView(): void {}
  scrollTo(): void {}
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  setSelectionRange(): void {}
  select(): void {}

  // ── Obsidian's Element helpers ──
  addClass(...cls: string[]): void {
    this.classList.add(...cls);
  }
  addClasses(cls: string[]): void {
    this.classList.add(...cls);
  }
  removeClass(...cls: string[]): void {
    this.classList.remove(...cls);
  }
  removeClasses(cls: string[]): void {
    this.classList.remove(...cls);
  }
  toggleClass(cls: string | string[], on: boolean): void {
    for (const c of Array.isArray(cls) ? cls : [cls]) this.classList.toggle(c, on);
  }
  hasClass(cls: string): boolean {
    return this.classList.contains(cls);
  }
  setText(text: string | FakeNode): void {
    this.removeAll();
    if (typeof text === "string") {
      if (text) this.appendChild(new FakeText(text, this.ownerDocument));
    } else this.appendChild(text);
  }
  getText(): string {
    return this.textContent;
  }
  setAttr(name: string, value: string | number | boolean | null): void {
    if (value === null) this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  }
  setAttrs(obj: Record<string, string | number | boolean | null>): void {
    for (const [k, v] of Object.entries(obj)) this.setAttr(k, v);
  }
  getAttr(name: string): string | null {
    return this.getAttribute(name);
  }
  show(): void {
    this.style.display = "";
  }
  hide(): void {
    this.style.display = "none";
  }
  toggle(show: boolean): void {
    if (show) this.show();
    else this.hide();
  }
  toggleVisibility(show: boolean): void {
    this.toggle(show);
  }
  isShown(): boolean {
    return this.style.display !== "none";
  }
  setCssStyles(styles: Record<string, string>): void {
    Object.assign(this.style, styles);
  }
  setCssProps(props: Record<string, string>): void {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
  }
  onClickEvent(fn: (e: any) => void): void {
    this.addEventListener("click", fn);
  }
  find(sel: string): FakeElement | null {
    return this.querySelector(sel);
  }
  findAll(sel: string): FakeElement[] {
    return this.querySelectorAll(sel);
  }
}

function* descendants(root: FakeNode): Generator<FakeElement> {
  const stack: FakeNode[] = [...root.childNodes].reverse();
  while (stack.length) {
    const n = stack.pop() as FakeNode;
    if (n.nodeType !== ELEMENT_NODE) continue;
    yield n as FakeElement;
    for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i]);
  }
}

function queryFirst(root: FakeNode, sel: string): FakeElement | null {
  for (const el of descendants(root)) if (matches(el, sel)) return el;
  return null;
}

function queryAll(root: FakeNode, sel: string): FakeElement[] {
  const out: FakeElement[] = [];
  for (const el of descendants(root)) if (matches(el, sel)) out.push(el);
  return out;
}

// ── TreeWalker (examHighlight walks text nodes) ──────────────────────────

export const NodeFilter = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xffffffff,
  SHOW_ELEMENT: 0x1,
  SHOW_TEXT: 0x4,
} as const;

type FilterFn = ((n: FakeNode) => number) | { acceptNode(n: FakeNode): number } | null | undefined;

class FakeTreeWalker {
  currentNode: FakeNode;
  constructor(
    readonly root: FakeNode,
    private whatToShow: number,
    private filter: FilterFn
  ) {
    this.currentNode = root;
  }

  private accept(n: FakeNode): number {
    const bit = n.nodeType === ELEMENT_NODE ? NodeFilter.SHOW_ELEMENT : n.nodeType === TEXT_NODE ? NodeFilter.SHOW_TEXT : 0;
    if (!(this.whatToShow & bit)) return NodeFilter.FILTER_SKIP;
    const f = this.filter;
    if (!f) return NodeFilter.FILTER_ACCEPT;
    return typeof f === "function" ? f(n) : f.acceptNode(n);
  }

  // Pre-order traversal; REJECT on an element skips its subtree.
  nextNode(): FakeNode | null {
    let node: FakeNode = this.currentNode;
    let result = NodeFilter.FILTER_ACCEPT as number;
    for (;;) {
      if (result !== NodeFilter.FILTER_REJECT && node.childNodes.length) {
        node = node.childNodes[0];
      } else {
        let next: FakeNode | null = null;
        for (let n: FakeNode | null = node; n && n !== this.root; n = n.parentNode) {
          const sib = n.nextSibling;
          if (sib) {
            next = sib;
            break;
          }
        }
        if (!next) return null;
        node = next;
      }
      result = this.accept(node);
      if (result === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
  }
}

// ── Document ─────────────────────────────────────────────────────────────

export class FakeDocument extends FakeNode {
  readonly documentElement: FakeElement;
  readonly head: FakeElement;
  readonly body: FakeElement;
  activeElement: FakeElement;

  constructor() {
    super(DOCUMENT_NODE, null);
    this.documentElement = this.createElement("html");
    this.appendChild(this.documentElement);
    this.head = this.documentElement.createEl("head");
    this.body = this.documentElement.createEl("body");
    this.activeElement = this.body;
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  createElementNS(_ns: string, tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  createTextNode(text: string): FakeText {
    return new FakeText(text, this);
  }
  createDocumentFragment(): FakeFragment {
    return new FakeFragment(this);
  }
  createTreeWalker(root: FakeNode, whatToShow = NodeFilter.SHOW_ALL, filter?: FilterFn): FakeTreeWalker {
    return new FakeTreeWalker(root, whatToShow, filter);
  }
  createRange() {
    return { setStart() {}, setEnd() {}, toString: () => "", getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }) };
  }
  getSelection() {
    return { toString: () => "", rangeCount: 0, isCollapsed: true, removeAllRanges() {}, getRangeAt: () => null };
  }
  querySelector(sel: string): FakeElement | null {
    return queryFirst(this, sel);
  }
  querySelectorAll(sel: string): FakeElement[] {
    return queryAll(this, sel);
  }
  getElementById(id: string): FakeElement | null {
    return queryFirst(this, `#${id}`);
  }
  hasFocus(): boolean {
    return true;
  }
}

// ── install as globals ───────────────────────────────────────────────────

class MemoryLocalStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

// Every network attempt the code under test makes through window.fetch /
// globalThis.fetch (the AI transport's BrowserFetch). Obsidian's requestUrl
// is recorded by the obsidian mock into the same list.
export const networkLog: { via: string; url: string }[] = [];

// What window.fetch answers. Default: reject like an offline browser.
// Tests that need an AI answer install a handler returning a Response.
type NetworkHandler = (url: string, init: unknown) => Promise<unknown> | unknown;
let networkHandler: NetworkHandler | null = null;
export function setNetworkHandler(fn: NetworkHandler | null): void {
  networkHandler = fn;
}

function cssEscape(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
}

let installed: FakeDocument | null = null;

export function installDom(): FakeDocument {
  if (installed) return installed;
  const doc = new FakeDocument();
  const g = globalThis as any;
  const fakeFetch = async (input: unknown, init?: unknown) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    networkLog.push({ via: "fetch", url });
    if (networkHandler) return networkHandler(url, init);
    throw new TypeError(`network disabled in tests: ${url}`);
  };
  const win: Record<string, unknown> = {
    document: doc,
    localStorage: new MemoryLocalStorage(),
    sessionStorage: new MemoryLocalStorage(),
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    requestAnimationFrame: (fn: (t: number) => void) => setTimeout(() => fn(performance.now()), 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    getSelection: () => doc.getSelection(),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    fetch: fakeFetch,
    speechSynthesis: { cancel() {}, speak() {} },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
  };
  g.window = win;
  g.document = doc;
  g.fetch = fakeFetch;
  g.Node = FakeNode;
  g.Text = FakeText;
  g.Element = FakeElement;
  g.HTMLElement = FakeElement;
  g.HTMLInputElement = FakeElement;
  g.HTMLTextAreaElement = FakeElement;
  g.HTMLButtonElement = FakeElement;
  g.HTMLSelectElement = FakeElement;
  g.SVGElement = FakeElement;
  g.DocumentFragment = FakeFragment;
  g.NodeFilter = NodeFilter;
  g.CSS = { escape: cssEscape };
  g.requestAnimationFrame = win.requestAnimationFrame;
  g.cancelAnimationFrame = win.cancelAnimationFrame;
  g.activeDocument = doc;
  g.activeWindow = win;
  // Obsidian's global element factories.
  g.createEl = (tag: string, o?: DomElementInfo | string) => {
    const el = doc.createElement(tag);
    applyInfo(el, typeof o === "string" ? { cls: o } : (o ?? {}));
    return el;
  };
  g.createDiv = (o?: DomElementInfo | string) => g.createEl("div", o);
  g.createSpan = (o?: DomElementInfo | string) => g.createEl("span", o);
  g.createFragment = (cb?: (f: FakeFragment) => void) => {
    const f = doc.createDocumentFragment();
    cb?.(f);
    return f;
  };
  installed = doc;
  return doc;
}

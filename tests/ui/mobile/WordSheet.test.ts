import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Obsidian: a Component with child/cleanup bookkeeping, a Notice spy ──
vi.mock("obsidian", () => {
  class Component {
    _children: Component[] = [];
    _cleanups: (() => void)[] = [];
    _loaded = false;
    load() {
      this._loaded = true;
      this.onload();
      for (const c of this._children) if (!c._loaded) c.load();
    }
    onload() {}
    unload() {
      for (const c of this._children) c.unload();
      this._children = [];
      for (const f of this._cleanups.splice(0)) f();
      this._loaded = false;
    }
    addChild<T extends Component>(c: T): T {
      this._children.push(c);
      if (this._loaded) c.load();
      return c;
    }
    removeChild<T extends Component>(c: T): T {
      this._children = this._children.filter((x) => x !== c);
      c.unload();
      return c;
    }
    register(fn: () => void) {
      this._cleanups.push(fn);
    }
    registerEvent(ref: { off?: () => void }) {
      this._cleanups.push(() => ref.off?.());
    }
  }
  const notices: string[] = [];
  class Notice {
    constructor(msg: string) {
      notices.push(msg);
    }
    hide() {}
  }
  return { Component, Notice, notices, setIcon: () => undefined, MarkdownRenderer: { render: async () => {} } };
});

// The card and the paragraph pane have their own tests: here they only
// record what they were given.
const rows: { entryId: string; state: string; opts: Record<string, unknown>; refresh: () => void; setState: (s: string) => void }[] = [];
vi.mock("../../../src/ui/word/WordRow", () => ({
  renderVocabRow: (
    _plugin: unknown,
    container: { createDiv(o: unknown): unknown },
    entry: { id: string },
    state: string,
    setState: (s: string) => void,
    refresh: () => void,
    opts: Record<string, unknown>
  ) => {
    container.createDiv({ cls: "fake-row" });
    rows.push({ entryId: entry.id, state, opts, refresh, setState });
  },
}));

const panes: { route: unknown; nav: Record<string, (...a: unknown[]) => void>; unloaded: boolean }[] = [];
vi.mock("../../../src/ui/sidebar/ParagraphThreadPane", async () => {
  const { Component } = await import("obsidian");
  class ParagraphThreadPane extends Component {
    rec: (typeof panes)[number];
    constructor(parent: { createDiv(o: unknown): unknown }, route: unknown, _host: unknown, _chat: unknown, nav: Record<string, (...a: unknown[]) => void>) {
      super();
      parent.createDiv({ cls: "fake-pane" });
      this.rec = { route, nav, unloaded: false };
      panes.push(this.rec);
    }
    onload() {
      this.register(() => (this.rec.unloaded = true));
    }
  }
  return { ParagraphThreadPane };
});

const rebindNotices: { text: string; actions: { label: string; run(): void }[]; hide: ReturnType<typeof vi.fn> }[] = [];
vi.mock("../../../src/ui/mobile/actionNotice", () => ({
  actionNotice: (text: string, actions: { label: string; run(): void }[]) => {
    const n = { text, actions, hide: vi.fn() };
    rebindNotices.push(n);
    return n;
  },
}));

import { Component } from "obsidian";
import { TypedEmitter } from "../../../src/core/events";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { SectionRef } from "../../../src/services/anchors/ParagraphAnchorService";
import type { SheetWindow } from "../../../src/ui/mobile/BottomSheet";
import { WordSheet } from "../../../src/ui/mobile/WordSheet";
import { FakeEl, FakeWindow, installGlobals, type FakeDocument } from "./fakeDom";

const REF: SectionRef = { path: "speech.md", lineStart: 12, lineEnd: 12, text: "Last time I was in a stadium this size" };

let doc: FakeDocument;
let body: FakeEl;
let docBody: FakeEl;
let win: FakeWindow;
let fileOpen: (() => void) | null;

function makePlugin(entries: VocabEntry[], threads: Record<string, unknown> = {}) {
  const events = new TypedEmitter<{ "data:changed": unknown }>();
  return {
    store: { entries, events },
    app: {
      workspace: {
        on: (_name: string, fn: () => void) => {
          fileOpen = fn;
          return { off: () => (fileOpen = null) };
        },
      },
    },
    threads: {
      ensureLoaded: async () => {},
      paragraphThread: () => undefined,
      rebindParagraph: vi.fn(async () => true),
      ...threads,
    },
    addWordToVocab: vi.fn(async (word: string) => {
      entries.push({ id: `id-${word}`, word } as VocabEntry);
      return true;
    }),
    openWordPage: vi.fn(async () => {}),
  };
}

function makeSheet(plugin: ReturnType<typeof makePlugin>) {
  const owner = new Component();
  owner.load();
  const sheet = owner.addChild(
    new WordSheet(plugin as never, { host: body as unknown as HTMLElement, win: win as unknown as SheetWindow })
  );
  return { sheet, owner };
}

const layer = () => body.find("vt-sheet-layer");

beforeEach(() => {
  rows.length = 0;
  panes.length = 0;
  rebindNotices.length = 0;
  fileOpen = null;
  doc = installGlobals();
  body = new FakeEl("BODY");
  body.ownerDocument = doc;
  docBody = new FakeEl("BODY");
  vi.stubGlobal("document", { body: docBody });
  vi.stubGlobal("window", globalThis);
  win = new FakeWindow();
});

describe("WordSheet: a word", () => {
  it("a saved word opens the sheet with its card (sheet variant), never collapsed", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("Glittery");
    expect(sheet.isOpen).toBe(true);
    expect(layer()?.hasClass("is-open")).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryId: "e1", state: "half" });
    expect(rows[0].opts.variant).toBe("sheet");
    expect(sheet.current).toMatchObject({ kind: "word", entryId: "e1" });
  });

  it("an unsaved word shows 「加入單字庫」, which adds it (with the tapped sentence) and shows the card", async () => {
    const plugin = makePlugin([]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("leotard", { ctx: { sentence: "wearing a glittery leotard." } });
    expect(rows).toHaveLength(0);
    const btn = layer()!.find("vt-sheet-add-btn")!;
    btn.click();
    expect(plugin.addWordToVocab).toHaveBeenCalledWith("leotard", { sentence: "wearing a glittery leotard." }, { reveal: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(rows).toHaveLength(1);
    expect(rows[0].entryId).toBe("id-leotard");
  });

  it("openWord opens on the asked tab", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.openWord("e1", "ai");
    expect(sheet.wordUi.tabs.get("e1")).toBe("ai");
    sheet.openWord("missing", "ai");
    expect(rows).toHaveLength(1);
  });

  it("closing unloads the card's components; deleting the word closes it", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    (rows[0].opts.onDeleted as () => void)();
    expect(sheet.isOpen).toBe(false);
    expect(sheet.current).toBeNull();
    // The card's refresh after a delete doesn't draw into a closed sheet.
    rows[0].refresh();
    expect(rows).toHaveLength(1);
  });

  it("the 「單字頁」 button closes the sheet and opens the page", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    (rows[0].opts.openWordPage as (e: VocabEntry) => void)({ id: "e1" } as VocabEntry);
    expect(sheet.isOpen).toBe(false);
    expect(plugin.openWordPage).toHaveBeenCalledWith("e1");
  });

  it("switching tabs / more redraws the card and keeps the expand state", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    rows[0].setState("full");
    rows[0].refresh();
    expect(rows).toHaveLength(2);
    expect(rows[1].state).toBe("full");
    // Another word starts at half again.
    plugin.store.entries.push({ id: "e2", word: "leotard" } as VocabEntry);
    sheet.showWord("leotard");
    expect(rows[2].state).toBe("half");
  });

  it("📍 (jump to the word in the note) closes the sheet so the note shows", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    (rows[0].opts.onJump as () => void)();
    expect(sheet.isOpen).toBe(false);
  });

  it("opening another note closes the sheet", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    fileOpen?.();
    expect(sheet.isOpen).toBe(false);
  });

  it("unloading the plugin removes the sheet", () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet, owner } = makeSheet(plugin);
    sheet.showWord("glittery");
    owner.unload();
    expect(layer()).toBeNull();
  });
});

describe("WordSheet: store changes", () => {
  const wait = () => new Promise((r) => setTimeout(r, 0));

  it("redraws the data tab when the entry changes (dictionary data arrived)", async () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    plugin.store.events.emit("data:changed", {});
    plugin.store.events.emit("data:changed", {});
    await wait();
    expect(rows).toHaveLength(2);
  });

  it("never redraws the AI tab — the streaming composer keeps its focus", async () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.openWord("e1", "ai");
    plugin.store.events.emit("data:changed", {});
    await wait();
    expect(rows).toHaveLength(1);
  });

  it("doesn't redraw while something in the sheet has focus", async () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    const { sheet } = makeSheet(plugin);
    sheet.showWord("glittery");
    const input = layer()!.find("vt-sheet-content")!.createEl("textarea");
    doc.activeElement = input;
    plugin.store.events.emit("data:changed", {});
    await wait();
    expect(rows).toHaveLength(1);
  });

  it("ignores changes while closed", async () => {
    const plugin = makePlugin([{ id: "e1", word: "glittery" } as VocabEntry]);
    makeSheet(plugin);
    plugin.store.events.emit("data:changed", {});
    await wait();
    expect(rows).toHaveLength(0);
  });
});

describe("WordSheet: a paragraph", () => {
  it("a paragraph without a discussion opens a draft pane; with one, its thread", async () => {
    const plugin = makePlugin([], { paragraphThread: (path: string) => (path === "other.md" ? { id: "t9" } : undefined) });
    const { sheet } = makeSheet(plugin);
    await sheet.openParagraph(REF);
    expect(sheet.isOpen).toBe(true);
    expect(panes[0].route).toEqual({ name: "paragraph-draft", section: REF });
    await sheet.openParagraph({ ...REF, path: "other.md" });
    expect(panes[1].route).toEqual({ name: "paragraph", threadId: "t9" });
    expect(panes[0].unloaded).toBe(true);
  });

  it("the draft's first question hands over to the new thread, keeping composer focus", async () => {
    const plugin = makePlugin([]);
    const { sheet } = makeSheet(plugin);
    await sheet.openParagraph(REF);
    sheet.wordUi.chat.focused = `draft:${REF.path}:${REF.lineStart}`;
    panes[0].nav.threadStarted(REF, "t1");
    expect(panes[1].route).toEqual({ name: "paragraph", threadId: "t1" });
    expect(sheet.wordUi.chat.focused).toBe("t1");
    // A stale hand-over for another paragraph is ignored.
    panes[1].nav.threadStarted({ ...REF, lineStart: 99 }, "t2");
    expect(panes).toHaveLength(2);
  });

  it("back closes; the thread being deleted closes", async () => {
    const plugin = makePlugin([], { paragraphThread: () => ({ id: "t1" }) });
    const { sheet } = makeSheet(plugin);
    await sheet.openParagraph(REF);
    panes[0].nav.back();
    expect(sheet.isOpen).toBe(false);
    await sheet.openParagraph(REF);
    panes[1].nav.removed("other");
    expect(sheet.isOpen).toBe(true);
    panes[1].nav.removed("t1");
    expect(sheet.isOpen).toBe(false);
    await sheet.openParagraph(REF);
    panes[2].nav.jumped();
    expect(sheet.isOpen).toBe(false);
  });

  it("rebind: closes the sheet, waits for a ✦, then binds and shows the thread", async () => {
    const plugin = makePlugin([], { paragraphThread: () => ({ id: "t1" }) });
    const { sheet } = makeSheet(plugin);
    await sheet.openParagraph(REF);
    panes[0].nav.rebind("t1");
    expect(sheet.isOpen).toBe(false);
    expect(sheet.rebinding).toBe(true);
    expect(docBody.hasClass("vt-rebinding")).toBe(true);
    expect(rebindNotices).toHaveLength(1);

    const target = { ...REF, lineStart: 20, lineEnd: 20, text: "To the honorees" };
    await sheet.openParagraph(target);
    expect(plugin.threads.rebindParagraph).toHaveBeenCalledWith("t1", target);
    expect(sheet.rebinding).toBe(false);
    expect(docBody.hasClass("vt-rebinding")).toBe(false);
    expect(rebindNotices[0].hide).toHaveBeenCalled();
    expect(sheet.isOpen).toBe(true);
    expect(panes.at(-1)?.route).toEqual({ name: "paragraph", threadId: "t1" });
  });

  it("rebind can be cancelled from its Notice", async () => {
    const plugin = makePlugin([], { paragraphThread: () => ({ id: "t1" }) });
    const { sheet } = makeSheet(plugin);
    await sheet.openParagraph(REF);
    panes[0].nav.rebind("t1");
    rebindNotices[0].actions[0].run();
    expect(sheet.rebinding).toBe(false);
    expect(docBody.hasClass("vt-rebinding")).toBe(false);
    await sheet.openParagraph(REF);
    expect(plugin.threads.rebindParagraph).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
// Boots the real plugin (main.ts onload, every service wired the way
// Obsidian runs it) on the in-memory App, seeded with a stress fixture.
// Test files must mock obsidian first:
//
//   vi.mock("obsidian", () => import("./support/obsidian"));
//   import { bootPlugin } from "./support/harness";

import type VocabTrackerPlugin from "../../../main";
import { VOCAB_VIEW_TYPE, type VocabSidebarView } from "../../../src/ui/sidebar/VocabSidebarView";
import type { StressFixture, StressNote } from "../../fixtures/stress";
import { FakeApp, PLUGIN_DIR, pluginFile } from "./app";
import type { FakeElement } from "./dom";
import { WorkspaceLeaf, type Component } from "./obsidian";

export interface Booted {
  app: FakeApp;
  plugin: VocabTrackerPlugin;
  // The mock Plugin's registries (post-processors, code blocks, views).
  host: {
    postProcessors: ((el: HTMLElement, ctx: any) => unknown)[];
    codeBlocks: Map<string, (source: string, el: HTMLElement, ctx: any) => unknown>;
    views: Map<string, (leaf: WorkspaceLeaf) => any>;
  };
  unload(): Promise<void>;
}

export interface BootOptions {
  // data.json as it sits on disk (default: fx.data()).
  data?: unknown;
  // store/threads.json (default: fx.threadsShard()); null = no file.
  threads?: unknown | null;
  // store/learn.json (default: fx.learnShard()); null = no file.
  learn?: unknown | null;
  // Note in front when the layout is ready (default: the long article).
  activePath?: string | null;
}

// Lets queued timers/promises run (background scans yield with setTimeout 0).
export async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

export function seedApp(fx: StressFixture, opts: BootOptions = {}): FakeApp {
  const app = new FakeApp();
  for (const n of fx.notes) app.vault.addFile(n.path, n.text);
  for (const w of fx.wordlists) app.vault.addFile(w.path, w.text);
  const { files } = app.vault.adapter;
  files.set(pluginFile("data.json"), JSON.stringify(opts.data === undefined ? fx.data() : opts.data));
  const threads = opts.threads === undefined ? fx.threadsShard() : opts.threads;
  if (threads !== null) files.set(pluginFile("store/threads.json"), JSON.stringify(threads));
  const learn = opts.learn === undefined ? fx.learnShard() : opts.learn;
  if (learn !== null) files.set(pluginFile("store/learn.json"), JSON.stringify(learn));
  // Every note's exam words were imported before (a returning user).
  const imported = Object.fromEntries(fx.notes.map((n) => [n.path, fx.now.toISOString()]));
  files.set(pluginFile("store/imports.json"), JSON.stringify({ notes: imported }));
  return app;
}

export async function bootPlugin(fx: StressFixture, opts: BootOptions = {}, app = seedApp(fx, opts)): Promise<Booted> {
  const activePath = opts.activePath === undefined ? fx.article.path : opts.activePath;
  if (activePath) app.workspace.activeFile = app.vault.getAbstractFileByPath(activePath) as any;
  // Imported at run time by its .ts name: a bare "../../../main" would
  // resolve to the built main.js bundle (Vite tries .js before .ts).
  const mainPath: string = "../../../main.ts";
  const { default: Plugin } = (await import(/* @vite-ignore */ mainPath)) as { default: typeof VocabTrackerPlugin };
  const plugin = new Plugin(app as any, { id: "vocab-tracker", dir: PLUGIN_DIR, version: "1.1.0", name: "Vocab Tracker" } as any);
  // Component.load() without awaiting: Obsidian awaits onload itself.
  (plugin as any)._loaded = true;
  await plugin.onload();
  app.workspace.finishLayout();
  await settle();
  return {
    app,
    plugin,
    host: plugin as any,
    unload: async () => {
      await (plugin.unload() as unknown as Promise<void>);
    },
  };
}

// Opens the sidebar the way activateSidebar does (a new leaf, the view's
// onOpen), with the given tab picked. Resolves once the view's async parts
// (thread counts, the 段落討論 list) have drawn.
export async function openSidebar(b: Booted, filter: "note" | "all"): Promise<VocabSidebarView> {
  const leaf = new WorkspaceLeaf(b.app);
  b.app.workspace.leaves.push(leaf);
  const view = b.host.views.get(VOCAB_VIEW_TYPE)!(leaf) as VocabSidebarView;
  leaf.view = view;
  view.filterMode = filter;
  (document.body as unknown as FakeElement).appendChild(view.containerEl as unknown as FakeElement);
  (view as unknown as Component).load();
  await view.onOpen();
  return view;
}

export function closeSidebar(b: Booted, view: VocabSidebarView): void {
  (view as unknown as Component).unload();
  (view.containerEl as unknown as FakeElement).remove();
  const i = b.app.workspace.leaves.findIndex((l) => l.view === view);
  if (i >= 0) b.app.workspace.leaves.splice(i, 1);
}

// ── reading view ─────────────────────────────────────────────────────────

export interface RenderedSection {
  el: HTMLElement;
  ctx: any;
  kind: string;
}

const INLINE = /==([^=\n]+)==|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[\[([^\]\n]+)\]\]/g;

// Inline markdown → DOM, roughly as Obsidian renders it.
function inline(parent: FakeElement, text: string): void {
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index!;
    if (i > last) parent.appendChild(document.createTextNode(text.slice(last, i)) as any);
    if (m[1] !== undefined) parent.createEl("mark", { text: m[1] });
    else if (m[2] !== undefined) parent.createEl("strong", { text: m[2] });
    else if (m[3] !== undefined) parent.createEl("code", { text: m[3] });
    else parent.createEl("a", { cls: "internal-link", text: m[4], attr: { "data-href": m[4] } });
    last = i + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)) as any);
}

// Reading view hides trailing block ids.
function stripBlockId(line: string): string {
  return line.replace(/\s\^[A-Za-z0-9-]+\s*$/, "");
}

function frontmatterOf(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 4);
  const out: Record<string, unknown> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// The section elements reading view would hand the post-processors for a
// note, each with its MarkdownPostProcessorContext. Built up front so a
// timing only covers the plugin's post-processors.
export function renderNote(note: Pick<StressNote, "path" | "text" | "sections">): RenderedSection[] {
  const lines = note.text.split("\n");
  const frontmatter = frontmatterOf(note.text);
  const out: RenderedSection[] = [];
  for (const s of note.sections) {
    const div = (globalThis as any).createDiv() as FakeElement;
    const body = lines.slice(s.lineStart, s.lineEnd + 1).map(stripBlockId);
    switch (s.kind) {
      case "heading": {
        const m = /^(#+)\s*(.*)$/.exec(body[0]) ?? ["", "#", body[0]];
        div.addClass(`el-h${m[1].length}`);
        inline(div.createEl(`h${m[1].length}`), m[2]);
        break;
      }
      case "list": {
        div.addClass("el-ul");
        const ul = div.createEl("ul");
        for (const l of body) inline(ul.createEl("li"), l.replace(/^\s*[-*]\s+/, ""));
        break;
      }
      case "quote":
        div.addClass("el-blockquote");
        inline(div.createEl("blockquote").createEl("p"), body.map((l) => l.replace(/^>\s?/, "")).join("\n"));
        break;
      case "code":
        div.addClass("el-pre");
        div.createEl("pre").createEl("code", { text: body.slice(1, -1).join("\n") });
        break;
      default:
        div.addClass("el-p");
        inline(div.createEl("p"), body.join("\n"));
    }
    const children: Component[] = [];
    const ctx = {
      docId: "doc",
      sourcePath: note.path,
      frontmatter,
      getSectionInfo: (el: unknown) => (el === div ? { text: note.text, lineStart: s.lineStart, lineEnd: s.lineEnd } : null),
      addChild: (child: Component) => {
        child.load();
        children.push(child);
      },
      children,
    };
    out.push({ el: div as unknown as HTMLElement, ctx, kind: s.kind });
  }
  return out;
}

// Note → sections in the same shape the fixture uses, for notes the plugin
// wrote itself (word pages): blank-line separated blocks.
export function sectionsOf(text: string): StressNote["sections"] {
  const lines = text.split("\n");
  const out: StressNote["sections"] = [];
  let i = 0;
  // Frontmatter is not a section reading view post-processes as prose.
  if (lines[0] === "---") {
    i = lines.indexOf("---", 1) + 1;
  }
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const start = i;
    if (lines[i].startsWith("```")) {
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) i++;
      out.push({ kind: "code", lineStart: start, lineEnd: Math.min(i, lines.length - 1) });
      i++;
      continue;
    }
    if (lines[i].startsWith("#")) {
      out.push({ kind: "heading", lineStart: start, lineEnd: start });
      i++;
      continue;
    }
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```")) i++;
    const first = lines[start];
    const kind = /^\s*[-*]\s/.test(first) ? "list" : first.startsWith(">") ? "quote" : "paragraph";
    out.push({ kind, lineStart: start, lineEnd: i - 1 });
  }
  return out;
}

export { ms, PERF_FACTOR, percentile } from "./report";

// Reading view of a whole note the plugin's way: `vocab-*` code blocks go
// to their registered processors, every other section through all
// post-processors. Returns the section elements.
export function readNote(b: Booted, path: string): FakeElement[] {
  const text = b.app.vault.text(path);
  if (text === undefined) throw new Error(`no such note: ${path}`);
  const lines = text.split("\n");
  const note = { path, text, sections: sectionsOf(text) };
  return renderNote(note).map((s, i) => {
    const sec = note.sections[i];
    const fence = sec.kind === "code" ? /^```(vocab-[a-z-]+)/.exec(lines[sec.lineStart]) : null;
    const lang = fence?.[1];
    if (lang) {
      const el = (globalThis as any).createDiv({ cls: `block-language-${lang}` }) as FakeElement;
      const source = lines.slice(sec.lineStart + 1, sec.lineEnd).join("\n");
      const processor = b.host.codeBlocks.get(lang);
      if (!processor) throw new Error(`no code block processor for ${lang}`);
      processor(source, el as unknown as HTMLElement, s.ctx);
      return el;
    }
    for (const pp of b.host.postProcessors) pp(s.el, s.ctx);
    return s.el as unknown as FakeElement;
  });
}

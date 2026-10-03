import {
  ItemView,
  MarkdownPostProcessorContext,
  Menu,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import type { VocabData, VocabEntry, VocabSource } from "./src/core/model/entry";
import type { WordContext } from "./src/core/model/word-context";
import { buildWordRe, escapeRe } from "./src/core/text/wordRe";
import { replaceOutsideCode, wrapOutsideCode } from "./src/core/text/outsideCode";
import { extractSentence } from "./src/core/text/sentence";
import { findSourceLine } from "./src/core/text/sourceLine";
import { ObsidianHttp } from "./src/platform/ObsidianHttp";
import { DictionaryService } from "./src/services/dictionary/DictionaryService";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = "note" | "all";

// Progressive-disclosure state for a single row: collapsed (one line),
// half (synonyms-and-up visible), full (everything visible).
type ExpandState = "collapsed" | "half" | "full";

// ─── Constants ────────────────────────────────────────────────────────────────

const VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";
// Lives inside its own folder so related notes (per-exam lists, planning
// docs, etc.) can sit alongside it instead of cluttering the vault root.
const VOCAB_FOLDER = "vocab-list";
const VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
const VOCAB_FILE_LEGACY = "vocab-list.md";

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Grows a textarea to fit its content instead of showing a scrollbar/resize
// handle — called once on render and again on every keystroke.
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// ─── Sidebar View ─────────────────────────────────────────────────────────────

class VocabSidebarView extends ItemView {
  plugin: VocabTrackerPlugin;
  // Word clicked via a plain ==mark== that isn't tracked yet — prompts an
  // "add to vocab" banner instead of a full row (see processMarks).
  pendingWord = "";
  filterMode?: FilterMode;
  expandState: Map<string, ExpandState> = new Map();
  collapsedGroups: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: VocabTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VOCAB_VIEW_TYPE; }
  getDisplayText() { return "Vocab Tracker"; }
  getIcon() { return "book-open"; }

  async onOpen() { this.render(); }

  // Called when a tracked word is clicked (reading-mode word / ==mark==).
  // Expands its row in place rather than opening a separate card.
  setWord(word: string) {
    const entry = this.plugin.vocabData.entries.find(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );
    if (entry) {
      if (this.expandState.get(entry.id) === undefined) {
        this.expandState.set(entry.id, "half");
      }
      this.pendingWord = "";
    } else {
      this.pendingWord = word;
    }
    this.render();
  }

  render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("vocab-tracker-sidebar");

    const header = root.createEl("div", { cls: "vocab-tracker-header" });
    header.createEl("h4", { text: "Vocab Tracker" });
    const openList = header.createEl("span", { text: "📄", cls: "vocab-tracker-icon-btn" });
    openList.title = "Open vocab-list.md";
    openList.onclick = () => this.plugin.openVocabFile();

    const { entries } = this.plugin.vocabData;

    // ── Not-yet-tracked word banner ──────────────────────────────
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vocab-tracker-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vocab-tracker-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: "+ Add to vocab list", cls: "vocab-tracker-btn" });
      addBtn.onclick = async () => {
        await this.plugin.addWordToVocab(this.pendingWord);
      };
      const dismiss = banner.createEl("span", { text: "×", cls: "vocab-tracker-close-btn" });
      dismiss.onclick = () => { this.pendingWord = ""; this.render(); };
    }

    // ── Scope: words from this note, or all words ────────────────
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const canFilter = !!activeFile;
    if (this.filterMode === undefined) this.filterMode = "note";

    let list = entries;
    let scopeLabel = "All words";
    if (this.filterMode === "note" && canFilter) {
      list = entries.filter(
        (e) => e.source && e.source.path === activeFile!.path
      );
      scopeLabel = "This note";
    }

    const listHeader = root.createEl("div", { cls: "vocab-tracker-list-header" });

    const countLabel = listHeader.createEl("div", { cls: "vocab-tracker-count-label" });
    countLabel.textContent = `${scopeLabel} (${list.length})`;

    const toggle = listHeader.createEl("div", { cls: "vocab-tracker-toggle-group" });
    const mkToggle = (label: string, mode: FilterMode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label, cls: "vocab-tracker-toggle-btn" });
      b.toggleClass("is-active", on);
      b.onclick = () => {
        this.filterMode = mode;
        this.render();
      };
    };
    mkToggle("This note", "note");
    mkToggle("All", "all");

    if (list.length === 0) {
      root.createEl("div", {
        text:
          this.filterMode === "note" && canFilter
            ? "No tracked words from this note yet. Click an English word in reading mode to add one."
            : "Click an English word in reading mode to start tracking.",
        cls: "vocab-tracker-hint",
      });
      return;
    }

    const listEl = root.createEl("div", { cls: "vocab-tracker-list" });
    if (this.filterMode === "all") {
      // Grouped by source note, same as the vocab-list dashboard — "This
      // note" stays flat since every row would be in the same group anyway.
      this.plugin.renderGroupedVocabList(
        listEl,
        list,
        this.collapsedGroups,
        this.expandState,
        () => this.render()
      );
    } else {
      for (const entry of list) {
        const state = this.expandState.get(entry.id) ?? "collapsed";
        this.plugin.renderVocabRow(
          listEl,
          entry,
          state,
          (s) => this.expandState.set(entry.id, s),
          () => this.render()
        );
      }
    }
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class VocabTrackerPlugin extends Plugin {
  vocabData: VocabData = { entries: [] };
  dictionary!: DictionaryService;

  async onload() {
    const saved = await this.loadData();
    if (saved) this.vocabData = saved;

    this.dictionary = new DictionaryService(new ObsidianHttp());

    // Sidebar
    this.registerView(
      VOCAB_VIEW_TYPE,
      (leaf) => new VocabSidebarView(leaf, this)
    );

    // Click handler for ==highlights== in reading mode
    this.registerMarkdownPostProcessor(this.processMarks.bind(this));

    // Click any plain English word in reading mode
    this.registerDomEvent(document, "click", this.handleReadingClick.bind(this));

    // vocab-dashboard code block inside vocab-list.md
    this.registerMarkdownCodeBlockProcessor(
      "vocab-dashboard",
      this.renderDashboard.bind(this)
    );

    // Command palette
    this.addCommand({
      id: "open-vocab-sidebar",
      name: "Open Vocab Sidebar",
      callback: () => this.activateSidebar(),
    });
    this.addCommand({
      id: "open-vocab-list",
      name: "Open Vocab List",
      callback: () => this.openVocabFile(),
    });

    // Keep the sidebar scoped to whatever note is in front
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshSidebar())
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshSidebar())
    );

    this.app.workspace.onLayoutReady(() => this.ensureVocabFile());
  }

  async saveVocab() {
    await this.saveData(this.vocabData);
  }

  async activateSidebar(): Promise<WorkspaceLeaf> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("split");
      await leaf.setViewState({ type: VOCAB_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf;
  }

  async openVocabFile() {
    await this.ensureVocabFile();
    const file = this.app.vault.getAbstractFileByPath(VOCAB_FILE) as TFile;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  async ensureVocabFile() {
    if (this.app.vault.getAbstractFileByPath(VOCAB_FILE)) return;

    if (!this.app.vault.getAbstractFileByPath(VOCAB_FOLDER)) {
      await this.app.vault.createFolder(VOCAB_FOLDER);
    }

    // Migrate a pre-existing vault-root vocab-list.md into the folder
    // instead of leaving it orphaned next to a freshly created empty one.
    const legacy = this.app.vault.getAbstractFileByPath(VOCAB_FILE_LEGACY);
    if (legacy instanceof TFile) {
      await this.app.fileManager.renameFile(legacy, VOCAB_FILE);
      return;
    }

    await this.app.vault.create(
      VOCAB_FILE,
      "# Vocabulary List\n\n> Click a row to expand its details. Edit fields inline and they save automatically.\n\n```vocab-dashboard\n```\n"
    );
  }

  // ── Click any English word in reading mode ─────────────────────

  handleReadingClick(evt: MouseEvent) {
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;

    const preview = target.closest(".markdown-preview-view, .markdown-rendered");
    if (!preview) return;
    if (target.closest("a, mark, button, input, select, textarea, code, .internal-link, .external-link"))
      return;

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    const ctx = this.getWordContext(evt.clientX, evt.clientY);
    if (!ctx.word) return;
    const word = ctx.word;

    const exists = this.vocabData.entries.some(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );

    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(
        exists ? `Open "${word}" in Vocab Tracker` : `Add "${word}" to Vocab Tracker`
      );
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        new Notice(added ? `Added "${word}" to vocab list` : `Opened "${word}"`);
      });
    });
    menu.showAtMouseEvent(evt);
  }

  getWordContext(x: number, y: number): WordContext {
    let node: Node | null = null;
    let offset = 0;

    if ((document as any).caretPositionFromPoint) {
      const cp = (document as any).caretPositionFromPoint(x, y);
      if (cp) {
        node = cp.offsetNode;
        offset = cp.offset;
      }
    } else if ((document as any).caretRangeFromPoint) {
      const r = (document as any).caretRangeFromPoint(x, y);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }

    if (!node || node.nodeType !== Node.TEXT_NODE) return { word: "", sentence: "" };

    const text = node.textContent || "";
    const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z'\-]/.test(c);

    let start = offset;
    let end = offset;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    const word = text.slice(start, end).replace(/^[-']+|[-']+$/g, "");
    if (!/^[A-Za-z][A-Za-z'\-]*$/.test(word)) return { word: "", sentence: "" };

    const sentence = extractSentence(text, start, end, node);
    return { word, sentence };
  }

  async addWordToVocab(word: string, ctx: Partial<WordContext> = {}): Promise<boolean> {
    const { entries } = this.vocabData;
    const existing = entries.find(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );

    let source: VocabSource | null = null;
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      const content = await this.app.vault.read(file);
      const line = findSourceLine(content, word, ctx.sentence);
      source = { path: file.path, line: line < 0 ? 0 : line };

      // Highlight the word in the note so it stays visible
      const updated = wrapOutsideCode(content, buildWordRe(word));
      if (updated !== content) await this.app.vault.modify(file, updated);
    }

    if (!existing) {
      const entry: VocabEntry = {
        id: String(Date.now()),
        word,
        level: "",
        synonyms: "",
        antonyms: "",
        example: ctx.sentence || "",
        definition: "",
        definitionZh: "",
        phonetic: "",
        partOfSpeech: "",
        grammar: "",
        source,
        added: nowStamp(),
        lastReviewed: nowStamp(),
        reviews: 0,
      };
      entries.push(entry);
      await this.saveVocab();
      this.enrichEntry(entry);
    } else {
      if (!existing.source && source) existing.source = source;
      if (!existing.example && ctx.sentence) existing.example = ctx.sentence;
      await this.saveVocab();
    }

    const leaf = await this.activateSidebar();
    (leaf.view as VocabSidebarView).setWord(word);
    return existing == null;
  }

  async jumpToSource(entry: VocabEntry) {
    if (!entry.source || !entry.source.path) return;
    const file = this.app.vault.getAbstractFileByPath(entry.source.path) as TFile;
    if (!file) {
      new Notice("Source note not found: " + entry.source.path);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: entry.source.line } });
  }

  // ── Pronounce a word ───────────────────────────────────────────

  speakWord(entry: VocabEntry) {
    if (entry.audio) {
      const a = new Audio(entry.audio);
      a.play().catch(() => this.speakSynth(entry.word));
      return;
    }
    this.speakSynth(entry.word);
  }

  speakSynth(word: string) {
    if (!("speechSynthesis" in window)) {
      new Notice("No pronunciation available on this device.");
      return;
    }
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  // ── Auto-fetch dictionary data (Wiktionary, falls back to Datamuse) ──

  async enrichEntry(entry: VocabEntry, opts: { verbose?: boolean } = {}) {
    try {
      const data = await this.dictionary.fetchDictionary(entry.word);

      if (!entry.phonetic) entry.phonetic = data.phonetic;
      if (!entry.audio) entry.audio = data.audio;
      if (!entry.partOfSpeech) entry.partOfSpeech = data.partOfSpeech;
      if (!entry.definition) entry.definition = data.definition;
      if (!entry.definitionZh) entry.definitionZh = data.definitionZh;
      if (!entry.synonyms) entry.synonyms = data.synonyms.join(", ");
      if (!entry.antonyms) entry.antonyms = data.antonyms.join(", ");
      await this.saveVocab();

      const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
      const view = leaf && (leaf.view as VocabSidebarView);
      if (view) view.render();
      if (opts.verbose) new Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e: any) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      new Notice(`Vocab Tracker: couldn't fetch "${entry.word}" — ${e?.message || e}`);
    }
  }

  refreshSidebar() {
    const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) return;
    const path = this.app.workspace.getActiveFile()?.path || "";
    const view = leaf.view as any;
    if (view._lastFilePath === path) return;
    view._lastFilePath = path;
    view.render();
  }

  // ── Delete a tracked word and remove its ==highlight== ─────────

  async deleteEntry(entry: VocabEntry) {
    this.vocabData.entries = this.vocabData.entries.filter(
      (e) => e.id !== entry.id
    );
    await this.saveVocab();
    if (entry.source && entry.source.path) {
      await this.unhighlightWord(entry.word, entry.source.path);
    }
  }

  async unhighlightWord(word: string, path: string) {
    const file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file || file.extension !== "md") return;
    const re = new RegExp(`==(${escapeRe(word)})==`, "gi");
    const content = await this.app.vault.read(file);
    const updated = replaceOutsideCode(content, re, "$1");
    if (updated !== content) await this.app.vault.modify(file, updated);
  }

  // ── Shared row renderer: sidebar list + dashboard both use this ──
  //
  // Three progressive-disclosure states:
  //   collapsed — one line: ✕ delete · word+level · expand toggle · 🔊 speak
  //   half      — + phonetic/POS, synonyms, definition, 中文翻译;
  //               footer: more toggle · 🔄 fetch · ✓ reviewed · 🔊 speak
  //   full      — + antonyms (if any), example, grammar, source,
  //               added/reviewed, level
  renderVocabRow(
    container: HTMLElement,
    entry: VocabEntry,
    state: ExpandState,
    setState: (s: ExpandState) => void,
    refresh: () => void
  ) {
    const row = container.createEl("div", { cls: "vocab-tracker-row" });
    row.toggleClass("is-expanded", state !== "collapsed");

    // ── Header: always visible ───────────────────────────────────
    const head = row.createEl("div", { cls: "vocab-tracker-row-header" });

    const del = head.createEl("span", { text: "✕", cls: "vocab-tracker-row-delete" });
    del.title = "Delete";
    del.onclick = async (e) => {
      e.stopPropagation();
      await this.deleteEntry(entry);
      refresh();
    };

    const wordWrap = head.createEl("span", { cls: "vocab-tracker-row-wordwrap" });
    wordWrap.createEl("span", { text: entry.word, cls: "vocab-tracker-row-word" });
    for (const tag of entry.level.split(",").map((t) => t.trim()).filter(Boolean)) {
      wordWrap.createEl("span", { text: tag, cls: "vocab-tracker-row-badge" });
    }

    head.createEl("span", { cls: "vocab-tracker-row-spacer" });

    const arrow = head.createEl("span", {
      text: state === "collapsed" ? "⌃" : "⌵",
      cls: "vocab-tracker-row-arrow",
    });
    arrow.title = state === "collapsed" ? "Expand" : "Collapse";

    head.onclick = () => {
      setState(state === "collapsed" ? "half" : "collapsed");
      refresh();
    };

    if (state === "collapsed") {
      const speak = head.createEl("span", {
        text: "🔊",
        cls: ["vocab-tracker-speak-icon", "vocab-tracker-row-speak"],
      });
      speak.title = "Pronounce";
      speak.onclick = (e) => {
        e.stopPropagation();
        this.speakWord(entry);
      };
      return;
    }

    // ── Body: half + full ────────────────────────────────────────
    const body = row.createEl("div", { cls: "vocab-tracker-row-body" });

    const subText = body.createEl("div", { cls: "vocab-tracker-form-subtext" });
    subText.textContent =
      [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  ·  ") || entry.word;

    const mkField = (
      label: string,
      key: keyof VocabEntry,
      opts: { multiline?: boolean } = {}
    ) => {
      const value = String((entry as any)[key] ?? "");
      // No field-name labels — the placeholder alone says what belongs here,
      // and a filled field reads as plain text once the border drops away.
      const wrap = body.createEl("div", { cls: "vocab-tracker-field" });
      if (value) wrap.addClass("is-filled");
      const cls = ["vocab-tracker-input", "vocab-tracker-field-box"];
      if (opts.multiline) cls.push("vocab-tracker-textarea");
      const inp: any = wrap.createEl(opts.multiline ? "textarea" : "input", { cls });
      if (!opts.multiline) inp.type = "text";
      else inp.rows = 1; // UA default is 2 rows — pin to 1 so auto-grow starts tight
      inp.value = value;
      inp.placeholder = `Add ${label.toLowerCase()}…`;
      inp.onclick = (e: MouseEvent) => e.stopPropagation();
      if (opts.multiline) {
        autoGrowTextarea(inp);
        inp.addEventListener("input", () => autoGrowTextarea(inp));
      }
      inp.onchange = async () => {
        (entry as any)[key] = inp.value;
        await this.saveVocab();
        refresh();
      };
    };

    // Synonyms shares the exact same auto-growing textarea treatment as
    // Definition/中文翻译, so a long list wraps flush-left instead of
    // truncating in a single-line input.
    mkField("Synonyms", "synonyms", { multiline: true });
    mkField("Definition", "definition", { multiline: true });
    mkField("中文翻译", "definitionZh", { multiline: true });

    if (state === "full") {
      // Antonyms is hidden entirely when empty rather than showing an
      // empty prompt box — unlike the other fields, it's not something
      // most words have.
      if (entry.antonyms) mkField("Antonyms", "antonyms");

      mkField("Example sentence (from note)", "example", { multiline: true });
      mkField("Grammar tips", "grammar");

      if (entry.source && entry.source.path) {
        const src = body.createEl("div", { cls: "vocab-tracker-source-link" });
        const name = entry.source.path.split("/").pop();
        src.textContent = `📍 ${name} : line ${entry.source.line + 1}`;
        src.title = "Jump to where this word was captured";
        src.onclick = (e) => {
          e.stopPropagation();
          this.jumpToSource(entry);
        };
      }

      body.createEl("div", { text: `Added: ${entry.added}`, cls: "vocab-tracker-meta" });
      body.createEl("div", {
        text: `Reviewed: ${entry.lastReviewed} (${entry.reviews}×)`,
        cls: "vocab-tracker-meta",
      });

      // Level — last, right below the Added/Reviewed lines. Comma-separated
      // free-form tags (e.g. "多益中級, 托福高級"), same field style as everything else.
      mkField("Level", "level", { multiline: true });
    }

    // ── Footer: more-info toggle · fetch · reviewed · speak ──────
    const footer = body.createEl("div", { cls: "vocab-tracker-row-footer" });

    const moreBtn = footer.createEl("span", {
      text: state === "full" ? "⌵" : "ℹ️",
      cls: "vocab-tracker-footer-icon",
    });
    moreBtn.title = state === "full" ? "Show less" : "Show more";
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      setState(state === "full" ? "half" : "full");
      refresh();
    };

    const actions = footer.createEl("span", { cls: "vocab-tracker-row-footer-actions" });

    const fetchBtn = actions.createEl("span", { text: "🔄", cls: "vocab-tracker-footer-icon" });
    fetchBtn.title = "Fetch dictionary data (definition, synonyms, phonetic)";
    fetchBtn.onclick = async (e) => {
      e.stopPropagation();
      fetchBtn.textContent = "…";
      await this.enrichEntry(entry, { verbose: true });
      refresh();
    };

    const reviewBtn = actions.createEl("span", { text: "✓", cls: "vocab-tracker-footer-icon" });
    reviewBtn.title = "Mark as reviewed";
    reviewBtn.onclick = async (e) => {
      e.stopPropagation();
      entry.lastReviewed = nowStamp();
      entry.reviews += 1;
      await this.saveVocab();
      refresh();
    };

    const speak = actions.createEl("span", { text: "🔊", cls: "vocab-tracker-speak-icon" });
    speak.title = "Pronounce";
    speak.onclick = (e) => {
      e.stopPropagation();
      this.speakWord(entry);
    };
  }

  // ── Shared grouped list: dashboard + sidebar "All" tab both use this ──
  //
  // Groups rows by source note title into collapsible sections, each
  // showing its word count — the sidebar/dashboard" second level of
  // organization" on top of each row's own collapsed/half/full state.
  renderGroupedVocabList(
    container: HTMLElement,
    rows: VocabEntry[],
    collapsedGroups: Set<string>,
    expandState: Map<string, ExpandState>,
    refresh: () => void
  ) {
    const groups = new Map<string, VocabEntry[]>();
    for (const entry of rows) {
      const title = entry.source?.path
        ? entry.source.path.split("/").pop()!.replace(/\.md$/, "")
        : "(no note)";
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(entry);
    }

    const titles = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    for (const title of titles) {
      const groupRows = groups.get(title)!;
      const isCollapsed = collapsedGroups.has(title);

      const heading = container.createEl("div", { cls: "vocab-tracker-group-heading" });
      heading.createEl("span", {
        text: isCollapsed ? "⌃" : "⌵",
        cls: "vocab-tracker-group-arrow",
      });
      heading.createEl("span", { text: title, cls: "vocab-tracker-group-title", title });
      heading.createEl("span", { cls: "vocab-tracker-group-spacer" });
      heading.createEl("span", { text: String(groupRows.length), cls: "vocab-tracker-group-count" });
      heading.onclick = () => {
        if (isCollapsed) collapsedGroups.delete(title);
        else collapsedGroups.add(title);
        refresh();
      };

      if (isCollapsed) continue;

      for (const entry of groupRows) {
        const state = expandState.get(entry.id) ?? "collapsed";
        this.renderVocabRow(
          container,
          entry,
          state,
          (s) => expandState.set(entry.id, s),
          refresh
        );
      }
    }
  }

  // ── Mark click handler ─────────────────────────────────────────

  processMarks(el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    el.querySelectorAll<HTMLElement>("mark").forEach((mark) => {
      const word = mark.textContent?.trim() ?? "";
      if (!word) return;
      mark.addClass("vocab-tracker-tracked-mark");
      mark.title = `Track "${word}" in Vocab Tracker`;
      mark.addEventListener("click", async () => {
        const leaf = await this.activateSidebar();
        (leaf.view as VocabSidebarView).setWord(word);
      });
    });
  }

  // ── vocab-dashboard renderer ───────────────────────────────────

  renderDashboard(
    _source: string,
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext
  ) {
    const { entries } = this.vocabData;
    el.addClass("vocab-tracker-dashboard");

    if (entries.length === 0) {
      el.createEl("p", {
        text: "No words yet. Highlight ==words== in your notes and click them to start tracking.",
        cls: "vocab-tracker-empty-state",
      });
      return;
    }

    // Stats bar
    const stats = el.createEl("div", { cls: "vocab-tracker-stats" });
    stats.createEl("span", {
      text: `📚 ${entries.length} word${entries.length !== 1 ? "s" : ""}`,
      cls: "vocab-tracker-stat-pill",
    });
    const tagCounts = new Map<string, number>();
    for (const e of entries) {
      for (const tag of e.level.split(",").map((t) => t.trim()).filter(Boolean)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
      stats.createEl("span", {
        text: `${tag}: ${n}`,
        cls: ["vocab-tracker-stat-pill", "is-accent"],
      });
    }

    // Search
    const search = el.createEl("input", { cls: ["vocab-tracker-search-input", "vocab-tracker-field-box"] });
    search.placeholder = "Search words…";

    const listWrap = el.createEl("div", { cls: "vocab-tracker-list" });
    const expandState: Map<string, ExpandState> = new Map();
    const collapsedGroups: Set<string> = new Set();

    // Grouped by source note title — lets a note that only holds a
    // vocab-dashboard block double as a per-note word list. Each group
    // heading is itself collapsible and shows its word count.
    const draw = (q: string) => {
      listWrap.empty();
      const rows = entries.filter((e) =>
        e.word.toLowerCase().includes(q.toLowerCase())
      );
      this.renderGroupedVocabList(listWrap, rows, collapsedGroups, expandState, () => draw(search.value));
    };

    draw("");
    search.oninput = () => draw(search.value);
  }
}

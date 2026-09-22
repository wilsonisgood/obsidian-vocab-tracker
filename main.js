"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var LEVELS = ["", "A1", "A2", "B1", "B2", "C1", "C2"];
var VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";
var VOCAB_FILE = "vocab-list.md";
function nowStamp() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var VocabSidebarView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.activeWord = "";
    this.plugin = plugin;
  }
  getViewType() {
    return VOCAB_VIEW_TYPE;
  }
  getDisplayText() {
    return "Vocab Tracker";
  }
  getIcon() {
    return "book-open";
  }
  async onOpen() {
    this.render();
  }
  setWord(word) {
    this.activeWord = word;
    this.render();
  }
  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.style.cssText = "padding:12px;overflow-y:auto;height:100%;box-sizing:border-box;";
    const header = root.createEl("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;";
    header.createEl("h4", { text: "Vocab Tracker" }).style.margin = "0";
    const openList = header.createEl("span", { text: "\u{1F4C4}" });
    openList.title = "Open vocab-list.md";
    openList.style.cssText = "cursor:pointer;font-size:1em;";
    openList.onclick = () => this.plugin.openVocabFile();
    const { entries } = this.plugin.vocabData;
    if (this.activeWord) {
      const entry = entries.find(
        (e) => e.word.toLowerCase() === this.activeWord.toLowerCase()
      );
      const card = root.createEl("div");
      card.style.cssText = "background:var(--background-secondary);padding:12px;border-radius:8px;margin-bottom:16px;";
      const titleRow = card.createEl("div");
      titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
      titleRow.createEl("span", { text: this.activeWord }).style.cssText = "font-size:1.1em;font-weight:bold;";
      const close = titleRow.createEl("span", { text: "\xD7" });
      close.style.cssText = "cursor:pointer;color:var(--text-muted);font-size:1.2em;";
      close.onclick = () => {
        this.activeWord = "";
        this.render();
      };
      if (entry) {
        this.renderEntryForm(card, entry);
      } else {
        const btn = card.createEl("button", { text: "+ Add to vocab list" });
        btn.style.cssText = "width:100%;padding:7px;cursor:pointer;border-radius:5px;font-size:0.9em;";
        btn.onclick = async () => {
          await this.plugin.addWordToVocab(this.activeWord);
        };
      }
    }
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const canFilter = !!activeFile;
    if (this.filterMode === void 0) this.filterMode = "note";
    let list = entries;
    let scopeLabel = "All words";
    if (this.filterMode === "note" && canFilter) {
      list = entries.filter(
        (e) => e.source && e.source.path === activeFile.path
      );
      scopeLabel = "This note";
    }
    const listHeader = root.createEl("div");
    listHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px;";
    const countLabel = listHeader.createEl("div");
    countLabel.style.cssText = "font-size:0.8em;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;";
    countLabel.textContent = `${scopeLabel} (${list.length})`;
    const toggle = listHeader.createEl("div");
    toggle.style.cssText = "display:flex;gap:4px;flex-shrink:0;";
    const mkToggle = (label, mode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label });
      b.style.cssText = `cursor:pointer;font-size:0.72em;padding:2px 8px;border-radius:10px;background:${on ? "var(--interactive-accent)" : "var(--background-secondary)"};color:${on ? "var(--text-on-accent)" : "var(--text-muted)"};`;
      b.onclick = () => {
        this.filterMode = mode;
        this.render();
      };
    };
    mkToggle("This note", "note");
    mkToggle("All", "all");
    if (list.length === 0) {
      const hint = root.createEl("div", {
        text: this.filterMode === "note" && canFilter ? "No tracked words from this note yet. Click an English word in reading mode to add one." : "Click an English word in reading mode to start tracking."
      });
      hint.style.cssText = "font-size:0.85em;color:var(--text-muted);line-height:1.5;";
      return;
    }
    for (const entry of list) {
      const row = root.createEl("div");
      const isActive = entry.word.toLowerCase() === this.activeWord.toLowerCase();
      row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:7px 9px;margin-bottom:4px;border-radius:5px;cursor:pointer;background:${isActive ? "var(--interactive-accent)" : "var(--background-secondary)"};`;
      const left = row.createEl("span");
      const wordSpan = left.createEl("span", { text: entry.word });
      wordSpan.style.color = isActive ? "var(--text-on-accent)" : "var(--text-normal)";
      if (entry.level) {
        const badge = left.createEl("span", { text: entry.level });
        badge.style.cssText = `margin-left:5px;font-size:0.7em;padding:1px 5px;border-radius:3px;vertical-align:middle;background:${isActive ? "rgba(255,255,255,.25)" : "var(--interactive-accent)"};color:${isActive ? "var(--text-on-accent)" : "var(--text-on-accent)"};`;
      }
      const right = row.createEl("span");
      right.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
      const speak = right.createEl("span", { text: "\u{1F50A}" });
      speak.title = "Pronounce";
      speak.style.cssText = `cursor:pointer;font-size:0.95em;line-height:1;user-select:none;opacity:${isActive ? "1" : ".7"};`;
      speak.onclick = (e) => {
        e.stopPropagation();
        this.plugin.speakWord(entry);
      };
      const del = right.createEl("span", { text: "\xD7" });
      del.style.cssText = `color:${isActive ? "rgba(255,255,255,.6)" : "var(--text-muted)"};padding:0 3px;font-size:1.1em;line-height:1;cursor:pointer;`;
      del.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.deleteEntry(entry);
        if (this.activeWord.toLowerCase() === entry.word.toLowerCase())
          this.activeWord = "";
        this.render();
      };
      row.onclick = () => {
        this.activeWord = entry.word;
        this.render();
      };
    }
  }
  renderEntryForm(container, entry) {
    var _a;
    const sub = container.createEl("div");
    sub.style.cssText = "display:flex;align-items:center;gap:8px;margin:-4px 0 10px;";
    const subText = sub.createEl("span");
    subText.style.cssText = "font-size:0.82em;color:var(--text-muted);";
    subText.textContent = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  \xB7  ") || entry.word;
    const speak = sub.createEl("span", { text: "\u{1F50A}" });
    speak.title = "Pronounce";
    speak.style.cssText = "cursor:pointer;font-size:0.95em;line-height:1;user-select:none;";
    speak.onclick = () => this.plugin.speakWord(entry);
    const lvlWrap = container.createEl("div");
    lvlWrap.style.marginBottom = "8px";
    lvlWrap.createEl("div", { text: "Level" }).style.cssText = "font-size:0.75em;color:var(--text-muted);margin-bottom:3px;";
    const sel = lvlWrap.createEl("select");
    sel.style.cssText = "width:100%;padding:5px;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px;";
    for (const lvl of LEVELS) {
      const opt = sel.createEl("option", {
        text: lvl || "\u2014 not set \u2014",
        value: lvl
      });
      if (entry.level === lvl) opt.selected = true;
    }
    sel.onchange = async () => {
      entry.level = sel.value;
      await this.plugin.saveVocab();
      this.render();
    };
    const textFields = [
      { label: "Definition", key: "definition", multiline: true },
      { label: "Synonyms", key: "synonyms" },
      { label: "Antonyms", key: "antonyms" },
      { label: "Example sentence (from note)", key: "example", multiline: true },
      { label: "Grammar tips", key: "grammar" }
    ];
    for (const f of textFields) {
      const wrap = container.createEl("div");
      wrap.style.marginBottom = "7px";
      wrap.createEl("div", { text: f.label }).style.cssText = "font-size:0.75em;color:var(--text-muted);margin-bottom:3px;";
      const inp = wrap.createEl(f.multiline ? "textarea" : "input");
      if (!f.multiline) inp.type = "text";
      inp.value = String((_a = entry[f.key]) != null ? _a : "");
      inp.placeholder = f.label;
      inp.style.cssText = "width:100%;padding:5px;box-sizing:border-box;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px;font-size:0.9em;" + (f.multiline ? "resize:vertical;min-height:46px;font-family:inherit;line-height:1.4;" : "");
      inp.onchange = async () => {
        entry[f.key] = inp.value;
        await this.plugin.saveVocab();
      };
    }
    if (entry.source && entry.source.path) {
      const src = container.createEl("div");
      src.style.cssText = "font-size:0.8em;margin:8px 0 4px;cursor:pointer;color:var(--text-accent);";
      const name = entry.source.path.split("/").pop();
      src.textContent = `\u{1F4CD} ${name} : line ${entry.source.line + 1}`;
      src.title = "Jump to where this word was captured";
      src.onclick = () => this.plugin.jumpToSource(entry);
    }
    const meta = container.createEl("div");
    meta.style.cssText = "font-size:0.72em;color:var(--text-muted);margin:6px 0;";
    meta.textContent = `Added: ${entry.added}  \xB7  Reviewed: ${entry.lastReviewed} (${entry.reviews}\xD7)`;
    const btnRow = container.createEl("div");
    btnRow.style.cssText = "display:flex;gap:6px;";
    const btn = btnRow.createEl("button", { text: "\u2713 Mark as reviewed" });
    btn.style.cssText = "flex:1;padding:6px;cursor:pointer;border-radius:5px;font-size:0.88em;";
    btn.onclick = async () => {
      entry.lastReviewed = nowStamp();
      entry.reviews += 1;
      await this.plugin.saveVocab();
      this.render();
    };
    const fetchBtn = btnRow.createEl("button", { text: "\u{1F504} Fetch" });
    fetchBtn.title = "Fetch dictionary data (definition, synonyms, phonetic)";
    fetchBtn.style.cssText = "padding:6px 10px;cursor:pointer;border-radius:5px;font-size:0.88em;";
    fetchBtn.onclick = async () => {
      fetchBtn.textContent = "\u2026";
      fetchBtn.disabled = true;
      await this.plugin.enrichEntry(entry);
      this.render();
    };
  }
};
var VocabTrackerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.vocabData = { entries: [] };
  }
  async onload() {
    const saved = await this.loadData();
    if (saved) this.vocabData = saved;
    this.registerView(
      VOCAB_VIEW_TYPE,
      (leaf) => new VocabSidebarView(leaf, this)
    );
    this.registerMarkdownPostProcessor(this.processMarks.bind(this));
    this.registerDomEvent(document, "click", this.handleReadingClick.bind(this));
    this.registerMarkdownCodeBlockProcessor(
      "vocab-dashboard",
      this.renderDashboard.bind(this)
    );
    this.addCommand({
      id: "open-vocab-sidebar",
      name: "Open Vocab Sidebar",
      callback: () => this.activateSidebar()
    });
    this.addCommand({
      id: "open-vocab-list",
      name: "Open Vocab List",
      callback: () => this.openVocabFile()
    });
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
  async activateSidebar() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf("split");
      await leaf.setViewState({ type: VOCAB_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf;
  }
  async openVocabFile() {
    await this.ensureVocabFile();
    const file = this.app.vault.getAbstractFileByPath(VOCAB_FILE);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
  async ensureVocabFile() {
    if (!this.app.vault.getAbstractFileByPath(VOCAB_FILE)) {
      await this.app.vault.create(
        VOCAB_FILE,
        "# Vocabulary List\n\n> Click a row to expand its details. Edit fields inline and they save automatically.\n\n```vocab-dashboard\n```\n"
      );
    }
  }
  // ── Click any English word in reading mode ─────────────────────
  handleReadingClick(evt) {
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
    const menu = new import_obsidian.Menu();
    menu.addItem((item) => {
      item.setTitle(
        exists ? `Open "${word}" in Vocab Tracker` : `Add "${word}" to Vocab Tracker`
      );
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        new import_obsidian.Notice(added ? `Added "${word}" to vocab list` : `Opened "${word}"`);
      });
    });
    menu.showAtMouseEvent(evt);
  }
  getWordContext(x, y) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      const cp = document.caretPositionFromPoint(x, y);
      if (cp) {
        node = cp.offsetNode;
        offset = cp.offset;
      }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return { word: "", sentence: "" };
    const text = node.textContent || "";
    const isWordChar = (c) => c !== void 0 && /[A-Za-z'\-]/.test(c);
    let start = offset;
    let end = offset;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    const word = text.slice(start, end).replace(/^[-']+|[-']+$/g, "");
    if (!/^[A-Za-z][A-Za-z'\-]*$/.test(word)) return { word: "", sentence: "" };
    const sentence = this.extractSentence(text, start, end, node);
    return { word, sentence };
  }
  extractSentence(text, start, end, node) {
    let s = start;
    let e = end;
    while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
    while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
    if (e < text.length && /[.!?]/.test(text[e])) e++;
    let sentence = text.slice(s, e).trim();
    if ((s > 0 || e < text.length) && node && node.parentElement) {
      return sentence;
    }
    const block = node && node.parentElement && node.parentElement.closest("p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6");
    if (block) {
      const full = (block.textContent || "").replace(/\s+/g, " ").trim();
      if (full.length <= 400) return full;
    }
    return sentence;
  }
  async addWordToVocab(word, ctx = {}) {
    const { entries } = this.vocabData;
    const existing = entries.find(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );
    let source = null;
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      const content = await this.app.vault.read(file);
      const line = this.findSourceLine(content, word, ctx.sentence);
      source = { path: file.path, line: line < 0 ? 0 : line };
      const updated = this.wrapOutsideCode(content, this.buildWordRe(word));
      if (updated !== content) await this.app.vault.modify(file, updated);
    }
    if (!existing) {
      const entry = {
        id: String(Date.now()),
        word,
        level: "",
        synonyms: "",
        antonyms: "",
        example: ctx.sentence || "",
        definition: "",
        phonetic: "",
        partOfSpeech: "",
        grammar: "",
        source,
        added: nowStamp(),
        lastReviewed: nowStamp(),
        reviews: 0
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
    leaf.view.setWord(word);
    return existing == null;
  }
  buildWordRe(word) {
    return new RegExp(
      `(?<![A-Za-z0-9'=\\-])${escapeRe(word)}(?![A-Za-z0-9'=\\-])`,
      "gi"
    );
  }
  // ── Locate the clicked word's line in the note's source ────────
  findSourceLine(content, word, sentence) {
    const lines = content.split("\n");
    const wordRe = new RegExp(
      `(?<![A-Za-z0-9'\\-])${escapeRe(word)}(?![A-Za-z0-9'\\-])`,
      "i"
    );
    const candidates = [];
    for (let i = 0; i < lines.length; i++) {
      if (wordRe.test(lines[i])) candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    if (candidates.length === 1 || !sentence) return candidates[0];
    const sentWords = new Set(sentence.toLowerCase().match(/[a-z']+/g) || []);
    let best = candidates[0];
    let bestScore = -1;
    for (const i of candidates) {
      const lw = lines[i].toLowerCase().match(/[a-z']+/g) || [];
      let score = 0;
      for (const w of lw) if (sentWords.has(w)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }
  async jumpToSource(entry) {
    if (!entry.source || !entry.source.path) return;
    const file = this.app.vault.getAbstractFileByPath(entry.source.path);
    if (!file) {
      new import_obsidian.Notice("Source note not found: " + entry.source.path);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: entry.source.line } });
  }
  // ── Pronounce a word ───────────────────────────────────────────
  speakWord(entry) {
    if (entry.audio) {
      const a = new Audio(entry.audio);
      a.play().catch(() => this.speakSynth(entry.word));
      return;
    }
    this.speakSynth(entry.word);
  }
  speakSynth(word) {
    if (!("speechSynthesis" in window)) {
      new import_obsidian.Notice("No pronunciation available on this device.");
      return;
    }
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  // ── Auto-fetch dictionary data (Free Dictionary API) ───────────
  async enrichEntry(entry) {
    try {
      const data = await this.fetchDictionary(entry.word);
      if (!data) return;
      if (!entry.phonetic) entry.phonetic = data.phonetic;
      if (!entry.audio) entry.audio = data.audio;
      if (!entry.partOfSpeech) entry.partOfSpeech = data.partOfSpeech;
      if (!entry.definition) entry.definition = data.definition;
      if (!entry.synonyms) entry.synonyms = data.synonyms.join(", ");
      if (!entry.antonyms) entry.antonyms = data.antonyms.join(", ");
      await this.saveVocab();
      const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
      const view = leaf && leaf.view;
      if (view && view.activeWord && view.activeWord.toLowerCase() === entry.word.toLowerCase()) {
        view.render();
      }
    } catch (e) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
    }
  }
  async fetchDictionary(word) {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`;
    const res = await (0, import_obsidian.requestUrl)({ url, throw: false });
    if (res.status !== 200) return null;
    const arr = res.json;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const first = arr[0];
    let phonetic = first.phonetic || "";
    let audio = "";
    if (Array.isArray(first.phonetics)) {
      if (!phonetic) {
        const p = first.phonetics.find((p2) => p2.text);
        if (p) phonetic = p.text;
      }
      const a = first.phonetics.find((p) => p.audio);
      if (a) audio = a.audio;
    }
    const meanings = first.meanings || [];
    const partOfSpeech = meanings.length ? meanings[0].partOfSpeech || "" : "";
    let definition = "";
    for (const m of meanings) {
      const d = (m.definitions || []).find((d2) => d2.definition);
      if (d) {
        definition = d.definition;
        break;
      }
    }
    const syn = /* @__PURE__ */ new Set();
    const ant = /* @__PURE__ */ new Set();
    for (const m of meanings) {
      (m.synonyms || []).forEach((s) => syn.add(s));
      (m.antonyms || []).forEach((a) => ant.add(a));
      for (const d of m.definitions || []) {
        (d.synonyms || []).forEach((s) => syn.add(s));
        (d.antonyms || []).forEach((a) => ant.add(a));
      }
    }
    return {
      phonetic,
      audio,
      partOfSpeech,
      definition,
      synonyms: [...syn].slice(0, 8),
      antonyms: [...ant].slice(0, 8)
    };
  }
  refreshSidebar() {
    var _a;
    const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) return;
    const path = ((_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) || "";
    const view = leaf.view;
    if (view._lastFilePath === path) return;
    view._lastFilePath = path;
    view.render();
  }
  // ── ==Highlight== helpers, skipping code spans and fences ──────
  wrapOutsideCode(content, re) {
    return this.replaceOutsideCode(content, re, "==$&==");
  }
  replaceOutsideCode(content, re, repl) {
    const lines = content.split("\n");
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      lines[i] = lines[i].replace(
        /(`[^`]*`)|([^`]+)/g,
        (_m, code, text) => code != null ? code : text.replace(re, repl)
      );
    }
    return lines.join("\n");
  }
  // ── Delete a tracked word and remove its ==highlight== ─────────
  async deleteEntry(entry) {
    this.vocabData.entries = this.vocabData.entries.filter(
      (e) => e.id !== entry.id
    );
    await this.saveVocab();
    if (entry.source && entry.source.path) {
      await this.unhighlightWord(entry.word, entry.source.path);
    }
  }
  async unhighlightWord(word, path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || file.extension !== "md") return;
    const re = new RegExp(`==(${escapeRe(word)})==`, "gi");
    const content = await this.app.vault.read(file);
    const updated = this.replaceOutsideCode(content, re, "$1");
    if (updated !== content) await this.app.vault.modify(file, updated);
  }
  // ── Mark click handler ─────────────────────────────────────────
  processMarks(el, _ctx) {
    el.querySelectorAll("mark").forEach((mark) => {
      var _a, _b;
      const word = (_b = (_a = mark.textContent) == null ? void 0 : _a.trim()) != null ? _b : "";
      if (!word) return;
      mark.style.cursor = "pointer";
      mark.title = `Track "${word}" in Vocab Tracker`;
      mark.addEventListener("click", async () => {
        const leaf = await this.activateSidebar();
        leaf.view.setWord(word);
      });
    });
  }
  // ── vocab-dashboard renderer ───────────────────────────────────
  renderDashboard(_source, el, _ctx) {
    const { entries } = this.vocabData;
    el.style.fontFamily = "inherit";
    if (entries.length === 0) {
      el.createEl("p", {
        text: "No words yet. Highlight ==words== in your notes and click them to start tracking."
      }).style.color = "var(--text-muted)";
      return;
    }
    const stats = el.createEl("div");
    stats.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;";
    stats.createEl("span", {
      text: `\u{1F4DA} ${entries.length} word${entries.length !== 1 ? "s" : ""}`
    }).style.cssText = "padding:3px 10px;background:var(--background-secondary);border-radius:12px;font-size:0.82em;";
    for (const lvl of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
      const n = entries.filter((e) => e.level === lvl).length;
      if (!n) continue;
      const b = stats.createEl("span", { text: `${lvl}: ${n}` });
      b.style.cssText = "padding:3px 10px;background:var(--interactive-accent);color:var(--text-on-accent);border-radius:12px;font-size:0.82em;";
    }
    const search = el.createEl("input");
    search.placeholder = "Search words\u2026";
    search.style.cssText = "width:100%;padding:6px;box-sizing:border-box;margin-bottom:10px;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px;";
    const tableWrap = el.createEl("div");
    const draw = (q) => {
      tableWrap.empty();
      const rows = entries.filter(
        (e) => e.word.toLowerCase().includes(q.toLowerCase())
      );
      const tbl = tableWrap.createEl("table");
      tbl.style.cssText = "width:100%;border-collapse:collapse;";
      const hdrRow = tbl.createEl("thead").createEl("tr");
      for (const h of ["Word", "Level", "Last Reviewed", "Reviews"]) {
        const th = hdrRow.createEl("th", { text: h });
        th.style.cssText = "text-align:left;padding:6px 8px;border-bottom:2px solid var(--background-modifier-border);font-size:0.8em;color:var(--text-muted);font-weight:600;";
      }
      const tbody = tbl.createEl("tbody");
      for (const entry of rows) {
        const tr = tbody.createEl("tr");
        tr.style.cursor = "pointer";
        tr.onmouseenter = () => tr.style.background = "var(--background-secondary)";
        tr.onmouseleave = () => tr.style.background = "";
        const wTd = tr.createEl("td");
        wTd.style.cssText = "padding:8px;font-weight:500;";
        wTd.textContent = entry.word;
        const lTd = tr.createEl("td");
        lTd.style.padding = "8px";
        if (entry.level) {
          const b = lTd.createEl("span", { text: entry.level });
          b.style.cssText = "padding:2px 6px;background:var(--interactive-accent);color:var(--text-on-accent);border-radius:3px;font-size:0.78em;font-weight:600;";
        } else {
          lTd.style.color = "var(--text-muted)";
          lTd.textContent = "\u2014";
        }
        tr.createEl("td", { text: entry.lastReviewed }).style.cssText = "padding:8px;font-size:0.85em;color:var(--text-muted);";
        tr.createEl("td", { text: String(entry.reviews) }).style.cssText = "padding:8px;font-size:0.85em;color:var(--text-muted);";
        const dtr = tbody.createEl("tr");
        dtr.style.display = "none";
        const dtd = dtr.createEl("td");
        dtd.setAttribute("colspan", "4");
        dtd.style.cssText = "padding:12px 16px;background:var(--background-secondary);border-bottom:1px solid var(--background-modifier-border);";
        tr.onclick = () => {
          const open = dtr.style.display !== "none";
          if (open) {
            dtr.style.display = "none";
            return;
          }
          dtd.empty();
          dtr.style.display = "";
          const sub = dtd.createEl("div");
          sub.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
          const subText = sub.createEl("span");
          subText.style.cssText = "font-size:0.82em;color:var(--text-muted);";
          subText.textContent = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  \xB7  ") || entry.word;
          const speak = sub.createEl("span", { text: "\u{1F50A}" });
          speak.title = "Pronounce";
          speak.style.cssText = "cursor:pointer;font-size:0.95em;line-height:1;user-select:none;";
          speak.onclick = () => this.speakWord(entry);
          const grid = dtd.createEl("div");
          grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;";
          const mkField = (label, key, opts = {}) => {
            var _a;
            const wrap = grid.createEl("div");
            if (opts.full) wrap.style.gridColumn = "1 / -1";
            wrap.createEl("div", { text: label }).style.cssText = "font-size:0.75em;color:var(--text-muted);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;";
            const inp = wrap.createEl(opts.multiline ? "textarea" : "input");
            if (!opts.multiline) inp.type = "text";
            inp.value = String((_a = entry[key]) != null ? _a : "");
            inp.placeholder = `Add ${label.toLowerCase()}\u2026`;
            inp.style.cssText = "width:100%;padding:5px;box-sizing:border-box;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px;font-size:0.9em;" + (opts.multiline ? "resize:vertical;min-height:46px;font-family:inherit;line-height:1.4;" : "");
            inp.onchange = async () => {
              entry[key] = inp.value;
              await this.saveVocab();
            };
          };
          mkField("Definition", "definition", { full: true, multiline: true });
          mkField("Synonyms", "synonyms");
          mkField("Antonyms", "antonyms");
          mkField("Example sentence (from note)", "example", { full: true, multiline: true });
          mkField("Grammar tips", "grammar", { full: true });
          const lvlWrap = grid.createEl("div");
          lvlWrap.style.gridColumn = "1 / -1";
          lvlWrap.createEl("div", { text: "Level" }).style.cssText = "font-size:0.75em;color:var(--text-muted);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;";
          const sel = lvlWrap.createEl("select");
          sel.style.cssText = "padding:5px 8px;background:var(--background-primary);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px;";
          for (const lvl of LEVELS) {
            const opt = sel.createEl("option", {
              text: lvl || "\u2014 not set \u2014",
              value: lvl
            });
            if (entry.level === lvl) opt.selected = true;
          }
          sel.onchange = async () => {
            entry.level = sel.value;
            await this.saveVocab();
            draw(search.value);
          };
          if (entry.source && entry.source.path) {
            const src = dtd.createEl("div");
            src.style.cssText = "font-size:0.8em;margin:2px 0 8px;cursor:pointer;color:var(--text-accent);";
            const name = entry.source.path.split("/").pop();
            src.textContent = `\u{1F4CD} ${name} : line ${entry.source.line + 1}`;
            src.onclick = () => this.jumpToSource(entry);
          }
          const footer = dtd.createEl("div");
          footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;";
          footer.createEl("span", {
            text: `Added: ${entry.added}`
          }).style.cssText = "font-size:0.75em;color:var(--text-muted);";
          const btnGroup = footer.createEl("div");
          btnGroup.style.cssText = "display:flex;gap:6px;flex-shrink:0;";
          const fetchBtn = btnGroup.createEl("button", { text: "\u{1F504} Fetch" });
          fetchBtn.style.cssText = "padding:3px 10px;border:1px solid var(--background-modifier-border);background:transparent;border-radius:4px;cursor:pointer;font-size:0.82em;";
          fetchBtn.onclick = async () => {
            fetchBtn.textContent = "\u2026";
            await this.enrichEntry(entry);
            draw(search.value);
          };
          const delBtn = btnGroup.createEl("button", { text: "Delete word" });
          delBtn.style.cssText = "padding:3px 10px;color:var(--text-error);background:transparent;border:1px solid var(--text-error);border-radius:4px;cursor:pointer;font-size:0.82em;";
          delBtn.onclick = async () => {
            await this.deleteEntry(entry);
            draw(search.value);
          };
        };
      }
    };
    draw("");
    search.oninput = () => draw(search.value);
  }
};

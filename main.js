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
var import_obsidian2 = require("obsidian");

// src/core/text/wordRe.ts
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildWordRe(word) {
  return new RegExp(
    `(?<![A-Za-z0-9'=\\-])${escapeRe(word)}(?![A-Za-z0-9'=\\-])`,
    "gi"
  );
}

// src/core/text/outsideCode.ts
function replaceOutsideCode(content, re, repl) {
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
function wrapOutsideCode(content, re) {
  return replaceOutsideCode(content, re, "==$&==");
}

// src/core/text/sentence.ts
function extractSentence(text, start, end, node) {
  let s = start;
  let e = end;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  if (e < text.length && /[.!?]/.test(text[e])) e++;
  const sentence = text.slice(s, e).trim();
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

// src/core/text/sourceLine.ts
function findSourceLine(content, word, sentence) {
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

// src/platform/ObsidianHttp.ts
var import_obsidian = require("obsidian");
var ObsidianHttp = class {
  encodeQueryParam(text) {
    return import_obsidian.Platform.isMobile ? text : encodeURIComponent(text);
  }
  async get(url) {
    const res = await (0, import_obsidian.requestUrl)({ url, throw: false });
    return {
      status: res.status,
      get json() {
        return res.json;
      }
    };
  }
};

// src/core/errorMessage.ts
function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/services/dictionary/sources/wiktionary.ts
async function fetchWiktionaryDefinition(http, w) {
  var _a, _b;
  let res;
  try {
    res = await http.get(`https://en.wiktionary.org/api/rest_v1/page/definition/${http.encodeQueryParam(w)}`);
  } catch (e) {
    throw new Error(`Wiktionary request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status === 404) throw new Error(`"${w}" not found in dictionary`);
  if (res.status !== 200) throw new Error(`Wiktionary API returned HTTP ${res.status}`);
  let data;
  try {
    data = res.json;
  } catch (e) {
    throw new Error("couldn't parse Wiktionary response", { cause: e });
  }
  const entries = Array.isArray(data == null ? void 0 : data.en) ? data.en : [];
  const entry = entries.find((en) => {
    var _a2, _b2;
    return (_b2 = (_a2 = en.definitions) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.definition;
  });
  if (!entry) throw new Error(`"${w}" not found in dictionary`);
  const rawDefinition = ((_b = (_a = entry.definitions) == null ? void 0 : _a[0]) == null ? void 0 : _b.definition) || "";
  const definition = rawDefinition.replace(/<[^>]+>/g, "").trim();
  const partOfSpeech = (entry.partOfSpeech || "").toLowerCase();
  return { definition, partOfSpeech };
}

// src/services/dictionary/sources/datamuse.ts
var POS_MAP = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: ""
};
async function fetchDatamuseDefinition(http, w) {
  var _a, _b, _c;
  let res;
  try {
    res = await http.get(`https://api.datamuse.com/words?sp=${http.encodeQueryParam(w)}&md=d&max=1`);
  } catch (e) {
    throw new Error(`Datamuse request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`Datamuse API returned HTTP ${res.status}`);
  let arr;
  try {
    arr = res.json;
  } catch (e) {
    throw new Error("couldn't parse Datamuse response", { cause: e });
  }
  const defs = Array.isArray(arr) && Array.isArray((_a = arr[0]) == null ? void 0 : _a.defs) ? arr[0].defs : [];
  if (defs.length === 0) throw new Error(`"${w}" not found in dictionary`);
  const [posTag, definition] = defs[0].split("	");
  const partOfSpeech = (_c = (_b = POS_MAP[posTag]) != null ? _b : posTag) != null ? _c : "";
  return { definition: (definition || "").trim(), partOfSpeech };
}
async function fetchDatamuseRelated(http, w, rel) {
  try {
    const res = await http.get(`https://api.datamuse.com/words?${rel}=${http.encodeQueryParam(w)}&max=8`);
    const json = res.json;
    if (res.status !== 200 || !Array.isArray(json)) return [];
    return json.map((entry) => entry.word);
  } catch (e) {
    return [];
  }
}

// src/services/dictionary/translate/validate.ts
function looksLikeValidTranslation(s) {
  return s.length > 0 && !/%[0-9A-Fa-f]{2}/.test(s);
}

// src/services/dictionary/translate/google.ts
async function translateWithGoogle(http, text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${http.encodeQueryParam(text)}`;
  let res;
  try {
    res = await http.get(url);
  } catch (e) {
    throw new Error(`Google Translate request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`Google Translate returned HTTP ${res.status}`);
  let data;
  try {
    data = res.json;
  } catch (e) {
    throw new Error("couldn't parse Google Translate response", { cause: e });
  }
  const segments = Array.isArray(data == null ? void 0 : data[0]) ? data[0] : [];
  const translated = segments.map((seg) => (seg == null ? void 0 : seg[0]) || "").join("");
  if (!looksLikeValidTranslation(translated)) throw new Error("empty or corrupted translation");
  return translated;
}

// src/services/dictionary/translate/mymemory.ts
async function translateWithMyMemory(http, text) {
  var _a;
  const url = `https://api.mymemory.translated.net/get?q=${http.encodeQueryParam(text)}&langpair=en|zh-TW`;
  let res;
  try {
    res = await http.get(url);
  } catch (e) {
    throw new Error(`MyMemory request failed (${errorMessage(e)})`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`MyMemory returned HTTP ${res.status}`);
  let data;
  try {
    data = res.json;
  } catch (e) {
    throw new Error("couldn't parse MyMemory response", { cause: e });
  }
  const translated = ((_a = data == null ? void 0 : data.responseData) == null ? void 0 : _a.translatedText) || "";
  if (!looksLikeValidTranslation(translated)) throw new Error("empty or corrupted translation");
  return translated;
}

// src/services/dictionary/DictionaryService.ts
var DictionaryService = class {
  constructor(http) {
    this.http = http;
  }
  // Wiktionary first, Datamuse as fallback for the definition; Datamuse
  // always supplies synonyms/antonyms. All three requests run concurrently.
  async fetchDictionary(word) {
    const w = word.toLowerCase();
    const defPromise = this.fetchDefinition(w);
    const synPromise = fetchDatamuseRelated(this.http, w, "rel_syn");
    const antPromise = fetchDatamuseRelated(this.http, w, "rel_ant");
    const { definition, partOfSpeech } = await defPromise;
    const definitionZh = await this.translateToZhTW(definition);
    const synonyms = await synPromise;
    const antonyms = await antPromise;
    return { phonetic: "", audio: "", partOfSpeech, definition, definitionZh, synonyms, antonyms };
  }
  // Translation is a bonus — failure here must not sink the definition
  // fetch, so it soft-fails to "".
  async translateToZhTW(text) {
    if (!text) return "";
    try {
      return await translateWithGoogle(this.http, text);
    } catch (primaryErr) {
      try {
        return await translateWithMyMemory(this.http, text);
      } catch (fallbackErr) {
        console.error("Vocab Tracker: translation failed", primaryErr, fallbackErr);
        return "";
      }
    }
  }
  async fetchDefinition(w) {
    try {
      return await fetchWiktionaryDefinition(this.http, w);
    } catch (primaryErr) {
      try {
        return await fetchDatamuseDefinition(this.http, w);
      } catch (fallbackErr) {
        throw new Error(
          `${errorMessage(primaryErr)}; fallback also failed: ${errorMessage(fallbackErr)}`,
          { cause: fallbackErr }
        );
      }
    }
  }
};

// src/core/events.ts
var TypedEmitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(event, fn) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    var _a;
    (_a = this.listeners.get(event)) == null ? void 0 : _a.delete(fn);
  }
  emit(event, payload) {
    var _a;
    for (const fn of (_a = this.listeners.get(event)) != null ? _a : []) fn(payload);
  }
};

// src/core/store/VocabStore.ts
var VocabStore = class {
  constructor(data, persist) {
    this.data = data;
    this.persist = persist;
    this.events = new TypedEmitter();
  }
  get vocabData() {
    return this.data;
  }
  async save() {
    await this.persist(this.data);
    this.events.emit("data:changed", this.data);
  }
  // Used by onExternalSettingsChange (multi-device sync) once that exists.
  replace(data) {
    this.data = data;
    this.events.emit("data:changed", this.data);
  }
};

// main.ts
var VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";
var VOCAB_FOLDER = "vocab-list";
var VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
var VOCAB_FILE_LEGACY = "vocab-list.md";
function nowStamp() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function autoGrowTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
var VocabSidebarView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    // Word clicked via a plain ==mark== that isn't tracked yet — prompts an
    // "add to vocab" banner instead of a full row (see processMarks).
    this.pendingWord = "";
    this.expandState = /* @__PURE__ */ new Map();
    this.collapsedGroups = /* @__PURE__ */ new Set();
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
  // Called when a tracked word is clicked (reading-mode word / ==mark==).
  // Expands its row in place rather than opening a separate card.
  setWord(word) {
    const entry = this.plugin.vocabData.entries.find(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );
    if (entry) {
      if (this.expandState.get(entry.id) === void 0) {
        this.expandState.set(entry.id, "half");
      }
      this.pendingWord = "";
    } else {
      this.pendingWord = word;
    }
    this.render();
  }
  render() {
    var _a;
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("vocab-tracker-sidebar");
    const header = root.createEl("div", { cls: "vocab-tracker-header" });
    header.createEl("h4", { text: "Vocab Tracker" });
    const openList = header.createEl("span", { text: "\u{1F4C4}", cls: "vocab-tracker-icon-btn" });
    openList.title = "Open vocab-list.md";
    openList.onclick = () => this.plugin.openVocabFile();
    const { entries } = this.plugin.vocabData;
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vocab-tracker-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vocab-tracker-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: "+ Add to vocab list", cls: "vocab-tracker-btn" });
      addBtn.onclick = async () => {
        await this.plugin.addWordToVocab(this.pendingWord);
      };
      const dismiss = banner.createEl("span", { text: "\xD7", cls: "vocab-tracker-close-btn" });
      dismiss.onclick = () => {
        this.pendingWord = "";
        this.render();
      };
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
    const listHeader = root.createEl("div", { cls: "vocab-tracker-list-header" });
    const countLabel = listHeader.createEl("div", { cls: "vocab-tracker-count-label" });
    countLabel.textContent = `${scopeLabel} (${list.length})`;
    const toggle = listHeader.createEl("div", { cls: "vocab-tracker-toggle-group" });
    const mkToggle = (label, mode) => {
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
        text: this.filterMode === "note" && canFilter ? "No tracked words from this note yet. Click an English word in reading mode to add one." : "Click an English word in reading mode to start tracking.",
        cls: "vocab-tracker-hint"
      });
      return;
    }
    const listEl = root.createEl("div", { cls: "vocab-tracker-list" });
    if (this.filterMode === "all") {
      this.plugin.renderGroupedVocabList(
        listEl,
        list,
        this.collapsedGroups,
        this.expandState,
        () => this.render()
      );
    } else {
      for (const entry of list) {
        const state = (_a = this.expandState.get(entry.id)) != null ? _a : "collapsed";
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
};
var VocabTrackerPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.vocabData = { entries: [] };
  }
  async onload() {
    const saved = await this.loadData();
    if (saved) this.vocabData = saved;
    this.store = new VocabStore(this.vocabData, (data) => this.saveData(data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
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
    await this.store.save();
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
    if (this.app.vault.getAbstractFileByPath(VOCAB_FILE)) return;
    if (!this.app.vault.getAbstractFileByPath(VOCAB_FOLDER)) {
      await this.app.vault.createFolder(VOCAB_FOLDER);
    }
    const legacy = this.app.vault.getAbstractFileByPath(VOCAB_FILE_LEGACY);
    if (legacy instanceof import_obsidian2.TFile) {
      await this.app.fileManager.renameFile(legacy, VOCAB_FILE);
      return;
    }
    await this.app.vault.create(
      VOCAB_FILE,
      "# Vocabulary List\n\n> Click a row to expand its details. Edit fields inline and they save automatically.\n\n```vocab-dashboard\n```\n"
    );
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
    const menu = new import_obsidian2.Menu();
    menu.addItem((item) => {
      item.setTitle(
        exists ? `Open "${word}" in Vocab Tracker` : `Add "${word}" to Vocab Tracker`
      );
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        new import_obsidian2.Notice(added ? `Added "${word}" to vocab list` : `Opened "${word}"`);
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
    const sentence = extractSentence(text, start, end, node);
    return { word, sentence };
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
      const line = findSourceLine(content, word, ctx.sentence);
      source = { path: file.path, line: line < 0 ? 0 : line };
      const updated = wrapOutsideCode(content, buildWordRe(word));
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
        definitionZh: "",
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
  async jumpToSource(entry) {
    if (!entry.source || !entry.source.path) return;
    const file = this.app.vault.getAbstractFileByPath(entry.source.path);
    if (!file) {
      new import_obsidian2.Notice("Source note not found: " + entry.source.path);
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
      new import_obsidian2.Notice("No pronunciation available on this device.");
      return;
    }
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  // ── Auto-fetch dictionary data (Wiktionary, falls back to Datamuse) ──
  async enrichEntry(entry, opts = {}) {
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
      const view = leaf && leaf.view;
      if (view) view.render();
      if (opts.verbose) new import_obsidian2.Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      new import_obsidian2.Notice(`Vocab Tracker: couldn't fetch "${entry.word}" \u2014 ${(e == null ? void 0 : e.message) || e}`);
    }
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
  renderVocabRow(container, entry, state, setState, refresh) {
    const row = container.createEl("div", { cls: "vocab-tracker-row" });
    row.toggleClass("is-expanded", state !== "collapsed");
    const head = row.createEl("div", { cls: "vocab-tracker-row-header" });
    const del = head.createEl("span", { text: "\u2715", cls: "vocab-tracker-row-delete" });
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
      text: state === "collapsed" ? "\u2303" : "\u2335",
      cls: "vocab-tracker-row-arrow"
    });
    arrow.title = state === "collapsed" ? "Expand" : "Collapse";
    head.onclick = () => {
      setState(state === "collapsed" ? "half" : "collapsed");
      refresh();
    };
    if (state === "collapsed") {
      const speak2 = head.createEl("span", {
        text: "\u{1F50A}",
        cls: ["vocab-tracker-speak-icon", "vocab-tracker-row-speak"]
      });
      speak2.title = "Pronounce";
      speak2.onclick = (e) => {
        e.stopPropagation();
        this.speakWord(entry);
      };
      return;
    }
    const body = row.createEl("div", { cls: "vocab-tracker-row-body" });
    const subText = body.createEl("div", { cls: "vocab-tracker-form-subtext" });
    subText.textContent = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  \xB7  ") || entry.word;
    const mkField = (label, key, opts = {}) => {
      var _a;
      const value = String((_a = entry[key]) != null ? _a : "");
      const wrap = body.createEl("div", { cls: "vocab-tracker-field" });
      if (value) wrap.addClass("is-filled");
      const cls = ["vocab-tracker-input", "vocab-tracker-field-box"];
      if (opts.multiline) cls.push("vocab-tracker-textarea");
      const inp = wrap.createEl(opts.multiline ? "textarea" : "input", { cls });
      if (!opts.multiline) inp.type = "text";
      else inp.rows = 1;
      inp.value = value;
      inp.placeholder = `Add ${label.toLowerCase()}\u2026`;
      inp.onclick = (e) => e.stopPropagation();
      if (opts.multiline) {
        autoGrowTextarea(inp);
        inp.addEventListener("input", () => autoGrowTextarea(inp));
      }
      inp.onchange = async () => {
        entry[key] = inp.value;
        await this.saveVocab();
        refresh();
      };
    };
    mkField("Synonyms", "synonyms", { multiline: true });
    mkField("Definition", "definition", { multiline: true });
    mkField("\u4E2D\u6587\u7FFB\u8BD1", "definitionZh", { multiline: true });
    if (state === "full") {
      if (entry.antonyms) mkField("Antonyms", "antonyms");
      mkField("Example sentence (from note)", "example", { multiline: true });
      mkField("Grammar tips", "grammar");
      if (entry.source && entry.source.path) {
        const src = body.createEl("div", { cls: "vocab-tracker-source-link" });
        const name = entry.source.path.split("/").pop();
        src.textContent = `\u{1F4CD} ${name} : line ${entry.source.line + 1}`;
        src.title = "Jump to where this word was captured";
        src.onclick = (e) => {
          e.stopPropagation();
          this.jumpToSource(entry);
        };
      }
      body.createEl("div", { text: `Added: ${entry.added}`, cls: "vocab-tracker-meta" });
      body.createEl("div", {
        text: `Reviewed: ${entry.lastReviewed} (${entry.reviews}\xD7)`,
        cls: "vocab-tracker-meta"
      });
      mkField("Level", "level", { multiline: true });
    }
    const footer = body.createEl("div", { cls: "vocab-tracker-row-footer" });
    const moreBtn = footer.createEl("span", {
      text: state === "full" ? "\u2335" : "\u2139\uFE0F",
      cls: "vocab-tracker-footer-icon"
    });
    moreBtn.title = state === "full" ? "Show less" : "Show more";
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      setState(state === "full" ? "half" : "full");
      refresh();
    };
    const actions = footer.createEl("span", { cls: "vocab-tracker-row-footer-actions" });
    const fetchBtn = actions.createEl("span", { text: "\u{1F504}", cls: "vocab-tracker-footer-icon" });
    fetchBtn.title = "Fetch dictionary data (definition, synonyms, phonetic)";
    fetchBtn.onclick = async (e) => {
      e.stopPropagation();
      fetchBtn.textContent = "\u2026";
      await this.enrichEntry(entry, { verbose: true });
      refresh();
    };
    const reviewBtn = actions.createEl("span", { text: "\u2713", cls: "vocab-tracker-footer-icon" });
    reviewBtn.title = "Mark as reviewed";
    reviewBtn.onclick = async (e) => {
      e.stopPropagation();
      entry.lastReviewed = nowStamp();
      entry.reviews += 1;
      await this.saveVocab();
      refresh();
    };
    const speak = actions.createEl("span", { text: "\u{1F50A}", cls: "vocab-tracker-speak-icon" });
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
  renderGroupedVocabList(container, rows, collapsedGroups, expandState, refresh) {
    var _a, _b;
    const groups = /* @__PURE__ */ new Map();
    for (const entry of rows) {
      const title = ((_a = entry.source) == null ? void 0 : _a.path) ? entry.source.path.split("/").pop().replace(/\.md$/, "") : "(no note)";
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(entry);
    }
    const titles = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    for (const title of titles) {
      const groupRows = groups.get(title);
      const isCollapsed = collapsedGroups.has(title);
      const heading = container.createEl("div", { cls: "vocab-tracker-group-heading" });
      heading.createEl("span", {
        text: isCollapsed ? "\u2303" : "\u2335",
        cls: "vocab-tracker-group-arrow"
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
        const state = (_b = expandState.get(entry.id)) != null ? _b : "collapsed";
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
  processMarks(el, _ctx) {
    el.querySelectorAll("mark").forEach((mark) => {
      var _a, _b;
      const word = (_b = (_a = mark.textContent) == null ? void 0 : _a.trim()) != null ? _b : "";
      if (!word) return;
      mark.addClass("vocab-tracker-tracked-mark");
      mark.title = `Track "${word}" in Vocab Tracker`;
      mark.addEventListener("click", async () => {
        const leaf = await this.activateSidebar();
        leaf.view.setWord(word);
      });
    });
  }
  // ── vocab-dashboard renderer ───────────────────────────────────
  renderDashboard(_source, el, _ctx) {
    var _a;
    const { entries } = this.vocabData;
    el.addClass("vocab-tracker-dashboard");
    if (entries.length === 0) {
      el.createEl("p", {
        text: "No words yet. Highlight ==words== in your notes and click them to start tracking.",
        cls: "vocab-tracker-empty-state"
      });
      return;
    }
    const stats = el.createEl("div", { cls: "vocab-tracker-stats" });
    stats.createEl("span", {
      text: `\u{1F4DA} ${entries.length} word${entries.length !== 1 ? "s" : ""}`,
      cls: "vocab-tracker-stat-pill"
    });
    const tagCounts = /* @__PURE__ */ new Map();
    for (const e of entries) {
      for (const tag of e.level.split(",").map((t) => t.trim()).filter(Boolean)) {
        tagCounts.set(tag, ((_a = tagCounts.get(tag)) != null ? _a : 0) + 1);
      }
    }
    for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
      stats.createEl("span", {
        text: `${tag}: ${n}`,
        cls: ["vocab-tracker-stat-pill", "is-accent"]
      });
    }
    const search = el.createEl("input", { cls: ["vocab-tracker-search-input", "vocab-tracker-field-box"] });
    search.placeholder = "Search words\u2026";
    const listWrap = el.createEl("div", { cls: "vocab-tracker-list" });
    const expandState = /* @__PURE__ */ new Map();
    const collapsedGroups = /* @__PURE__ */ new Set();
    const draw = (q) => {
      listWrap.empty();
      const rows = entries.filter(
        (e) => e.word.toLowerCase().includes(q.toLowerCase())
      );
      this.renderGroupedVocabList(listWrap, rows, collapsedGroups, expandState, () => draw(search.value));
    };
    draw("");
    search.oninput = () => draw(search.value);
  }
};

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian9 = require("obsidian");

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

// src/platform/ObsidianStorage.ts
var import_obsidian2 = require("obsidian");
var ObsidianStorage = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  async readShard(name) {
    var _a;
    if (name === "data") return (_a = await this.plugin.loadData()) != null ? _a : null;
    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    if (!await adapter.exists(path)) return null;
    return JSON.parse(await adapter.read(path));
  }
  async writeShard(name, data) {
    if (name === "data") {
      await this.plugin.saveData(data);
      return;
    }
    const adapter = this.plugin.app.vault.adapter;
    const dir = (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/store`);
    if (!await adapter.exists(dir)) await adapter.mkdir(dir);
    await adapter.write(this.shardPath(name), JSON.stringify(data));
  }
  async backup(name, data) {
    const adapter = this.plugin.app.vault.adapter;
    const backupDir = (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/backup`);
    if (!await adapter.exists(backupDir)) await adapter.mkdir(backupDir);
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-");
    const path = (0, import_obsidian2.normalizePath)(`${backupDir}/${name}-v1-${stamp}.json`);
    await adapter.write(path, JSON.stringify(data, null, 2));
  }
  pluginDir() {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return dir;
  }
  shardPath(name) {
    if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`ObsidianStorage: invalid shard name "${name}"`);
    return (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/store/${name}.json`);
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
  const entry = entries.find((en2) => {
    var _a2, _b2;
    return (_b2 = (_a2 = en2.definitions) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.definition;
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

// src/core/nowIso.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/core/store/VocabStore.ts
var WRITE_DEBOUNCE_MS = 500;
var VocabStore = class {
  constructor(data, persist) {
    this.data = data;
    this.persist = persist;
    this.events = new TypedEmitter();
    this.writeTimer = null;
    this.pendingWrite = Promise.resolve();
  }
  get vocabData() {
    return this.data;
  }
  // Live entries only — excludes soft-deleted (tombstoned) ones. UI code
  // should read this instead of vocabData.entries directly; the raw array
  // (tombstones included) is only needed by persistence and merge.ts.
  get entries() {
    return this.data.entries.filter((e) => !e.deletedAt);
  }
  // Stamps a brand-new entry and adds it. Pushes the same object reference
  // the caller holds (not a copy) so later direct mutations on it — e.g.
  // enrichEntry filling in dictionary fields — land in this.data too.
  addEntry(entry) {
    var _a, _b;
    const stamp = nowIso();
    entry.createdAt = (_a = entry.createdAt) != null ? _a : stamp;
    entry.updatedAt = stamp;
    entry.rev = 0;
    entry.lang = (_b = entry.lang) != null ? _b : "en";
    this.data.entries.push(entry);
    return this.save();
  }
  // Call after directly mutating fields on an entry that's already in
  // this.data.entries, so its updatedAt/rev stay meaningful to merge.ts.
  touch(entry) {
    var _a;
    entry.updatedAt = nowIso();
    entry.rev = ((_a = entry.rev) != null ? _a : 0) + 1;
    return this.save();
  }
  // Soft-delete: sets deletedAt instead of removing the entry, so a delete
  // on one device can be merged against an edit on another (see
  // core/store/merge.ts) instead of the record just vanishing or
  // reappearing depending on write order. Permanently purged after 30 days
  // by core/store/cleanupTombstones.ts.
  deleteEntry(id) {
    var _a;
    const entry = this.data.entries.find((e) => e.id === id);
    if (!entry) return Promise.resolve();
    const stamp = nowIso();
    entry.deletedAt = stamp;
    entry.updatedAt = stamp;
    entry.rev = ((_a = entry.rev) != null ? _a : 0) + 1;
    return this.save();
  }
  // Emits data:changed immediately (so the UI reflects the edit right
  // away) but coalesces the actual disk write: rapid edits (e.g. typing in
  // an inline-editable field) share one write instead of one per
  // keystroke. Callers that need the write to have actually landed (e.g.
  // before closing a file) should use flush(), not rely on this resolving.
  async save() {
    this.events.emit("data:changed", this.data);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.persist(this.data);
    }, WRITE_DEBOUNCE_MS);
  }
  // Forces any debounced write to land now — call on plugin unload so a
  // pending edit isn't lost if Obsidian closes before the timer fires.
  async flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.persist(this.data);
    }
    await this.pendingWrite;
  }
  // Used by onExternalSettingsChange (multi-device sync) once that exists.
  replace(data) {
    this.data = data;
    this.events.emit("data:changed", this.data);
  }
};

// src/core/migrations/v1-to-v2.ts
function parseAddedAt(added) {
  const d = new Date(added.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}
function migrateEntry(entry) {
  const createdAt = entry.added ? parseAddedAt(entry.added) : nowIso();
  return {
    ...entry,
    lang: "en",
    createdAt,
    updatedAt: createdAt,
    rev: 0
  };
}
function migrateV1ToV2(raw) {
  return {
    schemaVersion: 2,
    settings: { schemaVersion: 2 },
    entries: raw.entries.map(migrateEntry)
  };
}

// src/core/migrations/index.ts
function isSchemaV2(raw) {
  return !!raw && typeof raw === "object" && raw.schemaVersion === 2;
}
function migrate(raw) {
  if (!raw) {
    return { data: { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] }, migrated: false };
  }
  if (isSchemaV2(raw)) return { data: raw, migrated: false };
  return { data: migrateV1ToV2(raw), migrated: true };
}

// src/core/migrations/loadMigrated.ts
async function loadMigrated(storage, shard = "data") {
  const raw = await storage.readShard(shard);
  const { data, migrated } = migrate(raw);
  if (migrated) {
    await storage.backup(shard, raw);
    await storage.writeShard(shard, data);
  }
  return data;
}

// src/core/store/cleanupTombstones.ts
var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1e3;
function cleanupTombstones(data, now = Date.now()) {
  const entries = data.entries.filter((e) => {
    if (!e.deletedAt) return true;
    return now - new Date(e.deletedAt).getTime() < THIRTY_DAYS_MS;
  });
  if (entries.length === data.entries.length) return data;
  return { ...data, entries };
}

// src/core/store/merge.ts
function updatedAtMs(entry) {
  return entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
}
function pickNewer(a, b) {
  var _a, _b;
  const aMs = updatedAtMs(a);
  const bMs = updatedAtMs(b);
  if (aMs !== bMs) return aMs > bMs ? a : b;
  return ((_a = a.rev) != null ? _a : 0) >= ((_b = b.rev) != null ? _b : 0) ? a : b;
}
function merge(local, remote) {
  var _a, _b;
  const byId = /* @__PURE__ */ new Map();
  const order = [];
  for (const entry of local.entries) {
    byId.set(entry.id, entry);
    order.push(entry.id);
  }
  for (const entry of remote.entries) {
    const existing = byId.get(entry.id);
    if (!existing) order.push(entry.id);
    byId.set(entry.id, existing ? pickNewer(existing, entry) : entry);
  }
  return {
    schemaVersion: 2,
    settings: (_b = (_a = local.settings) != null ? _a : remote.settings) != null ? _b : { schemaVersion: 2 },
    entries: order.map((id) => byId.get(id))
  };
}

// src/core/store/updateSourcePaths.ts
function updateSourcePaths(entries, oldPath, newPath) {
  const changed = [];
  for (const entry of entries) {
    if (entry.source && entry.source.path === oldPath) {
      entry.source.path = newPath;
      changed.push(entry);
    }
  }
  return changed;
}

// src/core/nowStamp.ts
function nowStamp(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// src/ui/sidebar/VocabSidebarView.ts
var import_obsidian5 = require("obsidian");

// src/ui/word/WordRow.ts
var import_obsidian3 = require("obsidian");

// src/core/model/srs.ts
var SrsState = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
var Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
var RATINGS = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
var CARD_MODES = ["en-zh", "zh-en", "cloze", "listen"];
var DEFAULT_SRS_SETTINGS = { retention: 0.9, dailyNew: 20 };
function resolveSrsSettings(partial) {
  const retention = Number(partial == null ? void 0 : partial.retention);
  const dailyNew = Number(partial == null ? void 0 : partial.dailyNew);
  return {
    retention: Number.isFinite(retention) && retention > 0 ? Math.min(0.99, Math.max(0.7, retention)) : DEFAULT_SRS_SETTINGS.retention,
    dailyNew: Number.isFinite(dailyNew) && dailyNew >= 0 ? Math.floor(dailyNew) : DEFAULT_SRS_SETTINGS.dailyNew
  };
}

// src/core/text/dueLabel.ts
function dueLabel(due, now) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due.getTime() < tomorrow.getTime()) return { kind: "today" };
  const p = (n) => String(n).padStart(2, "0");
  const md = `${p(due.getMonth() + 1)}/${p(due.getDate())}`;
  return {
    kind: "date",
    text: due.getFullYear() === now.getFullYear() ? md : `${due.getFullYear()}/${md}`
  };
}

// src/core/i18n/en.ts
var en = {
  "sidebar.title": "Vocab Tracker",
  "sidebar.openList": "Open vocab-list.md",
  "sidebar.addPrompt.cta": "+ Add to vocab list",
  "sidebar.filter.note": "This note",
  "sidebar.filter.all": "All",
  "sidebar.scope.note": "This note",
  "sidebar.scope.all": "All words",
  "sidebar.hint.noteEmpty": "No tracked words from this note yet. Click an English word in reading mode to add one.",
  "sidebar.hint.allEmpty": "Click an English word in reading mode to start tracking.",
  "row.delete": "Delete",
  "row.expand": "Expand",
  "row.collapse": "Collapse",
  "row.pronounce": "Pronounce",
  "row.jumpToSource": "Jump to where this word was captured",
  "row.showMore": "Show more",
  "row.showLess": "Show less",
  "row.fetch": "Fetch dictionary data (definition, synonyms, phonetic)",
  "row.markReviewed": "Mark as reviewed (rates Good)",
  "row.meta.added": "Added: {date}",
  "row.meta.reviewed": "Reviewed: {date} ({count}\xD7)",
  "row.field.synonyms": "Synonyms",
  "row.field.definition": "Definition",
  "row.field.definitionZh": "\u4E2D\u6587\u7FFB\u8BD1",
  "row.field.antonyms": "Antonyms",
  "row.field.example": "Example sentence (from note)",
  "row.field.grammar": "Grammar tips",
  "row.field.level": "Level",
  "row.field.placeholder": "Add {label}\u2026",
  "dashboard.empty": "No words yet. Highlight ==words== in your notes and click them to start tracking.",
  "dashboard.search": "Search words\u2026",
  "dashboard.stat.word": "\u{1F4DA} {count} word",
  "dashboard.stat.words": "\u{1F4DA} {count} words",
  // ── M2: flashcards / SRS ──────────────────────────────────────
  "dashboard.startReview": "Start review \xB7 {count} due today",
  "dashboard.startReview.none": "Flashcards \xB7 nothing due",
  "row.nextReview": "Next review: {date}",
  "row.due.today": "Today",
  "srs.interval.m": "{n} min",
  "srs.interval.h": "{n} h",
  "srs.interval.d": "{n} d",
  "srs.interval.mo": "{n} mo",
  "srs.interval.y": "{n} y",
  "srs.rating.1": "Again",
  "srs.rating.2": "Hard",
  "srs.rating.3": "Good",
  "srs.rating.4": "Easy",
  "flashcards.title": "Flashcards",
  "flashcards.mode.en-zh": "EN \u2192 ZH",
  "flashcards.mode.zh-en": "ZH \u2192 EN",
  "flashcards.mode.cloze": "Cloze",
  "flashcards.mode.listen": "Listen & spell",
  "flashcards.source.all": "All sources",
  "flashcards.hint.en-zh": "Recall what it means",
  "flashcards.hint.zh-en": "Recall the English word",
  "flashcards.hint.cloze": "Fill in the blank",
  "flashcards.hint.listen": "Type the word you hear",
  "flashcards.listen.placeholder": "Type the word\u2026",
  "flashcards.listen.replay": "Play again",
  "flashcards.listen.correct": "Correct",
  "flashcards.listen.wrong": "You typed \u201C{answer}\u201D",
  "flashcards.flip": "Flip",
  "flashcards.flipKey": "Space",
  "flashcards.noTranslation": "(no translation yet)",
  "flashcards.stat.due": "Due today",
  "flashcards.stat.new": "New",
  "flashcards.stat.done": "Done",
  "flashcards.empty.title": "Nothing to review right now",
  "flashcards.empty.body": "When words come due, the count shows up here and on the dashboard.",
  "flashcards.empty.cloze": "Cloze mode skips words without an example sentence.",
  "flashcards.done.title": "Today's review is done",
  "flashcards.done.body": "When words come due again, the dashboard and this page will show the count.",
  "flashcards.done.reviewedToday": "Reviewed today",
  "flashcards.done.recalled": "Rated Good or better",
  "flashcards.done.dueTomorrow": "Due tomorrow",
  "flashcards.done.forgotten": "Forgotten this time",
  "flashcards.done.retryForgotten": "Practice forgotten words again ({count})",
  "flashcards.done.continue": "Keep reviewing ({count} due)",
  "flashcards.done.backToList": "Back to word list",
  "command.openFlashcards": "Open flashcards"
};

// src/core/i18n/zh-TW.ts
var zhTW = {
  "sidebar.title": "\u55AE\u5B57\u8FFD\u8E64",
  "sidebar.openList": "\u958B\u555F vocab-list.md",
  "sidebar.addPrompt.cta": "\uFF0B \u52A0\u5165\u55AE\u5B57\u5EAB",
  "sidebar.filter.note": "\u672C\u7BC7\u7B46\u8A18",
  "sidebar.filter.all": "\u5168\u90E8",
  "sidebar.scope.note": "\u672C\u7BC7\u7B46\u8A18",
  "sidebar.scope.all": "\u5168\u90E8\u55AE\u5B57",
  "sidebar.hint.noteEmpty": "\u9019\u7BC7\u7B46\u8A18\u9084\u6C92\u6709\u8FFD\u8E64\u7684\u55AE\u5B57\u3002\u5728\u95B1\u8B80\u6A21\u5F0F\u9EDE\u64CA\u82F1\u6587\u55AE\u5B57\u5373\u53EF\u52A0\u5165\u3002",
  "sidebar.hint.allEmpty": "\u5728\u95B1\u8B80\u6A21\u5F0F\u9EDE\u64CA\u82F1\u6587\u55AE\u5B57\u958B\u59CB\u8FFD\u8E64\u3002",
  "row.delete": "\u522A\u9664",
  "row.expand": "\u5C55\u958B",
  "row.collapse": "\u6536\u5408",
  "row.pronounce": "\u767C\u97F3",
  "row.jumpToSource": "\u8DF3\u5230\u9019\u500B\u5B57\u51FA\u73FE\u7684\u5730\u65B9",
  "row.showMore": "\u986F\u793A\u66F4\u591A",
  "row.showLess": "\u986F\u793A\u8F03\u5C11",
  "row.fetch": "\u6293\u53D6\u5B57\u5178\u8CC7\u6599\uFF08\u5B9A\u7FA9\u3001\u540C\u7FA9\u8A5E\u3001\u97F3\u6A19\uFF09",
  "row.markReviewed": "\u6A19\u8A18\u70BA\u5DF2\u8907\u7FD2\uFF08\u8A55\u70BA\u300C\u8A18\u5F97\u300D\uFF09",
  "row.meta.added": "\u52A0\u5165\u6642\u9593\uFF1A{date}",
  "row.meta.reviewed": "\u8907\u7FD2\u6642\u9593\uFF1A{date}\uFF08{count} \u6B21\uFF09",
  "row.field.synonyms": "\u540C\u7FA9\u8A5E",
  "row.field.definition": "\u5B9A\u7FA9",
  "row.field.definitionZh": "\u4E2D\u6587\u7FFB\u8BD1",
  "row.field.antonyms": "\u53CD\u7FA9\u8A5E",
  "row.field.example": "\u4F8B\u53E5\uFF08\u4F86\u81EA\u7B46\u8A18\uFF09",
  "row.field.grammar": "\u6587\u6CD5\u63D0\u793A",
  "row.field.level": "\u7A0B\u5EA6",
  "row.field.placeholder": "\u65B0\u589E{label}\u2026",
  "dashboard.empty": "\u9084\u6C92\u6709\u55AE\u5B57\u3002\u5728\u7B46\u8A18\u4E2D\u7528 ==\u55AE\u5B57== \u6A19\u8A18\u4E26\u9EDE\u64CA\u5373\u53EF\u958B\u59CB\u8FFD\u8E64\u3002",
  "dashboard.search": "\u641C\u5C0B\u55AE\u5B57\u2026",
  "dashboard.stat.word": "\u{1F4DA} {count} \u500B\u55AE\u5B57",
  "dashboard.stat.words": "\u{1F4DA} {count} \u500B\u55AE\u5B57",
  // ── M2：單字卡 / SRS ──────────────────────────────────────────
  "dashboard.startReview": "\u958B\u59CB\u8907\u7FD2 \xB7 \u4ECA\u65E5 {count} \u5F35",
  "dashboard.startReview.none": "\u55AE\u5B57\u5361 \xB7 \u76EE\u524D\u6C92\u6709\u5230\u671F",
  "row.nextReview": "\u4E0B\u6B21\u8907\u7FD2\uFF1A{date}",
  "row.due.today": "\u4ECA\u5929",
  "srs.interval.m": "{n} \u5206\u9418",
  "srs.interval.h": "{n} \u5C0F\u6642",
  "srs.interval.d": "{n} \u5929",
  "srs.interval.mo": "{n} \u500B\u6708",
  "srs.interval.y": "{n} \u5E74",
  "srs.rating.1": "\u5FD8\u4E86",
  "srs.rating.2": "\u96E3",
  "srs.rating.3": "\u8A18\u5F97",
  "srs.rating.4": "\u7C21\u55AE",
  "flashcards.title": "\u55AE\u5B57\u5361",
  "flashcards.mode.en-zh": "\u82F1\u2192\u4E2D",
  "flashcards.mode.zh-en": "\u4E2D\u2192\u82F1",
  "flashcards.mode.cloze": "\u4F8B\u53E5\u586B\u7A7A",
  "flashcards.mode.listen": "\u807D\u97F3\u62FC\u5B57",
  "flashcards.source.all": "\u5168\u90E8\u4F86\u6E90",
  "flashcards.hint.en-zh": "\u60F3\u4E00\u60F3\u5B83\u7684\u4E2D\u6587\u610F\u601D",
  "flashcards.hint.zh-en": "\u60F3\u4E00\u60F3\u82F1\u6587\u55AE\u5B57",
  "flashcards.hint.cloze": "\u7A7A\u683C\u88E1\u61C9\u8A72\u586B\u54EA\u500B\u5B57\uFF1F",
  "flashcards.hint.listen": "\u62FC\u51FA\u4F60\u807D\u5230\u7684\u55AE\u5B57",
  "flashcards.listen.placeholder": "\u8F38\u5165\u55AE\u5B57\u2026",
  "flashcards.listen.replay": "\u518D\u807D\u4E00\u6B21",
  "flashcards.listen.correct": "\u62FC\u5C0D\u4E86",
  "flashcards.listen.wrong": "\u4F60\u62FC\u7684\u662F\u300C{answer}\u300D",
  "flashcards.flip": "\u7FFB\u9762",
  "flashcards.flipKey": "Space",
  "flashcards.noTranslation": "\uFF08\u9084\u6C92\u6709\u4E2D\u6587\u7FFB\u8B6F\uFF09",
  "flashcards.stat.due": "\u4ECA\u65E5\u5230\u671F",
  "flashcards.stat.new": "\u65B0\u5B57",
  "flashcards.stat.done": "\u5DF2\u5B8C\u6210",
  "flashcards.empty.title": "\u76EE\u524D\u6C92\u6709\u8981\u8907\u7FD2\u7684\u5B57",
  "flashcards.empty.body": "\u6709\u5B57\u5230\u671F\u6642\uFF0C\u9019\u88E1\u548C dashboard \u90FD\u6703\u986F\u793A\u6578\u91CF\u3002",
  "flashcards.empty.cloze": "\u4F8B\u53E5\u586B\u7A7A\u6703\u7565\u904E\u6C92\u6709\u4F8B\u53E5\u7684\u5B57\u3002",
  "flashcards.done.title": "\u4ECA\u5929\u7684\u8907\u7FD2\u5B8C\u6210\u4E86",
  "flashcards.done.body": "\u4E0B\u6B21\u6709\u5B57\u5230\u671F\u6642\uFF0Cdashboard \u548C\u9019\u88E1\u90FD\u6703\u986F\u793A\u6578\u91CF\u3002",
  "flashcards.done.reviewedToday": "\u4ECA\u5929\u8907\u7FD2",
  "flashcards.done.recalled": "\u7B54\u300C\u8A18\u5F97\u300D\u4EE5\u4E0A",
  "flashcards.done.dueTomorrow": "\u660E\u5929\u5230\u671F",
  "flashcards.done.forgotten": "\u9019\u6B21\u5FD8\u8A18\u7684\u5B57",
  "flashcards.done.retryForgotten": "\u518D\u7DF4\u4E00\u6B21\u5FD8\u8A18\u7684\u5B57\uFF08{count}\uFF09",
  "flashcards.done.continue": "\u7E7C\u7E8C\u8907\u7FD2\uFF08{count} \u5F35\u5230\u671F\uFF09",
  "flashcards.done.backToList": "\u56DE\u5230\u55AE\u5B57\u5217\u8868",
  "command.openFlashcards": "\u958B\u555F\u55AE\u5B57\u5361"
};

// src/core/i18n/index.ts
var dictionaries = { en, "zh-TW": zhTW };
var activeLocale = "en";
function t(key, params) {
  var _a;
  const template = (_a = dictionaries[activeLocale][key]) != null ? _a : dictionaries.en[key];
  if (!params) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (match, name) => name in params ? String(params[name]) : match
  );
}

// src/ui/word/WordRow.ts
function autoGrowTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
function renderVocabRow(plugin, container, entry, state, setState, refresh, opts = {}) {
  const row = container.createEl("div", { cls: "vocab-tracker-row" });
  const due = plugin.srs.nextDue(entry);
  row.toggleClass("is-expanded", state !== "collapsed");
  const head = row.createEl("div", { cls: "vocab-tracker-row-header" });
  const del = head.createEl("span", { cls: "vocab-tracker-row-delete" });
  (0, import_obsidian3.setIcon)(del, "x");
  del.title = t("row.delete");
  del.onclick = async (e) => {
    e.stopPropagation();
    await plugin.deleteEntry(entry);
    refresh();
  };
  const wordWrap = head.createEl("span", { cls: "vocab-tracker-row-wordwrap" });
  wordWrap.createEl("span", { text: entry.word, cls: "vocab-tracker-row-word" });
  for (const tag of entry.level.split(",").map((t2) => t2.trim()).filter(Boolean)) {
    wordWrap.createEl("span", { text: tag, cls: "vocab-tracker-row-badge" });
  }
  head.createEl("span", { cls: "vocab-tracker-row-spacer" });
  if (opts.showDue && due) {
    const label = dueLabel(due, /* @__PURE__ */ new Date());
    const chip = head.createEl("span", { cls: "vt-row-due" });
    chip.toggleClass("is-today", label.kind === "today");
    (0, import_obsidian3.setIcon)(chip.createSpan({ cls: "vt-row-due-icon" }), "calendar");
    chip.createSpan({ text: label.kind === "today" ? t("row.due.today") : label.text });
    chip.title = t("row.nextReview", { date: due.toLocaleString() });
  }
  const arrow = head.createEl("span", { cls: "vocab-tracker-row-arrow" });
  (0, import_obsidian3.setIcon)(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
  arrow.title = state === "collapsed" ? t("row.expand") : t("row.collapse");
  head.onclick = () => {
    setState(state === "collapsed" ? "half" : "collapsed");
    refresh();
  };
  if (state === "collapsed") {
    const speak2 = head.createEl("span", {
      cls: ["vocab-tracker-speak-icon", "vocab-tracker-row-speak"]
    });
    (0, import_obsidian3.setIcon)(speak2, "volume-2");
    speak2.title = t("row.pronounce");
    speak2.onclick = (e) => {
      e.stopPropagation();
      plugin.speakWord(entry);
    };
    return;
  }
  const body = row.createEl("div", { cls: "vocab-tracker-row-body" });
  const subText = body.createEl("div", { cls: "vocab-tracker-form-subtext" });
  subText.textContent = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  \xB7  ") || entry.word;
  const commitField = async (key, value) => {
    entry[key] = value;
    await plugin.store.touch(entry);
    refresh();
  };
  const mkField = (label, key, opts2 = {}) => {
    var _a;
    const value = (_a = entry[key]) != null ? _a : "";
    const wrap = body.createEl("div", { cls: "vocab-tracker-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vocab-tracker-input", "vocab-tracker-field-box"];
    if (opts2.multiline) cls.push("vocab-tracker-textarea");
    if (opts2.multiline) {
      const inp = wrap.createEl("textarea", { cls });
      inp.rows = 1;
      inp.value = value;
      inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
      inp.onclick = (e) => e.stopPropagation();
      autoGrowTextarea(inp);
      inp.addEventListener("input", () => autoGrowTextarea(inp));
      inp.onchange = () => commitField(key, inp.value);
    } else {
      const inp = wrap.createEl("input", { cls });
      inp.type = "text";
      inp.value = value;
      inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
      inp.onclick = (e) => e.stopPropagation();
      inp.onchange = () => commitField(key, inp.value);
    }
  };
  mkField(t("row.field.synonyms"), "synonyms", { multiline: true });
  mkField(t("row.field.definition"), "definition", { multiline: true });
  mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });
  if (state === "full") {
    if (entry.antonyms) mkField(t("row.field.antonyms"), "antonyms");
    mkField(t("row.field.example"), "example", { multiline: true });
    mkField(t("row.field.grammar"), "grammar");
    if (entry.source && entry.source.path) {
      const src = body.createEl("div", { cls: "vocab-tracker-source-link" });
      const name = entry.source.path.split("/").pop();
      src.textContent = `\u{1F4CD} ${name} : line ${entry.source.line + 1}`;
      src.title = t("row.jumpToSource");
      src.onclick = (e) => {
        e.stopPropagation();
        plugin.jumpToSource(entry);
      };
    }
    body.createEl("div", { text: t("row.meta.added", { date: entry.added }), cls: "vocab-tracker-meta" });
    body.createEl("div", {
      text: t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }),
      cls: "vocab-tracker-meta"
    });
    if (due) {
      body.createEl("div", {
        text: t("row.nextReview", { date: due.toLocaleString() }),
        cls: "vocab-tracker-meta"
      });
    }
    mkField(t("row.field.level"), "level", { multiline: true });
  }
  const footer = body.createEl("div", { cls: "vocab-tracker-row-footer" });
  const moreBtn = footer.createEl("span", { cls: "vocab-tracker-footer-icon" });
  (0, import_obsidian3.setIcon)(moreBtn, state === "full" ? "chevron-down" : "info");
  moreBtn.title = state === "full" ? t("row.showLess") : t("row.showMore");
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    setState(state === "full" ? "half" : "full");
    refresh();
  };
  const actions = footer.createEl("span", { cls: "vocab-tracker-row-footer-actions" });
  const fetchBtn = actions.createEl("span", { cls: "vocab-tracker-footer-icon" });
  (0, import_obsidian3.setIcon)(fetchBtn, "refresh-cw");
  fetchBtn.title = t("row.fetch");
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "\u2026";
    await plugin.enrichEntry(entry, { verbose: true });
    refresh();
  };
  const reviewBtn = actions.createEl("span", { cls: "vocab-tracker-footer-icon" });
  (0, import_obsidian3.setIcon)(reviewBtn, "check");
  reviewBtn.title = t("row.markReviewed");
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    await plugin.srs.rate(entry, Rating.Good, "manual");
    refresh();
  };
  const speak = actions.createEl("span", { cls: "vocab-tracker-speak-icon" });
  (0, import_obsidian3.setIcon)(speak, "volume-2");
  speak.title = t("row.pronounce");
  speak.onclick = (e) => {
    e.stopPropagation();
    plugin.speakWord(entry);
  };
}

// src/ui/word/GroupedWordList.ts
var import_obsidian4 = require("obsidian");
function renderGroupedVocabList(plugin, container, rows, collapsedGroups, expandState, refresh, rowOpts = {}) {
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
    const arrow = heading.createEl("span", { cls: "vocab-tracker-group-arrow" });
    (0, import_obsidian4.setIcon)(arrow, isCollapsed ? "chevron-up" : "chevron-down");
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
      renderVocabRow(
        plugin,
        container,
        entry,
        state,
        (s) => expandState.set(entry.id, s),
        refresh,
        rowOpts
      );
    }
  }
}

// src/ui/sidebar/VocabSidebarView.ts
var VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";
var VocabSidebarView = class extends import_obsidian5.ItemView {
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
    return t("sidebar.title");
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
    const entry = this.plugin.store.entries.find(
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
    header.createEl("h4", { text: t("sidebar.title") });
    const openList = header.createEl("span", { cls: "vocab-tracker-icon-btn" });
    (0, import_obsidian5.setIcon)(openList, "file-text");
    openList.title = t("sidebar.openList");
    openList.onclick = () => this.plugin.openVocabFile();
    const entries = this.plugin.store.entries;
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vocab-tracker-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vocab-tracker-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: t("sidebar.addPrompt.cta"), cls: "vocab-tracker-btn" });
      addBtn.onclick = async () => {
        await this.plugin.addWordToVocab(this.pendingWord);
      };
      const dismiss = banner.createEl("span", { cls: "vocab-tracker-close-btn" });
      (0, import_obsidian5.setIcon)(dismiss, "x");
      dismiss.onclick = () => {
        this.pendingWord = "";
        this.render();
      };
    }
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const canFilter = !!activeFile;
    if (this.filterMode === void 0) this.filterMode = "note";
    let list = entries;
    let scopeLabel = t("sidebar.scope.all");
    if (this.filterMode === "note" && canFilter) {
      list = entries.filter(
        (e) => e.source && e.source.path === activeFile.path
      );
      scopeLabel = t("sidebar.scope.note");
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
    mkToggle(t("sidebar.filter.note"), "note");
    mkToggle(t("sidebar.filter.all"), "all");
    if (list.length === 0) {
      root.createEl("div", {
        text: this.filterMode === "note" && canFilter ? t("sidebar.hint.noteEmpty") : t("sidebar.hint.allEmpty"),
        cls: "vocab-tracker-hint"
      });
      return;
    }
    const listEl = root.createEl("div", { cls: "vocab-tracker-list" });
    if (this.filterMode === "all") {
      renderGroupedVocabList(
        this.plugin,
        listEl,
        list,
        this.collapsedGroups,
        this.expandState,
        () => this.render()
      );
    } else {
      for (const entry of list) {
        const state = (_a = this.expandState.get(entry.id)) != null ? _a : "collapsed";
        renderVocabRow(
          this.plugin,
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

// src/ui/blocks/dashboard.ts
var import_obsidian6 = require("obsidian");
function renderDashboard(plugin, _source, el, ctx) {
  var _a;
  const entries = plugin.store.entries;
  el.addClass("vocab-tracker-dashboard");
  if (entries.length === 0) {
    el.createEl("p", {
      text: t("dashboard.empty"),
      cls: "vocab-tracker-empty-state"
    });
    return;
  }
  const stats = el.createEl("div", { cls: "vocab-tracker-stats" });
  stats.createEl("span", {
    text: entries.length === 1 ? t("dashboard.stat.word", { count: entries.length }) : t("dashboard.stat.words", { count: entries.length }),
    cls: "vocab-tracker-stat-pill"
  });
  const tagCounts = /* @__PURE__ */ new Map();
  for (const e of entries) {
    for (const tag of e.level.split(",").map((t2) => t2.trim()).filter(Boolean)) {
      tagCounts.set(tag, ((_a = tagCounts.get(tag)) != null ? _a : 0) + 1);
    }
  }
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    stats.createEl("span", {
      text: `${tag}: ${n}`,
      cls: ["vocab-tracker-stat-pill", "is-accent"]
    });
  }
  renderReviewButton(plugin, el, ctx);
  const search = el.createEl("input", { cls: ["vocab-tracker-search-input", "vocab-tracker-field-box"] });
  search.placeholder = t("dashboard.search");
  const listWrap = el.createEl("div", { cls: "vocab-tracker-list" });
  const expandState = /* @__PURE__ */ new Map();
  const collapsedGroups = /* @__PURE__ */ new Set();
  const draw = (q) => {
    listWrap.empty();
    const rows = entries.filter(
      (e) => e.word.toLowerCase().includes(q.toLowerCase())
    );
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => draw(search.value), {
      showDue: true
    });
  };
  draw("");
  search.oninput = () => draw(search.value);
}
function renderReviewButton(plugin, el, ctx) {
  const btn = el.createEl("button", { cls: "vt-dash-review" });
  (0, import_obsidian6.setIcon)(btn.createSpan({ cls: "vt-dash-review-icon" }), "layers");
  const label = btn.createSpan();
  btn.onclick = () => void plugin.openFlashcards();
  const update = () => {
    const n = plugin.srs.queue().length;
    label.setText(n > 0 ? t("dashboard.startReview", { count: n }) : t("dashboard.startReview.none"));
    btn.toggleClass("mod-cta", n > 0);
  };
  update();
  const child = new import_obsidian6.MarkdownRenderChild(el);
  let alive = true;
  child.register(() => alive = false);
  child.register(plugin.store.events.on("data:changed", update));
  ctx.addChild(child);
  void plugin.srs.ensureLoaded().then(() => {
    if (alive) update();
  });
}

// node_modules/ts-fsrs/dist/index.mjs
var FSRSError = class _FSRSError extends Error {
  constructor(message = "FSRS Error") {
    var _a;
    super(message);
    this.name = "FSRSError";
    (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, _FSRSError);
  }
};
var FSRSValidationError = class _FSRSValidationError extends FSRSError {
  constructor(message) {
    var _a;
    super(message);
    this.name = "FSRSValidationError";
    (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, _FSRSValidationError);
  }
};
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["New"] = 0] = "New";
  State2[State2["Learning"] = 1] = "Learning";
  State2[State2["Review"] = 2] = "Review";
  State2[State2["Relearning"] = 3] = "Relearning";
  return State2;
})(State || {});
var Rating2 = /* @__PURE__ */ ((Rating22) => {
  Rating22[Rating22["Manual"] = 0] = "Manual";
  Rating22[Rating22["Again"] = 1] = "Again";
  Rating22[Rating22["Hard"] = 2] = "Hard";
  Rating22[Rating22["Good"] = 3] = "Good";
  Rating22[Rating22["Easy"] = 4] = "Easy";
  return Rating22;
})(Rating2 || {});
var TypeConvert = class _TypeConvert {
  static card(card) {
    return {
      ...card,
      state: _TypeConvert.state(card.state),
      due: _TypeConvert.time(card.due),
      last_review: card.last_review ? _TypeConvert.time(card.last_review) : void 0
    };
  }
  static rating(value) {
    if (typeof value === "string") {
      const firstLetter = value.charAt(0).toUpperCase();
      const restOfString = value.slice(1).toLowerCase();
      const ret = Rating2[`${firstLetter}${restOfString}`];
      if (ret === void 0) {
        throw new FSRSValidationError(`Invalid rating:[${value}]`);
      }
      return ret;
    } else if (typeof value === "number") {
      return value;
    }
    throw new FSRSValidationError(`Invalid rating:[${value}]`);
  }
  static state(value) {
    if (typeof value === "string") {
      const firstLetter = value.charAt(0).toUpperCase();
      const restOfString = value.slice(1).toLowerCase();
      const ret = State[`${firstLetter}${restOfString}`];
      if (ret === void 0) {
        throw new FSRSValidationError(`Invalid state:[${value}]`);
      }
      return ret;
    } else if (typeof value === "number") {
      return value;
    }
    throw new FSRSValidationError(`Invalid state:[${value}]`);
  }
  static time(value) {
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(value);
    if (typeof value === "object" && value !== null && !Number.isNaN(Date.parse(value) || +date)) {
      return date;
    } else if (typeof value === "string") {
      const timestamp = Date.parse(value);
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp);
      } else {
        throw new FSRSValidationError(`Invalid date:[${value}]`);
      }
    } else if (typeof value === "number") {
      return new Date(value);
    }
    throw new FSRSValidationError(`Invalid date:[${value}]`);
  }
  static review_log(log) {
    return {
      ...log,
      due: _TypeConvert.time(log.due),
      rating: _TypeConvert.rating(log.rating),
      state: _TypeConvert.state(log.state),
      review: _TypeConvert.time(log.review)
    };
  }
};
Date.prototype.scheduler = function(t2, isDay) {
  return date_scheduler(this, t2, isDay);
};
Date.prototype.diff = function(pre, unit) {
  return date_diff(this, pre, unit);
};
Date.prototype.format = function() {
  return formatDate(this);
};
Date.prototype.dueFormat = function(last_review, unit, timeUnit) {
  return show_diff_message(this, last_review, unit, timeUnit);
};
function date_scheduler(now, t2, isDay) {
  return new Date(
    isDay ? TypeConvert.time(now).getTime() + t2 * 24 * 60 * 60 * 1e3 : TypeConvert.time(now).getTime() + t2 * 60 * 1e3
  );
}
function date_diff(now, pre, unit) {
  if (!now || !pre) {
    throw new FSRSValidationError("Invalid date");
  }
  const diff = TypeConvert.time(now).getTime() - TypeConvert.time(pre).getTime();
  let r = 0;
  switch (unit) {
    case "days":
      r = Math.floor(diff / (24 * 60 * 60 * 1e3));
      break;
    case "minutes":
      r = Math.floor(diff / (60 * 1e3));
      break;
  }
  return r;
}
function formatDate(dateInput) {
  const date = TypeConvert.time(dateInput);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return `${year}-${padZero(month)}-${padZero(day)} ${padZero(hours)}:${padZero(
    minutes
  )}:${padZero(seconds)}`;
}
function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}
var TIMEUNIT = [60, 60, 24, 31, 12];
var TIMEUNITFORMAT = ["second", "min", "hour", "day", "month", "year"];
function show_diff_message(due, last_review, unit, timeUnit = TIMEUNITFORMAT) {
  due = TypeConvert.time(due);
  last_review = TypeConvert.time(last_review);
  if (timeUnit.length !== TIMEUNITFORMAT.length) {
    timeUnit = TIMEUNITFORMAT;
  }
  let diff = due.getTime() - last_review.getTime();
  let i = 0;
  diff /= 1e3;
  for (i = 0; i < TIMEUNIT.length; i++) {
    if (diff < TIMEUNIT[i]) {
      break;
    } else {
      diff /= TIMEUNIT[i];
    }
  }
  return `${Math.floor(diff)}${unit ? timeUnit[i] : ""}`;
}
var Grades = Object.freeze([
  Rating2.Again,
  Rating2.Hard,
  Rating2.Good,
  Rating2.Easy
]);
var FUZZ_RANGES = [
  {
    start: 2.5,
    end: 7,
    factor: 0.15
  },
  {
    start: 7,
    end: 20,
    factor: 0.1
  },
  {
    start: 20,
    end: Infinity,
    factor: 0.05
  }
];
function get_fuzz_range(interval, elapsed_days, maximum_interval) {
  let delta = 1;
  for (const range of FUZZ_RANGES) {
    delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
  }
  interval = Math.min(interval, maximum_interval);
  let min_ivl = Math.max(2, Math.round(interval - delta));
  const max_ivl = Math.min(Math.round(interval + delta), maximum_interval);
  if (interval > elapsed_days) {
    min_ivl = Math.max(min_ivl, elapsed_days + 1);
  }
  min_ivl = Math.min(min_ivl, max_ivl);
  return { min_ivl, max_ivl };
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function roundTo(num, decimals) {
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}
function dateDiffInDays(last, cur) {
  const utc1 = Date.UTC(
    last.getUTCFullYear(),
    last.getUTCMonth(),
    last.getUTCDate()
  );
  const utc2 = Date.UTC(
    cur.getUTCFullYear(),
    cur.getUTCMonth(),
    cur.getUTCDate()
  );
  return Math.floor(
    (utc2 - utc1) / 864e5
    /** 1000 * 60 * 60 * 24*/
  );
}
var ConvertStepUnitToMinutes = (step) => {
  const unit = step.slice(-1);
  const value = parseInt(step.slice(0, -1), 10);
  if (Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
    throw new FSRSValidationError(`Invalid step value: ${step}`);
  }
  switch (unit) {
    case "m":
      return value;
    case "h":
      return value * 60;
    case "d":
      return value * 1440;
    default:
      throw new FSRSValidationError(
        `Invalid step unit: ${step}, expected m/h/d`
      );
  }
};
var BasicLearningStepsStrategy = (params, state, cur_step) => {
  const learning_steps = state === State.Relearning || state === State.Review ? params.relearning_steps : params.learning_steps;
  const steps_length = learning_steps.length;
  if (steps_length === 0 || cur_step >= steps_length) return {};
  const firstStep = learning_steps[0];
  const toMinutes = ConvertStepUnitToMinutes;
  const getAgainInterval = () => {
    return toMinutes(firstStep);
  };
  const getHardInterval = () => {
    if (steps_length === 1) return Math.round(toMinutes(firstStep) * 1.5);
    const nextStep = learning_steps[1];
    return Math.round((toMinutes(firstStep) + toMinutes(nextStep)) / 2);
  };
  const getStepInfo = (index) => {
    if (index < 0 || index >= steps_length) {
      return null;
    } else {
      return learning_steps[index];
    }
  };
  const getGoodMinutes = (step) => {
    return toMinutes(step);
  };
  const result = {};
  const step_info = getStepInfo(Math.max(0, cur_step));
  if (state === State.Review) {
    result[Rating2.Again] = {
      scheduled_minutes: toMinutes(step_info),
      next_step: 0
    };
    return result;
  } else {
    result[Rating2.Again] = {
      scheduled_minutes: getAgainInterval(),
      next_step: 0
    };
    result[Rating2.Hard] = {
      scheduled_minutes: getHardInterval(),
      next_step: cur_step
    };
    const next_info = getStepInfo(cur_step + 1);
    if (next_info) {
      const nextMin = getGoodMinutes(next_info);
      if (nextMin) {
        result[Rating2.Good] = {
          scheduled_minutes: Math.round(nextMin),
          next_step: cur_step + 1
        };
      }
    }
  }
  return result;
};
function DefaultInitSeedStrategy() {
  const time = this.review_time.getTime();
  const reps = this.current.reps;
  const mul = this.current.difficulty * this.current.stability;
  return `${time}_${reps}_${mul}`;
}
var StrategyMode = /* @__PURE__ */ ((StrategyMode2) => {
  StrategyMode2["SCHEDULER"] = "Scheduler";
  StrategyMode2["LEARNING_STEPS"] = "LearningSteps";
  StrategyMode2["SEED"] = "Seed";
  return StrategyMode2;
})(StrategyMode || {});
var AbstractScheduler = class {
  // init
  constructor(card, now, algorithm, strategies) {
    __publicField(this, "last");
    __publicField(this, "current");
    __publicField(this, "review_time");
    __publicField(this, "next", /* @__PURE__ */ new Map());
    __publicField(this, "algorithm");
    __publicField(this, "strategies");
    __publicField(this, "elapsed_days", 0);
    this.algorithm = algorithm;
    this.last = TypeConvert.card(card);
    this.current = TypeConvert.card(card);
    this.review_time = TypeConvert.time(now);
    this.strategies = strategies;
    this.init();
  }
  checkGrade(grade) {
    if (!Number.isFinite(grade) || grade < 1 || grade > 4) {
      throw new FSRSValidationError(`Invalid grade "${grade}",expected 1-4`);
    }
  }
  init() {
    const { state, last_review } = this.current;
    let interval = 0;
    if (state !== State.New && last_review) {
      interval = dateDiffInDays(last_review, this.review_time);
    }
    this.current.last_review = this.review_time;
    this.elapsed_days = interval;
    this.current.elapsed_days = interval;
    this.current.reps += 1;
    let seed_strategy = DefaultInitSeedStrategy;
    if (this.strategies) {
      const custom_strategy = this.strategies.get(StrategyMode.SEED);
      if (custom_strategy) {
        seed_strategy = custom_strategy;
      }
    }
    this.algorithm.seed = seed_strategy.call(this);
  }
  preview() {
    return {
      [Rating2.Again]: this.review(Rating2.Again),
      [Rating2.Hard]: this.review(Rating2.Hard),
      [Rating2.Good]: this.review(Rating2.Good),
      [Rating2.Easy]: this.review(Rating2.Easy),
      [Symbol.iterator]: this.previewIterator.bind(this)
    };
  }
  *previewIterator() {
    for (const grade of Grades) {
      yield this.review(grade);
    }
  }
  review(grade) {
    const { state } = this.last;
    let item;
    this.checkGrade(grade);
    switch (state) {
      case State.New:
        item = this.newState(grade);
        break;
      case State.Learning:
      case State.Relearning:
        item = this.learningState(grade);
        break;
      case State.Review:
        item = this.reviewState(grade);
        break;
    }
    return item;
  }
  buildLog(rating) {
    const { last_review, due, elapsed_days } = this.last;
    return {
      rating,
      state: this.current.state,
      due: last_review || due,
      stability: this.current.stability,
      difficulty: this.current.difficulty,
      elapsed_days: this.elapsed_days,
      last_elapsed_days: elapsed_days,
      scheduled_days: this.current.scheduled_days,
      learning_steps: this.current.learning_steps,
      review: this.review_time
    };
  }
};
var Alea = class {
  constructor(seed) {
    __publicField(this, "c");
    __publicField(this, "s0");
    __publicField(this, "s1");
    __publicField(this, "s2");
    const mash = Mash();
    this.c = 1;
    this.s0 = mash(" ");
    this.s1 = mash(" ");
    this.s2 = mash(" ");
    if (seed == null) seed = Date.now();
    this.s0 -= mash(seed);
    if (this.s0 < 0) this.s0 += 1;
    this.s1 -= mash(seed);
    if (this.s1 < 0) this.s1 += 1;
    this.s2 -= mash(seed);
    if (this.s2 < 0) this.s2 += 1;
  }
  next() {
    const t2 = 2091639 * this.s0 + this.c * 23283064365386963e-26;
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.c = t2 | 0;
    this.s2 = t2 - this.c;
    return this.s2;
  }
  set state(state) {
    this.c = state.c;
    this.s0 = state.s0;
    this.s1 = state.s1;
    this.s2 = state.s2;
  }
  get state() {
    return {
      c: this.c,
      s0: this.s0,
      s1: this.s1,
      s2: this.s2
    };
  }
};
function Mash() {
  let n = 4022871197;
  return function mash(data) {
    data = String(data);
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 4294967296;
    }
    return (n >>> 0) * 23283064365386963e-26;
  };
}
function alea(seed) {
  const xg = new Alea(seed);
  const prng = () => xg.next();
  prng.int32 = () => xg.next() * 4294967296 | 0;
  prng.double = () => prng() + (prng() * 2097152 | 0) * 11102230246251565e-32;
  prng.state = () => xg.state;
  prng.importState = (state) => {
    xg.state = state;
    return prng;
  };
  return prng;
}
var version = "5.4.2";
var default_request_retention = 0.9;
var default_maximum_interval = 36500;
var default_enable_fuzz = false;
var default_enable_short_term = true;
var default_learning_steps = Object.freeze([
  "1m",
  "10m"
]);
var default_relearning_steps = Object.freeze([
  "10m"
]);
var FSRSVersion = `v${version} using FSRS-6.0`;
var S_MIN = 1e-3;
var INIT_S_MAX = 100;
var FSRS5_DEFAULT_DECAY = 0.5;
var FSRS6_DEFAULT_DECAY = 0.1542;
var default_w = Object.freeze([
  0.212,
  1.2931,
  2.3065,
  8.2956,
  6.4133,
  0.8334,
  3.0194,
  1e-3,
  1.8722,
  0.1666,
  0.796,
  1.4835,
  0.0614,
  0.2629,
  1.6483,
  0.6014,
  1.8729,
  0.5425,
  0.0912,
  0.0658,
  FSRS6_DEFAULT_DECAY
]);
var W17_W18_Ceiling = 2;
var CLAMP_PARAMETERS = (w17_w18_ceiling, enable_short_term = default_enable_short_term) => [
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [1, 10],
  [1e-3, 4],
  [1e-3, 4],
  [1e-3, 0.75],
  [0, 4.5],
  [0, 0.8],
  [1e-3, 3.5],
  [1e-3, 5],
  [1e-3, 0.25],
  [1e-3, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, w17_w18_ceiling],
  [0, w17_w18_ceiling],
  [
    enable_short_term ? 0.01 : 0,
    0.8
  ],
  [0.1, 0.8]
];
var clipParameters = (parameters, numRelearningSteps, enableShortTerm = default_enable_short_term) => {
  const clip = CLAMP_PARAMETERS(W17_W18_Ceiling, enableShortTerm).slice(
    0,
    parameters.length
  );
  if (Math.max(0, numRelearningSteps) > 1) {
    const w11 = clamp(parameters[11] || 0, clip[11][0], clip[11][1]);
    const w13 = clamp(parameters[13] || 0, clip[13][0], clip[13][1]);
    const w14 = clamp(parameters[14] || 0, clip[14][0], clip[14][1]);
    const value = -(Math.log(w11) + Math.log(Math.pow(2, w13) - 1) + w14 * 0.3) / numRelearningSteps;
    const w17_w18_ceiling = clamp(
      roundTo(Math.sqrt(Math.max(value, 0)), 8),
      0.01,
      W17_W18_Ceiling
    );
    if (clip[17]) clip[17] = [clip[17][0], w17_w18_ceiling];
    if (clip[18]) clip[18] = [clip[18][0], w17_w18_ceiling];
  }
  return clip.map(
    ([min, max], index) => clamp(parameters[index] || 0, min, max)
  );
};
var migrateParameters = (parameters, numRelearningSteps = 0, enableShortTerm = default_enable_short_term) => {
  if (parameters === void 0) {
    return [...default_w];
  }
  switch (parameters.length) {
    case 21:
      return clipParameters(
        Array.from(parameters),
        numRelearningSteps,
        enableShortTerm
      );
    case 19:
      console.debug("[FSRS-6]auto fill w from 19 to 21 length");
      return clipParameters(
        Array.from(parameters),
        numRelearningSteps,
        enableShortTerm
      ).concat([0, FSRS5_DEFAULT_DECAY]);
    case 17: {
      const w = clipParameters(
        Array.from(parameters),
        numRelearningSteps,
        enableShortTerm
      );
      w[4] = +(w[5] * 2 + w[4]).toFixed(8);
      w[5] = +(Math.log(w[5] * 3 + 1) / 3).toFixed(8);
      w[6] = +(w[6] + 0.5).toFixed(8);
      console.debug("[FSRS-6]auto fill w from 17 to 21 length");
      return w.concat([0, 0, 0, FSRS5_DEFAULT_DECAY]);
    }
    default:
      console.warn("[FSRS]Invalid parameters length, using default parameters");
      return [...default_w];
  }
};
var generatorParameters = (props) => {
  var _a, _b;
  const learning_steps = Array.isArray(props == null ? void 0 : props.learning_steps) ? props.learning_steps : default_learning_steps;
  const relearning_steps = Array.isArray(props == null ? void 0 : props.relearning_steps) ? props.relearning_steps : default_relearning_steps;
  const enable_short_term = (_a = props == null ? void 0 : props.enable_short_term) != null ? _a : default_enable_short_term;
  const w = migrateParameters(
    props == null ? void 0 : props.w,
    relearning_steps.length,
    enable_short_term
  );
  return {
    request_retention: (props == null ? void 0 : props.request_retention) || default_request_retention,
    maximum_interval: (props == null ? void 0 : props.maximum_interval) || default_maximum_interval,
    w,
    enable_fuzz: (_b = props == null ? void 0 : props.enable_fuzz) != null ? _b : default_enable_fuzz,
    enable_short_term,
    learning_steps,
    relearning_steps
  };
};
function createEmptyCard(now, afterHandler) {
  const emptyCard = {
    due: now ? TypeConvert.time(now) : /* @__PURE__ */ new Date(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: State.New,
    last_review: void 0
  };
  if (afterHandler && typeof afterHandler === "function") {
    return afterHandler(emptyCard);
  } else {
    return emptyCard;
  }
}
var computeDecayFactor = (decayOrParams) => {
  const decay = typeof decayOrParams === "number" ? -decayOrParams : -decayOrParams[20];
  const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
  return { decay, factor: roundTo(factor, 8) };
};
function forgetting_curve(decayOrParams, elapsed_days, stability) {
  const { decay, factor } = computeDecayFactor(decayOrParams);
  return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
}
var FSRSAlgorithm = class {
  constructor(params) {
    __publicField(this, "param");
    __publicField(this, "intervalModifier");
    __publicField(this, "_seed");
    __publicField(this, "prepare_parameters", (params) => {
      const generated = generatorParameters(params);
      generated.w = clipParameters(
        Array.from(generated.w),
        generated.relearning_steps.length,
        generated.enable_short_term
      );
      return generated;
    });
    /**
     * The formula used is :
     * $$R(t,S) = (1 + \text{FACTOR} \times \frac{t}{9 \cdot S})^{\text{DECAY}}$$
     * @param {number} elapsed_days t days since the last review
     * @param {number} stability Stability (interval when R=90%)
     * @return {number} r Retrievability (probability of recall)
     */
    __publicField(this, "forgetting_curve");
    this.param = new Proxy(
      this.prepare_parameters(params),
      this.params_handler_proxy()
    );
    this.intervalModifier = this.calculate_interval_modifier(
      this.param.request_retention
    );
    this.forgetting_curve = forgetting_curve.bind(this, this.param.w);
  }
  get interval_modifier() {
    return this.intervalModifier;
  }
  set seed(seed) {
    this._seed = seed;
  }
  /**
   * @see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm#fsrs-5
   *
   * The formula used is: $$I(r,s) = (r^{\frac{1}{DECAY}} - 1) / FACTOR \times s$$
   * @param request_retention 0<request_retention<=1,Requested retention rate
   * @throws {Error} Requested retention rate should be in the range (0,1]
   */
  calculate_interval_modifier(request_retention) {
    if (request_retention <= 0 || request_retention > 1) {
      throw new FSRSValidationError(
        "Requested retention rate should be in the range (0,1]"
      );
    }
    const { decay, factor } = computeDecayFactor(this.param.w);
    return roundTo((Math.pow(request_retention, 1 / decay) - 1) / factor, 8);
  }
  /**
   * Get the parameters of the algorithm.
   */
  get parameters() {
    return this.param;
  }
  /**
   * Set the parameters of the algorithm.
   * @param params Partial<FSRSParameters>
   */
  set parameters(params) {
    this.update_parameters(params);
  }
  params_handler_proxy() {
    const _this = this;
    return {
      set: function(target, prop, value) {
        if (prop === "request_retention" && Number.isFinite(value)) {
          _this.intervalModifier = _this.calculate_interval_modifier(
            Number(value)
          );
        } else if (prop === "w") {
          value = migrateParameters(
            value,
            target.relearning_steps.length,
            target.enable_short_term
          );
          value = clipParameters(
            Array.from(value),
            target.relearning_steps.length,
            target.enable_short_term
          );
          _this.forgetting_curve = forgetting_curve.bind(this, value);
          _this.intervalModifier = _this.calculate_interval_modifier(
            Number(target.request_retention)
          );
        }
        Reflect.set(target, prop, value);
        return true;
      }
    };
  }
  update_parameters(params) {
    const _params = this.prepare_parameters(params);
    for (const key in _params) {
      const paramKey = key;
      this.param[paramKey] = _params[paramKey];
    }
  }
  /**
     * The formula used is :
     * $$ S_0(G) = w_{G-1}$$
     * $$S_0 = \max \lbrace S_0,0.1\rbrace $$
  
     * @param g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
     * @return Stability (interval when R=90%)
     */
  init_stability(g) {
    return Math.max(this.param.w[g - 1], 0.1);
  }
  /**
   * The formula used is :
   * $$D_0(G) = w_4 - e^{(G-1) \cdot w_5} + 1 $$
   * $$D_0 = \min \lbrace \max \lbrace D_0(G),1 \rbrace,10 \rbrace$$
   * where the $$D_0(1)=w_4$$ when the first rating is good.
   *
   * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
   * @return {number} Difficulty $$D \in [1,10]$$
   */
  init_difficulty(g) {
    const w = this.param.w;
    const d = w[4] - Math.exp((g - 1) * w[5]) + 1;
    return roundTo(d, 8);
  }
  /**
   * If fuzzing is disabled or ivl is less than 2.5, it returns the original interval.
   * @param {number} ivl - The interval to be fuzzed.
   * @param {number} elapsed_days t days since the last review
   * @return {number} - The fuzzed interval.
   **/
  apply_fuzz(ivl, elapsed_days) {
    if (!this.param.enable_fuzz || ivl < 2.5) return Math.round(ivl);
    const generator = alea(this._seed);
    const fuzz_factor = generator();
    const { min_ivl, max_ivl } = get_fuzz_range(
      ivl,
      elapsed_days,
      this.param.maximum_interval
    );
    return Math.floor(fuzz_factor * (max_ivl - min_ivl + 1) + min_ivl);
  }
  /**
   *   @see The formula used is : {@link FSRSAlgorithm.calculate_interval_modifier}
   *   @param {number} s - Stability (interval when R=90%)
   *   @param {number} elapsed_days t days since the last review
   */
  next_interval(s, elapsed_days) {
    const newInterval = Math.min(
      Math.max(1, Math.round(s * this.intervalModifier)),
      this.param.maximum_interval
    );
    return this.apply_fuzz(newInterval, elapsed_days);
  }
  /**
   * @see https://github.com/open-spaced-repetition/fsrs4anki/issues/697
   */
  linear_damping(delta_d, old_d) {
    return roundTo(delta_d * (10 - old_d) / 9, 8);
  }
  /**
   * The formula used is :
   * $$\text{delta}_d = -w_6 \cdot (g - 3)$$
   * $$\text{next}_d = D + \text{linear damping}(\text{delta}_d , D)$$
   * $$D^\prime(D,R) = w_7 \cdot D_0(4) +(1 - w_7) \cdot \text{next}_d$$
   * @param {number} d Difficulty $$D \in [1,10]$$
   * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
   * @return {number} $$\text{next}_D$$
   */
  next_difficulty(d, g) {
    const delta_d = -this.param.w[6] * (g - 3);
    const next_d = d + this.linear_damping(delta_d, d);
    return clamp(
      this.mean_reversion(this.init_difficulty(Rating2.Easy), next_d),
      1,
      10
    );
  }
  /**
   * The formula used is :
   * $$w_7 \cdot \text{init} +(1 - w_7) \cdot \text{current}$$
   * @param {number} init $$w_2 : D_0(3) = w_2 + (R-2) \cdot w_3= w_2$$
   * @param {number} current $$D - w_6 \cdot (R - 2)$$
   * @return {number} difficulty
   */
  mean_reversion(init, current) {
    const w = this.param.w;
    return roundTo(w[7] * init + (1 - w[7]) * current, 8);
  }
  /**
   * The formula used is :
   * $$S^\prime_r(D,S,R,G) = S\cdot(e^{w_8}\cdot (11-D)\cdot S^{-w_9}\cdot(e^{w_{10}\cdot(1-R)}-1)\cdot w_{15}(\text{if} G=2) \cdot w_{16}(\text{if} G=4)+1)$$
   * @param {number} d Difficulty D \in [1,10]
   * @param {number} s Stability (interval when R=90%)
   * @param {number} r Retrievability (probability of recall)
   * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
   * @return {number} S^\prime_r new stability after recall
   */
  next_recall_stability(d, s, r, g) {
    const w = this.param.w;
    const hard_penalty = Rating2.Hard === g ? w[15] : 1;
    const easy_bound = Rating2.Easy === g ? w[16] : 1;
    return roundTo(
      clamp(
        s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound),
        S_MIN,
        36500
      ),
      8
    );
  }
  /**
   * The formula used is :
   * $$S^\prime_f(D,S,R) = w_{11}\cdot D^{-w_{12}}\cdot ((S+1)^{w_{13}}-1) \cdot e^{w_{14}\cdot(1-R)}$$
   * enable_short_term = true : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, \frac{S}{e^{w_{17} \cdot w_{18}}} \rbrace$$
   * enable_short_term = false : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, S \rbrace$$
   * @param {number} d Difficulty D \in [1,10]
   * @param {number} s Stability (interval when R=90%)
   * @param {number} r Retrievability (probability of recall)
   * @return {number} S^\prime_f new stability after forgetting
   */
  next_forget_stability(d, s, r) {
    const w = this.param.w;
    return roundTo(
      clamp(
        w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
        S_MIN,
        36500
      ),
      8
    );
  }
  /**
   * The formula used is :
   * $$S^\prime_s(S,G) = S \cdot e^{w_{17} \cdot (G-3+w_{18})}$$
   * @param {number} s Stability (interval when R=90%)
   * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
   */
  next_short_term_stability(s, g) {
    const w = this.param.w;
    const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
    const maskedSinc = g >= Rating2.Hard ? Math.max(sinc, 1) : sinc;
    return roundTo(clamp(s * maskedSinc, S_MIN, 36500), 8);
  }
  /**
   * Calculates the next state of memory based on the current state, time elapsed, and grade.
   *
   * @param memory_state - The current state of memory, which can be null.
   * @param t - The time elapsed since the last review.
   * @param {Rating} g Grade (Rating[0.Manual,1.Again,2.Hard,3.Good,4.Easy])
   * @param r - Optional retrievability value. If not provided, it will be calculated.
   * @returns The next state of memory with updated difficulty and stability.
   */
  next_state(memory_state, t2, g, r) {
    const { difficulty: d, stability: s } = memory_state != null ? memory_state : {
      difficulty: 0,
      stability: 0
    };
    if (t2 < 0) {
      throw new FSRSValidationError(`Invalid delta_t "${t2}"`);
    }
    if (g < 0 || g > 4) {
      throw new FSRSValidationError(`Invalid grade "${g}"`);
    }
    if (d === 0 && s === 0) {
      return {
        difficulty: clamp(this.init_difficulty(g), 1, 10),
        stability: this.init_stability(g)
      };
    }
    if (g === 0) {
      return {
        difficulty: d,
        stability: s
      };
    }
    if (d < 1 || s < S_MIN) {
      throw new FSRSValidationError(
        `Invalid memory state { difficulty: ${d}, stability: ${s} }`
      );
    }
    const w = this.param.w;
    r = typeof r === "number" ? r : this.forgetting_curve(t2, s);
    let new_s;
    if (t2 === 0 && this.param.enable_short_term) {
      new_s = this.next_short_term_stability(s, g);
    } else if (g === 1) {
      const s_after_fail = this.next_forget_stability(d, s, r);
      let [w_17, w_18] = [0, 0];
      if (this.param.enable_short_term) {
        w_17 = w[17];
        w_18 = w[18];
      }
      const next_s_min = s / Math.exp(w_17 * w_18);
      new_s = clamp(roundTo(next_s_min, 8), S_MIN, s_after_fail);
    } else {
      new_s = this.next_recall_stability(d, s, r, g);
    }
    const new_d = this.next_difficulty(d, g);
    return { difficulty: new_d, stability: new_s };
  }
};
var BasicScheduler = class extends AbstractScheduler {
  constructor(card, now, algorithm, strategies) {
    super(card, now, algorithm, strategies);
    __publicField(this, "learningStepsStrategy");
    let learningStepStrategy = BasicLearningStepsStrategy;
    if (this.strategies) {
      const custom_strategy = this.strategies.get(StrategyMode.LEARNING_STEPS);
      if (custom_strategy) {
        learningStepStrategy = custom_strategy;
      }
    }
    this.learningStepsStrategy = learningStepStrategy;
  }
  getLearningInfo(card, grade) {
    var _a, _b, _c, _d;
    const parameters = this.algorithm.parameters;
    card.learning_steps = card.learning_steps || 0;
    const steps_strategy = this.learningStepsStrategy(
      parameters,
      card.state,
      card.learning_steps
    );
    const scheduled_minutes = Math.max(
      0,
      (_b = (_a = steps_strategy[grade]) == null ? void 0 : _a.scheduled_minutes) != null ? _b : 0
    );
    const next_steps = Math.max(0, (_d = (_c = steps_strategy[grade]) == null ? void 0 : _c.next_step) != null ? _d : 0);
    return {
      scheduled_minutes,
      next_steps
    };
  }
  /**
   * @description This function applies the learning steps based on the current card's state and grade.
   */
  applyLearningSteps(nextCard, grade, to_state) {
    const { scheduled_minutes, next_steps } = this.getLearningInfo(
      this.current,
      grade
    );
    if (scheduled_minutes > 0 && scheduled_minutes < 1440) {
      nextCard.learning_steps = next_steps;
      nextCard.scheduled_days = 0;
      nextCard.state = to_state;
      nextCard.due = date_scheduler(
        this.review_time,
        Math.round(scheduled_minutes),
        false
        /** true:days false: minute */
      );
    } else {
      nextCard.state = State.Review;
      if (scheduled_minutes >= 1440) {
        nextCard.learning_steps = next_steps;
        nextCard.due = date_scheduler(
          this.review_time,
          Math.round(scheduled_minutes),
          false
          /** true:days false: minute */
        );
        nextCard.scheduled_days = Math.floor(scheduled_minutes / 1440);
      } else {
        nextCard.learning_steps = 0;
        const interval = this.algorithm.next_interval(
          nextCard.stability,
          this.elapsed_days
        );
        nextCard.scheduled_days = interval;
        nextCard.due = date_scheduler(this.review_time, interval, true);
      }
    }
  }
  newState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const next = this.next_ds(this.elapsed_days, grade);
    this.applyLearningSteps(next, grade, State.Learning);
    const item = {
      card: next,
      log: this.buildLog(grade)
    };
    this.next.set(grade, item);
    return item;
  }
  learningState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const next = this.next_ds(this.elapsed_days, grade);
    this.applyLearningSteps(
      next,
      grade,
      this.last.state
      /** Learning or Relearning */
    );
    const item = {
      card: next,
      log: this.buildLog(grade)
    };
    this.next.set(grade, item);
    return item;
  }
  reviewState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const interval = this.elapsed_days;
    const retrievability = this.algorithm.forgetting_curve(
      interval,
      this.current.stability
    );
    const next_again = this.next_ds(interval, Rating2.Again, retrievability);
    const next_hard = this.next_ds(interval, Rating2.Hard, retrievability);
    const next_good = this.next_ds(interval, Rating2.Good, retrievability);
    const next_easy = this.next_ds(interval, Rating2.Easy, retrievability);
    this.next_interval(next_hard, next_good, next_easy, interval);
    this.next_state(next_hard, next_good, next_easy);
    this.applyLearningSteps(next_again, Rating2.Again, State.Relearning);
    next_again.lapses += 1;
    const item_again = {
      card: next_again,
      log: this.buildLog(Rating2.Again)
    };
    const item_hard = {
      card: next_hard,
      log: super.buildLog(Rating2.Hard)
    };
    const item_good = {
      card: next_good,
      log: super.buildLog(Rating2.Good)
    };
    const item_easy = {
      card: next_easy,
      log: super.buildLog(Rating2.Easy)
    };
    this.next.set(Rating2.Again, item_again);
    this.next.set(Rating2.Hard, item_hard);
    this.next.set(Rating2.Good, item_good);
    this.next.set(Rating2.Easy, item_easy);
    return this.next.get(grade);
  }
  /**
   * Review next_ds
   */
  next_ds(t2, g, r) {
    const next_state = this.algorithm.next_state(
      {
        difficulty: this.current.difficulty,
        stability: this.current.stability
      },
      t2,
      g,
      r
    );
    const card = TypeConvert.card(this.current);
    card.difficulty = next_state.difficulty;
    card.stability = next_state.stability;
    return card;
  }
  /**
   * Review next_interval
   */
  next_interval(next_hard, next_good, next_easy, interval) {
    let hard_interval, good_interval;
    hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
    good_interval = this.algorithm.next_interval(next_good.stability, interval);
    hard_interval = Math.min(hard_interval, good_interval);
    good_interval = Math.max(good_interval, hard_interval + 1);
    const easy_interval = Math.max(
      this.algorithm.next_interval(next_easy.stability, interval),
      good_interval + 1
    );
    next_hard.scheduled_days = hard_interval;
    next_hard.due = date_scheduler(this.review_time, hard_interval, true);
    next_good.scheduled_days = good_interval;
    next_good.due = date_scheduler(this.review_time, good_interval, true);
    next_easy.scheduled_days = easy_interval;
    next_easy.due = date_scheduler(this.review_time, easy_interval, true);
  }
  /**
   * Review next_state
   */
  next_state(next_hard, next_good, next_easy) {
    next_hard.state = State.Review;
    next_hard.learning_steps = 0;
    next_good.state = State.Review;
    next_good.learning_steps = 0;
    next_easy.state = State.Review;
    next_easy.learning_steps = 0;
  }
};
var LongTermScheduler = class extends AbstractScheduler {
  newState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    this.current.scheduled_days = 0;
    this.current.elapsed_days = 0;
    const first_interval = 0;
    const next_again = this.next_ds(first_interval, Rating2.Again);
    const next_hard = this.next_ds(first_interval, Rating2.Hard);
    const next_good = this.next_ds(first_interval, Rating2.Good);
    const next_easy = this.next_ds(first_interval, Rating2.Easy);
    this.next_interval(
      next_again,
      next_hard,
      next_good,
      next_easy,
      first_interval
    );
    this.next_state(next_again, next_hard, next_good, next_easy);
    this.update_next(next_again, next_hard, next_good, next_easy);
    return this.next.get(grade);
  }
  next_ds(t2, g, r) {
    const next_state = this.algorithm.next_state(
      {
        difficulty: this.current.difficulty,
        stability: this.current.stability
      },
      t2,
      g,
      r
    );
    const card = TypeConvert.card(this.current);
    card.difficulty = next_state.difficulty;
    card.stability = next_state.stability;
    return card;
  }
  /**
   * @see https://github.com/open-spaced-repetition/ts-fsrs/issues/98#issuecomment-2241923194
   */
  learningState(grade) {
    return this.reviewState(grade);
  }
  reviewState(grade) {
    const exist = this.next.get(grade);
    if (exist) {
      return exist;
    }
    const interval = this.elapsed_days;
    const retrievability = this.algorithm.forgetting_curve(
      interval,
      this.current.stability
    );
    const next_again = this.next_ds(interval, Rating2.Again, retrievability);
    const next_hard = this.next_ds(interval, Rating2.Hard, retrievability);
    const next_good = this.next_ds(interval, Rating2.Good, retrievability);
    const next_easy = this.next_ds(interval, Rating2.Easy, retrievability);
    this.next_interval(next_again, next_hard, next_good, next_easy, interval);
    this.next_state(next_again, next_hard, next_good, next_easy);
    next_again.lapses += 1;
    this.update_next(next_again, next_hard, next_good, next_easy);
    return this.next.get(grade);
  }
  /**
   * Review/New next_interval
   */
  next_interval(next_again, next_hard, next_good, next_easy, interval) {
    let again_interval, hard_interval, good_interval, easy_interval;
    again_interval = this.algorithm.next_interval(
      next_again.stability,
      interval
    );
    hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
    good_interval = this.algorithm.next_interval(next_good.stability, interval);
    easy_interval = this.algorithm.next_interval(next_easy.stability, interval);
    again_interval = Math.min(again_interval, hard_interval);
    hard_interval = Math.max(hard_interval, again_interval + 1);
    good_interval = Math.max(good_interval, hard_interval + 1);
    easy_interval = Math.max(easy_interval, good_interval + 1);
    next_again.scheduled_days = again_interval;
    next_again.due = date_scheduler(this.review_time, again_interval, true);
    next_hard.scheduled_days = hard_interval;
    next_hard.due = date_scheduler(this.review_time, hard_interval, true);
    next_good.scheduled_days = good_interval;
    next_good.due = date_scheduler(this.review_time, good_interval, true);
    next_easy.scheduled_days = easy_interval;
    next_easy.due = date_scheduler(this.review_time, easy_interval, true);
  }
  /**
   * Review/New next_state
   */
  next_state(next_again, next_hard, next_good, next_easy) {
    next_again.state = State.Review;
    next_again.learning_steps = 0;
    next_hard.state = State.Review;
    next_hard.learning_steps = 0;
    next_good.state = State.Review;
    next_good.learning_steps = 0;
    next_easy.state = State.Review;
    next_easy.learning_steps = 0;
  }
  update_next(next_again, next_hard, next_good, next_easy) {
    const item_again = {
      card: next_again,
      log: this.buildLog(Rating2.Again)
    };
    const item_hard = {
      card: next_hard,
      log: super.buildLog(Rating2.Hard)
    };
    const item_good = {
      card: next_good,
      log: super.buildLog(Rating2.Good)
    };
    const item_easy = {
      card: next_easy,
      log: super.buildLog(Rating2.Easy)
    };
    this.next.set(Rating2.Again, item_again);
    this.next.set(Rating2.Hard, item_hard);
    this.next.set(Rating2.Good, item_good);
    this.next.set(Rating2.Easy, item_easy);
  }
};
var Reschedule = class {
  /**
   * Creates an instance of the `Reschedule` class.
   * @param fsrs - An instance of the FSRS class used for scheduling.
   */
  constructor(fsrs2) {
    __publicField(this, "fsrs");
    this.fsrs = fsrs2;
  }
  /**
   * Replays a review for a card and determines the next review date based on the given rating.
   * @param card - The card being reviewed.
   * @param reviewed - The date the card was reviewed.
   * @param rating - The grade given to the card during the review.
   * @returns A `RecordLogItem` containing the updated card and review log.
   */
  replay(card, reviewed, rating) {
    return this.fsrs.next(card, reviewed, rating);
  }
  /**
   * Processes a manual review for a card, allowing for custom state, stability, difficulty, and due date.
   * @param card - The card being reviewed.
   * @param state - The state of the card after the review.
   * @param reviewed - The date the card was reviewed.
   * @param elapsed_days - The number of days since the last review.
   * @param stability - (Optional) The stability of the card.
   * @param difficulty - (Optional) The difficulty of the card.
   * @param due - (Optional) The due date for the next review.
   * @returns A `RecordLogItem` containing the updated card and review log.
   * @throws Will throw an error if the state or due date is not provided when required.
   */
  handleManualRating(card, state, reviewed, elapsed_days, stability, difficulty, due) {
    if (typeof state === "undefined") {
      throw new FSRSValidationError(
        "reschedule: state is required for manual rating"
      );
    }
    let log;
    let next_card;
    if (state === State.New) {
      log = {
        rating: Rating2.Manual,
        state,
        due: due != null ? due : reviewed,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days,
        last_elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        review: reviewed
      };
      next_card = createEmptyCard(reviewed);
      next_card.last_review = reviewed;
    } else {
      if (typeof due === "undefined") {
        throw new FSRSValidationError(
          "reschedule: due is required for manual rating"
        );
      }
      const scheduled_days = date_diff(due, reviewed, "days");
      log = {
        rating: Rating2.Manual,
        state: card.state,
        due: card.last_review || card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days,
        last_elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        review: reviewed
      };
      next_card = {
        ...card,
        state,
        due,
        last_review: reviewed,
        stability: stability || card.stability,
        difficulty: difficulty || card.difficulty,
        elapsed_days,
        scheduled_days,
        reps: card.reps + 1
      };
    }
    return { card: next_card, log };
  }
  /**
   * Reschedules a card based on its review history.
   *
   * @param current_card - The card to be rescheduled.
   * @param reviews - An array of review history objects.
   * @returns An array of record log items representing the rescheduling process.
   */
  reschedule(current_card, reviews) {
    const collections = [];
    let cur_card = createEmptyCard(current_card.due);
    for (const review of reviews) {
      let item;
      review.review = TypeConvert.time(review.review);
      if (review.rating === Rating2.Manual) {
        let interval = 0;
        if (cur_card.state !== State.New && cur_card.last_review) {
          interval = date_diff(review.review, cur_card.last_review, "days");
        }
        item = this.handleManualRating(
          cur_card,
          review.state,
          review.review,
          interval,
          review.stability,
          review.difficulty,
          review.due ? TypeConvert.time(review.due) : void 0
        );
      } else {
        item = this.replay(cur_card, review.review, review.rating);
      }
      collections.push(item);
      cur_card = item.card;
    }
    return collections;
  }
  calculateManualRecord(current_card, now, record_log_item, update_memory) {
    if (!record_log_item) {
      return null;
    }
    const { card: reschedule_card, log } = record_log_item;
    const cur_card = TypeConvert.card(current_card);
    if (cur_card.due.getTime() === reschedule_card.due.getTime()) {
      return null;
    }
    cur_card.scheduled_days = date_diff(
      reschedule_card.due,
      cur_card.due,
      "days"
    );
    return this.handleManualRating(
      cur_card,
      reschedule_card.state,
      TypeConvert.time(now),
      log.elapsed_days,
      update_memory ? reschedule_card.stability : void 0,
      update_memory ? reschedule_card.difficulty : void 0,
      reschedule_card.due
    );
  }
};
function applyAfterHandler(value, afterHandler) {
  return typeof afterHandler === "function" ? afterHandler(value) : value;
}
var FSRS = class extends FSRSAlgorithm {
  constructor(param) {
    super(param);
    __publicField(this, "strategyHandler", /* @__PURE__ */ new Map());
    __publicField(this, "Scheduler");
    const { enable_short_term } = this.parameters;
    this.Scheduler = enable_short_term ? BasicScheduler : LongTermScheduler;
  }
  params_handler_proxy() {
    const _this = this;
    return {
      set: function(target, prop, value) {
        if (prop === "request_retention" && Number.isFinite(value)) {
          _this.intervalModifier = _this.calculate_interval_modifier(
            Number(value)
          );
        } else if (prop === "enable_short_term") {
          _this.Scheduler = value === true ? BasicScheduler : LongTermScheduler;
        } else if (prop === "w") {
          value = migrateParameters(
            value,
            target.relearning_steps.length,
            target.enable_short_term
          );
          value = clipParameters(
            Array.from(value),
            target.relearning_steps.length,
            target.enable_short_term
          );
          _this.forgetting_curve = forgetting_curve.bind(this, value);
          _this.intervalModifier = _this.calculate_interval_modifier(
            Number(target.request_retention)
          );
        }
        Reflect.set(target, prop, value);
        return true;
      }
    };
  }
  useStrategy(mode, handler) {
    this.strategyHandler.set(mode, handler);
    return this;
  }
  clearStrategy(mode) {
    if (mode) {
      this.strategyHandler.delete(mode);
    } else {
      this.strategyHandler.clear();
    }
    return this;
  }
  getScheduler(card, now) {
    const schedulerStrategy = this.strategyHandler.get(
      StrategyMode.SCHEDULER
    );
    const Scheduler = schedulerStrategy || this.Scheduler;
    const instance = new Scheduler(card, now, this, this.strategyHandler);
    return instance;
  }
  /**
   * Display the collection of cards and logs for the four scenarios after scheduling the card at the current time.
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const card: Card = createEmptyCard(new Date());
   * const f = fsrs();
   * const recordLog = f.repeat(card, new Date());
   * ```
   * @example
   * ```typescript
   * interface RevLogUnchecked
   *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
   *   cid: string;
   *   due: Date | number;
   *   state: StateType;
   *   review: Date | number;
   *   rating: RatingType;
   * }
   *
   * interface RepeatRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked;
   * }
   *
   * function repeatAfterHandler(recordLog: RecordLog) {
   *     const record: { [key in Grade]: RepeatRecordLog } = {} as {
   *       [key in Grade]: RepeatRecordLog;
   *     };
   *     for (const grade of Grades) {
   *       record[grade] = {
   *         card: {
   *           ...(recordLog[grade].card as Card & { cid: string }),
   *           due: recordLog[grade].card.due.getTime(),
   *           state: State[recordLog[grade].card.state] as StateType,
   *           last_review: recordLog[grade].card.last_review
   *             ? recordLog[grade].card.last_review!.getTime()
   *             : null,
   *         },
   *         log: {
   *           ...recordLog[grade].log,
   *           cid: (recordLog[grade].card as Card & { cid: string }).cid,
   *           due: recordLog[grade].log.due.getTime(),
   *           review: recordLog[grade].log.review.getTime(),
   *           state: State[recordLog[grade].log.state] as StateType,
   *           rating: Rating[recordLog[grade].log.rating] as RatingType,
   *         },
   *       };
   *     }
   *     return record;
   * }
   * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
   * const f = fsrs();
   * const recordLog = f.repeat(card, new Date(), repeatAfterHandler);
   * ```
   */
  repeat(card, now, afterHandler) {
    const instance = this.getScheduler(card, now);
    const recordLog = instance.preview();
    return applyAfterHandler(recordLog, afterHandler);
  }
  /**
   * Display the collection of cards and logs for the card scheduled at the current time, after applying a specific grade rating.
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param grade Rating of the review (Again, Hard, Good, Easy)
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const card: Card = createEmptyCard(new Date());
   * const f = fsrs();
   * const recordLogItem = f.next(card, new Date(), Rating.Again);
   * ```
   * @example
   * ```typescript
   * interface RevLogUnchecked
   *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
   *   cid: string;
   *   due: Date | number;
   *   state: StateType;
   *   review: Date | number;
   *   rating: RatingType;
   * }
   *
   * interface NextRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked;
   * }
   *
  function nextAfterHandler(recordLogItem: RecordLogItem) {
    const recordItem = {
      card: {
        ...(recordLogItem.card as Card & { cid: string }),
        due: recordLogItem.card.due.getTime(),
        state: State[recordLogItem.card.state] as StateType,
        last_review: recordLogItem.card.last_review
          ? recordLogItem.card.last_review!.getTime()
          : null,
      },
      log: {
        ...recordLogItem.log,
        cid: (recordLogItem.card as Card & { cid: string }).cid,
        due: recordLogItem.log.due.getTime(),
        review: recordLogItem.log.review.getTime(),
        state: State[recordLogItem.log.state] as StateType,
        rating: Rating[recordLogItem.log.rating] as RatingType,
      },
    };
    return recordItem
  }
   * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
   * const f = fsrs();
   * const recordLogItem = f.repeat(card, new Date(), Rating.Again, nextAfterHandler);
   * ```
   */
  next(card, now, grade, afterHandler) {
    const instance = this.getScheduler(card, now);
    const g = TypeConvert.rating(grade);
    if (g === Rating2.Manual) {
      throw new FSRSValidationError("Cannot review a manual rating");
    }
    const recordLogItem = instance.review(g);
    return applyAfterHandler(recordLogItem, afterHandler);
  }
  /**
   * Get the retrievability of the card
   * @param card  Card to be processed
   * @param now  Current time or scheduled time
   * @param format  default:true , Convert the result to another type. (Optional)
   * @returns  The retrievability of the card,if format is true, the result is a string, otherwise it is a number
   */
  get_retrievability(card, now, format = true) {
    const processedCard = TypeConvert.card(card);
    now = now ? TypeConvert.time(now) : /* @__PURE__ */ new Date();
    const t2 = processedCard.state !== State.New ? Math.max(date_diff(now, processedCard.last_review, "days"), 0) : 0;
    const r = processedCard.state !== State.New ? this.forgetting_curve(t2, +processedCard.stability.toFixed(8)) : 0;
    return format ? `${(r * 100).toFixed(2)}%` : r;
  }
  /**
   *
   * @param card Card to be processed
   * @param log last review log
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now);
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now);
   * const { card, log } = repeatFormAfterHandler[Rating.Hard];
   * const rollbackFromAfterHandler = f.rollback(card, log);
   * ```
   *
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler);  //see method: createEmptyCard
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
   * const { card, log } = repeatFormAfterHandler[Rating.Hard];
   * const rollbackFromAfterHandler = f.rollback(card, log, cardAfterHandler);
   * ```
   */
  rollback(card, log, afterHandler) {
    const processedCard = TypeConvert.card(card);
    const processedLog = TypeConvert.review_log(log);
    if (processedLog.rating === Rating2.Manual) {
      throw new FSRSValidationError("Cannot rollback a manual rating");
    }
    let last_due;
    let last_review;
    let last_lapses;
    switch (processedLog.state) {
      case State.New:
        last_due = processedLog.due;
        last_review = void 0;
        last_lapses = 0;
        break;
      case State.Learning:
      case State.Relearning:
      case State.Review:
        last_due = processedLog.review;
        last_review = processedLog.due;
        last_lapses = processedCard.lapses - (processedLog.rating === Rating2.Again && processedLog.state === State.Review ? 1 : 0);
        break;
    }
    const prevCard = {
      ...processedCard,
      due: last_due,
      stability: processedLog.stability,
      difficulty: processedLog.difficulty,
      elapsed_days: processedLog.last_elapsed_days,
      scheduled_days: processedLog.scheduled_days,
      reps: Math.max(0, processedCard.reps - 1),
      lapses: Math.max(0, last_lapses),
      learning_steps: processedLog.learning_steps,
      state: processedLog.state,
      last_review
    };
    return applyAfterHandler(prevCard, afterHandler);
  }
  /**
   *
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param reset_count Should the review count information(reps,lapses) be reset. (Optional)
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCard = createEmptyCard(now);
   * const scheduling_cards = f.repeat(emptyCard, now);
   * const { card, log } = scheduling_cards[Rating.Hard];
   * const forgetCard = f.forget(card, new Date(), true);
   * ```
   *
   * @example
   * ```typescript
   * interface RepeatRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked; //see method: fsrs.repeat()
   * }
   *
   * function forgetAfterHandler(recordLogItem: RecordLogItem): RepeatRecordLog {
   *     return {
   *       card: {
   *         ...(recordLogItem.card as Card & { cid: string }),
   *         due: recordLogItem.card.due.getTime(),
   *         state: State[recordLogItem.card.state] as StateType,
   *         last_review: recordLogItem.card.last_review
   *           ? recordLogItem.card.last_review!.getTime()
   *           : null,
   *       },
   *       log: {
   *         ...recordLogItem.log,
   *         cid: (recordLogItem.card as Card & { cid: string }).cid,
   *         due: recordLogItem.log.due.getTime(),
   *         review: recordLogItem.log.review.getTime(),
   *         state: State[recordLogItem.log.state] as StateType,
   *         rating: Rating[recordLogItem.log.rating] as RatingType,
   *       },
   *     };
   * }
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler); //see method:  createEmptyCard
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
   * const { card } = repeatFormAfterHandler[Rating.Hard];
   * const forgetFromAfterHandler = f.forget(card, date_scheduler(now, 1, true), false, forgetAfterHandler);
   * ```
   */
  forget(card, now, reset_count = false, afterHandler) {
    const processedCard = TypeConvert.card(card);
    now = TypeConvert.time(now);
    const scheduled_days = processedCard.state === State.New ? 0 : date_diff(now, processedCard.due, "days");
    const forget_log = {
      rating: Rating2.Manual,
      state: processedCard.state,
      due: processedCard.due,
      stability: processedCard.stability,
      difficulty: processedCard.difficulty,
      elapsed_days: 0,
      last_elapsed_days: processedCard.elapsed_days,
      scheduled_days,
      learning_steps: processedCard.learning_steps,
      review: now
    };
    const forget_card = {
      ...processedCard,
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: reset_count ? 0 : processedCard.reps,
      lapses: reset_count ? 0 : processedCard.lapses,
      learning_steps: 0,
      state: State.New,
      last_review: processedCard.last_review
    };
    const recordLogItem = { card: forget_card, log: forget_log };
    return applyAfterHandler(recordLogItem, afterHandler);
  }
  /**
   * Reschedules the current card and returns the rescheduled collections and reschedule item.
   *
   * @template T - The type of the record log item.
   * @param {CardInput | Card} current_card - The current card to be rescheduled.
   * @param {Array<FSRSHistory>} reviews - The array of FSRSHistory objects representing the reviews.
   * @param {Partial<RescheduleOptions<T>>} options - The optional reschedule options.
   * @returns {IReschedule<T>} - The rescheduled collections and reschedule item.
   *
   * @example
   * ```typescript
   * const f = fsrs()
   * const grades: Grade[] = [Rating.Good, Rating.Good, Rating.Good, Rating.Good]
   * const reviews_at = [
   *   new Date(2024, 8, 13),
   *   new Date(2024, 8, 13),
   *   new Date(2024, 8, 17),
   *   new Date(2024, 8, 28),
   * ]
   *
   * const reviews: FSRSHistory[] = []
   * for (let i = 0; i < grades.length; i++) {
   *   reviews.push({
   *     rating: grades[i],
   *     review: reviews_at[i],
   *   })
   * }
   *
   * const results_short = scheduler.reschedule(
   *   createEmptyCard(),
   *   reviews,
   *   {
   *     skipManual: false,
   *   }
   * )
   * console.log(results_short)
   * ```
   */
  reschedule(current_card, reviews = [], options = {}) {
    const {
      recordLogHandler,
      reviewsOrderBy,
      skipManual = true,
      now = /* @__PURE__ */ new Date(),
      update_memory_state: updateMemoryState = false
    } = options;
    if (reviewsOrderBy && typeof reviewsOrderBy === "function") {
      reviews.sort(reviewsOrderBy);
    }
    if (skipManual) {
      reviews = reviews.filter((review) => review.rating !== Rating2.Manual);
    }
    const rescheduleSvc = new Reschedule(this);
    const collections = rescheduleSvc.reschedule(
      options.first_card || createEmptyCard(),
      reviews
    );
    const len = collections.length;
    const cur_card = TypeConvert.card(current_card);
    const manual_item = rescheduleSvc.calculateManualRecord(
      cur_card,
      now,
      len ? collections[len - 1] : void 0,
      updateMemoryState
    );
    return {
      collections: typeof recordLogHandler === "function" ? collections.map(recordLogHandler) : collections,
      reschedule_item: manual_item ? applyAfterHandler(manual_item, recordLogHandler) : null
    };
  }
};
var fsrs = (params) => {
  return new FSRS(params || {});
};

// src/core/store/reviewLogs.ts
var REVIEW_LOG_RETENTION_DAYS = 90;
function mergeReviewLogs(a, b) {
  const byId = /* @__PURE__ */ new Map();
  for (const log of a) byId.set(log.id, log);
  for (const log of b) if (!byId.has(log.id)) byId.set(log.id, log);
  return [...byId.values()].sort((x, y) => x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
}
function pruneReviewLogs(logs, now, days = REVIEW_LOG_RETENTION_DAYS) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1e3;
  return logs.filter((log) => new Date(log.at).getTime() >= cutoff);
}

// src/core/text/cloze.ts
var SUFFIXES = "(?:s|es|ed|d|ing|er|est|ly)?";
function clozeParts(sentence, word) {
  const w = word.trim();
  if (!sentence || !w) return null;
  const re = new RegExp(
    `(?<![A-Za-z0-9'\\-])${escapeRe(w)}${SUFFIXES}(?![A-Za-z0-9'\\-])`,
    "i"
  );
  const m = re.exec(sentence);
  if (!m) return null;
  return {
    before: sentence.slice(0, m.index),
    answer: m[0],
    after: sentence.slice(m.index + m[0].length)
  };
}

// src/services/srs/queue.ts
function isNewCard(entry) {
  return !entry.srs || entry.srs.state === SrsState.New;
}
function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function newIntroducedToday(logs, now) {
  const dayStart = startOfLocalDay(now).getTime();
  const ids = /* @__PURE__ */ new Set();
  for (const log of logs) {
    if (log.prevState !== SrsState.New) continue;
    if (new Date(log.at).getTime() >= dayStart) ids.add(log.entryId);
  }
  return ids.size;
}
function matchesFilter(entry, filter) {
  var _a, _b;
  if (entry.deletedAt) return false;
  if (filter.source && !((_b = (_a = entry.source) == null ? void 0 : _a.path) != null ? _b : "").startsWith(filter.source)) return false;
  if (filter.mode === "cloze" && !clozeParts(entry.example, entry.word)) return false;
  return true;
}
function dueMs(entry) {
  return entry.srs ? new Date(entry.srs.due).getTime() : 0;
}
function addedKey(entry) {
  var _a, _b;
  return (_b = (_a = entry.createdAt) != null ? _a : entry.added) != null ? _b : "";
}
function buildQueue(entries, filter, ctx) {
  const nowMs = ctx.now.getTime();
  const candidates = entries.filter((e) => matchesFilter(e, filter));
  const due = candidates.filter((e) => !isNewCard(e) && dueMs(e) <= nowMs).sort((a, b) => dueMs(a) - dueMs(b));
  const allowance = Math.max(0, ctx.dailyNew - newIntroducedToday(ctx.logs, ctx.now));
  const fresh = candidates.filter(isNewCard).sort((a, b) => addedKey(a) < addedKey(b) ? -1 : addedKey(a) > addedKey(b) ? 1 : 0).slice(0, allowance);
  const queue = [...due, ...fresh];
  return filter.limit !== void 0 && filter.limit >= 0 ? queue.slice(0, filter.limit) : queue;
}
function countDueBetween(entries, filter, from, to) {
  const a = from.getTime();
  const b = to.getTime();
  return entries.filter((e) => {
    if (!matchesFilter(e, filter) || isNewCard(e)) return false;
    const ms = dueMs(e);
    return ms >= a && ms < b;
  }).length;
}

// src/services/srs/SrsService.ts
var REVIEWS_SHARD = "reviews";
var WRITE_DEBOUNCE_MS2 = 500;
var GRADE = {
  1: Rating2.Again,
  2: Rating2.Hard,
  3: Rating2.Good,
  4: Rating2.Easy
};
function toFsrsCard(card) {
  var _a;
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: (_a = card.learningSteps) != null ? _a : 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview ? new Date(card.lastReview) : void 0
  };
}
function fromFsrsCard(card) {
  const out = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state
  };
  if (card.last_review) out.lastReview = card.last_review.toISOString();
  return out;
}
function defaultId(now) {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var SrsService = class {
  constructor(deps) {
    this.deps = deps;
    this.logs = [];
    this.loading = null;
    this.writeTimer = null;
    this.pendingWrite = Promise.resolve();
    this.scheduler = null;
    var _a, _b;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
    this.newId = (_b = deps.newId) != null ? _b : (() => defaultId(this.clock()));
  }
  settings() {
    var _a;
    return resolveSrsSettings((_a = this.deps.store.vocabData.settings) == null ? void 0 : _a.srs);
  }
  // Review logs are read lazily ("開單字卡時", §4.2) — only the daily
  // new-card cap and the done screen need them. Memoized: callers can
  // await this freely before every queue().
  ensureLoaded() {
    if (!this.loading) this.loading = this.reloadLogs();
    return this.loading;
  }
  // Unions what's on disk into memory — another device may have synced
  // new reviews in. Never drops in-memory logs that haven't been written.
  async reloadLogs() {
    var _a;
    try {
      const disk = await this.deps.storage.readShard(REVIEWS_SHARD);
      this.logs = pruneReviewLogs(mergeReviewLogs(this.logs, (_a = disk == null ? void 0 : disk.logs) != null ? _a : []), this.clock());
    } catch (e) {
      console.error("Vocab Tracker: couldn't read review logs", e);
    }
  }
  reviewLogs() {
    return this.logs;
  }
  queue(filter = {}) {
    return buildQueue(this.deps.store.vocabData.entries, filter, {
      now: this.clock(),
      dailyNew: this.settings().dailyNew,
      logs: this.logs
    });
  }
  // Cards due tomorrow (local calendar day) — the done screen's "明天到期".
  dueTomorrow(filter = {}) {
    const today = startOfLocalDay(this.clock());
    return countDueBetween(this.deps.store.vocabData.entries, filter, addDays(today, 1), addDays(today, 2));
  }
  // Reviews logged today (local calendar day) for words matching the
  // source filter — the done screen's "今天複習". Counts every rating, so
  // a card failed and retried counts twice, same as the effort it took.
  reviewsToday(filter = {}) {
    const dayStart = startOfLocalDay(this.clock()).getTime();
    const ids = new Set(
      this.deps.store.vocabData.entries.filter((e) => matchesFilter(e, { source: filter.source })).map((e) => e.id)
    );
    return this.logs.filter((l) => ids.has(l.entryId) && new Date(l.at).getTime() >= dayStart).length;
  }
  // When this entry is next due, or null for a card that's never been
  // scheduled (shown as "new" rather than a date).
  nextDue(entry) {
    return isNewCard(entry) || !entry.srs ? null : new Date(entry.srs.due);
  }
  // The four candidate outcomes for the rating buttons (L3). Uses the same
  // card + clock path as rate(), and fuzz is off, so the label on a button
  // is exactly the interval that pressing it produces.
  preview(entry, now = this.clock()) {
    const f = this.fsrs();
    const card = this.cardOf(entry, now);
    const out = {};
    for (const rating of RATINGS) {
      const next = f.next(card, now, GRADE[rating]).card;
      out[rating] = { due: next.due.toISOString(), intervalMs: next.due.getTime() - now.getTime() };
    }
    return out;
  }
  async rate(entry, rating, mode, elapsedMs = 0) {
    var _a;
    const now = this.clock();
    const card = this.cardOf(entry, now);
    const next = this.fsrs().next(card, now, GRADE[rating]).card;
    const log = {
      id: this.newId(),
      entryId: entry.id,
      at: now.toISOString(),
      rating,
      mode,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      prevState: card.state
    };
    entry.srs = fromFsrsCard(next);
    entry.lastReviewed = nowStamp(now);
    entry.reviews = ((_a = entry.reviews) != null ? _a : 0) + 1;
    this.logs = mergeReviewLogs(this.logs, [log]);
    this.scheduleLogWrite();
    await this.deps.store.touch(entry);
    return log;
  }
  // Lands any debounced review-log write now (plugin unload).
  async flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.enqueueLogWrite();
    }
    await this.pendingWrite;
  }
  dispose() {
    return this.flush();
  }
  cardOf(entry, now) {
    return entry.srs ? toFsrsCard(entry.srs) : createEmptyCard(now);
  }
  fsrs() {
    const { retention } = this.settings();
    if (!this.scheduler || this.scheduler.retention !== retention) {
      this.scheduler = {
        retention,
        f: fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false }))
      };
    }
    return this.scheduler.f;
  }
  scheduleLogWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.enqueueLogWrite();
    }, WRITE_DEBOUNCE_MS2);
  }
  // Read-merge-write rather than a blind overwrite: reviews.json isn't
  // covered by onExternalSettingsChange (that only fires for data.json),
  // so this is where another device's synced reviews get folded in
  // instead of clobbered. Chained so two writes never interleave.
  enqueueLogWrite() {
    this.pendingWrite = this.pendingWrite.then(async () => {
      try {
        await this.reloadLogs();
        await this.deps.storage.writeShard(REVIEWS_SHARD, { logs: this.logs });
      } catch (e) {
        console.error("Vocab Tracker: couldn't save review logs", e);
      }
    });
  }
};

// src/ui/blocks/flashcards.ts
var import_obsidian7 = require("obsidian");

// src/core/text/interval.ts
var MIN = 60 * 1e3;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;
function splitInterval(ms) {
  const round = (n) => Math.max(1, Math.round(n));
  if (ms < HOUR) return { value: round(ms / MIN), unit: "m" };
  if (ms < DAY) return { value: round(ms / HOUR), unit: "h" };
  if (ms < 30 * DAY) return { value: round(ms / DAY), unit: "d" };
  if (ms < 365 * DAY) return { value: round(ms / (30 * DAY)), unit: "mo" };
  return { value: Math.max(1, Math.round(ms / (365 * DAY) * 10) / 10), unit: "y" };
}

// src/ui/blocks/params.ts
function parseBlockParams(source) {
  const out = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}
var MODE_ALIASES = {
  "en-zh": "en-zh",
  "en\u2192zh": "en-zh",
  "\u82F1\u2192\u4E2D": "en-zh",
  "zh-en": "zh-en",
  "zh\u2192en": "zh-en",
  "\u4E2D\u2192\u82F1": "zh-en",
  cloze: "cloze",
  "\u4F8B\u53E5\u586B\u7A7A": "cloze",
  listen: "listen",
  "\u807D\u97F3\u62FC\u5B57": "listen"
};
function parseFlashcardParams(source) {
  var _a, _b, _c;
  const p = parseBlockParams(source);
  const mode = (_b = MODE_ALIASES[((_a = p.mode) != null ? _a : "").toLowerCase()]) != null ? _b : CARD_MODES[0];
  const out = { mode };
  const src = ((_c = p.source) != null ? _c : "").replace(/^["']|["']$/g, "").replace(/^\/+/, "");
  if (src) out.source = src;
  const limit = Number(p.limit);
  if (p.limit !== void 0 && Number.isInteger(limit) && limit > 0) out.limit = limit;
  return out;
}

// src/ui/blocks/flashcards.ts
function renderFlashcards(plugin, source, el, ctx) {
  ctx.addChild(new FlashcardsBlock(el, plugin, parseFlashcardParams(source)));
}
function formatInterval(ms) {
  const { value, unit } = splitInterval(ms);
  return t(`srs.interval.${unit}`, { n: value });
}
var FlashcardsBlock = class extends import_obsidian7.MarkdownRenderChild {
  constructor(containerEl, plugin, params) {
    super(containerEl);
    this.plugin = plugin;
    this.params = params;
    this.phase = "loading";
    this.session = [];
    this.index = 0;
    this.flipped = false;
    this.shownAt = 0;
    this.typed = "";
    this.results = [];
    this.initialDue = 0;
    this.initialNew = 0;
    // Set while rate() is in flight: rate() fires data:changed itself, and
    // reacting to our own write would double-render mid-transition.
    this.busy = false;
    this.disposed = false;
    this.mode = params.mode;
  }
  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: "vt vt-flashcards" });
    this.root.tabIndex = 0;
    this.registerDomEvent(this.root, "keydown", (e) => this.onKey(e));
    this.registerDomEvent(this.root, "click", (e) => e.stopPropagation());
    this.register(this.plugin.store.events.on("data:changed", () => this.onStoreChanged()));
    this.render();
    void this.plugin.srs.ensureLoaded().then(() => {
      if (!this.disposed) this.startSession();
    });
  }
  onunload() {
    this.disposed = true;
  }
  // ── Session state ─────────────────────────────────────────────
  filter() {
    return { source: this.params.source, mode: this.mode, limit: this.params.limit };
  }
  live(id) {
    if (!id) return void 0;
    return this.plugin.store.entries.find((e) => e.id === id);
  }
  current() {
    return this.live(this.session[this.index]);
  }
  // `ids` replays a specific set (e.g. "practice forgotten words") instead
  // of the due queue; they're still filtered by mode so cloze never shows
  // a card it can't blank out.
  startSession(ids, opts = {}) {
    const cards = ids ? ids.map((id) => this.live(id)).filter((e) => !!e && matchesFilter(e, { mode: this.mode })) : this.plugin.srs.queue(this.filter());
    this.session = cards.map((e) => e.id);
    this.initialNew = cards.filter(isNewCard).length;
    this.initialDue = cards.length - this.initialNew;
    this.index = 0;
    this.results = [];
    this.resetCard();
    this.phase = "card";
    this.skipMissing();
    this.render();
    if (opts.speak) this.autoSpeak();
  }
  resetCard() {
    this.flipped = false;
    this.typed = "";
    this.shownAt = Date.now();
  }
  // Skips cards deleted (or synced away) since the session started; ends
  // the session when nothing's left.
  skipMissing() {
    while (this.index < this.session.length && !this.current()) this.index++;
    if (this.index >= this.session.length) {
      this.phase = this.results.length > 0 ? "done" : "empty";
    }
  }
  flip() {
    if (this.phase !== "card" || this.flipped) return;
    this.flipped = true;
    this.render();
  }
  async rate(rating) {
    const entry = this.current();
    if (this.phase !== "card" || !this.flipped || this.busy || !entry) return;
    this.busy = true;
    try {
      await this.plugin.srs.rate(entry, rating, this.mode, Date.now() - this.shownAt);
      this.results.push({ id: entry.id, rating });
      this.index++;
      this.resetCard();
      this.skipMissing();
    } catch (err) {
      console.error("Vocab Tracker: rating failed", err);
    } finally {
      this.busy = false;
    }
    this.render();
    this.autoSpeak();
  }
  autoSpeak() {
    const entry = this.current();
    if (this.mode === "listen" && this.phase === "card" && entry) this.plugin.speakWord(entry);
  }
  onStoreChanged() {
    if (this.busy || this.disposed) return;
    if (this.phase === "card" && !this.current()) {
      this.skipMissing();
      this.render();
    } else if (this.phase === "empty") {
      if (this.plugin.srs.queue(this.filter()).length > 0) this.startSession();
    }
  }
  onKey(e) {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || this.phase !== "card") return;
    if (e.target instanceof HTMLInputElement) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        this.flip();
      }
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !this.flipped) {
      e.preventDefault();
      e.stopPropagation();
      this.flip();
    } else if (this.flipped && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      void this.rate(Number(e.key));
    }
  }
  // ── Rendering ─────────────────────────────────────────────────
  render() {
    const hadFocus = this.root.contains(document.activeElement);
    this.root.empty();
    this.root.toggleClass("is-flipped", this.flipped);
    this.renderToolbar();
    if (this.phase === "card") this.renderCard();
    else if (this.phase === "empty") this.renderEmpty();
    else if (this.phase === "done") this.renderDone();
    if (hadFocus) {
      const input = this.root.querySelector("input");
      (input != null ? input : this.root).focus({ preventScroll: true });
    }
  }
  renderToolbar() {
    var _a;
    const bar = this.root.createDiv({ cls: "vt-fc-toolbar" });
    const modes = bar.createDiv({ cls: "vt-fc-modes" });
    for (const mode of CARD_MODES) {
      const b = modes.createEl("button", {
        text: t(`flashcards.mode.${mode}`),
        cls: "vt-fc-mode"
      });
      b.toggleClass("is-active", mode === this.mode);
      b.onclick = () => {
        if (mode === this.mode || this.phase === "loading") return;
        this.mode = mode;
        this.startSession(void 0, { speak: true });
      };
    }
    const src = bar.createDiv({ cls: "vt-fc-source" });
    (0, import_obsidian7.setIcon)(src.createSpan({ cls: "vt-fc-icon" }), "folder");
    src.createSpan({ text: (_a = this.params.source) != null ? _a : t("flashcards.source.all") });
  }
  renderCard() {
    const entry = this.current();
    if (!entry) return;
    this.root.createDiv({
      cls: "vt-fc-progress",
      text: `${this.index + 1} / ${this.session.length}`
    });
    const card = this.root.createDiv({ cls: "vt-fc-card" });
    const front = card.createDiv({ cls: "vt-fc-front" });
    switch (this.mode) {
      case "en-zh":
        this.renderWordHead(front, entry);
        break;
      case "zh-en":
        front.createDiv({ cls: "vt-fc-prompt", text: zhOf(entry) });
        if (entry.partOfSpeech) front.createDiv({ cls: "vt-fc-sub", text: entry.partOfSpeech });
        break;
      case "cloze":
        this.renderSentence(front, entry, this.flipped ? "answer" : "blank");
        if (!this.flipped && entry.definitionZh) {
          front.createDiv({ cls: "vt-fc-sub", text: entry.definitionZh });
        }
        break;
      case "listen":
        this.renderListenFront(front, entry);
        break;
    }
    if (!this.flipped) {
      card.createDiv({ cls: "vt-fc-hint", text: t(`flashcards.hint.${this.mode}`) });
      const flip = card.createEl("button", { cls: "vt-fc-btn vt-fc-flip" });
      flip.createSpan({ text: t("flashcards.flip") });
      flip.createEl("kbd", { cls: "vt-fc-kbd", text: t("flashcards.flipKey") });
      flip.onclick = () => this.flip();
    } else {
      this.renderBack(card.createDiv({ cls: "vt-fc-back" }), entry);
      this.renderRatings(entry);
    }
    const stats = this.root.createDiv({ cls: "vt-fc-stats" });
    const stat = (label, n) => {
      const s = stats.createSpan({ cls: "vt-fc-stat" });
      s.createSpan({ text: label });
      s.createSpan({ cls: "vt-fc-stat-n", text: String(n) });
    };
    stat(t("flashcards.stat.due"), this.initialDue);
    stat(t("flashcards.stat.new"), this.initialNew);
    stat(t("flashcards.stat.done"), this.results.length);
  }
  renderWordHead(el, entry) {
    el.createDiv({ cls: "vt-fc-word", text: entry.word });
    const sub = el.createDiv({ cls: "vt-fc-sub" });
    const meta = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join(" \xB7 ");
    if (meta) sub.createSpan({ text: meta });
    const speak = sub.createEl("button", { cls: "vt-fc-icon-btn", attr: { "aria-label": t("row.pronounce") } });
    (0, import_obsidian7.setIcon)(speak, "volume-2");
    speak.onclick = () => this.plugin.speakWord(entry);
  }
  // Cloze sentence with the word blanked ("blank") or revealed and
  // highlighted ("answer"); also used for the example on the back.
  renderSentence(el, entry, as) {
    const parts = clozeParts(entry.example, entry.word);
    const line = el.createDiv({ cls: "vt-fc-sentence" });
    if (!parts) {
      line.setText(entry.example);
      return;
    }
    line.appendText(parts.before);
    if (as === "blank") line.createSpan({ cls: "vt-fc-blank", text: "_____" });
    else line.createEl("mark", { cls: "vt-fc-mark", text: parts.answer });
    line.appendText(parts.after);
  }
  renderListenFront(el, entry) {
    const play = el.createEl("button", {
      cls: "vt-fc-listen",
      attr: { "aria-label": t("flashcards.listen.replay") }
    });
    (0, import_obsidian7.setIcon)(play, "volume-2");
    play.onclick = () => this.plugin.speakWord(entry);
    if (!this.flipped) {
      const input = el.createEl("input", {
        cls: "vt-fc-input",
        type: "text",
        attr: {
          placeholder: t("flashcards.listen.placeholder"),
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false"
        }
      });
      input.value = this.typed;
      input.oninput = () => this.typed = input.value;
      return;
    }
    const ok = this.typed.trim().toLowerCase() === entry.word.trim().toLowerCase();
    const result = el.createDiv({ cls: ["vt-fc-result", ok ? "is-correct" : "is-wrong"] });
    (0, import_obsidian7.setIcon)(result.createSpan({ cls: "vt-fc-icon" }), ok ? "check" : "x");
    result.createSpan({
      text: ok ? t("flashcards.listen.correct") : t("flashcards.listen.wrong", { answer: this.typed.trim() || "\u2014" })
    });
  }
  renderBack(el, entry) {
    var _a;
    if (this.mode !== "en-zh") this.renderWordHead(el, entry);
    if (this.mode !== "zh-en") el.createDiv({ cls: "vt-fc-answer", text: zhOf(entry) });
    if (entry.definition) el.createDiv({ cls: "vt-fc-def", text: entry.definition });
    if (entry.example && this.mode !== "cloze") this.renderSentence(el, entry, "answer");
    if ((_a = entry.source) == null ? void 0 : _a.path) {
      const src = el.createDiv({ cls: "vt-fc-origin" });
      (0, import_obsidian7.setIcon)(src.createSpan({ cls: "vt-fc-icon" }), "file-text");
      src.createSpan({ text: entry.source.path.split("/").pop().replace(/\.md$/, "") });
      src.onclick = () => this.plugin.jumpToSource(entry);
    }
  }
  renderRatings(entry) {
    const preview = this.plugin.srs.preview(entry);
    const grid = this.root.createDiv({ cls: "vt-fc-ratings" });
    for (const rating of RATINGS) {
      const b = grid.createEl("button", { cls: ["vt-fc-rate", `is-r${rating}`] });
      b.createEl("kbd", { cls: "vt-fc-kbd vt-fc-rate-key", text: String(rating) });
      b.createSpan({ cls: "vt-fc-rate-label", text: t(`srs.rating.${rating}`) });
      b.createSpan({ cls: "vt-fc-rate-interval", text: formatInterval(preview[rating].intervalMs) });
      b.onclick = () => void this.rate(rating);
    }
  }
  renderEmpty() {
    const box = this.root.createDiv({ cls: "vt-fc-empty" });
    (0, import_obsidian7.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "layers");
    box.createDiv({ cls: "vt-fc-empty-title", text: t("flashcards.empty.title") });
    box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.body") });
    if (this.mode === "cloze") {
      box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.cloze") });
    }
    const tiles = box.createDiv({ cls: "vt-fc-tiles" });
    tile(tiles, String(this.plugin.srs.dueTomorrow(this.filter())), t("flashcards.done.dueTomorrow"));
  }
  renderDone() {
    const box = this.root.createDiv({ cls: "vt-fc-empty vt-fc-done" });
    (0, import_obsidian7.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "check-circle-2");
    box.createDiv({ cls: "vt-fc-empty-title", text: t("flashcards.done.title") });
    box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.done.body") });
    const recalled = this.results.filter((r) => r.rating >= Rating.Good).length;
    const tiles = box.createDiv({ cls: "vt-fc-tiles" });
    tile(tiles, String(this.plugin.srs.reviewsToday(this.filter())), t("flashcards.done.reviewedToday"));
    tile(tiles, `${recalled} / ${this.results.length}`, t("flashcards.done.recalled"));
    tile(tiles, String(this.plugin.srs.dueTomorrow(this.filter())), t("flashcards.done.dueTomorrow"));
    const forgotten = [
      ...new Set(this.results.filter((r) => r.rating === Rating.Again).map((r) => r.id))
    ].map((id) => this.live(id)).filter((e) => !!e);
    if (forgotten.length > 0) {
      box.createDiv({ cls: "vt-fc-section-title", text: t("flashcards.done.forgotten") });
      const list = box.createDiv({ cls: "vt-fc-forgotten" });
      for (const entry of forgotten) {
        const row = list.createDiv({ cls: "vt-fc-forgotten-row" });
        row.createSpan({ cls: "vt-fc-forgotten-word", text: entry.word });
        row.createSpan({ cls: "vt-fc-forgotten-zh", text: entry.definitionZh });
        const speak = row.createEl("button", { cls: "vt-fc-icon-btn", attr: { "aria-label": t("row.pronounce") } });
        (0, import_obsidian7.setIcon)(speak, "volume-2");
        speak.onclick = () => this.plugin.speakWord(entry);
      }
    }
    const actions = box.createDiv({ cls: "vt-fc-actions" });
    if (forgotten.length > 0) {
      const retry = actions.createEl("button", { cls: "vt-fc-btn mod-cta" });
      (0, import_obsidian7.setIcon)(retry.createSpan({ cls: "vt-fc-icon" }), "rotate-ccw");
      retry.createSpan({ text: t("flashcards.done.retryForgotten", { count: forgotten.length }) });
      retry.onclick = () => this.startSession(forgotten.map((e) => e.id), { speak: true });
    }
    const dueNow = this.plugin.srs.queue(this.filter()).length;
    if (dueNow > 0) {
      const more = actions.createEl("button", { cls: "vt-fc-btn" });
      more.setText(t("flashcards.done.continue", { count: dueNow }));
      more.onclick = () => this.startSession(void 0, { speak: true });
    }
    const back = actions.createEl("a", { cls: "vt-fc-link", text: t("flashcards.done.backToList") });
    back.onclick = (e) => {
      e.preventDefault();
      void this.plugin.openVocabFile();
    };
  }
};
function zhOf(entry) {
  return entry.definitionZh || entry.definition || t("flashcards.noTranslation");
}
function tile(container, value, label) {
  const el = container.createDiv({ cls: "vt-fc-tile" });
  el.createDiv({ cls: "vt-fc-tile-value", text: value });
  el.createDiv({ cls: "vt-fc-tile-label", text: label });
}

// src/ui/blocks/flashcardsFile.ts
var import_obsidian8 = require("obsidian");
var FLASHCARDS_FILE = "vocab-list/\u55AE\u5B57\u5361.md";
var FLASHCARDS_CONTENT = "# \u55AE\u5B57\u5361\n\n```vocab-flashcards\n```\n";
async function openFlashcardsFile(app) {
  let file = app.vault.getAbstractFileByPath(FLASHCARDS_FILE);
  if (!file) {
    const folder = FLASHCARDS_FILE.slice(0, FLASHCARDS_FILE.lastIndexOf("/"));
    if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
    file = await app.vault.create(FLASHCARDS_FILE, FLASHCARDS_CONTENT);
  }
  if (file instanceof import_obsidian8.TFile) await app.workspace.getLeaf(false).openFile(file);
}

// main.ts
var VOCAB_FOLDER = "vocab-list";
var VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
var VOCAB_FILE_LEGACY = "vocab-list.md";
var VocabTrackerPlugin = class extends import_obsidian9.Plugin {
  constructor() {
    super(...arguments);
    this.vocabData = { entries: [] };
  }
  async onload() {
    this.storage = new ObsidianStorage(this);
    this.vocabData = cleanupTombstones(await loadMigrated(this.storage));
    this.store = new VocabStore(this.vocabData, (data) => this.storage.writeShard("data", data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
    this.srs = new SrsService({ store: this.store, storage: this.storage });
    this.registerView(
      VOCAB_VIEW_TYPE,
      (leaf) => new VocabSidebarView(leaf, this)
    );
    this.registerMarkdownPostProcessor(this.processMarks.bind(this));
    this.registerDomEvent(document, "click", this.handleReadingClick.bind(this));
    this.registerMarkdownCodeBlockProcessor(
      "vocab-dashboard",
      (source, el, ctx) => renderDashboard(this, source, el, ctx)
    );
    this.registerMarkdownCodeBlockProcessor(
      "vocab-flashcards",
      (source, el, ctx) => renderFlashcards(this, source, el, ctx)
    );
    this.addCommand({
      id: "open-flashcards",
      name: t("command.openFlashcards"),
      callback: () => this.openFlashcards()
    });
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
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof import_obsidian9.TFile)) return;
        const changed = updateSourcePaths(this.vocabData.entries, oldPath, file.path);
        for (const entry of changed) await this.store.touch(entry);
      })
    );
    this.app.workspace.onLayoutReady(() => this.ensureVocabFile());
  }
  // So a debounced write (VocabStore's 500ms coalescing) isn't lost if
  // Obsidian closes right after an edit, before the timer fires.
  async onunload() {
    await Promise.all([this.store.flush(), this.srs.flush()]);
  }
  // Fires when the data.json on disk changed from outside this session —
  // sync (iCloud/Obsidian Sync/Git) pulling in another device's edits.
  // Merge instead of overwriting so neither side's changes get clobbered.
  async onExternalSettingsChange() {
    var _a;
    void this.srs.reloadLogs();
    const disk = await this.storage.readShard("data");
    if (!disk) return;
    const merged = merge(this.vocabData, disk);
    this.vocabData = merged;
    this.store.replace(merged);
    if (JSON.stringify(merged) !== JSON.stringify(disk)) {
      await this.storage.writeShard("data", merged);
    }
    const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    (_a = leaf == null ? void 0 : leaf.view) == null ? void 0 : _a.render();
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
  openFlashcards() {
    return openFlashcardsFile(this.app);
  }
  async ensureVocabFile() {
    if (this.app.vault.getAbstractFileByPath(VOCAB_FILE)) return;
    if (!this.app.vault.getAbstractFileByPath(VOCAB_FOLDER)) {
      await this.app.vault.createFolder(VOCAB_FOLDER);
    }
    const legacy = this.app.vault.getAbstractFileByPath(VOCAB_FILE_LEGACY);
    if (legacy instanceof import_obsidian9.TFile) {
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
    const exists = this.store.entries.some(
      (e) => e.word.toLowerCase() === word.toLowerCase()
    );
    const menu = new import_obsidian9.Menu();
    menu.addItem((item) => {
      item.setTitle(
        exists ? `Open "${word}" in Vocab Tracker` : `Add "${word}" to Vocab Tracker`
      );
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        new import_obsidian9.Notice(added ? `Added "${word}" to vocab list` : `Opened "${word}"`);
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
    const existing = this.store.entries.find(
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
      await this.store.addEntry(entry);
      this.enrichEntry(entry);
    } else {
      if (!existing.source && source) existing.source = source;
      if (!existing.example && ctx.sentence) existing.example = ctx.sentence;
      await this.store.touch(existing);
    }
    const leaf = await this.activateSidebar();
    leaf.view.setWord(word);
    return existing == null;
  }
  async jumpToSource(entry) {
    if (!entry.source || !entry.source.path) return;
    const file = this.app.vault.getAbstractFileByPath(entry.source.path);
    if (!file) {
      new import_obsidian9.Notice("Source note not found: " + entry.source.path);
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
      new import_obsidian9.Notice("No pronunciation available on this device.");
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
      await this.store.touch(entry);
      const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
      const view = leaf && leaf.view;
      if (view) view.render();
      if (opts.verbose) new import_obsidian9.Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      new import_obsidian9.Notice(`Vocab Tracker: couldn't fetch "${entry.word}" \u2014 ${(e == null ? void 0 : e.message) || e}`);
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
    await this.store.deleteEntry(entry.id);
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
};
/*! Bundled license information:

ts-fsrs/dist/index.mjs:
ts-fsrs/dist/index.mjs:
ts-fsrs/dist/index.mjs:
  (* istanbul ignore next -- @preserve *)
*/

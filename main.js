"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian13 = require("obsidian");

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
var FILE_SHARDS = /* @__PURE__ */ new Set(["usage"]);
var UNSUPPORTED_SHARD = (name) => new Error(`ObsidianStorage: shard "${name}" is not implemented yet`);
var ObsidianStorage = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  shardPath(name) {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return (0, import_obsidian2.normalizePath)(`${dir}/store/${name}.json`);
  }
  async readShard(name) {
    var _a;
    if (name === "data") return (_a = await this.plugin.loadData()) != null ? _a : null;
    if (!FILE_SHARDS.has(name)) throw UNSUPPORTED_SHARD(name);
    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    if (!await adapter.exists(path)) return null;
    try {
      return JSON.parse(await adapter.read(path));
    } catch (e) {
      console.error(`Vocab Tracker: couldn't parse ${path}`, e);
      return null;
    }
  }
  async writeShard(name, data) {
    if (name === "data") return this.plugin.saveData(data);
    if (!FILE_SHARDS.has(name)) throw UNSUPPORTED_SHARD(name);
    const adapter = this.plugin.app.vault.adapter;
    const path = this.shardPath(name);
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (!await adapter.exists(dir)) await adapter.mkdir(dir);
    await adapter.write(path, JSON.stringify(data));
  }
  async backup(name, data) {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    const adapter = this.plugin.app.vault.adapter;
    const backupDir = (0, import_obsidian2.normalizePath)(`${dir}/backup`);
    if (!await adapter.exists(backupDir)) await adapter.mkdir(backupDir);
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-");
    const path = (0, import_obsidian2.normalizePath)(`${backupDir}/${name}-v1-${stamp}.json`);
    await adapter.write(path, JSON.stringify(data, null, 2));
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

// src/core/model/settings.ts
var CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
var LEARNER_GOALS = ["general", "toefl", "toeic", "ielts", "gept", "school"];
var ANSWER_LANGUAGES = ["zh-TW", "en", "bilingual"];
var DEFAULT_ANTHROPIC_SMART_MODEL = "claude-sonnet-5";
var DEFAULT_ANTHROPIC_FAST_MODEL = "claude-haiku-4-5";
function defaultAiSettings() {
  return {
    enabled: false,
    provider: "anthropic",
    providers: {
      anthropic: {
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
        smartModel: DEFAULT_ANTHROPIC_SMART_MODEL,
        fastModel: DEFAULT_ANTHROPIC_FAST_MODEL
      },
      "openai-compatible": {
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
        smartModel: "",
        fastModel: ""
      }
    },
    monthlyTokenBudget: 0
  };
}
function defaultLearnerProfile() {
  return { level: "", goal: "general", answerLanguage: "zh-TW", maxAnswerChars: 300, extra: "" };
}
function withSettingsDefaults(raw) {
  var _a, _b, _c, _d, _e, _f;
  const base = raw != null ? raw : { schemaVersion: 2 };
  const aiDefaults = defaultAiSettings();
  const ai = (_a = base.ai) != null ? _a : aiDefaults;
  const providers = { ...aiDefaults.providers };
  for (const id of Object.keys(providers)) {
    providers[id] = { ...aiDefaults.providers[id], ...(_c = (_b = ai.providers) == null ? void 0 : _b[id]) != null ? _c : {} };
  }
  return {
    ...base,
    schemaVersion: 2,
    ui: { locale: "auto", ...(_d = base.ui) != null ? _d : {} },
    ai: { ...aiDefaults, ...ai, providers: { ...(_e = ai.providers) != null ? _e : {}, ...providers } },
    learner: { ...defaultLearnerProfile(), ...(_f = base.learner) != null ? _f : {} }
  };
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
    // Settings objects already passed through withSettingsDefaults, so the
    // getter returns a stable object instead of re-resolving on every read.
    this.resolvedSettings = /* @__PURE__ */ new WeakSet();
  }
  get vocabData() {
    return this.data;
  }
  // Settings with every default filled in. Written back into this.data so
  // later in-place edits (updateSettings) land on the persisted object;
  // re-resolving after replace() (sync merge) picks up remote fields too.
  get settings() {
    const current = this.data.settings;
    if (current && this.resolvedSettings.has(current)) return current;
    const resolved = withSettingsDefaults(current);
    this.data.settings = resolved;
    this.resolvedSettings.add(resolved);
    return resolved;
  }
  // The only way UI code should change settings: stamps updatedAt so
  // merge.ts can tell which device's settings are newer.
  updateSettings(mutate) {
    const s = this.settings;
    mutate(s);
    s.updatedAt = nowIso();
    return this.save();
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
function pickNewerSettings(local, remote) {
  if (!local) return remote != null ? remote : { schemaVersion: 2 };
  if (!remote) return local;
  const l = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const r = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
  return r > l ? remote : local;
}
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
    settings: pickNewerSettings(local.settings, remote.settings),
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
function nowStamp() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// src/ui/sidebar/VocabSidebarView.ts
var import_obsidian5 = require("obsidian");

// src/ui/word/WordRow.ts
var import_obsidian3 = require("obsidian");

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
  "row.markReviewed": "Mark as reviewed",
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
  // ── M3: AI foundation + settings ──────────────────────────────────
  "ai.provider.anthropic": "Claude (Anthropic)",
  "ai.provider.openai": "OpenAI-compatible (OpenAI, Gemini, Ollama\u2026)",
  "ai.task.paragraph.grammar": "Grammar",
  "ai.task.paragraph.translate": "Translate",
  "ai.task.paragraph.vocab": "New words",
  "ai.task.paragraph.paraphrase": "Paraphrase",
  "ai.task.word.usage": "Usage",
  "ai.task.word.compare": "Compare",
  "ai.task.word.sentence": "Sentences",
  "ai.task.word.mnemonic": "Mnemonic",
  "ai.error.disabled": "AI is turned off. Enable it in Settings \u203A Vocab Tracker.",
  "ai.error.no_key": "No API key yet. Add one in Settings \u203A Vocab Tracker.",
  "ai.error.auth": "The API key was rejected. Check it in Settings \u203A Vocab Tracker.",
  "ai.error.rate_limit": "Too many requests right now. Wait a moment and retry.",
  "ai.error.overloaded": "The AI service is busy. Retry in a moment.",
  "ai.error.network": "Couldn't reach the AI service. Check the connection and retry.",
  "ai.error.offline": "You're offline. Earlier discussions are still readable.",
  "ai.error.cors": "The AI service blocked this request (CORS).",
  "ai.error.refused": "The AI declined to answer this one.",
  "ai.error.too_long": "This is too long for the model. Try a shorter selection.",
  "ai.error.bad_request": "The AI service rejected the request \u2014 check the model name and base URL.",
  "ai.error.bad_output": "The AI's answer couldn't be read. Retry.",
  "ai.error.aborted": "Stopped.",
  "ai.error.budget": "This month's token budget is used up. Raise it in Settings \u203A Vocab Tracker.",
  "ai.action.retry": "Retry",
  "ai.action.openSettings": "Open settings",
  "ai.bubble.streaming": "Answering\u2026",
  "ai.gate.noKey.title": "Set up AI to start discussing",
  "ai.gate.noKey.body": "Add an API key in Settings \u203A Vocab Tracker. Claude works, and so do OpenAI-compatible services (OpenAI, Gemini, local Ollama).",
  "ai.gate.disabled.title": "AI is turned off",
  "ai.gate.disabled.body": "Turn on \u201CEnable AI\u201D in Settings \u203A Vocab Tracker to discuss words and paragraphs.",
  "ai.gate.offline": "You're offline. Earlier discussions are readable; you can ask again once you're back online.",
  "settings.section.general": "General",
  "settings.general.locale.name": "Interface language",
  "settings.general.locale.desc": "Language of the plugin's buttons and messages. AI answers follow the learner profile below.",
  "settings.general.locale.auto": "Follow Obsidian",
  "settings.section.ai": "AI",
  "settings.ai.enabled.name": "Enable AI",
  "settings.ai.enabled.desc": "Off by default. Nothing is sent anywhere until this is on.",
  "settings.ai.provider.name": "Provider",
  "settings.ai.provider.desc": "Where questions are sent.",
  "settings.ai.key.name": "API key",
  "settings.ai.key.descSecret": "Stored in Obsidian's secret storage on this device \u2014 not in data.json.",
  "settings.ai.key.descData": "Stored in this plugin's data.json, which syncs with your vault. Use a dedicated key with a spending limit.",
  "settings.ai.key.optional": "Optional for local servers such as Ollama.",
  "settings.ai.baseUrl.name": "Base URL",
  "settings.ai.baseUrl.desc": "Endpoint that serves /chat/completions.",
  "settings.ai.smartModel.name": "Model for explanations",
  "settings.ai.smartModel.desc": "Used for grammar, comparisons and free-form questions.",
  "settings.ai.fastModel.name": "Model for quick tasks",
  "settings.ai.fastModel.desc": "Used for translation, word lists, sentences and mnemonics.",
  "settings.ai.model.placeholder": "model name",
  "settings.ai.test.name": "Test connection",
  "settings.ai.test.desc": "Sends a tiny request to each configured model.",
  "settings.ai.test.button": "Test connection",
  "settings.ai.test.running": "Testing\u2026",
  "settings.ai.test.ok": "Connected: {models} ({transport}, {ms} ms)",
  "settings.ai.test.fetch": "streaming",
  "settings.ai.test.requestUrl": "compatibility mode, no streaming",
  "settings.ai.test.noModel": "Fill in the model names first.",
  "settings.ai.budget.name": "Monthly token budget",
  "settings.ai.budget.desc": "Requests stop once this month's usage reaches it (cache reads count 1/10). 0 = no limit.",
  "settings.ai.usage.name": "Usage",
  "settings.ai.usage.value": "This month {month} tokens \xB7 today {today}",
  "settings.ai.usage.detail": "Input {input} \xB7 output {output} \xB7 cache read {cacheRead} \xB7 cache write {cacheWrite} \xB7 {requests} requests",
  "settings.ai.privacy": "When you ask, the paragraph (or the whole note, for paragraph discussions), the word's details and your question are sent to the provider above.",
  "settings.section.learner": "Learner profile",
  "settings.learner.desc": "Added to every AI request so answers fit your level.",
  "settings.learner.level.name": "Level (CEFR)",
  "settings.learner.level.none": "Not set",
  "settings.learner.goal.name": "Goal",
  "settings.learner.goal.general": "General reading",
  "settings.learner.goal.toefl": "TOEFL",
  "settings.learner.goal.toeic": "TOEIC",
  "settings.learner.goal.ielts": "IELTS",
  "settings.learner.goal.gept": "GEPT",
  "settings.learner.goal.school": "School exams",
  "settings.learner.language.name": "Answer language",
  "settings.learner.language.zh-TW": "Traditional Chinese",
  "settings.learner.language.en": "English",
  "settings.learner.language.bilingual": "Chinese + English",
  "settings.learner.maxChars.name": "Answer length",
  "settings.learner.maxChars.desc": "Rough upper limit in characters. 0 = no limit.",
  "settings.learner.extra.name": "Anything else",
  "settings.learner.extra.desc": "Free text added to every request, e.g. \u201CI'm an engineer; examples from tech are welcome.\u201D",
  "settings.learner.preview.name": "What the AI sees"
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
  "row.markReviewed": "\u6A19\u8A18\u70BA\u5DF2\u8907\u7FD2",
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
  // ── M3: AI foundation + settings ──────────────────────────────────
  "ai.provider.anthropic": "Claude\uFF08Anthropic\uFF09",
  "ai.provider.openai": "OpenAI \u76F8\u5BB9\uFF08OpenAI\u3001Gemini\u3001Ollama\u2026\uFF09",
  "ai.task.paragraph.grammar": "\u6587\u6CD5",
  "ai.task.paragraph.translate": "\u7FFB\u8B6F",
  "ai.task.paragraph.vocab": "\u751F\u5B57",
  "ai.task.paragraph.paraphrase": "\u63DB\u53E5\u8A71\u8AAA",
  "ai.task.word.usage": "\u7528\u6CD5",
  "ai.task.word.compare": "\u6BD4\u8F03",
  "ai.task.word.sentence": "\u9020\u53E5",
  "ai.task.word.mnemonic": "\u8A18\u61B6\u6CD5",
  "ai.error.disabled": "AI \u76EE\u524D\u95DC\u9589\u3002\u5230\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u958B\u555F\u3002",
  "ai.error.no_key": "\u9084\u6C92\u6709 API key\u3002\u5230\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u586B\u5165\u3002",
  "ai.error.auth": "API key \u7121\u6548\u6216\u6C92\u6709\u6B0A\u9650\uFF0C\u8ACB\u5230\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u6AA2\u67E5\u3002",
  "ai.error.rate_limit": "\u8ACB\u6C42\u592A\u983B\u7E41\uFF0C\u7A0D\u7B49\u4E00\u4E0B\u518D\u91CD\u8A66\u3002",
  "ai.error.overloaded": "AI \u670D\u52D9\u5FD9\u788C\u4E2D\uFF0C\u7A0D\u5F8C\u518D\u91CD\u8A66\u3002",
  "ai.error.network": "\u9023\u4E0D\u5230 AI \u670D\u52D9\uFF0C\u8ACB\u6AA2\u67E5\u7DB2\u8DEF\u5F8C\u91CD\u8A66\u3002",
  "ai.error.offline": "\u76EE\u524D\u96E2\u7DDA\u3002\u4E4B\u524D\u7684\u8A0E\u8AD6\u53EF\u4EE5\u770B\uFF0C\u9023\u7DDA\u5F8C\u624D\u80FD\u7E7C\u7E8C\u554F\u3002",
  "ai.error.cors": "AI \u670D\u52D9\u64CB\u4E0B\u4E86\u9019\u500B\u8ACB\u6C42\uFF08CORS\uFF09\u3002",
  "ai.error.refused": "AI \u62D2\u7D55\u56DE\u7B54\u9019\u4E00\u984C\u3002",
  "ai.error.too_long": "\u5167\u5BB9\u592A\u9577\uFF0C\u8D85\u904E\u6A21\u578B\u4E0A\u9650\u3002\u8A66\u8457\u9078\u77ED\u4E00\u9EDE\u7684\u7BC4\u570D\u3002",
  "ai.error.bad_request": "AI \u670D\u52D9\u62D2\u7D55\u4E86\u8ACB\u6C42\uFF0C\u8ACB\u6AA2\u67E5\u6A21\u578B\u540D\u7A31\u8207 Base URL\u3002",
  "ai.error.bad_output": "AI \u7684\u56DE\u7B54\u683C\u5F0F\u4E0D\u5C0D\uFF0C\u8ACB\u91CD\u8A66\u3002",
  "ai.error.aborted": "\u5DF2\u505C\u6B62\u3002",
  "ai.error.budget": "\u672C\u6708 token \u984D\u5EA6\u5DF2\u7528\u5B8C\uFF0C\u53EF\u5230\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u8ABF\u6574\u3002",
  "ai.action.retry": "\u91CD\u8A66",
  "ai.action.openSettings": "\u958B\u555F\u8A2D\u5B9A",
  "ai.bubble.streaming": "\u56DE\u7B54\u4E2D\u2026",
  "ai.gate.noKey.title": "\u8A2D\u5B9A AI \u5F8C\u624D\u80FD\u8A0E\u8AD6",
  "ai.gate.noKey.body": "\u5728\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u586B\u5165 API key\uFF0C\u53EF\u4EE5\u7528 Claude\uFF0C\u4E5F\u53EF\u4EE5\u7528 OpenAI \u76F8\u5BB9\u7684\u670D\u52D9\uFF08OpenAI\u3001Gemini\u3001\u672C\u6A5F Ollama\uFF09\u3002",
  "ai.gate.disabled.title": "AI \u76EE\u524D\u95DC\u9589",
  "ai.gate.disabled.body": "\u5728\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u6253\u958B\u300C\u555F\u7528 AI\u300D\uFF0C\u5C31\u80FD\u8A0E\u8AD6\u55AE\u5B57\u548C\u6BB5\u843D\u3002",
  "ai.gate.offline": "\u76EE\u524D\u96E2\u7DDA\u3002\u4E4B\u524D\u7684\u8A0E\u8AD6\u53EF\u4EE5\u770B\uFF0C\u9023\u7DDA\u5F8C\u624D\u80FD\u7E7C\u7E8C\u554F\u3002",
  "settings.section.general": "\u4E00\u822C",
  "settings.general.locale.name": "\u4ECB\u9762\u8A9E\u8A00",
  "settings.general.locale.desc": "\u63D2\u4EF6\u6309\u9215\u8207\u8A0A\u606F\u7684\u8A9E\u8A00\u3002AI \u56DE\u7B54\u7684\u8A9E\u8A00\u8ACB\u770B\u4E0B\u65B9\u300C\u5B78\u7FD2\u8005\u8A2D\u5B9A\u300D\u3002",
  "settings.general.locale.auto": "\u8DDF\u96A8 Obsidian",
  "settings.section.ai": "AI",
  "settings.ai.enabled.name": "\u555F\u7528 AI",
  "settings.ai.enabled.desc": "\u9810\u8A2D\u95DC\u9589\u3002\u6253\u958B\u4E4B\u524D\uFF0C\u4E0D\u6703\u628A\u4EFB\u4F55\u5167\u5BB9\u9001\u51FA\u53BB\u3002",
  "settings.ai.provider.name": "\u670D\u52D9",
  "settings.ai.provider.desc": "\u554F\u984C\u8981\u9001\u5230\u54EA\u88E1\u3002",
  "settings.ai.key.name": "API key",
  "settings.ai.key.descSecret": "\u5B58\u5728\u9019\u53F0\u88DD\u7F6E\u7684 Obsidian \u6A5F\u5BC6\u5132\u5B58\uFF0C\u4E0D\u6703\u5BEB\u9032 data.json\u3002",
  "settings.ai.key.descData": "\u5B58\u5728\u63D2\u4EF6\u7684 data.json\uFF0C\u6703\u8DDF\u8457 vault \u540C\u6B65\u3002\u5EFA\u8B70\u53E6\u958B\u4E00\u628A\u5C08\u7528 key \u4E26\u8A2D\u5B9A\u7528\u91CF\u4E0A\u9650\u3002",
  "settings.ai.key.optional": "\u672C\u6A5F\u670D\u52D9\uFF08\u4F8B\u5982 Ollama\uFF09\u53EF\u4EE5\u4E0D\u586B\u3002",
  "settings.ai.baseUrl.name": "Base URL",
  "settings.ai.baseUrl.desc": "\u63D0\u4F9B /chat/completions \u7684\u7AEF\u9EDE\u3002",
  "settings.ai.smartModel.name": "\u89E3\u8AAA\u7528\u6A21\u578B",
  "settings.ai.smartModel.desc": "\u7528\u5728\u6587\u6CD5\u3001\u6BD4\u8F03\u3001\u81EA\u7531\u63D0\u554F\u3002",
  "settings.ai.fastModel.name": "\u5FEB\u901F\u4EFB\u52D9\u6A21\u578B",
  "settings.ai.fastModel.desc": "\u7528\u5728\u7FFB\u8B6F\u3001\u751F\u5B57\u3001\u9020\u53E5\u3001\u8A18\u61B6\u6CD5\u3002",
  "settings.ai.model.placeholder": "\u6A21\u578B\u540D\u7A31",
  "settings.ai.test.name": "\u6E2C\u8A66\u9023\u7DDA",
  "settings.ai.test.desc": "\u5C0D\u6BCF\u500B\u8A2D\u5B9A\u7684\u6A21\u578B\u9001\u4E00\u500B\u5F88\u5C0F\u7684\u8ACB\u6C42\u3002",
  "settings.ai.test.button": "\u6E2C\u8A66\u9023\u7DDA",
  "settings.ai.test.running": "\u6E2C\u8A66\u4E2D\u2026",
  "settings.ai.test.ok": "\u9023\u7DDA\u6210\u529F\uFF1A{models}\uFF08{transport}\uFF0C{ms} ms\uFF09",
  "settings.ai.test.fetch": "\u4E32\u6D41",
  "settings.ai.test.requestUrl": "\u76F8\u5BB9\u6A21\u5F0F\uFF0C\u4E0D\u4E32\u6D41",
  "settings.ai.test.noModel": "\u8ACB\u5148\u586B\u6A21\u578B\u540D\u7A31\u3002",
  "settings.ai.budget.name": "\u6BCF\u6708 token \u4E0A\u9650",
  "settings.ai.budget.desc": "\u672C\u6708\u7528\u91CF\u5230\u9054\u4E0A\u9650\u5C31\u505C\u6B62\u9001\u51FA\uFF08\u5FEB\u53D6\u8B80\u53D6\u4EE5 1/10 \u8A08\uFF09\u30020 = \u4E0D\u9650\u3002",
  "settings.ai.usage.name": "\u7528\u91CF",
  "settings.ai.usage.value": "\u672C\u6708 {month} tokens \xB7 \u4ECA\u5929 {today}",
  "settings.ai.usage.detail": "\u8F38\u5165 {input} \xB7 \u8F38\u51FA {output} \xB7 \u5FEB\u53D6\u8B80 {cacheRead} \xB7 \u5FEB\u53D6\u5BEB {cacheWrite} \xB7 \u5171 {requests} \u6B21",
  "settings.ai.privacy": "\u63D0\u554F\u6642\uFF0C\u6703\u628A\u6BB5\u843D\uFF08\u6BB5\u843D\u8A0E\u8AD6\u6703\u9644\u4E0A\u6574\u7BC7\u7B46\u8A18\uFF09\u3001\u55AE\u5B57\u8CC7\u6599\u548C\u4F60\u7684\u554F\u984C\u9001\u5230\u4E0A\u9762\u9078\u7684\u670D\u52D9\u3002",
  "settings.section.learner": "\u5B78\u7FD2\u8005\u8A2D\u5B9A",
  "settings.learner.desc": "\u6703\u9644\u5728\u6BCF\u4E00\u6B21 AI \u8ACB\u6C42\u88E1\uFF0C\u8B93\u56DE\u7B54\u7B26\u5408\u4F60\u7684\u7A0B\u5EA6\u3002",
  "settings.learner.level.name": "\u7A0B\u5EA6\uFF08CEFR\uFF09",
  "settings.learner.level.none": "\u672A\u8A2D\u5B9A",
  "settings.learner.goal.name": "\u76EE\u6A19",
  "settings.learner.goal.general": "\u4E00\u822C\u95B1\u8B80",
  "settings.learner.goal.toefl": "\u6258\u798F",
  "settings.learner.goal.toeic": "\u591A\u76CA",
  "settings.learner.goal.ielts": "\u96C5\u601D",
  "settings.learner.goal.gept": "\u5168\u6C11\u82F1\u6AA2",
  "settings.learner.goal.school": "\u5B78\u6821\u8003\u8A66",
  "settings.learner.language.name": "\u56DE\u7B54\u8A9E\u8A00",
  "settings.learner.language.zh-TW": "\u7E41\u9AD4\u4E2D\u6587",
  "settings.learner.language.en": "\u82F1\u6587",
  "settings.learner.language.bilingual": "\u4E2D\u82F1\u5C0D\u7167",
  "settings.learner.maxChars.name": "\u56DE\u7B54\u9577\u5EA6",
  "settings.learner.maxChars.desc": "\u5927\u7D04\u7684\u5B57\u6578\u4E0A\u9650\u30020 = \u4E0D\u9650\u3002",
  "settings.learner.extra.name": "\u5176\u4ED6\u88DC\u5145",
  "settings.learner.extra.desc": "\u6703\u539F\u5C01\u4E0D\u52D5\u9644\u5728\u6BCF\u6B21\u8ACB\u6C42\u88E1\uFF0C\u4F8B\u5982\u300C\u6211\u662F\u5DE5\u7A0B\u5E2B\uFF0C\u4F8B\u53E5\u53EF\u4EE5\u7528\u79D1\u6280\u60C5\u5883\u300D\u3002",
  "settings.learner.preview.name": "AI \u6703\u770B\u5230"
};

// src/core/i18n/index.ts
var dictionaries = { en, "zh-TW": zhTW };
var activeLocale = "en";
function setLocale(locale) {
  activeLocale = locale;
}
function resolveLocale(setting, appLanguage) {
  if (setting !== "auto") return setting;
  return appLanguage.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}
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
function renderVocabRow(plugin, container, entry, state, setState, refresh) {
  const row = container.createEl("div", { cls: "vocab-tracker-row" });
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
  const mkField = (label, key, opts = {}) => {
    var _a;
    const value = (_a = entry[key]) != null ? _a : "";
    const wrap = body.createEl("div", { cls: "vocab-tracker-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vocab-tracker-input", "vocab-tracker-field-box"];
    if (opts.multiline) cls.push("vocab-tracker-textarea");
    if (opts.multiline) {
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
    entry.lastReviewed = nowStamp();
    entry.reviews += 1;
    await plugin.store.touch(entry);
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
function renderGroupedVocabList(plugin, container, rows, collapsedGroups, expandState, refresh) {
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
        refresh
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
function renderDashboard(plugin, _source, el, _ctx) {
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
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => draw(search.value));
  };
  draw("");
  search.oninput = () => draw(search.value);
}

// src/platform/obsidianLanguage.ts
var obsidian = __toESM(require("obsidian"), 1);
function obsidianLanguage() {
  var _a;
  const getLanguage2 = obsidian.getLanguage;
  if (typeof getLanguage2 === "function") return getLanguage2();
  try {
    return (_a = window.localStorage.getItem("language")) != null ? _a : "en";
  } catch (e) {
    return "en";
  }
}

// src/platform/BrowserFetch.ts
var BrowserFetch = class {
  async fetch(req, signal) {
    const res = await window.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal
    });
    return {
      status: res.status,
      header: (name) => res.headers.get(name),
      chunks: readChunks(res)
    };
  }
};
async function* readChunks(res) {
  if (!res.body) {
    yield await res.text();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.cancel().catch(() => void 0);
  }
}

// src/platform/ObsidianDevice.ts
var LS_PREFIX = "vocab-tracker:";
var ObsidianDeviceState = class {
  constructor(app) {
    this.app = app;
  }
  // app.loadLocalStorage/saveLocalStorage (1.8.7+) scope keys per vault;
  // older apps fall back to plain localStorage with a plugin prefix.
  get(key) {
    if (typeof this.app.loadLocalStorage === "function") {
      const v = this.app.loadLocalStorage(LS_PREFIX + key);
      return typeof v === "string" ? v : null;
    }
    try {
      return window.localStorage.getItem(LS_PREFIX + key);
    } catch (e) {
      return null;
    }
  }
  set(key, value) {
    if (typeof this.app.saveLocalStorage === "function") {
      this.app.saveLocalStorage(LS_PREFIX + key, value);
      return;
    }
    try {
      if (value === null) window.localStorage.removeItem(LS_PREFIX + key);
      else window.localStorage.setItem(LS_PREFIX + key, value);
    } catch (e) {
    }
  }
};
var ObsidianSecrets = class {
  constructor(app) {
    this.app = app;
  }
  get available() {
    const s = this.app.secretStorage;
    return !!s && typeof s.getSecret === "function";
  }
  get(id) {
    return this.available ? this.app.secretStorage.getSecret(id) : null;
  }
  set(id, value) {
    if (this.available) this.app.secretStorage.setSecret(id, value);
  }
};
var BrowserNetwork = class {
  isOnline() {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }
};

// src/platform/ObsidianRequest.ts
var import_obsidian6 = require("obsidian");
var ObsidianRequest = class {
  async request(req) {
    var _a;
    const res = await (0, import_obsidian6.requestUrl)({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
      contentType: req.headers["content-type"],
      throw: false
    });
    return { status: res.status, headers: (_a = res.headers) != null ? _a : {}, text: res.text };
  }
};

// src/platform/aiPorts.ts
function createAiPorts(app, storage) {
  return {
    storage,
    fetch: new BrowserFetch(),
    request: new ObsidianRequest(),
    device: new ObsidianDeviceState(app),
    secrets: new ObsidianSecrets(app),
    network: new BrowserNetwork()
  };
}

// src/services/ai/errors.ts
var AiError = class extends Error {
  constructor(code, message, extra = {}) {
    super(message != null ? message : code);
    this.code = code;
    this.extra = extra;
    this.name = "AiError";
  }
  get retryable() {
    return this.code === "rate_limit" || this.code === "overloaded";
  }
};
function isAiError(e) {
  return e instanceof AiError;
}
function parseRetryAfter(value, now = Date.now()) {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - now);
}
function errorBodyMessage(body) {
  try {
    const j = JSON.parse(body);
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object") {
      const msg = j.error.message;
      if (typeof msg === "string") return msg;
    }
    if (typeof j.message === "string") return j.message;
  } catch (e) {
  }
  return body.slice(0, 300);
}
var TOO_LONG_RE = /prompt is too long|context length|context window|maximum context|too many tokens|request_too_large/i;
function classifyHttpError(status, body, retryAfter) {
  const message = errorBodyMessage(body);
  const extra = { status, retryAfterMs: parseRetryAfter(retryAfter) };
  if (status === 401 || status === 403) return new AiError("auth", message, extra);
  if (status === 429) return new AiError("rate_limit", message, extra);
  if (status === 413 || TOO_LONG_RE.test(message)) return new AiError("too_long", message, extra);
  if (status === 529 || status >= 500) return new AiError("overloaded", message, extra);
  return new AiError("bad_request", message, extra);
}
function classifyStreamError(type, message) {
  switch (type) {
    case "overloaded_error":
    case "api_error":
      return new AiError("overloaded", message);
    case "rate_limit_error":
      return new AiError("rate_limit", message);
    case "authentication_error":
    case "permission_error":
      return new AiError("auth", message);
    case "request_too_large":
      return new AiError("too_long", message);
    default:
      return TOO_LONG_RE.test(message) ? new AiError("too_long", message) : new AiError("network", message);
  }
}

// src/services/ai/limiter.ts
var Limiter = class {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  get running() {
    return this.active;
  }
  get waiting() {
    return this.queue.length;
  }
  async run(fn, signal) {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
  acquire(signal) {
    if (signal == null ? void 0 : signal.aborted) return Promise.reject(new AiError("aborted"));
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const item = {
        signal,
        start: () => {
          signal == null ? void 0 : signal.removeEventListener("abort", item.onAbort);
          this.active++;
          resolve();
        },
        onAbort: () => {
          this.queue = this.queue.filter((q) => q !== item);
          reject(new AiError("aborted"));
        }
      };
      signal == null ? void 0 : signal.addEventListener("abort", item.onAbort, { once: true });
      this.queue.push(item);
    });
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next.start();
  }
};

// src/services/ai/transport/sse.ts
var SseParser = class {
  constructor() {
    this.buffer = "";
    this.dataLines = [];
    // A chunk ending in "\r" might be the first half of "\r\n"; hold it back.
    this.pendingCR = false;
  }
  push(chunk) {
    let text = chunk;
    if (this.pendingCR) {
      if (text.startsWith("\n")) text = text.slice(1);
      this.pendingCR = false;
    }
    this.buffer += text;
    const out = [];
    for (; ; ) {
      const m = /\r\n|\r|\n/.exec(this.buffer);
      if (!m) break;
      if (m[0] === "\r" && m.index === this.buffer.length - 1) {
        this.pendingCR = true;
        const line2 = this.buffer.slice(0, m.index);
        this.buffer = "";
        this.handleLine(line2, out);
        break;
      }
      const line = this.buffer.slice(0, m.index);
      this.buffer = this.buffer.slice(m.index + m[0].length);
      this.handleLine(line, out);
    }
    return out;
  }
  // Flushes a final event that wasn't followed by a blank line (common when
  // a non-streaming transport hands over a truncated body).
  end() {
    const out = [];
    if (this.buffer) {
      this.handleLine(this.buffer, out);
      this.buffer = "";
    }
    this.dispatch(out);
    return out;
  }
  handleLine(line, out) {
    if (line === "") {
      this.dispatch(out);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.dataLines.push(value);
    else if (field === "event") this.eventName = value;
    else if (field === "id") this.id = value;
  }
  dispatch(out) {
    if (this.dataLines.length > 0) {
      const ev = { data: this.dataLines.join("\n") };
      if (this.eventName) ev.event = this.eventName;
      if (this.id !== void 0) ev.id = this.id;
      out.push(ev);
    }
    this.dataLines = [];
    this.eventName = void 0;
  }
};
async function* parseSse(chunks) {
  const parser = new SseParser();
  for await (const chunk of chunks) {
    for (const ev of parser.push(chunk)) yield ev;
  }
  for (const ev of parser.end()) yield ev;
}

// src/services/ai/transport/types.ts
async function readAll(chunks) {
  let out = "";
  for await (const c of chunks) out += c;
  return out;
}

// src/services/ai/providers/stream.ts
async function throwIfHttpError(res) {
  if (res.status >= 200 && res.status < 300) return;
  const body = await readAll(res.chunks).catch(() => "");
  throw classifyHttpError(res.status, body, res.header("retry-after"));
}
async function consumeBody(res, signal, onEvent, onJson) {
  var _a;
  const contentType = (_a = res.header("content-type")) != null ? _a : "";
  try {
    if (contentType.includes("application/json")) {
      const text = await readAll(res.chunks);
      onJson(parseJson(text));
      return;
    }
    for await (const ev of parseSse(res.chunks)) {
      if (signal.aborted) throw new AiError("aborted");
      if (onEvent(ev) === true) return;
    }
  } catch (e) {
    if (signal.aborted) throw new AiError("aborted", void 0, { cause: e });
    if (e instanceof AiError) throw e;
    throw new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
  }
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new AiError("bad_output", "Response body is not valid JSON", { cause: e });
  }
}
function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new AiError("bad_output", "No JSON found in model output");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new AiError("bad_output", "Unterminated JSON in model output");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (e) {
    throw new AiError("bad_output", "Model output is not valid JSON", { cause: e });
  }
}
function trimSlash(url) {
  return url.replace(/\/+$/, "");
}

// src/services/ai/providers/types.ts
var TEST_MAX_TOKENS = 256;
function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

// src/services/ai/providers/anthropic.ts
var API_VERSION = "2023-06-01";
var MAX_CACHE_BREAKPOINTS = 4;
function buildAnthropicBody(req, model) {
  const cacheIdx = req.system.map((b, i) => b.cache ? i : -1).filter((i) => i >= 0);
  const keep = new Set(cacheIdx.slice(-MAX_CACHE_BREAKPOINTS));
  const body = {
    model,
    max_tokens: req.maxTokens,
    stream: true,
    system: req.system.map((b, i) => ({
      type: "text",
      text: b.text,
      ...keep.has(i) ? { cache_control: { type: "ephemeral" } } : {}
    })),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content }))
  };
  if (req.output) {
    body.output_config = { format: { type: "json_schema", schema: req.output.schema } };
  }
  return body;
}
function mapStop(reason) {
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "refusal") return "refusal";
  return "end";
}
function applyUsage(target, u) {
  if (!u) return;
  if (u.input_tokens !== void 0) target.input = u.input_tokens;
  if (u.output_tokens !== void 0) target.output = u.output_tokens;
  if (u.cache_read_input_tokens != null) target.cacheRead = u.cache_read_input_tokens;
  if (u.cache_creation_input_tokens != null) target.cacheWrite = u.cache_creation_input_tokens;
}
var AnthropicStreamState = class {
  constructor(onDelta) {
    this.onDelta = onDelta;
    this.text = "";
    this.usage = emptyUsage();
    this.model = "";
    this.stop = "end";
  }
  // Returns true on the terminal event.
  handle(ev) {
    var _a, _b, _c;
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (e) {
      return false;
    }
    const type = (_a = data.type) != null ? _a : ev.event;
    switch (type) {
      case "message_start": {
        const msg = data.message;
        if (msg == null ? void 0 : msg.model) this.model = msg.model;
        applyUsage(this.usage, msg == null ? void 0 : msg.usage);
        return false;
      }
      case "content_block_delta": {
        const delta = data.delta;
        if ((delta == null ? void 0 : delta.type) === "text_delta" && delta.text) {
          this.text += delta.text;
          (_b = this.onDelta) == null ? void 0 : _b.call(this, delta.text);
        }
        return false;
      }
      case "message_delta": {
        const delta = data.delta;
        if (delta == null ? void 0 : delta.stop_reason) this.stop = mapStop(delta.stop_reason);
        applyUsage(this.usage, data.usage);
        return false;
      }
      case "message_stop":
        return true;
      case "error": {
        const err = data.error;
        throw classifyStreamError(err == null ? void 0 : err.type, (_c = err == null ? void 0 : err.message) != null ? _c : "stream error");
      }
      default:
        return false;
    }
  }
  // Non-streaming Message object (a server or proxy that ignored stream:true).
  handleJson(json) {
    var _a, _b, _c;
    const msg = json;
    this.model = (_a = msg.model) != null ? _a : this.model;
    this.text = ((_b = msg.content) != null ? _b : []).filter((b) => b.type === "text").map((b) => {
      var _a2;
      return (_a2 = b.text) != null ? _a2 : "";
    }).join("");
    if (this.text) (_c = this.onDelta) == null ? void 0 : _c.call(this, this.text);
    this.stop = mapStop(msg.stop_reason);
    applyUsage(this.usage, msg.usage);
  }
};
var AnthropicProvider = class {
  constructor(deps) {
    this.deps = deps;
    this.id = "anthropic";
    this.caps = { streaming: true, structured: "native", promptCache: true };
  }
  request(body) {
    if (!this.deps.apiKey) throw new AiError("no_key");
    return {
      url: `${trimSlash(this.deps.config.baseUrl || "https://api.anthropic.com")}/v1/messages`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.deps.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    };
  }
  modelFor(tier) {
    const { smartModel, fastModel } = this.deps.config;
    return (tier === "smart" ? smartModel : fastModel) || smartModel || fastModel;
  }
  async complete(req, opt) {
    const model = this.modelFor(req.tier);
    const httpReq = this.request(buildAnthropicBody(req, model));
    const res = await this.deps.transport.send(httpReq, opt.signal);
    await throwIfHttpError(res);
    const state = new AnthropicStreamState(opt.onDelta);
    await consumeBody(res, opt.signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    const result = {
      text: state.text,
      usage: state.usage,
      model: state.model || model,
      stop: state.stop,
      transport: res.mode
    };
    if (req.output && state.stop === "end") result.json = parseJson(state.text);
    return result;
  }
  // One tiny request per configured model, so a typo in either model ID
  // shows up here instead of on the first real question.
  async testConnection(signal) {
    var _a;
    const now = (_a = this.deps.now) != null ? _a : Date.now;
    const started = now();
    const models = [...new Set([this.deps.config.smartModel, this.deps.config.fastModel].filter(Boolean))];
    let transport = "fetch";
    for (const model of models) {
      const res = await this.deps.transport.send(
        this.request({ model, max_tokens: TEST_MAX_TOKENS, stream: true, messages: [{ role: "user", content: "ping" }] }),
        signal
      );
      await throwIfHttpError(res);
      transport = res.mode;
      const state = new AnthropicStreamState();
      await consumeBody(res, signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    }
    return { models, transport, latencyMs: now() - started };
  }
};

// src/core/text/tokens.ts
var CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
function estimateTokens(text) {
  var _a, _b;
  if (!text) return 0;
  const cjk = (_b = (_a = text.match(CJK_RE)) == null ? void 0 : _a.length) != null ? _b : 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

// src/services/ai/providers/openaiCompat.ts
function isOfficialOpenAi(baseUrl) {
  try {
    return new URL(baseUrl).hostname === "api.openai.com";
  } catch (e) {
    return false;
  }
}
var PROMPTED_JSON_INSTRUCTION = "\u53EA\u8F38\u51FA\u4E00\u500B\u7B26\u5408\u4E0B\u5217 JSON Schema \u7684 JSON \u503C\uFF0C\u4E0D\u8981\u52A0\u4EFB\u4F55\u8AAA\u660E\u6587\u5B57\uFF0C\u4E5F\u4E0D\u8981\u7528\u7A0B\u5F0F\u78BC\u5340\u584A\u5305\u8D77\u4F86\uFF1A\n";
function buildOpenAiBody(req, model, baseUrl) {
  const official = isOfficialOpenAi(baseUrl);
  const systemParts = req.system.map((b) => b.text);
  if (req.output && !official) {
    systemParts.push(PROMPTED_JSON_INSTRUCTION + JSON.stringify(req.output.schema));
  }
  const body = {
    model,
    messages: [
      ...systemParts.length ? [{ role: "system", content: systemParts.join("\n\n") }] : [],
      ...req.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    stream: true,
    // Without this, streamed responses carry no token counts at all.
    stream_options: { include_usage: true },
    [official ? "max_completion_tokens" : "max_tokens"]: req.maxTokens
  };
  if (req.output && official) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: req.output.name, schema: req.output.schema, strict: true }
    };
  }
  return body;
}
function mapFinish(reason) {
  if (!reason) return void 0;
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "refusal";
  return "end";
}
function applyUsage2(target, u) {
  var _a, _b, _c;
  if (!u || u.prompt_tokens === void 0) return false;
  const cached = (_b = (_a = u.prompt_tokens_details) == null ? void 0 : _a.cached_tokens) != null ? _b : 0;
  target.input = u.prompt_tokens - cached;
  target.cacheRead = cached;
  target.output = (_c = u.completion_tokens) != null ? _c : 0;
  return true;
}
function streamErrorFromChunk(err) {
  var _a, _b, _c;
  const message = (_a = err.message) != null ? _a : "stream error";
  const kind = `${(_b = err.type) != null ? _b : ""} ${String((_c = err.code) != null ? _c : "")}`;
  if (/rate|429/i.test(kind)) return new AiError("rate_limit", message);
  if (/overload|unavailable|503|529/i.test(kind)) return new AiError("overloaded", message);
  if (/context|too_long|length/i.test(kind + message)) return new AiError("too_long", message);
  return new AiError("network", message);
}
var OpenAiStreamState = class {
  constructor(onDelta) {
    this.onDelta = onDelta;
    this.text = "";
    this.usage = emptyUsage();
    this.usageReported = false;
    this.model = "";
    this.stop = "end";
  }
  handle(ev) {
    var _a, _b, _c;
    if (ev.data.trim() === "[DONE]") return true;
    let chunk;
    try {
      chunk = JSON.parse(ev.data);
    } catch (e) {
      return false;
    }
    if (chunk.error) throw streamErrorFromChunk(chunk.error);
    if (chunk.model) this.model = chunk.model;
    const choice = (_a = chunk.choices) == null ? void 0 : _a[0];
    const piece = (_b = choice == null ? void 0 : choice.delta) == null ? void 0 : _b.content;
    if (piece) {
      this.text += piece;
      (_c = this.onDelta) == null ? void 0 : _c.call(this, piece);
    }
    const stop = mapFinish(choice == null ? void 0 : choice.finish_reason);
    if (stop) this.stop = stop;
    if (applyUsage2(this.usage, chunk.usage)) this.usageReported = true;
    return false;
  }
  handleJson(json) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const res = json;
    this.model = (_a = res.model) != null ? _a : this.model;
    this.text = (_e = (_d = (_c = (_b = res.choices) == null ? void 0 : _b[0]) == null ? void 0 : _c.message) == null ? void 0 : _d.content) != null ? _e : "";
    if (this.text) (_f = this.onDelta) == null ? void 0 : _f.call(this, this.text);
    this.stop = (_i = mapFinish((_h = (_g = res.choices) == null ? void 0 : _g[0]) == null ? void 0 : _h.finish_reason)) != null ? _i : "end";
    if (applyUsage2(this.usage, res.usage)) this.usageReported = true;
  }
};
var OpenAiCompatProvider = class {
  constructor(deps) {
    this.deps = deps;
    this.id = "openai-compatible";
    this.caps = {
      streaming: true,
      structured: isOfficialOpenAi(deps.config.baseUrl) ? "native" : "prompted",
      promptCache: false
    };
  }
  get baseUrl() {
    return trimSlash(this.deps.config.baseUrl);
  }
  request(body) {
    if (!this.baseUrl) throw new AiError("bad_request", "Base URL is empty");
    const headers = { "content-type": "application/json" };
    if (this.deps.apiKey) headers.authorization = `Bearer ${this.deps.apiKey}`;
    return { url: `${this.baseUrl}/chat/completions`, method: "POST", headers, body: JSON.stringify(body) };
  }
  modelFor(tier) {
    const { smartModel, fastModel } = this.deps.config;
    const model = (tier === "smart" ? smartModel : fastModel) || smartModel || fastModel;
    if (!model) throw new AiError("bad_request", "No model name configured");
    return model;
  }
  async complete(req, opt) {
    const model = this.modelFor(req.tier);
    const res = await this.deps.transport.send(this.request(buildOpenAiBody(req, model, this.baseUrl)), opt.signal);
    await throwIfHttpError(res);
    const state = new OpenAiStreamState(opt.onDelta);
    await consumeBody(res, opt.signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    const usage = state.usageReported ? state.usage : {
      ...emptyUsage(),
      input: estimateTokens(req.system.map((b) => b.text).join("\n") + req.messages.map((m) => m.content).join("\n")),
      output: estimateTokens(state.text),
      estimated: true
    };
    const result = { text: state.text, usage, model: state.model || model, stop: state.stop, transport: res.mode };
    if (req.output && state.stop === "end") {
      result.json = this.caps.structured === "native" ? parseJson(state.text) : extractJson(state.text);
    }
    return result;
  }
  async testConnection(signal) {
    var _a;
    const now = (_a = this.deps.now) != null ? _a : Date.now;
    const started = now();
    const models = [...new Set([this.deps.config.smartModel, this.deps.config.fastModel].filter(Boolean))];
    if (models.length === 0) throw new AiError("bad_request", "No model name configured");
    let transport = "fetch";
    for (const model of models) {
      const body = buildOpenAiBody(
        { system: [], messages: [{ role: "user", content: "ping" }], maxTokens: TEST_MAX_TOKENS, tier: "fast" },
        model,
        this.baseUrl
      );
      const res = await this.deps.transport.send(this.request(body), signal);
      await throwIfHttpError(res);
      transport = res.mode;
      const state = new OpenAiStreamState();
      await consumeBody(res, signal, (ev) => state.handle(ev), (j) => state.handleJson(j));
    }
    return { models, transport, latencyMs: now() - started };
  }
};

// src/services/ai/providers/registry.ts
var PROVIDERS = [
  {
    id: "anthropic",
    label: "ai.provider.anthropic",
    key: "required",
    // claude-opus-5-5 is listed because 規劃書 06 §6.1 names it as the
    // upgrade option; Sonnet 5 / Haiku 4.5 are the defaults.
    models: {
      smart: ["claude-sonnet-5", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-6"],
      fast: ["claude-haiku-4-5", "claude-sonnet-5"]
    },
    editableBaseUrl: false,
    create: (deps) => new AnthropicProvider(deps)
  },
  {
    id: "openai-compatible",
    label: "ai.provider.openai",
    key: "optional",
    baseUrlPresets: [
      { label: "OpenAI", url: "https://api.openai.com/v1" },
      { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
      { label: "Ollama", url: "http://localhost:11434/v1" }
    ],
    editableBaseUrl: true,
    create: (deps) => new OpenAiCompatProvider(deps)
  }
];
function providerDef(id) {
  var _a;
  return (_a = PROVIDERS.find((p) => p.id === id)) != null ? _a : PROVIDERS[0];
}
function isMissingKey(id, key) {
  return providerDef(id).key === "required" && !key;
}

// src/core/text/template.ts
var SECTION_RE = /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
var SLOT_RE = /\{\{(\w+)\}\}/g;
function filled(value) {
  return value !== void 0 && value !== null && String(value).trim() !== "";
}
function renderTemplate(template, slots) {
  let out = template;
  let prev;
  do {
    prev = out;
    out = out.replace(SECTION_RE, (_m, kind, name, body) => {
      const keep = kind === "#" ? filled(slots[name]) : !filled(slots[name]);
      return keep ? body : "";
    });
  } while (out !== prev);
  out = out.replace(SLOT_RE, (_m, name) => {
    const value = slots[name];
    return value === void 0 || value === null ? "" : String(value);
  });
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// src/services/ai/context/paragraphContext.ts
var MAX_ARTICLE_TOKENS = 3e4;
var TRUNCATE_WINDOW = 3;
var ARTICLE_TEMPLATE = `\u3014\u6587\u7AE0\u3015{{#title}}\u300A{{title}}\u300B{{/title}}
{{#truncated}}\uFF08\u5168\u6587\u592A\u9577\uFF0C\u9019\u88E1\u53EA\u9644\u4E0A\u3014\u76EE\u524D\u6BB5\u843D\u3015\u524D\u5F8C\u5404 {{window}} \u6BB5\uFF1B\u6BB5\u843D\u7DE8\u865F\u4ECD\u662F\u539F\u6587\u7684\u7DE8\u865F\u3002\uFF09{{/truncated}}

{{body}}`;
var FOCUS_TEMPLATE = `\u3014\u76EE\u524D\u6BB5\u843D\u3015\xB6{{paragraphNumber}}
{{paragraph}}`;
function buildParagraphContext(input, opts = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const { paragraphs } = input.article;
  if (input.paragraphIndex < 0 || input.paragraphIndex >= paragraphs.length) {
    throw new RangeError(`paragraphIndex ${input.paragraphIndex} out of range (0..${paragraphs.length - 1})`);
  }
  const maxTokens = (_a = opts.maxArticleTokens) != null ? _a : MAX_ARTICLE_TOKENS;
  const window2 = (_b = opts.window) != null ? _b : TRUNCATE_WINDOW;
  const numbered = paragraphs.map((p, i) => `\xB6${i + 1} ${p.trim()}`);
  const truncated = estimateTokens(numbered.join("\n\n")) > maxTokens;
  const from = truncated ? Math.max(0, input.paragraphIndex - window2) : 0;
  const to = truncated ? Math.min(paragraphs.length, input.paragraphIndex + window2 + 1) : paragraphs.length;
  const articleBlock = renderTemplate(ARTICLE_TEMPLATE, {
    title: (_c = input.article.title) == null ? void 0 : _c.trim(),
    truncated: truncated ? "yes" : "",
    window: window2,
    body: numbered.slice(from, to).join("\n\n")
  });
  const paragraph = paragraphs[input.paragraphIndex].trim();
  const paragraphNumber = input.paragraphIndex + 1;
  return {
    articleBlock,
    focusBlock: renderTemplate(FOCUS_TEMPLATE, { paragraph, paragraphNumber }),
    truncated,
    slots: {
      paragraph,
      paragraphNumber,
      selection: (_e = (_d = input.selection) == null ? void 0 : _d.trim()) != null ? _e : "",
      question: (_g = (_f = input.question) == null ? void 0 : _f.trim()) != null ? _g : "",
      knownWords: ((_h = input.knownWords) != null ? _h : []).join(", ")
    }
  };
}

// src/services/ai/context/profile.ts
var PROFILE_TEMPLATE = `\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015
\u6211\u662F{{who}}\u7684\u82F1\u6587\u5B78\u7FD2\u8005\u3002\u8ACB\u7528{{language}}\u56DE\u7B54\uFF0C\u7C21\u660E\u627C\u8981{{#maxChars}}\uFF0C\u76E1\u91CF\u5728 {{maxChars}} \u5B57\u4EE5\u5167\u5B8C\u6210\u8AAA\u660E{{/maxChars}}\u3002
{{#extra}}\u5176\u4ED6\u88DC\u5145\uFF1A{{extra}}{{/extra}}`;
var LEVEL_LABEL = {
  A1: "A1\uFF08\u5165\u9580\uFF09",
  A2: "A2\uFF08\u521D\u7D1A\uFF09",
  B1: "B1\uFF08\u4E2D\u7D1A\uFF09",
  B2: "B2\uFF08\u4E2D\u9AD8\u7D1A\uFF09",
  C1: "C1\uFF08\u9AD8\u7D1A\uFF09",
  C2: "C2\uFF08\u7CBE\u901A\uFF09"
};
var GOAL_PHRASE = {
  general: "\u4EE5\u95B1\u8B80\u82F1\u6587\u6587\u7AE0\u70BA\u4E3B",
  toefl: "\u6B63\u5728\u6E96\u5099\u6258\u798F\uFF08TOEFL\uFF09",
  toeic: "\u6B63\u5728\u6E96\u5099\u591A\u76CA\uFF08TOEIC\uFF09",
  ielts: "\u6B63\u5728\u6E96\u5099\u96C5\u601D\uFF08IELTS\uFF09",
  gept: "\u6B63\u5728\u6E96\u5099\u5168\u6C11\u82F1\u6AA2\uFF08GEPT\uFF09",
  school: "\u6B63\u5728\u6E96\u5099\u5B78\u6821\u8003\u8A66\uFF08\u6703\u8003\uFF0F\u5B78\u6E2C\uFF09"
};
var LANGUAGE_PHRASE = {
  "zh-TW": "\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09",
  en: "\u6DFA\u986F\u7684\u82F1\u6587",
  bilingual: "\u4E2D\u82F1\u5C0D\u7167\uFF08\u4EE5\u7E41\u9AD4\u4E2D\u6587\u70BA\u4E3B\uFF0C\u95DC\u9375\u8655\u9644\u82F1\u6587\uFF09"
};
function renderProfile(p) {
  var _a, _b;
  const parts = [];
  if (p.level) parts.push(` ${LEVEL_LABEL[p.level]}\u7A0B\u5EA6`);
  parts.push((_a = GOAL_PHRASE[p.goal]) != null ? _a : GOAL_PHRASE.general);
  return renderTemplate(PROFILE_TEMPLATE, {
    who: `\u4E00\u500B${parts.join("\u3001")}`,
    language: (_b = LANGUAGE_PHRASE[p.answerLanguage]) != null ? _b : LANGUAGE_PHRASE["zh-TW"],
    maxChars: p.maxAnswerChars > 0 ? p.maxAnswerChars : void 0,
    extra: p.extra.trim()
  });
}

// src/services/ai/tasks/compose.ts
var HISTORY_ROUNDS = 6;
function trimHistory(history, rounds = HISTORY_ROUNDS) {
  const recent = history.filter((m) => m.content.trim() !== "").slice(-rounds * 2);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}
function composeRequest(p) {
  var _a, _b;
  const system = [
    { text: p.base, cache: true },
    ...((_a = p.cached) != null ? _a : []).map((text) => ({ text, cache: true })),
    ...((_b = p.context) != null ? _b : []).filter(Boolean).map((text) => ({ text })),
    { text: renderProfile(p.profile) }
  ];
  const req = {
    system,
    messages: [...trimHistory(p.history), { role: "user", content: p.user }],
    maxTokens: p.maxTokens,
    tier: p.tier
  };
  if (p.output) req.output = p.output;
  return req;
}

// src/services/ai/tasks/paragraph.ts
var PARAGRAPH_BASE_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u8010\u5FC3\u3001\u7CBE\u6E96\u7684\u82F1\u6587\u95B1\u8B80\u5BB6\u6559\uFF0C\u6B63\u5728\u966A\u4E00\u4F4D\u4EE5\u4E2D\u6587\u70BA\u6BCD\u8A9E\u7684\u5B78\u7FD2\u8005\u8B80\u4E00\u7BC7\u82F1\u6587\u6587\u7AE0\u3002\u3014\u6587\u7AE0\u3015\u662F\u5168\u6587\uFF0C\u3014\u76EE\u524D\u6BB5\u843D\u3015\u662F\u5B78\u7FD2\u8005\u6B63\u5728\u8B80\u7684\u90A3\u4E00\u6BB5\u3002

\u56DE\u7B54\u898F\u5247\uFF1A
1. \u9810\u8A2D\u7528\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09\u56DE\u7B54\uFF0C\u5F15\u7528\u82F1\u6587\u539F\u6587\u6642\u4FDD\u7559\u82F1\u6587\uFF1B\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u82E5\u6307\u5B9A\u4E86\u5176\u4ED6\u56DE\u7B54\u8A9E\u8A00\uFF0C\u4EE5\u5B78\u7FD2\u8005\u8A2D\u5B9A\u70BA\u6E96\u3002
2. \u53EA\u6839\u64DA\u63D0\u4F9B\u7684\u6587\u7AE0\u548C\u53EF\u9760\u3001\u5E38\u898B\u7684\u8A9E\u8A00\u77E5\u8B58\u56DE\u7B54\u3002\u4E0D\u78BA\u5B9A\u5C31\u76F4\u63A5\u8AAA\u300C\u4E0D\u78BA\u5B9A\u300D\uFF0C\u4E0D\u8981\u7DE8\u9020\u5B57\u7FA9\u3001\u6587\u6CD5\u898F\u5247\u3001\u5B57\u6E90\u6216\u51FA\u8655\u3002
3. \u7528 Markdown \u6392\u7248\uFF1A\u91CD\u9EDE\u7528\u7C97\u9AD4\uFF0C\u689D\u5217\u6700\u591A 5 \u9EDE\uFF0C\u4E0D\u8981\u7528\u6A19\u984C\uFF08#\uFF09\u3002
4. \u7BC7\u5E45\u4EE5\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u70BA\u6E96\u3002

\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\uFF1A
- \u4F7F\u7528\u8005\u7684\u554F\u984C\u5E38\u5E38\u5F88\u53E3\u8A9E\uFF0C\u4F8B\u5982\u300C\u6211\u770B\u4E0D\u61C2\u9019\u53E5\u300D\u300C\u9019\u88E1\u70BA\u4EC0\u9EBC\u9019\u6A23\u5BEB\u300D\uFF0C\u4E5F\u53EF\u80FD\u76F4\u63A5\u8CBC\u4E0A\u6216\u5F15\u7528\u6587\u7AE0\u88E1\u7684\u4E00\u5C0F\u6BB5\u6587\u5B57\uFF08\u53EF\u80FD\u4E0D\u5B8C\u6574\u3001\u6709\u932F\u5B57\u3001\u5927\u5C0F\u5BEB\u4E0D\u540C\uFF09\u3002
- \u4F9D\u5E8F\u7528\u9019\u4E9B\u7DDA\u7D22\u627E\u51FA\u4ED6\u6307\u7684\u90A3\u4E00\u53E5\uFF1A
  1. \u6709\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6642\uFF0C\u4EE5\u5305\u542B\u9078\u53D6\u6587\u5B57\u7684\u90A3\u4E00\u53E5\u70BA\u6E96\u3002
  2. \u554F\u984C\u88E1\u5F15\u7528\u4E86\u82F1\u6587\u7247\u6BB5\u6642\uFF0C\u5728\u3014\u76EE\u524D\u6BB5\u843D\u3015\u627E\u5305\u542B\u9019\u500B\u7247\u6BB5\u7684\u53E5\u5B50\uFF1B\u627E\u4E0D\u5230\u518D\u5230\u3014\u6587\u7AE0\u3015\u5176\u4ED6\u6BB5\u843D\u627E\u3002
  3. \u90FD\u6C92\u6709\u7DDA\u7D22\u6642\uFF1A\u554F\u984C\u662F\u91DD\u5C0D\u6574\u6BB5\uFF08\u4F8B\u5982\u300C\u9019\u6BB5\u5728\u8B1B\u4EC0\u9EBC\u300D\uFF09\uFF0C\u7BC4\u570D\u5C31\u662F\u6574\u6BB5\uFF1B\u554F\u984C\u8AAA\u7684\u662F\u300C\u9019\u53E5\u300D\u4F46\u3014\u76EE\u524D\u6BB5\u843D\u3015\u6709\u597D\u5E7E\u53E5\uFF0C\u5C31\u6311\u6700\u53EF\u80FD\u8B93\u5B78\u7FD2\u8005\u5361\u4F4F\u7684\u90A3\u4E00\u53E5\uFF0C\u4E26\u5728\u56DE\u7B54\u6700\u5F8C\u63D0\u9192\uFF1A\u300C\u5982\u679C\u4E0D\u662F\u9019\u53E5\uFF0C\u9078\u53D6\u6216\u8CBC\u4E0A\u4F60\u60F3\u554F\u7684\u53E5\u5B50\u518D\u554F\u4E00\u6B21\u3002\u300D
- \u56DE\u7B54\u7684\u7B2C\u4E00\u884C\u56FA\u5B9A\u5BEB\u51FA\u7BC4\u570D\uFF0C\u539F\u6587\u7167\u6284\u3001\u4E0D\u8981\u7FFB\u8B6F\uFF1A
  - \u91DD\u5C0D\u67D0\u4E00\u53E5\uFF1A\u4F60\u554F\u7684\u662F\uFF1A\u300C<\u90A3\u4E00\u53E5\u82F1\u6587\u539F\u6587>\u300D
  - \u91DD\u5C0D\u6574\u6BB5\uFF1A\u4F60\u554F\u7684\u662F\uFF1A\u6574\u6BB5\uFF08\xB6<\u6BB5\u843D\u7DE8\u865F>\uFF09
- \u771F\u7684\u7121\u6CD5\u5224\u65B7\u6642\uFF0C\u5217\u51FA\u6700\u53EF\u80FD\u7684\u4E00\u5230\u5169\u53E5\u8ACB\u4F7F\u7528\u8005\u78BA\u8A8D\uFF0C\u4E0D\u8981\u786C\u731C\u3002
- \u7B2C\u4E00\u884C\u4E4B\u5F8C\u7A7A\u4E00\u884C\uFF0C\u518D\u958B\u59CB\u56DE\u7B54\u3002`;
var SELECTION_HEADER = `{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015
{{selection}}

{{/selection}}`;
var PARAGRAPH_TEMPLATES = {
  grammar: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u6587\u6CD5\u89E3\u6790\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u90A3\u4E00\u53E5\u3002{{/selection}}{{^selection}}\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u7D50\u69CB\u6700\u503C\u5F97\u5B78\u7684\u4E00\u53E5\uFF1B\u6BB5\u843D\u53EA\u6709\u4E00\u53E5\u6642\u5C31\u662F\u90A3\u4E00\u53E5\u3002{{/selection}}
\u8ACB\u62C6\u89E3\u53E5\u5B50\u7D50\u69CB\uFF08\u4E3B\u8981\u5B50\u53E5\u3001\u5F9E\u5C6C\u5B50\u53E5\u3001\u7247\u8A9E\u5404\u81EA\u4FEE\u98FE\u8AB0\uFF09\uFF0C\u9EDE\u51FA\u95DC\u9375\u6587\u6CD5\uFF08\u6642\u614B\u3001\u8A9E\u614B\u3001\u5047\u8A2D\u8A9E\u6C23\u3001\u5012\u88DD\u3001\u7701\u7565\u7B49\uFF09\u5728\u9019\u88E1\u7684\u4F5C\u7528\uFF0C\u6700\u5F8C\u7528\u4E00\u53E5\u8A71\u8AAA\u660E\u9019\u53E5\u7684\u610F\u601D\u3002`,
  translate: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u7FFB\u8B6F\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u53E5\u5B50\u3002{{/selection}}{{^selection}}\u6574\u6BB5\u3002{{/selection}}
\u5148\u7D66\u901A\u9806\u3001\u81EA\u7136\u7684\u7E41\u9AD4\u4E2D\u6587\u7FFB\u8B6F\uFF1B\u518D\u6311\u4E00\u5230\u4E09\u500B\u76F4\u8B6F\u5BB9\u6613\u51FA\u932F\u7684\u5730\u65B9\uFF08\u7247\u8A9E\u3001\u6163\u7528\u8A9E\u3001\u6587\u5316\u80CC\u666F\uFF09\u7C21\u77ED\u8AAA\u660E\u3002`,
  vocab: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u751F\u5B57\u6574\u7406\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A\u6574\u6BB5\u3002
\u4F9D\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF0C\u6311\u51FA\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u6700\u503C\u5F97\u5B78\u7684 3 \u5230 6 \u500B\u55AE\u5B57\u6216\u7247\u8A9E\u3002{{#knownWords}}\u5B78\u7FD2\u8005\u5DF2\u7D93\u6536\u9304\u7684\u5B57\u4E0D\u8981\u518D\u5217\uFF1A{{knownWords}}\u3002{{/knownWords}}
\u6BCF\u500B\u4E00\u884C\uFF0C\u683C\u5F0F\uFF1A- **\u55AE\u5B57** \u8A5E\u6027\uFF1A\u4E2D\u6587\u610F\u601D \u2014 \u5728\u9019\u6BB5\u88E1\u7684\u7528\u6CD5`,
  paraphrase: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u63DB\u53E5\u8A71\u8AAA\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u90A3\u4E00\u53E5\u3002{{/selection}}{{^selection}}\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u6700\u96E3\u61C2\u7684\u4E00\u53E5\u3002{{/selection}}
\u7D66\u5169\u7A2E\u82F1\u6587\u6539\u5BEB\uFF1A\u4E00\u7A2E\u66F4\u7C21\u55AE\u3001\u9069\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF1B\u4E00\u7A2E\u66F4\u81EA\u7136\u9053\u5730\u3002\u6BCF\u7A2E\u90FD\u9644\u4E2D\u6587\u8AAA\u660E\uFF0C\u8B1B\u6E05\u695A\u548C\u539F\u53E5\u5DEE\u5728\u54EA\u88E1\u3002`,
  custom: `${SELECTION_HEADER}\u3014\u4F7F\u7528\u8005\u7684\u554F\u984C\u3015\uFF08\xB6{{paragraphNumber}}\uFF09
{{question}}

\u8ACB\u5148\u4F9D\u300C\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\u300D\u7684\u898F\u5247\u5728\u7B2C\u4E00\u884C\u5BEB\u51FA\u7BC4\u570D\uFF0C\u518D\u56DE\u7B54\u554F\u984C\u3002`
};
function paragraphTask(id, opts) {
  return {
    id: `paragraph.${id}`,
    version: 1,
    surface: "paragraph",
    ...opts,
    build(input, ctx) {
      const c = buildParagraphContext(input);
      return composeRequest({
        base: PARAGRAPH_BASE_PROMPT,
        cached: [c.articleBlock],
        context: [c.focusBlock],
        profile: ctx.profile,
        history: ctx.history,
        user: renderTemplate(PARAGRAPH_TEMPLATES[id], c.slots),
        tier: opts.tier,
        maxTokens: opts.maxTokens
      });
    }
  };
}
var paragraphGrammar = paragraphTask("grammar", { tier: "smart", maxTokens: 4096, label: "ai.task.paragraph.grammar" });
var paragraphTranslate = paragraphTask("translate", { tier: "fast", maxTokens: 2048, label: "ai.task.paragraph.translate" });
var paragraphVocab = paragraphTask("vocab", { tier: "fast", maxTokens: 2048, label: "ai.task.paragraph.vocab" });
var paragraphParaphrase = paragraphTask("paraphrase", { tier: "smart", maxTokens: 4096, label: "ai.task.paragraph.paraphrase" });
var paragraphCustom = paragraphTask("custom", { tier: "smart", maxTokens: 4096 });
var PARAGRAPH_TASKS = [paragraphGrammar, paragraphTranslate, paragraphVocab, paragraphParaphrase, paragraphCustom];

// src/services/ai/context/wordContext.ts
var WORD_TEMPLATE = `\u3014\u55AE\u5B57\u3015{{word}}
{{#phonetic}}\u97F3\u6A19\uFF1A{{phonetic}}
{{/phonetic}}{{#partOfSpeech}}\u8A5E\u6027\uFF1A{{partOfSpeech}}
{{/partOfSpeech}}{{#definitionZh}}\u4E2D\u6587\uFF1A{{definitionZh}}
{{/definitionZh}}{{#definition}}\u82F1\u6587\u5B9A\u7FA9\uFF1A{{definition}}
{{/definition}}{{#synonyms}}\u540C\u7FA9\u8A5E\uFF1A{{synonyms}}
{{/synonyms}}{{#antonyms}}\u53CD\u7FA9\u8A5E\uFF1A{{antonyms}}
{{/antonyms}}{{#grammar}}\u5B78\u7FD2\u8005\u7684\u7B46\u8A18\uFF1A{{grammar}}
{{/grammar}}
{{#sourceParagraph}}\u3014\u51FA\u8655\u6BB5\u843D\u3015{{#sourceTitle}}\u51FA\u81EA\u300A{{sourceTitle}}\u300B{{/sourceTitle}}
{{sourceParagraph}}
{{/sourceParagraph}}{{^sourceParagraph}}{{#example}}\u3014\u51FA\u8655\u53E5\u5B50\u3015
{{example}}
{{/example}}{{/sourceParagraph}}
{{#otherExamples}}\u3014\u5176\u4ED6\u7B46\u8A18\u88E1\u7684\u4F8B\u53E5\u3015
{{otherExamples}}{{/otherExamples}}`;
function buildWordContext(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const e = input.entry;
  const sourceParagraph = (_b = (_a = input.sourceParagraph) == null ? void 0 : _a.trim()) != null ? _b : "";
  const example = (_d = (_c = e.example) == null ? void 0 : _c.trim()) != null ? _d : "";
  return {
    wordBlock: renderTemplate(WORD_TEMPLATE, {
      word: e.word,
      phonetic: e.phonetic,
      partOfSpeech: e.partOfSpeech,
      definitionZh: e.definitionZh,
      definition: e.definition,
      synonyms: e.synonyms,
      antonyms: e.antonyms,
      grammar: e.grammar,
      sourceParagraph,
      sourceTitle: (_e = input.sourceTitle) == null ? void 0 : _e.trim(),
      example,
      otherExamples: ((_f = input.otherExamples) != null ? _f : []).map((s) => `- ${s.trim()}`).join("\n")
    }),
    slots: {
      word: e.word,
      selection: (_h = (_g = input.selection) == null ? void 0 : _g.trim()) != null ? _h : "",
      question: (_j = (_i = input.question) == null ? void 0 : _i.trim()) != null ? _j : "",
      compareWith: (_l = (_k = input.compareWith) == null ? void 0 : _k.trim()) != null ? _l : "",
      hasSource: sourceParagraph || example ? "yes" : ""
    }
  };
}

// src/services/ai/tasks/word.ts
var WORD_BASE_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u8010\u5FC3\u3001\u7CBE\u6E96\u7684\u82F1\u6587\u55AE\u5B57\u5BB6\u6559\uFF0C\u6B63\u5728\u5E6B\u4E00\u4F4D\u4EE5\u4E2D\u6587\u70BA\u6BCD\u8A9E\u7684\u5B78\u7FD2\u8005\u5F04\u61C2\u4E00\u500B\u82F1\u6587\u55AE\u5B57\u3002\u3014\u55AE\u5B57\u3015\u662F\u9019\u500B\u5B57\u7684\u8CC7\u6599\uFF0C\u3014\u51FA\u8655\u6BB5\u843D\u3015\u662F\u5B78\u7FD2\u8005\u9047\u5230\u9019\u500B\u5B57\u7684\u90A3\u4E00\u6574\u6BB5\u539F\u6587\u3002

\u56DE\u7B54\u898F\u5247\uFF1A
1. \u9810\u8A2D\u7528\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09\u56DE\u7B54\uFF0C\u82F1\u6587\u55AE\u5B57\u8207\u4F8B\u53E5\u4FDD\u7559\u82F1\u6587\uFF1B\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u82E5\u6307\u5B9A\u4E86\u5176\u4ED6\u56DE\u7B54\u8A9E\u8A00\uFF0C\u4EE5\u5B78\u7FD2\u8005\u8A2D\u5B9A\u70BA\u6E96\u3002
2. \u53EA\u6839\u64DA\u63D0\u4F9B\u7684\u8CC7\u6599\u548C\u53EF\u9760\u3001\u5E38\u898B\u7684\u8A9E\u8A00\u77E5\u8B58\u56DE\u7B54\u3002\u4E0D\u78BA\u5B9A\u5C31\u76F4\u63A5\u8AAA\u300C\u4E0D\u78BA\u5B9A\u300D\uFF0C\u4E0D\u8981\u7DE8\u9020\u5B57\u7FA9\u3001\u7528\u6CD5\u3001\u5B57\u6E90\u6216\u51FA\u8655\u3002
3. \u7528 Markdown \u6392\u7248\uFF1A\u91CD\u9EDE\u7528\u7C97\u9AD4\uFF0C\u689D\u5217\u6700\u591A 5 \u9EDE\uFF0C\u4E0D\u8981\u7528\u6A19\u984C\uFF08#\uFF09\u3002
4. \u7BC7\u5E45\u4EE5\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u70BA\u6E96\u3002
5. \u89E3\u91CB\u5B57\u7FA9\u6642\uFF0C\u4EE5\u9019\u500B\u5B57\u5728\u3014\u51FA\u8655\u6BB5\u843D\u3015\u88E1\u7684\u610F\u601D\u70BA\u4E3B\uFF0C\u518D\u88DC\u5145\u5176\u4ED6\u5E38\u898B\u610F\u601D\u3002

\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\uFF1A
- \u4F7F\u7528\u8005\u7684\u554F\u984C\u53EF\u80FD\u5F88\u53E3\u8A9E\uFF0C\u4F8B\u5982\u300C\u9019\u53E5\u88E1\u5B83\u662F\u4EC0\u9EBC\u610F\u601D\u300D\u300C\u6211\u770B\u4E0D\u61C2\u9019\u53E5\u300D\uFF0C\u4E5F\u53EF\u80FD\u76F4\u63A5\u8CBC\u4E0A\u6216\u5F15\u7528\u539F\u6587\u7684\u4E00\u5C0F\u6BB5\uFF08\u53EF\u80FD\u4E0D\u5B8C\u6574\u3001\u6709\u932F\u5B57\u3001\u5927\u5C0F\u5BEB\u4E0D\u540C\uFF09\u3002
- \u4F9D\u5E8F\u7528\u9019\u4E9B\u7DDA\u7D22\u627E\u51FA\u4ED6\u6307\u7684\u90A3\u4E00\u53E5\uFF1A\u6709\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6642\u4EE5\u5305\u542B\u5B83\u7684\u53E5\u5B50\u70BA\u6E96\uFF1B\u554F\u984C\u88E1\u5F15\u7528\u4E86\u82F1\u6587\u7247\u6BB5\u6642\uFF0C\u5728\u3014\u51FA\u8655\u6BB5\u843D\u3015\u627E\u5305\u542B\u9019\u500B\u7247\u6BB5\u7684\u53E5\u5B50\uFF1B\u90FD\u6C92\u6709\u7DDA\u7D22\u6642\uFF0C\u4EE5\u3014\u51FA\u8655\u6BB5\u843D\u3015\u4E2D\u542B\u6709\u9019\u500B\u55AE\u5B57\u7684\u53E5\u5B50\u70BA\u6E96\u3002
- \u53EA\u8981\u56DE\u7B54\u727D\u6D89\u539F\u6587\u88E1\u7684\u67D0\u4E00\u53E5\uFF0C\u7B2C\u4E00\u884C\u56FA\u5B9A\u5BEB\uFF1A\u4F60\u554F\u7684\u662F\uFF1A\u300C<\u90A3\u4E00\u53E5\u82F1\u6587\u539F\u6587>\u300D\uFF08\u539F\u6587\u7167\u6284\uFF0C\u4E0D\u8981\u7FFB\u8B6F\uFF09\uFF0C\u7A7A\u4E00\u884C\u518D\u958B\u59CB\u56DE\u7B54\u3002\u554F\u984C\u548C\u539F\u6587\u53E5\u5B50\u7121\u95DC\u6642\uFF08\u4F8B\u5982\u53EA\u554F\u5B57\u6839\u3001\u9020\u53E5\uFF09\uFF0C\u4E0D\u7528\u5BEB\u9019\u4E00\u884C\u3002
- \u771F\u7684\u7121\u6CD5\u5224\u65B7\u6642\uFF0C\u5217\u51FA\u6700\u53EF\u80FD\u7684\u4E00\u5230\u5169\u53E5\u8ACB\u4F7F\u7528\u8005\u78BA\u8A8D\uFF0C\u4E0D\u8981\u786C\u731C\u3002`;
var SELECTION_HEADER2 = `{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015
{{selection}}

{{/selection}}`;
var WORD_TEMPLATES = {
  usage: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u7528\u6CD5\uFF08{{word}}\uFF09
\u8AAA\u660E {{word}} \u6700\u5E38\u898B\u7684 2 \u5230 3 \u7A2E\u7528\u6CD5\u6216\u642D\u914D\uFF08collocation\uFF09\uFF0C\u6BCF\u7A2E\u9644\u4E00\u500B\u7C21\u77ED\u4F8B\u53E5\u548C\u4E2D\u6587\u7FFB\u8B6F\u3002{{#hasSource}}\u5982\u679C\u3014\u51FA\u8655\u6BB5\u843D\u3015\u88E1\u7684\u7528\u6CD5\u5C6C\u65BC\u5176\u4E2D\u4E00\u7A2E\uFF0C\u6A19\u51FA\u4F86\u3002{{/hasSource}}`,
  compare: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u6BD4\u8F03\uFF08{{word}}{{#compareWith}} vs {{compareWith}}{{/compareWith}}\uFF09
{{^compareWith}}\u5148\u6311\u4E00\u5230\u5169\u500B\u5B78\u7FD2\u8005\u6700\u5BB9\u6613\u548C {{word}} \u6DF7\u6DC6\u7684\u8FD1\u7FA9\u5B57\u3002{{/compareWith}}\u5F9E\u610F\u601D\u3001\u8A9E\u6C23\u8207\u6B63\u5F0F\u7A0B\u5EA6\u3001\u5E38\u898B\u642D\u914D\u4E09\u65B9\u9762\u6BD4\u8F03\uFF0C\u5404\u9644\u4E00\u500B\u4F8B\u53E5\u3002{{#hasSource}}\u6700\u5F8C\u7528\u4E00\u5169\u53E5\u8AAA\u660E\u3014\u51FA\u8655\u6BB5\u843D\u3015\u70BA\u4EC0\u9EBC\u7528 {{word}}\u3002{{/hasSource}}`,
  sentence: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u9020\u53E5\uFF08{{word}}\uFF09
\u7528 {{word}} \u9020 3 \u500B\u53E5\u5B50\uFF0C\u96E3\u5EA6\u7B26\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF0C\u60C5\u5883\u76E1\u91CF\u8CBC\u8FD1\u5B78\u7FD2\u8005\u7684\u76EE\u6A19\u3002{{#hasSource}}\u5176\u4E2D\u4E00\u53E5\u6CBF\u7528\u3014\u51FA\u8655\u6BB5\u843D\u3015\u88E1\u7684\u610F\u601D\u3002{{/hasSource}}\u6BCF\u53E5\u9644\u4E2D\u6587\u7FFB\u8B6F\u3002`,
  mnemonic: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u8A18\u61B6\u6CD5\uFF08{{word}}\uFF09
\u7D66 {{word}} \u4E00\u5230\u5169\u500B\u597D\u8A18\u7684\u65B9\u6CD5\uFF08\u5B57\u6839\u5B57\u9996\u3001\u806F\u60F3\u3001\u62C6\u5B57\u64C7\u4E00\uFF09\u3002\u5B57\u6839\u6216\u5B57\u6E90\u4E0D\u78BA\u5B9A\u6642\u76F4\u63A5\u8AAA\u4E0D\u78BA\u5B9A\uFF0C\u6539\u7528\u806F\u60F3\u6CD5\uFF0C\u4E0D\u8981\u7DE8\u9020\u3002`,
  custom: `${SELECTION_HEADER2}\u3014\u4F7F\u7528\u8005\u7684\u554F\u984C\u3015\uFF08\u95DC\u65BC {{word}}\uFF09
{{question}}

\u5982\u679C\u554F\u984C\u727D\u6D89\u539F\u6587\u88E1\u7684\u67D0\u4E00\u53E5\uFF0C\u5148\u4F9D\u300C\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\u300D\u7684\u898F\u5247\u5728\u7B2C\u4E00\u884C\u5BEB\u51FA\u90A3\u4E00\u53E5\uFF0C\u518D\u56DE\u7B54\u554F\u984C\u3002`
};
function wordTask(id, opts) {
  return {
    id: `word.${id}`,
    version: 1,
    surface: "word",
    ...opts,
    build(input, ctx) {
      const c = buildWordContext(input);
      return composeRequest({
        base: WORD_BASE_PROMPT,
        context: [c.wordBlock],
        profile: ctx.profile,
        history: ctx.history,
        user: renderTemplate(WORD_TEMPLATES[id], c.slots),
        tier: opts.tier,
        maxTokens: opts.maxTokens
      });
    }
  };
}
var wordUsage = wordTask("usage", { tier: "fast", maxTokens: 2048, label: "ai.task.word.usage" });
var wordCompare = wordTask("compare", { tier: "smart", maxTokens: 4096, label: "ai.task.word.compare" });
var wordSentence = wordTask("sentence", { tier: "fast", maxTokens: 2048, label: "ai.task.word.sentence" });
var wordMnemonic = wordTask("mnemonic", { tier: "fast", maxTokens: 2048, label: "ai.task.word.mnemonic" });
var wordCustom = wordTask("custom", { tier: "smart", maxTokens: 4096 });
var WORD_TASKS = [wordUsage, wordCompare, wordSentence, wordMnemonic, wordCustom];

// src/services/ai/tasks/registry.ts
var TaskRegistry = class {
  constructor(initial = []) {
    this.tasks = /* @__PURE__ */ new Map();
    for (const t2 of initial) this.register(t2);
  }
  register(task) {
    if (this.tasks.has(task.id)) throw new Error(`AI task "${task.id}" is already registered`);
    this.tasks.set(task.id, task);
  }
  get(id) {
    return this.tasks.get(id);
  }
  forSurface(surface) {
    return [...this.tasks.values()].filter((t2) => t2.surface === surface);
  }
  all() {
    return [...this.tasks.values()];
  }
};
function defaultTaskRegistry() {
  return new TaskRegistry([...PARAGRAPH_TASKS, ...WORD_TASKS]);
}

// src/services/ai/transport/fallbackTransport.ts
var FallbackTransport = class {
  constructor(providerId, primary, fallback, device, network) {
    this.providerId = providerId;
    this.primary = primary;
    this.fallback = fallback;
    this.device = device;
    this.network = network;
  }
  get memoryKey() {
    return `ai.transport.${this.providerId}`;
  }
  get usesFallback() {
    return this.device.get(this.memoryKey) === "requestUrl";
  }
  // Called by "測試連線" so a fixed setup (e.g. OLLAMA_ORIGINS now set, or a
  // different base URL) gets streaming back instead of staying pinned.
  resetMemory() {
    this.device.set(this.memoryKey, null);
  }
  async send(req, signal) {
    if (!this.network.isOnline()) throw new AiError("offline");
    if (!this.usesFallback) {
      try {
        return await this.primary.send(req, signal);
      } catch (e) {
        if (signal.aborted) throw new AiError("aborted", void 0, { cause: e });
        if (isAiError(e)) throw e;
        if (!(e instanceof TypeError)) throw new AiError("network", String(e), { cause: e });
        if (!this.network.isOnline()) throw new AiError("offline", void 0, { cause: e });
      }
      const res = await this.sendFallback(req, signal);
      this.device.set(this.memoryKey, "requestUrl");
      return res;
    }
    return this.sendFallback(req, signal);
  }
  async sendFallback(req, signal) {
    try {
      return await this.fallback.send(req, signal);
    } catch (e) {
      if (signal.aborted) throw new AiError("aborted", void 0, { cause: e });
      if (isAiError(e)) throw e;
      if (!this.network.isOnline()) throw new AiError("offline", void 0, { cause: e });
      throw new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
    }
  }
};

// src/services/ai/transport/fetchTransport.ts
var FetchTransport = class {
  constructor(port) {
    this.port = port;
  }
  async send(req, signal) {
    const res = await this.port.fetch(req, signal);
    return { status: res.status, header: (n) => res.header(n), chunks: res.chunks, mode: "fetch" };
  }
};

// src/services/ai/transport/requestUrlTransport.ts
var RequestUrlTransport = class {
  constructor(port) {
    this.port = port;
  }
  async send(req, signal) {
    if (signal.aborted) throw new AiError("aborted");
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new AiError("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const res = await Promise.race([this.port.request(req), aborted]);
      const headers = lowerKeys(res.headers);
      return {
        status: res.status,
        header: (n) => {
          var _a;
          return (_a = headers[n.toLowerCase()]) != null ? _a : null;
        },
        chunks: once(res.text),
        mode: "requestUrl"
      };
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
};
function lowerKeys(h) {
  const out = {};
  for (const [k, v] of Object.entries(h != null ? h : {})) out[k.toLowerCase()] = v;
  return out;
}
async function* once(text) {
  yield text;
}

// src/services/ai/AiService.ts
var MAX_CONCURRENT = 2;
var MAX_RETRIES = 2;
var BASE_BACKOFF_MS = 1e3;
var MAX_RETRY_WAIT_MS = 3e4;
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AiError("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiError("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
var AiService = class {
  constructor(deps) {
    this.deps = deps;
    this.limiter = new Limiter(MAX_CONCURRENT);
    this.inFlight = /* @__PURE__ */ new Map();
    this.transports = /* @__PURE__ */ new Map();
    var _a, _b;
    this.tasks = (_a = deps.tasks) != null ? _a : defaultTaskRegistry();
    this.sleep = (_b = deps.sleep) != null ? _b : abortableSleep;
  }
  // Drives the D6 (no key / disabled) and D7 (offline) UI states.
  status() {
    const ai = this.deps.settings().ai;
    if (!ai.enabled) return "disabled";
    if (isMissingKey(ai.provider, this.deps.keys.get(ai.provider))) return "no_key";
    if (!this.deps.network.isOnline()) return "offline";
    return "ready";
  }
  usageSummary() {
    return this.deps.usage.summary();
  }
  usesFallback(provider = this.deps.settings().ai.provider) {
    return this.transport(provider).usesFallback;
  }
  transport(provider) {
    let t2 = this.transports.get(provider);
    if (!t2) {
      t2 = new FallbackTransport(
        provider,
        new FetchTransport(this.deps.fetch),
        new RequestUrlTransport(this.deps.request),
        this.deps.device,
        this.deps.network
      );
      this.transports.set(provider, t2);
    }
    return t2;
  }
  // Built per call so settings edits take effect immediately.
  provider(id) {
    const ai = this.deps.settings().ai;
    return providerDef(id).create({
      config: ai.providers[id],
      apiKey: this.deps.keys.get(id),
      transport: this.transport(id)
    });
  }
  // Works even with the master toggle off, so the user can verify their
  // setup before enabling AI. Clears the remembered transport fallback
  // first so a fixed CORS setup gets streaming back.
  async testConnection(provider = this.deps.settings().ai.provider, signal) {
    if (isMissingKey(provider, this.deps.keys.get(provider))) throw new AiError("no_key");
    this.transport(provider).resetMemory();
    return this.provider(provider).testConnection(signal != null ? signal : new AbortController().signal);
  }
  async run(task, input, opt = {}) {
    var _a;
    const t2 = typeof task === "string" ? this.tasks.get(task) : task;
    if (!t2) throw new Error(`Unknown AI task "${String(task)}"`);
    const req = t2.build(input, { profile: this.deps.settings().learner, history: (_a = opt.history) != null ? _a : [] });
    const result = await this.complete(req, opt);
    return { ...result, taskId: t2.id, taskVersion: t2.version };
  }
  async complete(req, opt = {}) {
    var _a, _b, _c, _d;
    const ai = this.deps.settings().ai;
    if (!ai.enabled) throw new AiError("disabled");
    const providerId = ai.provider;
    if (isMissingKey(providerId, this.deps.keys.get(providerId))) throw new AiError("no_key");
    if (!this.deps.network.isOnline()) throw new AiError("offline");
    await this.deps.usage.assertWithinBudget(ai.monthlyTokenBudget);
    const controller = new AbortController();
    const { threadId } = opt;
    if (threadId) {
      (_a = this.inFlight.get(threadId)) == null ? void 0 : _a.abort();
      this.inFlight.set(threadId, controller);
    }
    const onExternalAbort = () => controller.abort();
    if ((_b = opt.signal) == null ? void 0 : _b.aborted) controller.abort();
    (_c = opt.signal) == null ? void 0 : _c.addEventListener("abort", onExternalAbort, { once: true });
    let partial = "";
    try {
      const result = await this.limiter.run(
        () => this.withRetry(providerId, req, controller.signal, opt, (t2) => partial += t2),
        controller.signal
      );
      void this.deps.usage.record(result.usage).catch((e) => console.error("Vocab Tracker: usage write failed", e));
      if (result.stop === "refusal") {
        throw new AiError("refused", "The model declined to answer", { partialText: result.text });
      }
      return { ...result, provider: providerId };
    } catch (e) {
      const err = controller.signal.aborted ? new AiError("aborted", void 0, { cause: e }) : isAiError(e) ? e : new AiError("network", e instanceof Error ? e.message : String(e), { cause: e });
      if (partial && err.extra.partialText === void 0) err.extra.partialText = partial;
      throw err;
    } finally {
      (_d = opt.signal) == null ? void 0 : _d.removeEventListener("abort", onExternalAbort);
      if (threadId && this.inFlight.get(threadId) === controller) this.inFlight.delete(threadId);
    }
  }
  async withRetry(providerId, req, signal, opt, collect) {
    var _a, _b;
    for (let attempt = 0; ; attempt++) {
      let emitted = false;
      try {
        return await this.provider(providerId).complete(req, {
          signal,
          onDelta: (t2) => {
            var _a2;
            emitted = true;
            collect(t2);
            (_a2 = opt.onDelta) == null ? void 0 : _a2.call(opt, t2);
          }
        });
      } catch (e) {
        if (!isAiError(e) || !e.retryable || attempt >= MAX_RETRIES) throw e;
        if (emitted) throw e;
        const delay = (_a = e.extra.retryAfterMs) != null ? _a : BASE_BACKOFF_MS * 2 ** attempt;
        if (delay > MAX_RETRY_WAIT_MS) throw e;
        (_b = opt.onRetry) == null ? void 0 : _b.call(opt, attempt + 1, delay);
        await this.sleep(delay, signal);
      }
    }
  }
  isBusy(threadId) {
    return this.inFlight.has(threadId);
  }
  cancel(threadId) {
    var _a;
    (_a = this.inFlight.get(threadId)) == null ? void 0 : _a.abort();
  }
  dispose() {
    for (const c of this.inFlight.values()) c.abort();
    this.inFlight.clear();
  }
};

// src/services/ai/keys.ts
var ApiKeys = class _ApiKeys {
  constructor(secrets, settings, updateSettings) {
    this.secrets = secrets;
    this.settings = settings;
    this.updateSettings = updateSettings;
  }
  static secretId(provider) {
    return `vocab-tracker-${provider}`;
  }
  get usesSecretStorage() {
    return this.secrets.available;
  }
  get(provider) {
    if (this.secrets.available) {
      const secret = this.secrets.get(_ApiKeys.secretId(provider));
      if (secret) return secret;
    }
    return this.settings().ai.providers[provider].apiKey;
  }
  async set(provider, key) {
    const trimmed = key.trim();
    if (this.secrets.available) {
      this.secrets.set(_ApiKeys.secretId(provider), trimmed);
      if (this.settings().ai.providers[provider].apiKey) {
        await this.updateSettings((s) => {
          s.ai.providers[provider].apiKey = "";
        });
      }
      return;
    }
    await this.updateSettings((s) => {
      s.ai.providers[provider].apiKey = trimmed;
    });
  }
};

// src/services/ai/usage.ts
var SHARD = "usage";
var KEEP_DAYS = 400;
function emptyDay() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
}
function weightedTokens(d) {
  return d.input + d.output + d.cacheWrite + Math.round(d.cacheRead / 10);
}
function localDayKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function add(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    requests: a.requests + b.requests
  };
}
function normalize(raw) {
  const r = raw;
  if (!r || r.version !== 1 || typeof r.devices !== "object" || r.devices === null) {
    return { version: 1, devices: {} };
  }
  return { version: 1, devices: r.devices };
}
var UsageTracker = class {
  constructor(storage, deviceId2, now = () => /* @__PURE__ */ new Date()) {
    this.storage = storage;
    this.deviceId = deviceId2;
    this.now = now;
    this.writing = Promise.resolve();
  }
  async load() {
    return normalize(await this.storage.readShard(SHARD));
  }
  // Serialized so two requests finishing together don't race the
  // read-modify-write and drop one of them.
  record(u) {
    const run = async () => {
      var _a, _b, _c;
      const shard = await this.load();
      const id = this.deviceId();
      const days = (_b = (_a = shard.devices)[id]) != null ? _b : _a[id] = {};
      const key = localDayKey(this.now());
      days[key] = add((_c = days[key]) != null ? _c : emptyDay(), {
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
        requests: 1
      });
      const cutoff = localDayKey(new Date(this.now().getTime() - KEEP_DAYS * 864e5));
      for (const day of Object.keys(days)) if (day < cutoff) delete days[day];
      await this.storage.writeShard(SHARD, shard);
    };
    this.writing = this.writing.then(run, run);
    return this.writing;
  }
  async summary() {
    const shard = await this.load();
    const todayKey = localDayKey(this.now());
    const monthPrefix = todayKey.slice(0, 7);
    let today = emptyDay();
    let month = emptyDay();
    for (const days of Object.values(shard.devices)) {
      for (const [day, u] of Object.entries(days)) {
        if (day === todayKey) today = add(today, u);
        if (day.startsWith(monthPrefix)) month = add(month, u);
      }
    }
    return { today, month, monthWeighted: weightedTokens(month) };
  }
  // budget 0 = unlimited. Checked before each request, so the request that
  // crosses the line still completes; the next one is refused.
  async assertWithinBudget(budget) {
    if (!budget || budget <= 0) return;
    const { monthWeighted } = await this.summary();
    if (monthWeighted >= budget) {
      throw new AiError("budget", `Monthly budget reached (${monthWeighted}/${budget})`);
    }
  }
};

// src/services/ai/createAiService.ts
function deviceId(device) {
  return () => {
    let id = device.get("ai.deviceId");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      device.set("ai.deviceId", id);
    }
    return id;
  };
}
function createAiService(store, ports) {
  const keys = new ApiKeys(ports.secrets, () => store.settings, (m) => store.updateSettings(m));
  const ai = new AiService({
    settings: () => store.settings,
    keys,
    usage: new UsageTracker(ports.storage, deviceId(ports.device)),
    fetch: ports.fetch,
    request: ports.request,
    device: ports.device,
    network: ports.network
  });
  return { ai, keys };
}

// src/ui/settings/SettingsTab.ts
var import_obsidian7 = require("obsidian");
var VocabSettingsTab = class extends import_obsidian7.PluginSettingTab {
  constructor(app, plugin, ctx, sections) {
    super(app, plugin);
    this.ctx = ctx;
    this.sections = sections;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vt-settings");
    const ctx = { ...this.ctx, redisplay: () => this.display() };
    for (const section of this.sections) {
      new import_obsidian7.Setting(containerEl).setName(t(section.title)).setHeading();
      section.render(containerEl.createDiv({ cls: `vt-settings-section vt-settings-${section.id}` }), ctx);
    }
  }
};
function parseNonNegativeInt(value) {
  const n = Number(value.trim().replace(/[,_\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// src/ui/settings/sections/ai.ts
var import_obsidian10 = require("obsidian");

// src/ui/kit/emptyState.ts
var import_obsidian8 = require("obsidian");

// src/ui/kit/inlineNote.ts
var import_obsidian9 = require("obsidian");
var TONE_ICON = {
  info: "info",
  offline: "wifi-off",
  error: "alert-circle"
};
function inlineNote(opts) {
  var _a, _b;
  const tone = (_a = opts.tone) != null ? _a : "info";
  const el = createDiv({ cls: `vt-note is-${tone}` });
  (0, import_obsidian9.setIcon)(el.createSpan({ cls: "vt-note-icon" }), (_b = opts.icon) != null ? _b : TONE_ICON[tone]);
  el.createDiv({ cls: "vt-note-text", text: opts.text });
  return el;
}

// src/ui/kit/aiState.ts
function aiErrorKey(code) {
  return `ai.error.${code}`;
}
function aiErrorText(e) {
  const code = typeof e === "string" ? e : e.code;
  const base = t(aiErrorKey(code));
  if (typeof e !== "string" && (code === "bad_request" || code === "auth") && e.message && e.message !== code) {
    return `${base}\uFF08${e.message}\uFF09`;
  }
  return base;
}

// src/ui/settings/sections/ai.ts
var fmt = (n) => n.toLocaleString();
function renderProviderFields(el, ctx, id) {
  var _a;
  const def = providerDef(id);
  const cfg = () => ctx.store.settings.ai.providers[id];
  const update = (mutate) => ctx.store.updateSettings((s) => mutate(s.ai.providers[id]));
  const keyDesc = [t(ctx.keys.usesSecretStorage ? "settings.ai.key.descSecret" : "settings.ai.key.descData")];
  if (def.key === "optional") keyDesc.unshift(t("settings.ai.key.optional"));
  new import_obsidian10.Setting(el).setName(t("settings.ai.key.name")).setDesc(keyDesc.join(" ")).addText((text) => {
    text.inputEl.type = "password";
    text.inputEl.autocomplete = "off";
    text.setPlaceholder(id === "anthropic" ? "sk-ant-\u2026" : "sk-\u2026").setValue(ctx.keys.get(id));
    text.onChange((v) => void ctx.keys.set(id, v));
  });
  if (def.editableBaseUrl) {
    const baseUrl = new import_obsidian10.Setting(el).setName(t("settings.ai.baseUrl.name")).setDesc(t("settings.ai.baseUrl.desc"));
    baseUrl.addText((text) => {
      text.inputEl.addClass("vt-settings-wide");
      text.setPlaceholder("https://\u2026/v1").setValue(cfg().baseUrl);
      text.onChange((v) => void update((c) => c.baseUrl = v.trim()));
    });
    for (const preset of (_a = def.baseUrlPresets) != null ? _a : []) {
      baseUrl.addButton(
        (b) => b.setButtonText(preset.label).onClick(async () => {
          await update((c) => c.baseUrl = preset.url);
          ctx.redisplay();
        })
      );
    }
  }
  const modelSetting = (tier) => {
    var _a2;
    const field = tier === "smart" ? "smartModel" : "fastModel";
    const s = new import_obsidian10.Setting(el).setName(t(tier === "smart" ? "settings.ai.smartModel.name" : "settings.ai.fastModel.name")).setDesc(t(tier === "smart" ? "settings.ai.smartModel.desc" : "settings.ai.fastModel.desc"));
    const options = (_a2 = def.models) == null ? void 0 : _a2[tier];
    if (options) {
      const all = options.includes(cfg()[field]) || !cfg()[field] ? options : [...options, cfg()[field]];
      s.addDropdown((d) => {
        for (const m of all) d.addOption(m, m);
        d.setValue(cfg()[field]).onChange((v) => void update((c) => c[field] = v));
      });
    } else {
      s.addText(
        (text) => text.setPlaceholder(t("settings.ai.model.placeholder")).setValue(cfg()[field]).onChange((v) => void update((c) => c[field] = v.trim()))
      );
    }
  };
  modelSetting("smart");
  modelSetting("fast");
  const testSetting = new import_obsidian10.Setting(el).setName(t("settings.ai.test.name")).setDesc(t("settings.ai.test.desc"));
  const result = el.createDiv({ cls: "vt-settings-test-result" });
  testSetting.addButton((b) => {
    b.setButtonText(t("settings.ai.test.button")).onClick(async () => {
      result.empty();
      result.removeClass("is-ok", "is-error");
      if (!cfg().smartModel && !cfg().fastModel) {
        result.setText(t("settings.ai.test.noModel"));
        result.addClass("is-error");
        return;
      }
      b.setDisabled(true).setButtonText(t("settings.ai.test.running"));
      try {
        const r = await ctx.ai.testConnection(id);
        result.setText(
          t("settings.ai.test.ok", {
            models: r.models.join("\u3001"),
            transport: t(r.transport === "fetch" ? "settings.ai.test.fetch" : "settings.ai.test.requestUrl"),
            ms: r.latencyMs
          })
        );
        result.addClass("is-ok");
      } catch (e) {
        result.setText(isAiError(e) ? aiErrorText(e) : String(e));
        result.addClass("is-error");
      } finally {
        b.setDisabled(false).setButtonText(t("settings.ai.test.button"));
      }
    });
  });
}
var aiSection = {
  id: "ai",
  title: "settings.section.ai",
  render(el, ctx) {
    const ai = () => ctx.store.settings.ai;
    new import_obsidian10.Setting(el).setName(t("settings.ai.enabled.name")).setDesc(t("settings.ai.enabled.desc")).addToggle((tg) => tg.setValue(ai().enabled).onChange((v) => void ctx.store.updateSettings((s) => s.ai.enabled = v)));
    new import_obsidian10.Setting(el).setName(t("settings.ai.provider.name")).setDesc(t("settings.ai.provider.desc")).addDropdown((d) => {
      for (const p of PROVIDERS) d.addOption(p.id, t(p.label));
      d.setValue(ai().provider).onChange(async (v) => {
        await ctx.store.updateSettings((s) => s.ai.provider = v);
        ctx.redisplay();
      });
    });
    renderProviderFields(el, ctx, ai().provider);
    new import_obsidian10.Setting(el).setName(t("settings.ai.budget.name")).setDesc(t("settings.ai.budget.desc")).addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.setPlaceholder("0").setValue(ai().monthlyTokenBudget ? String(ai().monthlyTokenBudget) : "");
      text.onChange((v) => {
        const n = v.trim() === "" ? 0 : parseNonNegativeInt(v);
        if (n !== null) void ctx.store.updateSettings((s) => s.ai.monthlyTokenBudget = n);
      });
    });
    const usage = new import_obsidian10.Setting(el).setName(t("settings.ai.usage.name")).setDesc("\u2026");
    ctx.ai.usageSummary().then((u) => {
      const desc = createFragment((f) => {
        f.createDiv({ text: t("settings.ai.usage.value", { month: fmt(u.monthWeighted), today: fmt(u.today.input + u.today.output) }) });
        f.createDiv({
          cls: "vt-settings-muted",
          text: t("settings.ai.usage.detail", {
            input: fmt(u.month.input),
            output: fmt(u.month.output),
            cacheRead: fmt(u.month.cacheRead),
            cacheWrite: fmt(u.month.cacheWrite),
            requests: fmt(u.month.requests)
          })
        });
      });
      usage.setDesc(desc);
    }).catch(() => usage.setDesc("\u2014"));
    el.appendChild(inlineNote({ tone: "info", text: t("settings.ai.privacy") }));
  }
};

// src/ui/settings/sections/general.ts
var import_obsidian11 = require("obsidian");
var generalSection = {
  id: "general",
  title: "settings.section.general",
  render(el, ctx) {
    new import_obsidian11.Setting(el).setName(t("settings.general.locale.name")).setDesc(t("settings.general.locale.desc")).addDropdown(
      (d) => d.addOptions({ auto: t("settings.general.locale.auto"), "zh-TW": "\u7E41\u9AD4\u4E2D\u6587", en: "English" }).setValue(ctx.store.settings.ui.locale).onChange(async (v) => {
        await ctx.store.updateSettings((s) => {
          s.ui.locale = v;
        });
        ctx.applyLocale();
        ctx.redisplay();
      })
    );
  }
};

// src/ui/settings/sections/learner.ts
var import_obsidian12 = require("obsidian");
var learnerSection = {
  id: "learner",
  title: "settings.section.learner",
  render(el, ctx) {
    const profile = () => ctx.store.settings.learner;
    el.createDiv({ cls: "setting-item-description vt-settings-intro", text: t("settings.learner.desc") });
    const preview = createEl("pre", { cls: "vt-settings-preview", text: renderProfile(profile()) });
    const update = async (mutate) => {
      await ctx.store.updateSettings((s) => mutate(s.learner));
      preview.setText(renderProfile(profile()));
    };
    new import_obsidian12.Setting(el).setName(t("settings.learner.level.name")).addDropdown((d) => {
      d.addOption("", t("settings.learner.level.none"));
      for (const lv of CEFR_LEVELS) d.addOption(lv, lv);
      d.setValue(profile().level).onChange((v) => void update((p) => p.level = v));
    });
    new import_obsidian12.Setting(el).setName(t("settings.learner.goal.name")).addDropdown((d) => {
      for (const g of LEARNER_GOALS) d.addOption(g, t(`settings.learner.goal.${g}`));
      d.setValue(profile().goal).onChange((v) => void update((p) => p.goal = v));
    });
    new import_obsidian12.Setting(el).setName(t("settings.learner.language.name")).addDropdown((d) => {
      for (const l of ANSWER_LANGUAGES) d.addOption(l, t(`settings.learner.language.${l}`));
      d.setValue(profile().answerLanguage).onChange((v) => void update((p) => p.answerLanguage = v));
    });
    new import_obsidian12.Setting(el).setName(t("settings.learner.maxChars.name")).setDesc(t("settings.learner.maxChars.desc")).addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.setValue(String(profile().maxAnswerChars)).onChange((v) => {
        const n = parseNonNegativeInt(v);
        if (n !== null) void update((p) => p.maxAnswerChars = n);
      });
    });
    new import_obsidian12.Setting(el).setName(t("settings.learner.extra.name")).setDesc(t("settings.learner.extra.desc")).addTextArea((ta) => {
      ta.inputEl.rows = 3;
      ta.inputEl.addClass("vt-settings-wide");
      ta.setValue(profile().extra).onChange((v) => void update((p) => p.extra = v));
    });
    const previewSetting = new import_obsidian12.Setting(el).setName(t("settings.learner.preview.name"));
    previewSetting.settingEl.addClass("vt-settings-preview-row");
    el.appendChild(preview);
  }
};

// src/ui/settings/sections/index.ts
var SETTINGS_SECTIONS = [generalSection, aiSection, learnerSection];

// main.ts
var VOCAB_FOLDER = "vocab-list";
var VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
var VOCAB_FILE_LEGACY = "vocab-list.md";
var VocabTrackerPlugin = class extends import_obsidian13.Plugin {
  constructor() {
    super(...arguments);
    this.vocabData = { entries: [] };
  }
  async onload() {
    this.storage = new ObsidianStorage(this);
    this.vocabData = cleanupTombstones(await loadMigrated(this.storage));
    this.store = new VocabStore(this.vocabData, (data) => this.storage.writeShard("data", data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
    this.applyLocale();
    const { ai, keys } = createAiService(this.store, createAiPorts(this.app, this.storage));
    this.ai = ai;
    const settingsCtx = { app: this.app, store: this.store, ai, keys, applyLocale: () => this.applyLocale() };
    this.addSettingTab(new VocabSettingsTab(this.app, this, settingsCtx, SETTINGS_SECTIONS));
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
        if (!(file instanceof import_obsidian13.TFile)) return;
        const changed = updateSourcePaths(this.vocabData.entries, oldPath, file.path);
        for (const entry of changed) await this.store.touch(entry);
      })
    );
    this.app.workspace.onLayoutReady(() => this.ensureVocabFile());
  }
  // So a debounced write (VocabStore's 500ms coalescing) isn't lost if
  // Obsidian closes right after an edit, before the timer fires.
  async onunload() {
    var _a;
    (_a = this.ai) == null ? void 0 : _a.dispose();
    await this.store.flush();
  }
  // Interface language: the user's setting, or Obsidian's language on "auto".
  applyLocale() {
    setLocale(resolveLocale(this.store.settings.ui.locale, obsidianLanguage()));
  }
  // Fires when the data.json on disk changed from outside this session —
  // sync (iCloud/Obsidian Sync/Git) pulling in another device's edits.
  // Merge instead of overwriting so neither side's changes get clobbered.
  async onExternalSettingsChange() {
    var _a;
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
  async ensureVocabFile() {
    if (this.app.vault.getAbstractFileByPath(VOCAB_FILE)) return;
    if (!this.app.vault.getAbstractFileByPath(VOCAB_FOLDER)) {
      await this.app.vault.createFolder(VOCAB_FOLDER);
    }
    const legacy = this.app.vault.getAbstractFileByPath(VOCAB_FILE_LEGACY);
    if (legacy instanceof import_obsidian13.TFile) {
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
    const menu = new import_obsidian13.Menu();
    menu.addItem((item) => {
      item.setTitle(
        exists ? `Open "${word}" in Vocab Tracker` : `Add "${word}" to Vocab Tracker`
      );
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        new import_obsidian13.Notice(added ? `Added "${word}" to vocab list` : `Opened "${word}"`);
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
      new import_obsidian13.Notice("Source note not found: " + entry.source.path);
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
      new import_obsidian13.Notice("No pronunciation available on this device.");
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
      if (opts.verbose) new import_obsidian13.Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      new import_obsidian13.Notice(`Vocab Tracker: couldn't fetch "${entry.word}" \u2014 ${(e == null ? void 0 : e.message) || e}`);
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

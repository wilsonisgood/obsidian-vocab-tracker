"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key3, value) => key3 in obj ? __defProp(obj, key3, { enumerable: true, configurable: true, writable: true, value }) : obj[key3] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key3 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key3) && key3 !== except)
        __defProp(to, key3, { get: () => from[key3], enumerable: !(desc = __getOwnPropDesc(from, key3)) || desc.enumerable });
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
var __publicField = (obj, key3, value) => __defNormalProp(obj, typeof key3 !== "symbol" ? key3 + "" : key3, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabTrackerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian51 = require("obsidian");

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
  const lines4 = content.split("\n");
  let inFence = false;
  for (let i = 0; i < lines4.length; i++) {
    if (/^\s*(```|~~~)/.test(lines4[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines4[i] = lines4[i].replace(
      /(`[^`]*`)|([^`]+)/g,
      (_m, code, text) => code != null ? code : text.replace(re, repl)
    );
  }
  return lines4.join("\n");
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
  const lines4 = content.split("\n");
  const wordRe = new RegExp(
    `(?<![A-Za-z0-9'\\-])${escapeRe(word)}(?![A-Za-z0-9'\\-])`,
    "i"
  );
  const candidates = [];
  for (let i = 0; i < lines4.length; i++) {
    if (wordRe.test(lines4[i])) candidates.push(i);
  }
  if (candidates.length === 0) return -1;
  if (candidates.length === 1 || !sentence) return candidates[0];
  const sentWords = new Set(sentence.toLowerCase().match(/[a-z']+/g) || []);
  let best = candidates[0];
  let bestScore = -1;
  for (const i of candidates) {
    const lw = lines4[i].toLowerCase().match(/[a-z']+/g) || [];
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
var FILE_SHARDS = /* @__PURE__ */ new Set(["reviews", "usage", "threads", "imports", "learn", "files"]);
var UNSUPPORTED_SHARD = (name) => new Error(`ObsidianStorage: shard "${name}" is not implemented yet`);
var BACKUP_NAME = /^[\w.-]+\.json$/;
var ObsidianStorage = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  pluginDir() {
    const dir = this.plugin.manifest.dir;
    if (!dir) throw new Error("ObsidianStorage: plugin manifest.dir is unavailable");
    return dir;
  }
  shardPath(name) {
    return (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/store/${name}.json`);
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
  // The v1 → v2 migration's one-off backup of data.json:
  // backup/<name>-v1-<time>.json (BackupService lists and restores these).
  async backup(name, data) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-");
    await this.writeBackupFile(`${name}-v1-${stamp}.json`, JSON.stringify(data, null, 2));
  }
  // ── 備份與還原 (services/backup) ─────────────────────────────────
  get backupFolder() {
    return (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/backup`);
  }
  backupPath(name) {
    if (!BACKUP_NAME.test(name) || name.includes("..")) throw new Error(`ObsidianStorage: bad backup name "${name}"`);
    return (0, import_obsidian2.normalizePath)(`${this.backupFolder}/${name}`);
  }
  async writeBackupFile(name, text) {
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.backupFolder;
    if (!await adapter.exists(dir)) await adapter.mkdir(dir);
    const path = this.backupPath(name);
    await adapter.write(path, text);
    return path;
  }
  // Plain file names of the *.json files in backup/.
  async listBackups() {
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.backupFolder;
    if (!await adapter.exists(dir)) return [];
    const { files } = await adapter.list(dir);
    return files.map((p) => p.slice(p.lastIndexOf("/") + 1)).filter((n) => BACKUP_NAME.test(n));
  }
  async readBackup(name) {
    const adapter = this.plugin.app.vault.adapter;
    const path = this.backupPath(name);
    if (!await adapter.exists(path)) return null;
    try {
      return JSON.parse(await adapter.read(path));
    } catch (e) {
      console.error(`Vocab Tracker: couldn't parse ${path}`, e);
      return null;
    }
  }
  // Compact JSON: a full backup carries every discussion, so pretty
  // printing would roughly double it.
  writeBackup(name, data) {
    return this.writeBackupFile(name, JSON.stringify(data));
  }
  // data.json plus every store/*.json, parsed. A shard that doesn't parse
  // is kept as its raw text, so a backup never silently drops it.
  async readAllShards() {
    var _a;
    const out = { data: (_a = await this.plugin.loadData()) != null ? _a : null };
    const adapter = this.plugin.app.vault.adapter;
    const dir = (0, import_obsidian2.normalizePath)(`${this.pluginDir()}/store`);
    if (!await adapter.exists(dir)) return out;
    const { files } = await adapter.list(dir);
    for (const path of files) {
      const m = /\/([\w.-]+)\.json$/.exec(path);
      if (!m || m[1] === "data") continue;
      const text = await adapter.read(path);
      try {
        out[m[1]] = JSON.parse(text);
      } catch (e) {
        out[m[1]] = text;
      }
    }
    return out;
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
var TAP_ACTIONS = ["menu", "save", "open"];
var PRONOUNCE_SOURCES = ["auto", "recording", "synth"];
var DEFAULT_UI_PREFS = {
  tapAction: "menu",
  tapActionMobile: "save",
  livePreviewHint: true,
  pronounceSource: "auto"
};
function isTapAction(v) {
  return typeof v === "string" && TAP_ACTIONS.includes(v);
}
function isPronounceSource(v) {
  return typeof v === "string" && PRONOUNCE_SOURCES.includes(v);
}
function resolveUiPrefs(ui) {
  return {
    tapAction: isTapAction(ui == null ? void 0 : ui.tapAction) ? ui.tapAction : DEFAULT_UI_PREFS.tapAction,
    tapActionMobile: isTapAction(ui == null ? void 0 : ui.tapActionMobile) ? ui.tapActionMobile : DEFAULT_UI_PREFS.tapActionMobile,
    livePreviewHint: typeof (ui == null ? void 0 : ui.livePreviewHint) === "boolean" ? ui.livePreviewHint : DEFAULT_UI_PREFS.livePreviewHint,
    pronounceSource: isPronounceSource(ui == null ? void 0 : ui.pronounceSource) ? ui.pronounceSource : DEFAULT_UI_PREFS.pronounceSource
  };
}
var SETTINGS_SECTIONS = ["ui", "ai", "learner", "srs", "wordlists", "files", "anchors"];
function stampMs(iso) {
  if (typeof iso !== "string" || !iso) return 0;
  const ms5 = new Date(iso).getTime();
  return Number.isNaN(ms5) ? 0 : ms5;
}
function legacyStamp(s) {
  const ms5 = stampMs(s.updatedAt);
  let newest2 = 0;
  for (const v of Object.values(s)) {
    if (v && typeof v === "object") newest2 = Math.max(newest2, stampMs(v.updatedAt));
  }
  return ms5 > newest2 ? { ms: ms5, iso: s.updatedAt } : null;
}
function carryLegacyStamp(s) {
  const legacy = legacyStamp(s);
  if (!legacy) return;
  for (const key3 of SETTINGS_SECTIONS) {
    const section3 = s[key3];
    if (section3 && typeof section3 === "object" && stampMs(section3.updatedAt) < legacy.ms) section3.updatedAt = legacy.iso;
  }
}
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
function sectionFingerprint(section3) {
  if (!section3 || typeof section3 !== "object") return String(section3);
  return JSON.stringify(
    { ...section3, updatedAt: void 0 },
    (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(
      Object.keys(v).sort().map((k) => [k, v[k]])
    ) : v
  );
}
function snapshotSettingsSections(s) {
  const out = {};
  for (const key3 of SETTINGS_SECTIONS) {
    const section3 = s[key3];
    out[key3] = { fingerprint: sectionFingerprint(section3), updatedAt: section3 == null ? void 0 : section3.updatedAt };
  }
  return out;
}
function stampChangedSections(s, before, stamp) {
  const changed = [];
  for (const key3 of SETTINGS_SECTIONS) {
    const section3 = s[key3];
    if (!section3 || typeof section3 !== "object") continue;
    if (sectionFingerprint(section3) !== before[key3].fingerprint) {
      section3.updatedAt = stamp;
      changed.push(key3);
    } else if (before[key3].updatedAt !== void 0) {
      section3.updatedAt = before[key3].updatedAt;
    } else {
      delete section3.updatedAt;
    }
  }
  return changed;
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
  // The only way UI code should change settings. Stamps updatedAt on just
  // the sections (ui/ai/learner/srs/wordlists) whose content actually
  // changed, so merge.ts can keep the newer copy of each section
  // independently. The top-level updatedAt gets the very same stamp, and
  // only when some section changed — so it never exceeds the newest section
  // stamp, which is how merge.ts recognises a copy last edited by an older
  // plugin version (those bump only the top-level stamp). Such a copy first
  // hands that old-version time down to its sections (carryLegacyStamp),
  // since bumping the top-level stamp here would hide it from merge.ts.
  updateSettings(mutate) {
    const s = this.settings;
    carryLegacyStamp(s);
    const before = snapshotSettingsSections(s);
    mutate(s);
    const stamp = nowIso();
    if (stampChangedSections(s, before, stamp).length > 0) s.updatedAt = stamp;
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
    return this.addEntries([entry]);
  }
  // One save (and one data:changed) for a whole batch, e.g. a note's exam
  // words imported at once.
  addEntries(entries) {
    var _a, _b;
    const stamp = nowIso();
    for (const entry of entries) {
      entry.createdAt = (_a = entry.createdAt) != null ? _a : stamp;
      entry.updatedAt = stamp;
      entry.rev = 0;
      entry.lang = (_b = entry.lang) != null ? _b : "en";
      this.data.entries.push(entry);
    }
    return this.save();
  }
  // Raw entries including tombstones — for logic that must know a word was
  // deleted (e.g. auto-import not re-adding it), not for display.
  get allEntries() {
    return this.data.entries;
  }
  // Call after directly mutating fields on an entry that's already in
  // this.data.entries, so its updatedAt/rev stay meaningful to merge.ts.
  touch(entry) {
    return this.touchMany([entry]);
  }
  touchMany(entries) {
    var _a;
    const stamp = nowIso();
    for (const entry of entries) {
      entry.updatedAt = stamp;
      entry.rev = ((_a = entry.rev) != null ? _a : 0) + 1;
    }
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
function pickSection(local, remote, localLegacy, remoteLegacy, lTop, rTop) {
  const lOwn = stampMs(local == null ? void 0 : local.updatedAt);
  const rOwn = stampMs(remote == null ? void 0 : remote.updatedAt);
  const lf = sectionFingerprint(local);
  const rf = sectionFingerprint(remote);
  if (lf === rf) return rOwn > lOwn ? remote : local;
  const effective = (section3, own2, legacy2) => {
    var _a;
    return section3 === void 0 ? -1 : Math.max(own2, (_a = legacy2 == null ? void 0 : legacy2.ms) != null ? _a : 0);
  };
  const l4 = effective(local, lOwn, localLegacy);
  const r = effective(remote, rOwn, remoteLegacy);
  const remoteWins = l4 !== r ? r > l4 : lTop !== rTop ? rTop > lTop : rf > lf;
  const [winner, eff, own, legacy] = remoteWins ? [remote, r, rOwn, remoteLegacy] : [local, l4, lOwn, localLegacy];
  return legacy && eff > own ? { ...winner, updatedAt: legacy.iso } : winner;
}
function restFingerprint(s) {
  const rest = { ...s };
  for (const key3 of SETTINGS_SECTIONS) delete rest[key3];
  return sectionFingerprint(rest);
}
function mergeSettings(local, remote) {
  if (!local) return remote != null ? remote : { schemaVersion: 2 };
  if (!remote) return local;
  const l4 = stampMs(local.updatedAt);
  const r = stampMs(remote.updatedAt);
  const remoteNewer = l4 !== r ? r > l4 : restFingerprint(remote) > restFingerprint(local);
  const out = { ...remoteNewer ? remote : local };
  const localLegacy = legacyStamp(local);
  const remoteLegacy = legacyStamp(remote);
  for (const key3 of SETTINGS_SECTIONS) {
    const picked = pickSection(local[key3], remote[key3], localLegacy, remoteLegacy, l4, r);
    if (picked === void 0) delete out[key3];
    else out[key3] = picked;
  }
  return out;
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
    settings: mergeSettings(local.settings, remote.settings),
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
var import_obsidian17 = require("obsidian");

// src/ui/word/WordRow.ts
var import_obsidian9 = require("obsidian");

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
  // 1005 feedback S: collapsible sections, AI discussions, grouping by source
  "sidebar.section.words": "Words",
  // Wave 6 W: paragraph discussions split out into their own section — its
  // header reuses paragraph.list.title (the list's own heading before).
  "sidebar.paragraphs.noNote": "Open a note to see its paragraph discussions.",
  "sidebar.section.ai": "AI discussions ({n})",
  "sidebar.ai.empty": "No discussions yet. Open a word's AI tab, or click the \u2726 next to a paragraph in reading view.",
  "sidebar.ai.showAll": "Show all ({n})",
  "sidebar.ai.showLess": "Show recent only",
  // Wave 6 W: the 文法 section (today: 動詞用法; 句型結構 later).
  "sidebar.section.grammar": "Grammar ({n})",
  "sidebar.grammar.verbs": "Verb usage",
  "sidebar.grammar.empty": "No verb usage yet. Generate one from a verb's card.",
  "sidebar.grammar.viewAll": "View all",
  "sidebar.group.family": "Word family: {name}",
  "sidebar.group.familyGone": "Word family (removed)",
  "sidebar.group.familyOpen": "Open word families",
  "sidebar.group.wordlist": "Exam word lists",
  "sidebar.group.none": "(no note)",
  "row.delete": "Delete",
  "row.expand": "Expand",
  "row.collapse": "Collapse",
  "row.pronounce": "Pronounce",
  "pronounce.noVoice": "No pronunciation available on this device.",
  "pronounce.loading": "Loading pronunciation\u2026",
  "row.jumpToSource": "Jump to where this word was captured",
  "row.showMore": "Show more",
  "row.showLess": "Show less",
  "row.fetch": "Fetch dictionary data (definition, synonyms, phonetic)",
  "row.markReviewed": "Mark as reviewed (rates Good)",
  "row.meta.added": "Added: {date}",
  "row.meta.reviewed": "Reviewed: {date} ({count}\xD7)",
  "row.meta.updated": "Updated: {date}",
  "row.meta.dates": "Added {added} \xB7 Updated {updated}",
  "row.meta.addedOnly": "Added {added}",
  "row.field.synonyms": "Synonyms",
  "row.field.definition": "Definition",
  "row.field.definitionZh": "\u4E2D\u6587\u7FFB\u8BD1",
  "row.field.antonyms": "Antonyms",
  "row.field.example": "Example sentence (from note)",
  "row.field.grammar": "Grammar tips",
  "row.field.level": "Level",
  "row.field.placeholder": "Add {label}\u2026",
  // Confirm dialog before deleting a word: what it's linked to (W6).
  "deleteEntry.title": 'Delete "{word}"?',
  "deleteEntry.noLinks": "This word isn't in any family, trivia or discussion.",
  "deleteEntry.impact.families": "In {n} families (the text stays; you can add it back later)",
  "deleteEntry.impact.trivia": "Mentioned in {n} saved trivia answers",
  "deleteEntry.impact.verbFavorite": "Its verb usage is saved",
  "deleteEntry.impact.wordPage": "Has a word page",
  "deleteEntry.impact.threads": "{n} questions asked on its word page",
  "deleteEntry.trashWordPage": "Also delete the word page (move to trash)",
  "deleteEntry.cancel": "Cancel",
  "deleteEntry.confirm": "Delete",
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
  "flashcards.batch.toggle": "This batch ({n})",
  "flashcards.batch.current": "Now",
  "flashcards.batch.pending": "Up next",
  "flashcards.batch.new": "New",
  "flashcards.batch.due": "Due",
  "flashcards.batch.hidden": "Shown after you answer",
  "flashcards.batch.openSource": "Open source note",
  "flashcards.single.source": "This word only",
  "flashcards.single.new": "New word: rating it starts its schedule and uses one of today's new-card slots.",
  "flashcards.single.due": "Due \u2014 a regular review.",
  "flashcards.single.early": "Not due until {date}. An early review still counts: FSRS uses the real time since the last review, so remembering it now stretches the interval less than it would on the due date; Again still counts as forgotten and goes back to relearning.",
  "flashcards.single.noCloze": "This word has no example sentence containing it, so it can't be a cloze card. Pick another mode.",
  "flashcards.single.done": "Saved: {rating}",
  "flashcards.single.next": "Next review: {date} (in {interval})",
  "flashcards.single.nextSoon": "Next review: in {interval}",
  "flashcards.single.again": "Review again",
  "flashcards.single.close": "Done",
  "command.openFlashcards": "Open flashcards",
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
  "ai.task.family.generate": "Find families",
  "ai.task.verb.usage": "Generate usage",
  "ai.task.trivia.next": "Another one",
  "ai.task.trivia.quiz": "Quiz me",
  "ai.task.trivia.etymology": "Etymology",
  "ai.task.trivia.joke": "Joke",
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
  // ── M4: word discussion ──────────────────────────────────────────
  "word.tab.data": "Data",
  "word.tab.ai": "AI",
  "chat.placeholder.word": "Ask about {word}\u2026",
  "chat.send": "Send",
  "chat.stop": "Stop",
  "chat.selection": "Selection: \u201C{text}\u201D",
  "chat.selection.remove": "Don't attach the selection",
  "chat.selection.hint": "Sent with your next question so the AI knows which sentence you mean.",
  "chat.empty": "No discussion yet. Pick a button above or type a question.",
  "chat.meta.origin": "from \xB6{n}",
  "chat.action.pin": "Pin to grammar tips",
  "chat.action.unpin": "Unpin",
  "chat.action.copy": "Copy",
  "chat.copied": "Copied",
  "chat.truncated": "The answer hit the length limit and was cut off.",
  "chat.retryWait": "The service is busy \u2014 retrying in {seconds}s\u2026",
  "ai.gate.noKey.title": "Set up AI to start discussing",
  "ai.gate.noKey.body": "Add an API key in Settings \u203A Vocab Tracker. Claude works, and so do OpenAI-compatible services (OpenAI, Gemini, local Ollama).",
  "ai.gate.disabled.title": "AI is turned off",
  "ai.gate.disabled.body": "Turn on \u201CEnable AI\u201D in Settings \u203A Vocab Tracker to discuss words and paragraphs.",
  "ai.gate.offline": "You're offline. Earlier discussions are readable; you can ask again once you're back online.",
  "ai.debug.summary": "Debug info: what was sent to the AI and its raw answer",
  "ai.debug.prompt": "Prompt sent to the AI",
  "ai.debug.output": "Raw AI output",
  "ai.debug.empty": "(empty)",
  "ai.debug.copy": "Copy",
  "ai.debug.copied": "Debug info copied",
  "ai.debug.copyFailed": "Couldn't copy \u2014 select the text instead",
  "ai.debug.hint": "Attach this when reporting a problem (no API key in it).",
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
  "settings.ai.test.details": "Request and response ({n})",
  "settings.ai.test.copy": "Copy",
  "settings.ai.test.copied": "Copied",
  "settings.ai.test.response": "\u2500\u2500 Response ({mode}, {ms} ms) \u2500\u2500",
  "settings.ai.test.noResponse": "\u2500\u2500 No response ({ms} ms) \u2500\u2500",
  "settings.ai.test.emptyBody": "(empty)",
  "settings.ai.test.truncated": "\u2026 (only the first {n} characters kept)",
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
  "settings.learner.preview.name": "What the AI sees",
  // ── M2 settings section ──
  "settings.section.srs": "Flashcards",
  "settings.srs.retention.name": "Target retention",
  "settings.srs.retention.desc": "Probability you still remember a card when it comes due. Higher = more frequent reviews. Default 0.9.",
  "settings.srs.dailyNew.name": "New cards per day",
  "settings.srs.dailyNew.desc": "Max never-reviewed words introduced each day. Default 20.",
  "settings.section.wordlists": "Exam word lists",
  "settings.wordlists.desc": "Put word lists (TOEFL, IELTS, TOEIC\u2026) in a vault folder, one file per list. The file name becomes the tag: exam-TOEFL.md \u2192 TOEFL. One word per line; anything after the word (part of speech, meaning) is ignored. .md, .txt and .csv all work. Words from these lists are underlined in reading view.",
  "settings.wordlists.folder.name": "Word list folder",
  "settings.wordlists.folder.desc": "Vault folder holding the lists. Files starting with _ and README are skipped.",
  "settings.wordlists.highlight.name": "Underline list words",
  "settings.wordlists.highlight.desc": "Coloured dashed underline in reading view. Hover a word to see its lists. The note itself is never changed.",
  "settings.wordlists.inflections.name": "Match inflected forms",
  "settings.wordlists.inflections.desc": "analyzed / analyzing / analyzes also match analyze. Turn off for exact matches only.",
  "settings.wordlists.loaded.name": "Loaded lists",
  "settings.wordlists.loaded.none": "No lists found in {folder}/.",
  "settings.wordlists.loaded.some": "{n} list(s). Edits to the files are picked up automatically.",
  "settings.wordlists.reload": "Reload",
  "settings.wordlists.list.desc": "{n} words \xB7 {paths}",
  "exam.strip.scanning": "Scanning exam words\u2026",
  "exam.strip.title": "Exam words in this note \xB7 {total} distinct words",
  "exam.strip.hide": "Hide {tag} underlines",
  "exam.strip.show": "Show {tag} underlines",
  "command.toggleExamHighlight": "Toggle exam word underlines",
  "command.reloadWordlists": "Reload exam word lists",
  "exam.import.done": 'Vocab Tracker: added {added} exam word(s) from "{note}" ({tagged} existing word(s) tagged)',
  "command.importExamWords": "Add this note's exam words to the vocab list",
  "settings.wordlists.autoImport.name": "Auto-add exam words",
  "settings.wordlists.autoImport.desc": "The first time a note is opened, add every list word in it to the vocab list, with its exams (TOEFL, IELTS\u2026) in the level field. Each note is imported once; words you delete aren't re-added. Dictionary data is fetched in the background.",
  "export.families": "Word families",
  "export.familiesEmpty": "No word families yet.",
  "export.usage": "Usage",
  "export.usageEmpty": "No usage notes yet.",
  "export.usageRelated": "Related phrases",
  "export.trivia": "Saved trivia",
  "export.triviaEmpty": "Nothing saved yet.",
  "export.triviaMentionedIn": "Also mentioned in",
  "export.discussion": "AI discussion",
  "export.discussionEmpty": "No discussion yet.",
  "export.userNotesHint": "Your notes below \u2014 the plugin never changes them",
  "export.paragraphsEmpty": "No paragraph discussions yet.",
  "export.paragraphOrphaned": "Paragraph no longer found in the note",
  "export.wordsLearned": "Words from this note",
  "export.wordsEmpty": "No words added from this note yet.",
  "export.wordQuestions": "{n} questions",
  "export.favorites": "Saved",
  "export.favoritesEmpty": "Nothing saved yet.",
  "export.aborted": "(stopped)",
  "export.usageSaved": "Saved {date}",
  "export.usageGenerated": "Generated by AI {date}",
  // ── M6 word pages (vocab-word block, heading buttons) ──
  "wordPage.missing": "This word isn't in your vocab list (it may have been deleted).",
  "wordPage.speak": "Pronounce",
  "wordPage.source": "From {source}",
  "wordPage.sourceTitle": "Open the source note",
  "wordPage.dueNew": "Not reviewed yet",
  "wordPage.dueToday": "Due today",
  "wordPage.dueOn": "Next review {date}",
  "wordPage.reviewed": "Reviewed {n}\xD7",
  "wordPage.review": "Review this word",
  "wordPage.findFamilies": "Find families",
  "wordPage.generateUsage": "Generate",
  "wordPage.regenerateUsage": "Regenerate",
  "wordPage.trivia": "Tell me one",
  "wordPage.openSidebar": "Open in sidebar",
  "wordPage.familiesNone": "No new word families found.",
  "wordPage.familiesSaved": "Added {n} word families.",
  "wordPage.usageSaved": "Usage updated.",
  "wordPage.failed": "Failed: {error}",
  "wordPage.origin": "From word families: {name}",
  "wordPage.originUnknown": "From word families",
  "wordPage.originTitle": "Open in word families",
  // ── M6 entry files and the Files settings section ──
  "command.openFamilies": "Open word families",
  "command.openVerbs": "Open verb usage",
  "command.openTrivia": "Open trivia",
  "settings.section.files": "Files",
  "settings.files.desc": "Where the plugin's notes go. Changing a folder doesn't move files that already exist: entry files and word pages are found by their frontmatter, wherever you move them. Only new files use the new folder.",
  "settings.files.folder.name": "Entry files folder",
  "settings.files.folder.desc": "Holds the four entry files (flashcards, word families, verb usage, trivia) and the two folders below. Default: vocab-list",
  "settings.files.wordsFolder.name": "Word pages folder",
  "settings.files.wordsFolder.desc": "Inside the entry files folder. One page per word: <word>.md. Default: \u55AE\u5B57",
  "settings.files.threadsFolder.name": "Discussions folder",
  "settings.files.threadsFolder.desc": "Inside the entry files folder. Each article's paragraph discussions: <article>.ai.md. Default: \u8A0E\u8AD6\u4E32",
  // ── M5 paragraph discussions ──
  "paragraph.list.title": "Paragraph discussions ({n})",
  "paragraph.list.hint": "In reading view, hover a paragraph and click the \u2726 on its right to ask about it.",
  "paragraph.list.count": "{n} questions",
  "paragraph.list.orphan": "Paragraph not found",
  "paragraph.list.edited": "Text changed",
  "paragraph.list.orphanTitle": "Orphaned paragraph discussions ({n})",
  "paragraph.list.missingNote": "Note deleted or moved: {path}",
  "paragraph.action.rebind": "Rebind",
  "paragraph.action.delete": "Delete",
  "paragraph.action.confirmDelete": "Delete for good?",
  "paragraph.pane.back": "Back",
  "paragraph.pane.title": "Paragraph \xB7 \xB6{n}",
  "paragraph.pane.titleNoNumber": "Paragraph discussion",
  "paragraph.pane.jump": "Jump to the paragraph",
  "paragraph.pane.delete": "Delete this discussion",
  "paragraph.pane.placeholder": "Ask about this paragraph\u2026",
  "paragraph.pane.edited": "The text has changed since this discussion started.",
  "paragraph.pane.orphanParagraph": "This paragraph can't be found any more (deleted, or edited while in hash mode). Rebind the discussion to another paragraph, or delete it.",
  "paragraph.pane.orphanFile": "The note this discussion belongs to is gone (deleted or moved). Rebind the discussion to another paragraph, or delete it.",
  "paragraph.pane.hashAnchor": "Found by matching its text (hash mode): editing the paragraph will lose it.",
  "paragraph.notice.blockId": "The first question about a paragraph adds a small marker at its end (e.g. ^vt-k3x9q2), so the discussion still finds the paragraph after it moves. If you'd rather not have your notes changed, use hash mode: paragraphs are matched by their text and nothing is written, but editing a paragraph loses its discussion.",
  "paragraph.notice.ok": "Got it",
  "paragraph.notice.useHash": "Use hash mode (don't change notes)",
  "paragraph.notice.hashOn": "Hash mode is on \u2014 your notes won't be changed.",
  "paragraph.rebind.banner": "Click the \u2726 next to a paragraph in reading view to attach this discussion to it.",
  "paragraph.rebind.cancel": "Cancel",
  "paragraph.rebind.done": "Discussion moved to the new paragraph",
  "paragraph.rebind.failed": "Couldn't attach to that paragraph: {error}",
  "paragraph.deleted": "Paragraph discussion deleted",
  "paragraph.badge.open": "Discuss this paragraph",
  "paragraph.badge.count": "{n} questions about this paragraph",
  "paragraph.error.notAnchorable": "Headings, code, tables and callouts can't be discussed yet.",
  "word.discussions": "{n} questions",
  "paragraph.pane.openAiNote": "Open {path}",
  "word.openPage": "Word page",
  "word.openPageTitle": "Open this word's page",
  "settings.section.paragraphs": "Paragraph discussions",
  "settings.paragraphs.hashMode.name": "Don't modify my notes (hash mode)",
  "settings.paragraphs.hashMode.desc": "Paragraphs are found by their text instead of a ^vt-xxxxxx marker; editing a paragraph orphans its discussion.",
  // ── M7 word families, verb usage, trivia ──
  "learn.loading": "Loading\u2026",
  "learn.stop": "Stop",
  "learn.retry": "Retry",
  "learn.ai.offline": "You're offline. Saved content still shows; AI needs a connection.",
  "learn.ai.disabled.title": "AI is turned off",
  "learn.ai.noKey.title": "Set up AI to use this",
  "learn.ai.body": "Set up AI in Settings \u203A Vocab Tracker. Saved content still shows.",
  "learn.notFound": `"{word}" isn't in your vocab list.`,
  "learn.family.empty.title": "No word families yet",
  "learn.family.empty.body": "Let AI group the words you've learned into families, then pick new words to add.",
  "learn.family.word.empty.title": `"{word}" isn't in a family yet`,
  "learn.family.generate": "Find families",
  "learn.family.regroup": "Regroup",
  "learn.family.regroup.hint": "Your list has grown by 20% or more since the last grouping. Regroup?",
  "learn.family.generating": "Grouping your words\u2026",
  "learn.family.noneFound": "No families this time. Try again later.",
  "learn.family.known": "Learned",
  "learn.family.saved": "Saved {families} families. New words sit in the tree as text \u2014 tap one (or its \uFF0B) to add it.",
  "learn.family.added": 'Added "{word}"',
  "learn.family.add": 'Add "{word}"',
  "learn.family.legend.known": "In your list \u2014 tap to open its card",
  "learn.family.legend.suggested": "Suggested by AI \u2014 tap to add",
  "learn.family.legend.seeds": "Started from {words}",
  "learn.family.more": "More",
  "learn.family.delete": "Delete this family",
  "learn.family.deleted": 'Deleted family "{name}"',
  "learn.dates.added": "Added {date}",
  "learn.dates.updated": "Updated {date}",
  "learn.dates.saved": "Saved {date}",
  "learn.openWord": "Open {word} in the sidebar",
  "learn.verb.filter": "Filter verbs\u2026",
  "learn.verb.count": "Learned verbs ({n})",
  "learn.verb.none.title": "No verbs in your list yet",
  "learn.verb.none.body": 'Words whose part of speech includes "verb" show up here.',
  "learn.verb.noMatch": "No matching verbs",
  "learn.verb.notVerb": `"{word}" isn't a verb, so there's no usage to generate.`,
  "learn.verb.generate": "Generate usage",
  "learn.verb.regenerate": "Regenerate",
  "learn.verb.generating": "Working out how {word} is used\u2026",
  "learn.verb.empty.title": "No usage for {word} yet",
  "learn.verb.empty.body": "Let AI list common patterns, examples and similar expressions. It's saved once generated.",
  "learn.verb.related": "Similar expressions",
  "learn.verb.meta.source": "From {source}",
  "learn.verb.speak": "Pronounce",
  "learn.verb.hasUsage": "Usage generated",
  "learn.verb.favorite": "Save to word page",
  "learn.verb.favorited": "Saved",
  "learn.verb.unfavorite": "Unsave (the word page keeps the usage)",
  "learn.verb.savedTo": "Saved to {path}",
  "learn.verb.rowFavorited": "Saved to its word page",
  "learn.trivia.title": "Word trivia",
  "learn.trivia.random": "Random from your {n} words",
  "learn.trivia.subject": "About: {word}",
  "learn.trivia.pick": "Pick a word to talk about",
  "learn.trivia.pick.placeholder": "Which word?",
  "learn.trivia.placeholder": "Ask a follow-up\u2026",
  "learn.trivia.footer": "50\u2013200 characters each. What's been told is remembered, so it won't repeat.",
  "learn.trivia.empty.title": "Your vocab list is empty",
  "learn.trivia.empty.body": "Add a few words, then come back for trivia about them.",
  "learn.trivia.noWords": "No words to talk about.",
  "learn.trivia.turn.next": "Trivia",
  "learn.trivia.favorites": "Saved trivia",
  "learn.trivia.favorites.empty": 'Nothing saved yet. Tap "Save" under an answer to keep it here.',
  "learn.trivia.favorite": "Save",
  "learn.trivia.favoriteTo": "Save to {word}",
  "learn.trivia.favorited": "Saved",
  "learn.trivia.savedTo": "Saved to {path}",
  "learn.trivia.unfavorite": "Remove",
  "learn.trivia.up": "Helpful",
  "learn.trivia.down": "Not helpful",
  "learn.trivia.mentions": "Also mentions {words}",
  "mobile.sheet.close": "Close",
  "mobile.sheet.label.word": "Word card: {word}",
  "mobile.sheet.label.paragraph": "Paragraph discussion",
  "mobile.sheet.notTracked": "Not in your vocab list yet.",
  "mobile.save.added": "Added \u201C{word}\u201D",
  "mobile.save.undo": "Undo",
  "mobile.save.undone": "Removed \u201C{word}\u201D",
  "mobile.menu.add": "Add \u201C{word}\u201D to Vocab Tracker",
  "mobile.menu.open": "Open \u201C{word}\u201D in Vocab Tracker",
  "mobile.menu.added": "Added \u201C{word}\u201D to vocab list",
  "mobile.mark.label": "Track \u201C{word}\u201D in Vocab Tracker",
  "mobile.livePreview.text": "Tapping a word to save it only works in reading view.",
  "mobile.livePreview.switch": "Switch to reading view",
  "mobile.livePreview.never": "Don\u2019t show again",
  "mobile.rebind.pick": "Tap the \u2726 next to a paragraph to move this discussion there.",
  "settings.section.reading": "Tapping words",
  "settings.reading.tapAction.name": "Tap a word (desktop)",
  "settings.reading.tapAction.desc": "What clicking an English word in reading view does on desktop.",
  "settings.reading.tapActionMobile.name": "Tap a word (iPhone / iPad)",
  "settings.reading.tapActionMobile.desc": "What tapping an English word in reading view does on mobile. On iPhone, cards open in a sheet at the bottom instead of the sidebar.",
  "settings.reading.tap.menu": "Show a menu",
  "settings.reading.tap.save": "Save it right away",
  "settings.reading.tap.open": "Open its card (don\u2019t save)",
  "settings.reading.pronounceSource.name": "Pronunciation",
  "settings.reading.pronounceSource.desc": "Which voice \u{1F50A} uses. Dictionary recordings are downloaded; when that\u2019s slow, \u201CAutomatic\u201D switches to the system voice after 1.5 s.",
  "settings.reading.pronounceSource.auto": "Automatic (recording, system voice if slow)",
  "settings.reading.pronounceSource.recording": "Prefer recording (wait for it)",
  "settings.reading.pronounceSource.synth": "System voice only",
  "settings.reading.livePreviewHint.name": "Live Preview hint",
  "settings.reading.livePreviewHint.desc": "On mobile, tell me once per session when I tap a word in Live Preview, where tapping can\u2019t save words.",
  // ── 備份與還原 (services/backup) ──
  "settings.section.backup": "Backup & restore",
  "settings.backup.desc": "Backups are saved in {folder}. Restoring one brings your words, discussions, word families, saved trivia and review history back to how they were then. Settings (AI, flashcards, exam lists\u2026) are not changed.",
  "settings.backup.create.name": "Back up now",
  "settings.backup.create.desc": "Saves your word list and every discussion and learning record into one file.",
  "settings.backup.create.button": "Back up",
  "settings.backup.created": "Backed up to {path}",
  "settings.backup.failed": "Backup failed: {error}",
  "settings.backup.list.name": "Backups",
  "settings.backup.list.loading": "Reading backups\u2026",
  "settings.backup.list.empty": "No backups yet.",
  "settings.backup.list.reload": "Refresh",
  "settings.backup.reason.manual": "Manual backup",
  "settings.backup.reason.before-restore": "Saved automatically before a restore",
  "settings.backup.reason.migration": "Saved before the upgrade (old format, words only)",
  "settings.backup.reason.unknown": "Copy of data.json (words only)",
  "settings.backup.unreadable": "Can\u2019t be read, so it can\u2019t be restored.",
  "settings.backup.noTime": "Unknown time",
  "settings.backup.summary.words": "{n} words",
  "settings.backup.summary.threads": "{n} discussions ({q} questions)",
  "settings.backup.summary.families": "{n} word families",
  "settings.backup.summary.trivia": "{n} saved trivia",
  "settings.backup.summary.reviews": "{n} review records",
  "settings.backup.restore.button": "Restore\u2026",
  "settings.backup.lastRestore": "Restored. Your data from before the restore is saved in {path} \u2014 restore that one from the list to undo.",
  "backup.restore.title": "Restore from this backup?",
  "backup.restore.loading": "Comparing with your current data\u2026",
  "backup.restore.from": "Backup: {time} \xB7 {summary}",
  "backup.restore.what": "What will happen",
  "backup.restore.words": "Words: {changed} go back to how they were in the backup (definitions, levels and flashcard progress too); {revived} deleted words come back.",
  "backup.restore.threads": "Discussions: {n} go back to how they were in the backup; {q} deleted questions come back.",
  "backup.restore.learn": "Word families and saved trivia: {families} families and {trivia} saved trivia go back to how they were in the backup.",
  "backup.restore.reviews": "Review history: {n} records are added back (records are only ever added, never removed).",
  "backup.restore.same": "Your current data already matches this backup; nothing will change.",
  "backup.restore.missing": "This backup has no {parts}; those stay as they are now.",
  "backup.restore.part.threads": "discussions",
  "backup.restore.part.learn": "word families or saved trivia",
  "backup.restore.part.reviews": "review history",
  "backup.restore.settings": "Settings (AI, flashcards, exam lists\u2026) and AI usage stats are not changed.",
  "backup.restore.extras.title": "Added after the backup",
  "backup.restore.extras.desc": "You now have {words} words, {questions} discussion questions and {learn} families / saved trivia that aren\u2019t in this backup. They are kept unless you turn on the switch below.",
  "backup.restore.extras.remove": "Delete these too (other devices delete them after syncing)",
  "backup.restore.extras.undoHint": "Undoing a restore with its \u201CSaved automatically before a restore\u201D backup? Turn this on to get back exactly to how things were.",
  "backup.restore.safety": "Before restoring, everything you have now (data.json and the whole store/ folder) is saved to {folder} as full-<time>-before-restore.json. If the restore was a mistake, restore that file.",
  "backup.restore.devices.title": "Your other devices",
  "backup.restore.devices.sync": "After syncing, your other devices show the restored data too: the restore counts as a change made now, so it replaces the older copies there.",
  "backup.restore.devices.unsynced": "Changes made on another device that haven\u2019t synced yet: words this restore changes follow the restore; other words, and words that device added, keep that device\u2019s version.",
  "backup.restore.devices.after": "Anything you change on any device after the restore syncs as usual \u2014 the restore won\u2019t undo it.",
  "backup.restore.devices.tip": "Best: let every device finish syncing before you restore, then open Obsidian on the others and let them sync once.",
  "backup.restore.cancel": "Cancel",
  "backup.restore.confirm": "Restore",
  "backup.restore.working": "Restoring\u2026",
  "backup.restore.done": "Restored from the backup. Your data from before is saved in {path}",
  "backup.restore.failed": "Restore failed: {error}",
  "backup.restore.safetyFailed": "Couldn\u2019t back up your current data first, so nothing was restored or changed: {error}"
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
  // 1005 回饋 S：可收合分區、AI 討論、依來源分組
  "sidebar.section.words": "\u55AE\u5B57",
  // Wave 6 W：段落討論獨立成自己的分區，標題沿用原本列表自己的
  // paragraph.list.title。
  "sidebar.paragraphs.noNote": "\u958B\u555F\u4E00\u7BC7\u7B46\u8A18\u4EE5\u67E5\u770B\u6BB5\u843D\u8A0E\u8AD6\u3002",
  "sidebar.section.ai": "AI \u8A0E\u8AD6\uFF08{n}\uFF09",
  "sidebar.ai.empty": "\u9084\u6C92\u6709\u8A0E\u8AD6\u3002\u5C55\u958B\u55AE\u5B57\u5207\u5230 AI \u5206\u9801\uFF0C\u6216\u5728\u95B1\u8B80\u6A21\u5F0F\u9EDE\u6BB5\u843D\u65C1\u7684 \u2726 \u5C31\u80FD\u63D0\u554F\u3002",
  "sidebar.ai.showAll": "\u986F\u793A\u5168\u90E8\uFF08{n}\uFF09",
  "sidebar.ai.showLess": "\u53EA\u986F\u793A\u6700\u8FD1\u7684",
  // Wave 6 W：文法分區（目前只有動詞用法；句型結構之後再加）。
  "sidebar.section.grammar": "\u6587\u6CD5\uFF08{n}\uFF09",
  "sidebar.grammar.verbs": "\u52D5\u8A5E\u7528\u6CD5",
  "sidebar.grammar.empty": "\u9084\u6C92\u6709\u52D5\u8A5E\u7528\u6CD5\u3002\u5728\u52D5\u8A5E\u7684\u55AE\u5B57\u5361\u7522\u751F\u4E00\u500B\u770B\u770B\u3002",
  "sidebar.grammar.viewAll": "\u67E5\u770B\u5168\u90E8",
  "sidebar.group.family": "\u5B57\u65CF\u6A39\uFF1A{name}",
  "sidebar.group.familyGone": "\u5B57\u65CF\u6A39\uFF08\u5B57\u65CF\u5DF2\u79FB\u9664\uFF09",
  "sidebar.group.familyOpen": "\u958B\u555F\u5B57\u65CF\u6A39",
  "sidebar.group.wordlist": "\u8003\u8A66\u5B57\u8868",
  "sidebar.group.none": "\uFF08\u6C92\u6709\u4F86\u6E90\u7B46\u8A18\uFF09",
  "row.delete": "\u522A\u9664",
  "row.expand": "\u5C55\u958B",
  "row.collapse": "\u6536\u5408",
  "row.pronounce": "\u767C\u97F3",
  "pronounce.noVoice": "\u9019\u53F0\u88DD\u7F6E\u6C92\u6709\u53EF\u7528\u7684\u767C\u97F3\u3002",
  "pronounce.loading": "\u8B80\u53D6\u767C\u97F3\u4E2D\u2026",
  "row.jumpToSource": "\u8DF3\u5230\u9019\u500B\u5B57\u51FA\u73FE\u7684\u5730\u65B9",
  "row.showMore": "\u986F\u793A\u66F4\u591A",
  "row.showLess": "\u986F\u793A\u8F03\u5C11",
  "row.fetch": "\u6293\u53D6\u5B57\u5178\u8CC7\u6599\uFF08\u5B9A\u7FA9\u3001\u540C\u7FA9\u8A5E\u3001\u97F3\u6A19\uFF09",
  "row.markReviewed": "\u6A19\u8A18\u70BA\u5DF2\u8907\u7FD2\uFF08\u8A55\u70BA\u300C\u8A18\u5F97\u300D\uFF09",
  "row.meta.added": "\u52A0\u5165\u6642\u9593\uFF1A{date}",
  "row.meta.reviewed": "\u8907\u7FD2\u6642\u9593\uFF1A{date}\uFF08{count} \u6B21\uFF09",
  "row.meta.updated": "\u66F4\u65B0\u6642\u9593\uFF1A{date}",
  "row.meta.dates": "\u52A0\u5165 {added} \xB7 \u66F4\u65B0 {updated}",
  "row.meta.addedOnly": "\u52A0\u5165 {added}",
  "row.field.synonyms": "\u540C\u7FA9\u8A5E",
  "row.field.definition": "\u5B9A\u7FA9",
  "row.field.definitionZh": "\u4E2D\u6587\u7FFB\u8BD1",
  "row.field.antonyms": "\u53CD\u7FA9\u8A5E",
  "row.field.example": "\u4F8B\u53E5\uFF08\u4F86\u81EA\u7B46\u8A18\uFF09",
  "row.field.grammar": "\u6587\u6CD5\u63D0\u793A",
  "row.field.level": "\u7A0B\u5EA6",
  "row.field.placeholder": "\u65B0\u589E{label}\u2026",
  // 刪除單字前的確認視窗：列出關聯內容，確認後才刪 (W6)
  "deleteEntry.title": "\u522A\u9664\u300C{word}\u300D\uFF1F",
  "deleteEntry.noLinks": "\u9019\u500B\u5B57\u6C92\u6709\u95DC\u806F\u7684\u5B57\u65CF\u3001\u51B7\u77E5\u8B58\u6216\u8A0E\u8AD6\u3002",
  "deleteEntry.impact.families": "\u5728 {n} \u500B\u5B57\u65CF\u88E1\uFF08\u6587\u5B57\u6703\u4FDD\u7559\uFF0C\u4E4B\u5F8C\u53EF\u518D\u52A0\u56DE\uFF09",
  "deleteEntry.impact.trivia": "\u88AB {n} \u5247\u51B7\u77E5\u8B58\u63D0\u53CA",
  "deleteEntry.impact.verbFavorite": "\u5DF2\u6536\u85CF\u52D5\u8A5E\u7528\u6CD5",
  "deleteEntry.impact.wordPage": "\u6709\u55AE\u5B57\u9801",
  "deleteEntry.impact.threads": "\u55AE\u5B57\u9801\u6709 {n} \u5247\u8A0E\u8AD6",
  "deleteEntry.trashWordPage": "\u540C\u6642\u522A\u9664\u55AE\u5B57\u9801\uFF08\u79FB\u5230\u5783\u573E\u6876\uFF09",
  "deleteEntry.cancel": "\u53D6\u6D88",
  "deleteEntry.confirm": "\u522A\u9664",
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
  "flashcards.batch.toggle": "\u672C\u6279\u55AE\u5B57\uFF08{n}\uFF09",
  "flashcards.batch.current": "\u76EE\u524D",
  "flashcards.batch.pending": "\u9084\u6C92\u5230",
  "flashcards.batch.new": "\u65B0\u5B57",
  "flashcards.batch.due": "\u5230\u671F",
  "flashcards.batch.hidden": "\u4F5C\u7B54\u5F8C\u986F\u793A",
  "flashcards.batch.openSource": "\u958B\u555F\u51FA\u8655",
  "flashcards.single.source": "\u53EA\u8907\u7FD2\u9019\u500B\u5B57",
  "flashcards.single.new": "\u65B0\u5B57\uFF1A\u9019\u6B21\u8A55\u5206\u6703\u958B\u59CB\u6392\u7A0B\uFF0C\u4E5F\u6703\u7528\u6389\u4ECA\u5929\u7684\u4E00\u500B\u65B0\u5B57\u984D\u5EA6\u3002",
  "flashcards.single.due": "\u5DF2\u5230\u671F\uFF0C\u7167\u5E38\u8907\u7FD2\u3002",
  "flashcards.single.early": "\u9084\u6C92\u5230\u671F\uFF08\u539F\u5B9A {date}\uFF09\u3002\u63D0\u65E9\u8907\u7FD2\u4E00\u6A23\u6703\u8A18\u9304\uFF1AFSRS \u4F9D\u96E2\u4E0A\u6B21\u8907\u7FD2\u7684\u5BE6\u969B\u9593\u9694\u8A08\u7B97\uFF0C\u73FE\u5728\u8A18\u5F97\u7684\u8A71\uFF0C\u9593\u9694\u6703\u6BD4\u5230\u671F\u90A3\u5929\u518D\u8907\u7FD2\u62C9\u9577\u5F97\u5C11\uFF1B\u6309\u300C\u5FD8\u4E86\u300D\u4E00\u6A23\u7B97\u907A\u5FD8\u3001\u91CD\u65B0\u5B78\u7FD2\u3002",
  "flashcards.single.noCloze": "\u9019\u500B\u5B57\u6C92\u6709\u542B\u6709\u5B83\u7684\u4F8B\u53E5\uFF0C\u4E0D\u80FD\u7528\u4F8B\u53E5\u586B\u7A7A\uFF0C\u63DB\u500B\u6A21\u5F0F\u5427\u3002",
  "flashcards.single.done": "\u5DF2\u8A18\u9304\u300C{rating}\u300D",
  "flashcards.single.next": "\u4E0B\u6B21\u8907\u7FD2\uFF1A{date}\uFF08{interval}\u5F8C\uFF09",
  "flashcards.single.nextSoon": "\u4E0B\u6B21\u8907\u7FD2\uFF1A{interval}\u5F8C",
  "flashcards.single.again": "\u518D\u8907\u7FD2\u4E00\u6B21",
  "flashcards.single.close": "\u5B8C\u6210",
  "command.openFlashcards": "\u958B\u555F\u55AE\u5B57\u5361",
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
  "ai.task.family.generate": "\u627E\u5B57\u65CF",
  "ai.task.verb.usage": "\u7522\u751F\u7528\u6CD5",
  "ai.task.trivia.next": "\u518D\u4F86\u4E00\u5247",
  "ai.task.trivia.quiz": "\u8003\u6211\u4E00\u984C",
  "ai.task.trivia.etymology": "\u5B57\u6E90",
  "ai.task.trivia.joke": "\u7B11\u8A71",
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
  // ── M4：單字討論 ──────────────────────────────────────────────────
  "word.tab.data": "\u8CC7\u6599",
  "word.tab.ai": "AI",
  "chat.placeholder.word": "\u554F {word}\u2026",
  "chat.send": "\u9001\u51FA",
  "chat.stop": "\u505C\u6B62",
  "chat.selection": "\u9078\u53D6\uFF1A\u300C{text}\u300D",
  "chat.selection.remove": "\u4E0D\u8981\u9644\u4E0A\u9078\u53D6\u7684\u6587\u5B57",
  "chat.selection.hint": "\u4E0B\u4E00\u500B\u554F\u984C\u6703\u9644\u4E0A\u9019\u6BB5\u6587\u5B57\uFF0C\u8B93 AI \u77E5\u9053\u4F60\u554F\u7684\u662F\u54EA\u4E00\u53E5\u3002",
  "chat.empty": "\u9084\u6C92\u6709\u8A0E\u8AD6\u3002\u9EDE\u4E0A\u9762\u7684\u6309\u9215\uFF0C\u6216\u76F4\u63A5\u8F38\u5165\u554F\u984C\u3002",
  "chat.meta.origin": "\u51FA\u81EA \xB6{n}",
  "chat.action.pin": "\u91D8\u9078\u5230\u6587\u6CD5\u63D0\u793A",
  "chat.action.unpin": "\u53D6\u6D88\u91D8\u9078",
  "chat.action.copy": "\u8907\u88FD",
  "chat.copied": "\u5DF2\u8907\u88FD",
  "chat.truncated": "\u56DE\u7B54\u9054\u5230\u9577\u5EA6\u4E0A\u9650\uFF0C\u5F8C\u9762\u88AB\u622A\u6389\u4E86\u3002",
  "chat.retryWait": "\u670D\u52D9\u5FD9\u788C\uFF0C{seconds} \u79D2\u5F8C\u91CD\u8A66\u2026",
  "ai.gate.noKey.title": "\u8A2D\u5B9A AI \u5F8C\u624D\u80FD\u8A0E\u8AD6",
  "ai.gate.noKey.body": "\u5728\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u586B\u5165 API key\uFF0C\u53EF\u4EE5\u7528 Claude\uFF0C\u4E5F\u53EF\u4EE5\u7528 OpenAI \u76F8\u5BB9\u7684\u670D\u52D9\uFF08OpenAI\u3001Gemini\u3001\u672C\u6A5F Ollama\uFF09\u3002",
  "ai.gate.disabled.title": "AI \u76EE\u524D\u95DC\u9589",
  "ai.gate.disabled.body": "\u5728\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u6253\u958B\u300C\u555F\u7528 AI\u300D\uFF0C\u5C31\u80FD\u8A0E\u8AD6\u55AE\u5B57\u548C\u6BB5\u843D\u3002",
  "ai.gate.offline": "\u76EE\u524D\u96E2\u7DDA\u3002\u4E4B\u524D\u7684\u8A0E\u8AD6\u53EF\u4EE5\u770B\uFF0C\u9023\u7DDA\u5F8C\u624D\u80FD\u7E7C\u7E8C\u554F\u3002",
  "ai.debug.summary": "\u9664\u932F\u8CC7\u8A0A\uFF1A\u9001\u7D66 AI \u7684\u5167\u5BB9\u8207 AI \u7684\u539F\u59CB\u56DE\u7B54",
  "ai.debug.prompt": "\u9001\u7D66 AI \u7684 prompt",
  "ai.debug.output": "AI \u7684\u539F\u59CB\u8F38\u51FA",
  "ai.debug.empty": "\uFF08\u6C92\u6709\u5167\u5BB9\uFF09",
  "ai.debug.copy": "\u8907\u88FD",
  "ai.debug.copied": "\u5DF2\u8907\u88FD\u9664\u932F\u8CC7\u8A0A",
  "ai.debug.copyFailed": "\u7121\u6CD5\u8907\u88FD\uFF0C\u8ACB\u76F4\u63A5\u9078\u53D6\u6587\u5B57",
  "ai.debug.hint": "\u56DE\u5831\u554F\u984C\u6642\u53EF\u4EE5\u9644\u4E0A\u9019\u6BB5\uFF08\u4E0D\u542B API key\uFF09\u3002",
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
  "settings.ai.test.details": "\u8ACB\u6C42\u8207\u56DE\u61C9\uFF08{n} \u6B21\uFF09",
  "settings.ai.test.copy": "\u8907\u88FD",
  "settings.ai.test.copied": "\u5DF2\u8907\u88FD",
  "settings.ai.test.response": "\u2500\u2500 \u56DE\u61C9\uFF08{mode}\uFF0C{ms} ms\uFF09\u2500\u2500",
  "settings.ai.test.noResponse": "\u2500\u2500 \u6C92\u6709\u6536\u5230\u56DE\u61C9\uFF08{ms} ms\uFF09\u2500\u2500",
  "settings.ai.test.emptyBody": "\uFF08\u6C92\u6709\u5167\u5BB9\uFF09",
  "settings.ai.test.truncated": "\u2026\uFF08\u53EA\u4FDD\u7559\u524D {n} \u5B57\u5143\uFF09",
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
  "settings.learner.preview.name": "AI \u6703\u770B\u5230",
  // ── M2 settings section ──
  "settings.section.srs": "\u55AE\u5B57\u5361",
  "settings.srs.retention.name": "\u76EE\u6A19\u8A18\u61B6\u7387",
  "settings.srs.retention.desc": "\u5361\u7247\u5230\u671F\u6642\u4ECD\u8A18\u5F97\u7684\u6A5F\u7387\u3002\u8D8A\u9AD8\u8907\u7FD2\u8D8A\u983B\u7E41\uFF0C\u9810\u8A2D 0.9\u3002",
  "settings.srs.dailyNew.name": "\u6BCF\u65E5\u65B0\u5361\u4E0A\u9650",
  "settings.srs.dailyNew.desc": "\u6BCF\u5929\u6700\u591A\u5F15\u5165\u5E7E\u500B\u5F9E\u672A\u8907\u7FD2\u904E\u7684\u5B57\uFF0C\u9810\u8A2D 20\u3002",
  "settings.section.wordlists": "\u8003\u8A66\u5B57\u8868",
  "settings.wordlists.desc": "\u628A\u5B57\u8868\uFF08\u6258\u798F\u3001\u96C5\u601D\u3001\u591A\u76CA\u2026\uFF09\u653E\u9032 vault \u7684\u4E00\u500B\u8CC7\u6599\u593E\uFF0C\u4E00\u500B\u6A94\u6848\u4E00\u4EFD\u5B57\u8868\uFF0C\u6A94\u540D\u5C31\u662F\u6A19\u7C64\uFF1Aexam-TOEFL.md \u2192 TOEFL\u3002\u4E00\u884C\u4E00\u500B\u5B57\uFF0C\u5B57\u5F8C\u9762\u7684\u8A5E\u6027\u3001\u4E2D\u6587\u89E3\u91CB\u6703\u88AB\u7565\u904E\uFF1B.md\u3001.txt\u3001.csv \u90FD\u53EF\u4EE5\u3002\u5B57\u8868\u88E1\u7684\u5B57\u6703\u5728\u95B1\u8B80\u6A21\u5F0F\u52A0\u4E0A\u5E95\u7DDA\u3002",
  "settings.wordlists.folder.name": "\u5B57\u8868\u8CC7\u6599\u593E",
  "settings.wordlists.folder.desc": "\u653E\u5B57\u8868\u7684 vault \u8CC7\u6599\u593E\u3002_ \u958B\u982D\u7684\u6A94\u6848\u8207 README \u6703\u7565\u904E\u3002",
  "settings.wordlists.highlight.name": "\u6A19\u793A\u5B57\u8868\u55AE\u5B57",
  "settings.wordlists.highlight.desc": "\u5728\u95B1\u8B80\u6A21\u5F0F\u52A0\u4E0A\u5F69\u8272\u865B\u7DDA\u5E95\u7DDA\uFF0C\u6ED1\u904E\u53EF\u770B\u5C6C\u65BC\u54EA\u4E9B\u5B57\u8868\u3002\u4E0D\u6703\u4FEE\u6539\u7B46\u8A18\u5167\u5BB9\u3002",
  "settings.wordlists.inflections.name": "\u6BD4\u5C0D\u8A5E\u5F62\u8B8A\u5316",
  "settings.wordlists.inflections.desc": "analyzed / analyzing / analyzes \u4E5F\u7B97 analyze\u3002\u95DC\u6389\u5247\u53EA\u6BD4\u5C0D\u5B8C\u5168\u76F8\u540C\u7684\u5B57\u3002",
  "settings.wordlists.loaded.name": "\u5DF2\u8F09\u5165\u7684\u5B57\u8868",
  "settings.wordlists.loaded.none": "{folder}/ \u88E1\u9084\u6C92\u6709\u5B57\u8868\u3002",
  "settings.wordlists.loaded.some": "\u5171 {n} \u4EFD\u3002\u4FEE\u6539\u5B57\u8868\u6A94\u6848\u6703\u81EA\u52D5\u91CD\u65B0\u8F09\u5165\u3002",
  "settings.wordlists.reload": "\u91CD\u65B0\u8F09\u5165",
  "settings.wordlists.list.desc": "{n} \u5B57 \xB7 {paths}",
  "exam.strip.scanning": "\u6B63\u5728\u6383\u63CF\u8003\u8A66\u5B57\u5F59\u2026",
  "exam.strip.title": "\u672C\u7BC7\u8003\u8A66\u5B57\u5F59 \xB7 \u5168\u6587 {total} \u500B\u4E0D\u540C\u7684\u5B57",
  "exam.strip.hide": "\u96B1\u85CF {tag} \u5E95\u7DDA",
  "exam.strip.show": "\u986F\u793A {tag} \u5E95\u7DDA",
  "command.toggleExamHighlight": "\u5207\u63DB\u8003\u8A66\u5B57\u5F59\u5E95\u7DDA",
  "command.reloadWordlists": "\u91CD\u65B0\u8F09\u5165\u8003\u8A66\u5B57\u8868",
  "exam.import.done": "Vocab Tracker\uFF1A\u5F9E\u300C{note}\u300D\u52A0\u5165 {added} \u500B\u8003\u8A66\u55AE\u5B57\uFF08\u53E6\u6709 {tagged} \u500B\u65E2\u6709\u55AE\u5B57\u88DC\u4E0A\u8003\u8A66\u6A19\u7C64\uFF09",
  "command.importExamWords": "\u628A\u672C\u7BC7\u7684\u8003\u8A66\u5B57\u5F59\u52A0\u5165\u55AE\u5B57\u5EAB",
  "settings.wordlists.autoImport.name": "\u81EA\u52D5\u52A0\u5165\u8003\u8A66\u5B57\u5F59",
  "settings.wordlists.autoImport.desc": "\u7B2C\u4E00\u6B21\u6253\u958B\u7B46\u8A18\u6642\uFF0C\u628A\u88E1\u9762\u5C6C\u65BC\u5B57\u8868\u7684\u5B57\u5168\u90E8\u52A0\u5165\u55AE\u5B57\u5EAB\uFF0C\u4E26\u5728\u300C\u7B49\u7D1A\u300D\u6B04\u6A19\u4E0A\u8003\u8A66\uFF08TOEFL\u3001IELTS\u2026\uFF09\u3002\u6BCF\u7BC7\u53EA\u532F\u5165\u4E00\u6B21\uFF0C\u4F60\u522A\u6389\u7684\u5B57\u4E0D\u6703\u518D\u88AB\u52A0\u56DE\u4F86\u3002\u5B57\u5178\u8CC7\u6599\u6703\u5728\u80CC\u666F\u6162\u6162\u6293\u3002",
  "export.families": "\u5B57\u65CF",
  "export.familiesEmpty": "\u9084\u6C92\u6709\u5B57\u65CF\u3002",
  "export.usage": "\u7528\u6CD5",
  "export.usageEmpty": "\u9084\u6C92\u6709\u7528\u6CD5\u3002",
  "export.usageRelated": "\u76F8\u95DC\u7247\u8A9E",
  "export.trivia": "\u51B7\u77E5\u8B58\u6536\u85CF",
  "export.triviaEmpty": "\u9084\u6C92\u6709\u6536\u85CF\u3002",
  "export.triviaMentionedIn": "\u4E5F\u63D0\u5230\u9019\u500B\u5B57",
  "export.discussion": "AI \u8A0E\u8AD6",
  "export.discussionEmpty": "\u9084\u6C92\u6709\u8A0E\u8AD6\u3002",
  "export.userNotesHint": "\u4EE5\u4E0B\u662F\u4F60\u7684\u7B46\u8A18\uFF0C\u63D2\u4EF6\u4E0D\u6703\u6539\u52D5",
  "export.paragraphsEmpty": "\u9084\u6C92\u6709\u6BB5\u843D\u8A0E\u8AD6\u3002",
  "export.paragraphOrphaned": "\u539F\u6587\u4E2D\u627E\u4E0D\u5230\u9019\u6BB5",
  "export.wordsLearned": "\u9019\u7BC7\u5B78\u5230\u7684\u55AE\u5B57",
  "export.wordsEmpty": "\u9019\u7BC7\u9084\u6C92\u6709\u52A0\u5165\u55AE\u5B57\u3002",
  "export.wordQuestions": "{n} \u5247\u8A0E\u8AD6",
  "export.favorites": "\u6536\u85CF",
  "export.favoritesEmpty": "\u9084\u6C92\u6709\u6536\u85CF\u3002",
  "export.aborted": "\uFF08\u5DF2\u505C\u6B62\uFF09",
  "export.usageSaved": "\u5DF2\u6536\u85CF {date}",
  "export.usageGenerated": "AI \u7522\u751F\u65BC {date}",
  // ── M6 單字頁（vocab-word 區塊、區段標題按鈕）──
  "wordPage.missing": "\u55AE\u5B57\u5EAB\u88E1\u627E\u4E0D\u5230\u9019\u500B\u5B57\uFF08\u53EF\u80FD\u5DF2\u7D93\u522A\u9664\uFF09\u3002",
  "wordPage.speak": "\u767C\u97F3",
  "wordPage.source": "\u51FA\u81EA {source}",
  "wordPage.sourceTitle": "\u958B\u555F\u51FA\u8655",
  "wordPage.dueNew": "\u9084\u6C92\u958B\u59CB\u8907\u7FD2",
  "wordPage.dueToday": "\u4ECA\u5929\u5230\u671F",
  "wordPage.dueOn": "\u4E0B\u6B21\u8907\u7FD2 {date}",
  "wordPage.reviewed": "\u5DF2\u8907\u7FD2 {n} \u6B21",
  "wordPage.review": "\u8907\u7FD2\u9019\u500B\u5B57",
  "wordPage.findFamilies": "\u627E\u5B57\u65CF",
  "wordPage.generateUsage": "\u7522\u751F",
  "wordPage.regenerateUsage": "\u91CD\u65B0\u7522\u751F",
  "wordPage.trivia": "\u4F86\u4E00\u5247",
  "wordPage.openSidebar": "\u5728\u5074\u6B04\u958B\u555F",
  "wordPage.familiesNone": "\u6C92\u6709\u627E\u5230\u65B0\u7684\u5B57\u65CF\u3002",
  "wordPage.familiesSaved": "\u5DF2\u52A0\u5165 {n} \u500B\u5B57\u65CF\u3002",
  "wordPage.usageSaved": "\u7528\u6CD5\u5DF2\u66F4\u65B0\u3002",
  "wordPage.failed": "\u5931\u6557\uFF1A{error}",
  "wordPage.origin": "\u4F86\u6E90\uFF1A\u5B57\u65CF\u6A39 {name}",
  "wordPage.originUnknown": "\u4F86\u6E90\uFF1A\u5B57\u65CF\u6A39",
  "wordPage.originTitle": "\u5728\u5B57\u65CF\u6A39\u6253\u958B",
  // ── M6 入口檔與「檔案」設定 ──
  "command.openFamilies": "\u958B\u555F\u5B57\u65CF\u6A39",
  "command.openVerbs": "\u958B\u555F\u52D5\u8A5E\u7528\u6CD5",
  "command.openTrivia": "\u958B\u555F\u51B7\u77E5\u8B58",
  "settings.section.files": "\u6A94\u6848",
  "settings.files.desc": "\u5916\u639B\u5EFA\u7ACB\u7684\u7B46\u8A18\u653E\u5728\u54EA\u88E1\u3002\u6539\u8CC7\u6599\u593E\u4E0D\u6703\u642C\u52D5\u5DF2\u7D93\u5B58\u5728\u7684\u6A94\u6848\uFF1A\u5165\u53E3\u6A94\u548C\u55AE\u5B57\u9801\u9760 frontmatter \u627E\u56DE\uFF0C\u642C\u5230\u54EA\u88E1\u90FD\u53EF\u4EE5\uFF1B\u53EA\u6709\u65B0\u5EFA\u7684\u6A94\u6848\u6703\u653E\u5230\u65B0\u8CC7\u6599\u593E\u3002",
  "settings.files.folder.name": "\u5165\u53E3\u6A94\u8CC7\u6599\u593E",
  "settings.files.folder.desc": "\u55AE\u5B57\u5361\u3001\u5B57\u65CF\u6A39\u3001\u52D5\u8A5E\u7528\u6CD5\u3001\u51B7\u77E5\u8B58\u56DB\u500B\u5165\u53E3\u6A94\u653E\u9019\u88E1\uFF0C\u4E0B\u9762\u5169\u500B\u8CC7\u6599\u593E\u4E5F\u5728\u9019\u88E1\u9762\u3002\u9810\u8A2D\uFF1Avocab-list",
  "settings.files.wordsFolder.name": "\u55AE\u5B57\u9801\u8CC7\u6599\u593E",
  "settings.files.wordsFolder.desc": "\u5728\u5165\u53E3\u6A94\u8CC7\u6599\u593E\u5E95\u4E0B\u3002\u6BCF\u500B\u5B57\u4E00\u9801\uFF1A<\u5B57>.md\u3002\u9810\u8A2D\uFF1A\u55AE\u5B57",
  "settings.files.threadsFolder.name": "\u8A0E\u8AD6\u4E32\u8CC7\u6599\u593E",
  "settings.files.threadsFolder.desc": "\u5728\u5165\u53E3\u6A94\u8CC7\u6599\u593E\u5E95\u4E0B\u3002\u6BCF\u7BC7\u6587\u7AE0\u7684\u6BB5\u843D\u8A0E\u8AD6\uFF1A<\u6587\u7AE0>.ai.md\u3002\u9810\u8A2D\uFF1A\u8A0E\u8AD6\u4E32",
  // ── M5 段落討論 ──
  "paragraph.list.title": "\u6BB5\u843D\u8A0E\u8AD6\uFF08{n}\uFF09",
  "paragraph.list.hint": "\u5728\u95B1\u8B80\u6A21\u5F0F\u4E2D\uFF0C\u628A\u6E38\u6A19\u79FB\u5230\u6BB5\u843D\u53F3\u5074\u7684 \u2726 \u5C31\u80FD\u91DD\u5C0D\u90A3\u4E00\u6BB5\u63D0\u554F\u3002",
  "paragraph.list.count": "{n} \u5247",
  "paragraph.list.orphan": "\u539F\u6587\u4E2D\u627E\u4E0D\u5230\u9019\u6BB5",
  "paragraph.list.edited": "\u539F\u6587\u5DF2\u4FEE\u6539",
  "paragraph.list.orphanTitle": "\u5B64\u7ACB\u7684\u6BB5\u843D\u8A0E\u8AD6\uFF08{n}\uFF09",
  "paragraph.list.missingNote": "\u7B46\u8A18\u5DF2\u522A\u9664\u6216\u79FB\u8D70\uFF1A{path}",
  "paragraph.action.rebind": "\u91CD\u65B0\u7D81\u5B9A",
  "paragraph.action.delete": "\u522A\u9664",
  "paragraph.action.confirmDelete": "\u78BA\u5B9A\u522A\u9664\uFF1F",
  "paragraph.pane.back": "\u8FD4\u56DE",
  "paragraph.pane.title": "\u6BB5\u843D\u8A0E\u8AD6 \xB7 \xB6{n}",
  "paragraph.pane.titleNoNumber": "\u6BB5\u843D\u8A0E\u8AD6",
  "paragraph.pane.jump": "\u8DF3\u5230\u539F\u6587",
  "paragraph.pane.delete": "\u522A\u9664\u9019\u4E32\u8A0E\u8AD6",
  "paragraph.pane.placeholder": "\u8FFD\u554F\u9019\u4E00\u6BB5\u2026",
  "paragraph.pane.edited": "\u539F\u6587\u5DF2\u4FEE\u6539\uFF1A\u9019\u4E32\u8A0E\u8AD6\u662F\u91DD\u5C0D\u4FEE\u6539\u524D\u7684\u6587\u5B57\u958B\u59CB\u7684\u3002",
  "paragraph.pane.orphanParagraph": "\u539F\u6587\u4E2D\u627E\u4E0D\u5230\u9019\u6BB5\u4E86\uFF08\u6BB5\u843D\u88AB\u522A\u9664\uFF0C\u6216\u5728 hash \u6A21\u5F0F\u4E0B\u6587\u5B57\u88AB\u4FEE\u6539\uFF09\u3002\u53EF\u4EE5\u91CD\u65B0\u7D81\u5B9A\u5230\u53E6\u4E00\u6BB5\uFF0C\u6216\u522A\u9664\u9019\u4E32\u8A0E\u8AD6\u3002",
  "paragraph.pane.orphanFile": "\u627E\u4E0D\u5230\u539F\u672C\u7684\u7B46\u8A18\u4E86\uFF08\u5DF2\u522A\u9664\u6216\u79FB\u8D70\uFF09\u3002\u53EF\u4EE5\u91CD\u65B0\u7D81\u5B9A\u5230\u53E6\u4E00\u6BB5\uFF0C\u6216\u522A\u9664\u9019\u4E32\u8A0E\u8AD6\u3002",
  "paragraph.pane.hashAnchor": "\u9019\u6BB5\u8A0E\u8AD6\u7528\u6587\u5B57\u6BD4\u5C0D\u5B9A\u4F4D\uFF08hash \u6A21\u5F0F\uFF09\uFF1B\u6BB5\u843D\u6587\u5B57\u4E00\u6539\u5C31\u6703\u627E\u4E0D\u5230\u3002",
  "paragraph.notice.blockId": "\u7B2C\u4E00\u6B21\u5C0D\u4E00\u6BB5\u63D0\u554F\u6642\uFF0C\u6703\u5728\u9019\u6BB5\u6700\u5F8C\u52A0\u4E0A\u4E00\u500B\u770B\u4E0D\u898B\u7684\u6A19\u8A18\uFF08\u4F8B\u5982 ^vt-k3x9q2\uFF09\uFF0C\u8B93\u6BB5\u843D\u642C\u79FB\u5F8C\u8A0E\u8AD6\u9084\u627E\u5F97\u5230\u5B83\u3002\u4E0D\u60F3\u4FEE\u6539\u7B46\u8A18\u7684\u8A71\uFF0C\u53EF\u4EE5\u6539\u7528 hash \u6A21\u5F0F\uFF1A\u7528\u6587\u5B57\u6BD4\u5C0D\u5B9A\u4F4D\uFF0C\u4E0D\u5BEB\u5165\u7B46\u8A18\uFF0C\u4F46\u6BB5\u843D\u6587\u5B57\u4E00\u6539\u5C31\u6703\u627E\u4E0D\u5230\u3002",
  "paragraph.notice.ok": "\u77E5\u9053\u4E86",
  "paragraph.notice.useHash": "\u6539\u7528 hash \u6A21\u5F0F\uFF08\u4E0D\u4FEE\u6539\u7B46\u8A18\uFF09",
  "paragraph.notice.hashOn": "\u5DF2\u6539\u7528 hash \u6A21\u5F0F\uFF0C\u4E4B\u5F8C\u4E0D\u6703\u4FEE\u6539\u4F60\u7684\u7B46\u8A18\u3002",
  "paragraph.rebind.banner": "\u9EDE\u9078\u95B1\u8B80\u6A21\u5F0F\u4E2D\u6BB5\u843D\u53F3\u5074\u7684 \u2726\uFF0C\u628A\u9019\u4E32\u8A0E\u8AD6\u7D81\u5B9A\u5230\u90A3\u4E00\u6BB5\u3002",
  "paragraph.rebind.cancel": "\u53D6\u6D88",
  "paragraph.rebind.done": "\u5DF2\u91CD\u65B0\u7D81\u5B9A\u5230\u65B0\u7684\u6BB5\u843D",
  "paragraph.rebind.failed": "\u7121\u6CD5\u7D81\u5B9A\u5230\u9019\u4E00\u6BB5\uFF1A{error}",
  "paragraph.deleted": "\u5DF2\u522A\u9664\u6BB5\u843D\u8A0E\u8AD6",
  "paragraph.badge.open": "\u8A0E\u8AD6\u9019\u4E00\u6BB5",
  "paragraph.badge.count": "\u9019\u4E00\u6BB5\u6709 {n} \u5247\u8A0E\u8AD6",
  "paragraph.error.notAnchorable": "\u9019\u7A2E\u5340\u584A\uFF08\u6A19\u984C\u3001\u7A0B\u5F0F\u78BC\u3001\u8868\u683C\u3001callout\uFF09\u9084\u4E0D\u80FD\u8A0E\u8AD6\u3002",
  "word.discussions": "{n} \u5247\u8A0E\u8AD6",
  "paragraph.pane.openAiNote": "\u958B\u555F {path}",
  "word.openPage": "\u55AE\u5B57\u9801",
  "word.openPageTitle": "\u958B\u555F\u9019\u500B\u5B57\u7684\u55AE\u5B57\u9801",
  "settings.section.paragraphs": "\u6BB5\u843D\u8A0E\u8AD6",
  "settings.paragraphs.hashMode.name": "\u4E0D\u8981\u4FEE\u6539\u6211\u7684\u7B46\u8A18\uFF08hash \u6A21\u5F0F\uFF09",
  "settings.paragraphs.hashMode.desc": "\u958B\u555F\u5F8C\u4E0D\u6703\u5728\u6BB5\u843D\u672B\u5C3E\u52A0\u4E0A ^vt-xxxxxx\uFF0C\u6539\u7528\u6587\u5B57\u6BD4\u5C0D\u5B9A\u4F4D\uFF1B\u6BB5\u843D\u6587\u5B57\u4E00\u6539\uFF0C\u8A0E\u8AD6\u5C31\u6703\u8B8A\u6210\u5B64\u7ACB\u3002",
  // ── M7 字族樹、動詞用法、冷知識 ──
  "learn.loading": "\u8F09\u5165\u4E2D\u2026",
  "learn.stop": "\u505C\u6B62",
  "learn.retry": "\u91CD\u8A66",
  "learn.ai.offline": "\u76EE\u524D\u96E2\u7DDA\uFF0C\u9023\u7DDA\u5F8C\u624D\u80FD\u4F7F\u7528 AI\u3002\u5DF2\u5B58\u7684\u5167\u5BB9\u7167\u5E38\u986F\u793A\u3002",
  "learn.ai.disabled.title": "AI \u76EE\u524D\u95DC\u9589",
  "learn.ai.noKey.title": "\u8A2D\u5B9A AI \u5F8C\u624D\u80FD\u4F7F\u7528",
  "learn.ai.body": "\u5230\u300C\u8A2D\u5B9A \u203A Vocab Tracker\u300D\u8A2D\u5B9A AI\u3002\u5DF2\u5B58\u7684\u5167\u5BB9\u7167\u5E38\u986F\u793A\u3002",
  "learn.notFound": "\u55AE\u5B57\u5EAB\u88E1\u6C92\u6709\u300C{word}\u300D\u3002",
  "learn.family.empty.title": "\u9084\u6C92\u6709\u5B57\u65CF",
  "learn.family.empty.body": "\u8B93 AI \u5F9E\u4F60\u5B78\u904E\u7684\u55AE\u5B57\u6574\u7406\u51FA\u5B57\u65CF\uFF0C\u518D\u6311\u60F3\u5B78\u7684\u65B0\u5B57\u52A0\u5165\u55AE\u5B57\u5EAB\u3002",
  "learn.family.word.empty.title": "\u300C{word}\u300D\u9084\u6C92\u6709\u5B57\u65CF",
  "learn.family.generate": "\u627E\u5B57\u65CF",
  "learn.family.regroup": "\u91CD\u65B0\u5206\u7FA4",
  "learn.family.regroup.hint": "\u55AE\u5B57\u5EAB\u6BD4\u4E0A\u6B21\u5206\u7FA4\u6642\u591A\u4E86 20% \u4EE5\u4E0A\uFF0C\u8981\u91CD\u65B0\u5206\u7FA4\u55CE\uFF1F",
  "learn.family.generating": "AI \u6B63\u5728\u6574\u7406\u5B57\u65CF\u2026",
  "learn.family.noneFound": "AI \u6C92\u6709\u627E\u5230\u53EF\u4EE5\u6210\u70BA\u5B57\u65CF\u7684\u5B57\uFF0C\u63DB\u500B\u6642\u9593\u518D\u8A66\u8A66\u3002",
  "learn.family.known": "\u5DF2\u5B78",
  "learn.family.saved": "\u5DF2\u5B58 {families} \u500B\u5B57\u65CF\u3002\u65B0\u5B57\u4EE5\u6587\u5B57\u6210\u54E1\u5B58\u5728\u5B57\u65CF\u6A39\u88E1\uFF0C\u9EDE\u4E00\u4E0B\uFF08\u6216\u65C1\u908A\u7684 \uFF0B\uFF09\u5C31\u80FD\u52A0\u5165\u55AE\u5B57\u5EAB\u3002",
  "learn.family.added": "\u5DF2\u52A0\u5165\u300C{word}\u300D",
  "learn.family.add": "\u52A0\u5165\u300C{word}\u300D",
  "learn.family.legend.known": "\u5DF2\u5728\u55AE\u5B57\u5EAB\uFF0C\u9EDE\u4E00\u4E0B\u6253\u958B\u55AE\u5B57\u5361",
  "learn.family.legend.suggested": "AI \u88DC\u7684\u5EF6\u4F38\u5B57\uFF0C\u9EDE\u4E00\u4E0B\u52A0\u5165",
  "learn.family.legend.seeds": "\u8D77\u9EDE\uFF1A\u4F60\u5B78\u904E\u7684 {words}",
  "learn.family.more": "\u66F4\u591A",
  "learn.family.delete": "\u522A\u9664\u9019\u500B\u5B57\u65CF",
  "learn.family.deleted": "\u5DF2\u522A\u9664\u5B57\u65CF\u300C{name}\u300D",
  "learn.dates.added": "\u52A0\u5165 {date}",
  "learn.dates.updated": "\u66F4\u65B0 {date}",
  "learn.dates.saved": "\u6536\u85CF {date}",
  "learn.openWord": "\u5728\u5074\u6B04\u6253\u958B {word}",
  "learn.verb.filter": "\u7BE9\u9078\u52D5\u8A5E\u2026",
  "learn.verb.count": "\u5DF2\u5B78\u52D5\u8A5E\uFF08{n}\uFF09",
  "learn.verb.none.title": "\u55AE\u5B57\u5EAB\u88E1\u9084\u6C92\u6709\u52D5\u8A5E",
  "learn.verb.none.body": "\u8A5E\u6027\u542B verb \u7684\u55AE\u5B57\u6703\u51FA\u73FE\u5728\u9019\u88E1\u3002",
  "learn.verb.noMatch": "\u6C92\u6709\u7B26\u5408\u7684\u52D5\u8A5E",
  "learn.verb.notVerb": "\u300C{word}\u300D\u4E0D\u662F\u52D5\u8A5E\uFF0C\u6C92\u6709\u7528\u6CD5\u53EF\u4EE5\u7522\u751F\u3002",
  "learn.verb.generate": "\u7522\u751F\u7528\u6CD5",
  "learn.verb.regenerate": "\u91CD\u65B0\u7522\u751F",
  "learn.verb.generating": "AI \u6B63\u5728\u6574\u7406 {word} \u7684\u7528\u6CD5\u2026",
  "learn.verb.empty.title": "\u9084\u6C92\u6709 {word} \u7684\u7528\u6CD5",
  "learn.verb.empty.body": "\u8B93 AI \u6574\u7406\u5E38\u898B\u53E5\u578B\u3001\u4F8B\u53E5\u548C\u76F8\u8FD1\u8AAA\u6CD5\u3002\u7522\u751F\u4E00\u6B21\u5C31\u6703\u5B58\u8D77\u4F86\u3002",
  "learn.verb.related": "\u76F8\u8FD1\u8AAA\u6CD5",
  "learn.verb.meta.source": "\u51FA\u81EA {source}",
  "learn.verb.speak": "\u767C\u97F3",
  "learn.verb.hasUsage": "\u5DF2\u7522\u751F\u7528\u6CD5",
  "learn.verb.favorite": "\u6536\u85CF\uFF08\u5BEB\u5165\u55AE\u5B57\u9801\uFF09",
  "learn.verb.favorited": "\u5DF2\u6536\u85CF",
  "learn.verb.unfavorite": "\u53D6\u6D88\u6536\u85CF\uFF08\u55AE\u5B57\u9801\u4E0A\u7684\u7528\u6CD5\u6703\u4FDD\u7559\uFF09",
  "learn.verb.savedTo": "\u5DF2\u6536\u85CF\uFF0C\u5BEB\u5165 {path}",
  "learn.verb.rowFavorited": "\u5DF2\u6536\u85CF\u5230\u55AE\u5B57\u9801",
  "learn.trivia.title": "\u55AE\u5B57\u51B7\u77E5\u8B58",
  "learn.trivia.random": "\u5F9E\u5DF2\u5B78\u7684 {n} \u500B\u5B57\u96A8\u6A5F",
  "learn.trivia.subject": "\u4E3B\u89D2\uFF1A{word}",
  "learn.trivia.pick": "\u6307\u5B9A\u4E00\u500B\u5B57\u4F86\u804A",
  "learn.trivia.pick.placeholder": "\u60F3\u804A\u54EA\u500B\u5B57\uFF1F",
  "learn.trivia.placeholder": "\u8FFD\u554F\u9019\u5247\u51B7\u77E5\u8B58\u2026",
  "learn.trivia.footer": "\u6BCF\u5247 50\u2013200 \u5B57\uFF1B\u540C\u4E00\u500B\u5B57\u8B1B\u904E\u7684\u5167\u5BB9\u6703\u8A18\u4E0B\u4F86\uFF0C\u4E0D\u6703\u91CD\u8907\u3002",
  "learn.trivia.empty.title": "\u55AE\u5B57\u5EAB\u9084\u662F\u7A7A\u7684",
  "learn.trivia.empty.body": "\u52A0\u5165\u5E7E\u500B\u55AE\u5B57\u5F8C\uFF0C\u5C31\u80FD\u807D\u5B83\u5011\u7684\u51B7\u77E5\u8B58\u3002",
  "learn.trivia.noWords": "\u6C92\u6709\u53EF\u4EE5\u804A\u7684\u55AE\u5B57\u3002",
  "learn.trivia.turn.next": "\u51B7\u77E5\u8B58",
  "learn.trivia.favorites": "\u6536\u85CF\u7684\u51B7\u77E5\u8B58",
  "learn.trivia.favorites.empty": "\u9084\u6C92\u6709\u6536\u85CF\u3002\u5728\u56DE\u7B54\u4E0B\u9762\u9EDE\u300C\u6536\u85CF\u300D\uFF0C\u5C31\u6703\u51FA\u73FE\u5728\u9019\u88E1\u3002",
  "learn.trivia.favorite": "\u6536\u85CF",
  "learn.trivia.favoriteTo": "\u6536\u85CF\u5230 {word}",
  "learn.trivia.favorited": "\u5DF2\u6536\u85CF",
  "learn.trivia.savedTo": "\u5DF2\u6536\u85CF\uFF0C\u5BEB\u5165 {path}",
  "learn.trivia.unfavorite": "\u53D6\u6D88\u6536\u85CF",
  "learn.trivia.up": "\u6709\u5E6B\u52A9",
  "learn.trivia.down": "\u6C92\u5E6B\u52A9",
  "learn.trivia.mentions": "\u4E5F\u63D0\u5230 {words}",
  "mobile.sheet.close": "\u95DC\u9589",
  "mobile.sheet.label.word": "\u55AE\u5B57\u5361\uFF1A{word}",
  "mobile.sheet.label.paragraph": "\u6BB5\u843D\u8A0E\u8AD6",
  "mobile.sheet.notTracked": "\u9084\u6C92\u6709\u52A0\u5165\u55AE\u5B57\u5EAB\u3002",
  "mobile.save.added": "\u5DF2\u52A0\u5165\u300C{word}\u300D",
  "mobile.save.undo": "\u5FA9\u539F",
  "mobile.save.undone": "\u5DF2\u79FB\u9664\u300C{word}\u300D",
  "mobile.menu.add": "\u628A\u300C{word}\u300D\u52A0\u5165\u55AE\u5B57\u5EAB",
  "mobile.menu.open": "\u5728\u55AE\u5B57\u8FFD\u8E64\u958B\u555F\u300C{word}\u300D",
  "mobile.menu.added": "\u5DF2\u628A\u300C{word}\u300D\u52A0\u5165\u55AE\u5B57\u5EAB",
  "mobile.mark.label": "\u5728\u55AE\u5B57\u8FFD\u8E64\u67E5\u770B\u300C{word}\u300D",
  "mobile.livePreview.text": "\u9EDE\u5B57\u52A0\u5165\u55AE\u5B57\u5EAB\u53EA\u5728\u300C\u95B1\u8B80\u6A21\u5F0F\u300D\u6709\u6548\u3002",
  "mobile.livePreview.switch": "\u5207\u63DB\u5230\u95B1\u8B80\u6A21\u5F0F",
  "mobile.livePreview.never": "\u4E0D\u518D\u63D0\u793A",
  "mobile.rebind.pick": "\u9EDE\u6BB5\u843D\u65C1\u7684 \u2726\uFF0C\u628A\u9019\u4E32\u8A0E\u8AD6\u7D81\u5B9A\u5230\u90A3\u4E00\u6BB5\u3002",
  "settings.section.reading": "\u9EDE\u5B57\u52D5\u4F5C",
  "settings.reading.tapAction.name": "\u9EDE\u4E00\u4E0B\u55AE\u5B57\uFF08\u684C\u9762\uFF09",
  "settings.reading.tapAction.desc": "\u5728\u684C\u9762\u7248\u95B1\u8B80\u6A21\u5F0F\u9EDE\u82F1\u6587\u55AE\u5B57\u6642\u8981\u505A\u4EC0\u9EBC\u3002",
  "settings.reading.tapActionMobile.name": "\u9EDE\u4E00\u4E0B\u55AE\u5B57\uFF08iPhone\uFF0FiPad\uFF09",
  "settings.reading.tapActionMobile.desc": "\u5728\u884C\u52D5\u88DD\u7F6E\u95B1\u8B80\u6A21\u5F0F\u9EDE\u82F1\u6587\u55AE\u5B57\u6642\u8981\u505A\u4EC0\u9EBC\u3002iPhone \u4E0A\u55AE\u5B57\u5361\u6703\u5F9E\u5E95\u90E8\u62BD\u5C5C\u6253\u958B\uFF0C\u4E0D\u6703\u84CB\u4F4F\u5168\u6587\u3002",
  "settings.reading.tap.menu": "\u8DF3\u51FA\u9078\u55AE",
  "settings.reading.tap.save": "\u76F4\u63A5\u5B58\u6210\u55AE\u5B57",
  "settings.reading.tap.open": "\u6253\u958B\u55AE\u5B57\u5361\uFF08\u4E0D\u5132\u5B58\uFF09",
  "settings.reading.pronounceSource.name": "\u767C\u97F3\u4F86\u6E90",
  "settings.reading.pronounceSource.desc": "\u{1F50A} \u8981\u7528\u54EA\u7A2E\u8B80\u97F3\u3002\u5B57\u5178\u97F3\u6A94\u8981\u5F9E\u7DB2\u8DEF\u4E0B\u8F09\uFF0C\u7DB2\u8DEF\u6162\u6216\u4F3A\u670D\u5668\u6C92\u56DE\u61C9\u6642\uFF0C\u300C\u81EA\u52D5\u300D\u6703\u5728 1.5 \u79D2\u5F8C\u6539\u7528\u7CFB\u7D71\u8A9E\u97F3\u3002",
  "settings.reading.pronounceSource.auto": "\u81EA\u52D5\uFF08\u5B57\u5178\u97F3\u6A94\uFF0C\u592A\u6162\u5C31\u6539\u7528\u7CFB\u7D71\u8A9E\u97F3\uFF09",
  "settings.reading.pronounceSource.recording": "\u512A\u5148\u5B57\u5178\u97F3\u6A94\uFF08\u7B49\u5B83\u8F09\u5B8C\uFF09",
  "settings.reading.pronounceSource.synth": "\u53EA\u7528\u7CFB\u7D71\u8A9E\u97F3",
  "settings.reading.livePreviewHint.name": "Live Preview \u63D0\u793A",
  "settings.reading.livePreviewHint.desc": "\u5728\u884C\u52D5\u88DD\u7F6E\u7684 Live Preview\uFF08\u5373\u6642\u9810\u89BD\uFF09\u9EDE\u5B57\u6642\uFF0C\u6BCF\u6B21\u958B\u555F\u63D0\u9192\u4E00\u6B21\uFF1A\u9EDE\u5B57\u53EA\u5728\u95B1\u8B80\u6A21\u5F0F\u6709\u6548\u3002",
  // ── 備份與還原 (services/backup) ──
  "settings.section.backup": "\u5099\u4EFD\u8207\u9084\u539F",
  "settings.backup.desc": "\u5099\u4EFD\u5B58\u5728 {folder}\u3002\u9084\u539F\u6703\u628A\u55AE\u5B57\u3001\u8A0E\u8AD6\u4E32\u3001\u5B57\u65CF\u3001\u51B7\u77E5\u8B58\u6536\u85CF\u548C\u8907\u7FD2\u7D00\u9304\u6539\u56DE\u5099\u4EFD\u7576\u6642\u7684\u6A23\u5B50\uFF1B\u8A2D\u5B9A\uFF08AI\u3001\u55AE\u5B57\u5361\u3001\u8003\u8A66\u5B57\u8868\u2026\uFF09\u4E0D\u6703\u8B8A\u3002",
  "settings.backup.create.name": "\u7ACB\u5373\u5099\u4EFD",
  "settings.backup.create.desc": "\u628A\u76EE\u524D\u7684\u55AE\u5B57\u5EAB\uFF0C\u9023\u540C\u6240\u6709\u8A0E\u8AD6\u548C\u5B78\u7FD2\u7D00\u9304\uFF0C\u5B58\u6210\u4E00\u500B\u6A94\u6848\u3002",
  "settings.backup.create.button": "\u5099\u4EFD",
  "settings.backup.created": "\u5DF2\u5099\u4EFD\u5230 {path}",
  "settings.backup.failed": "\u5099\u4EFD\u5931\u6557\uFF1A{error}",
  "settings.backup.list.name": "\u5099\u4EFD\u6E05\u55AE",
  "settings.backup.list.loading": "\u6B63\u5728\u8B80\u53D6\u5099\u4EFD\u2026",
  "settings.backup.list.empty": "\u9084\u6C92\u6709\u5099\u4EFD\u3002",
  "settings.backup.list.reload": "\u91CD\u65B0\u6574\u7406",
  "settings.backup.reason.manual": "\u624B\u52D5\u5099\u4EFD",
  "settings.backup.reason.before-restore": "\u9084\u539F\u524D\u81EA\u52D5\u5099\u4EFD",
  "settings.backup.reason.migration": "\u5347\u7D1A\u524D\u81EA\u52D5\u5099\u4EFD\uFF08\u820A\u683C\u5F0F\uFF0C\u53EA\u6709\u55AE\u5B57\uFF09",
  "settings.backup.reason.unknown": "data.json \u526F\u672C\uFF08\u53EA\u6709\u55AE\u5B57\uFF09",
  "settings.backup.unreadable": "\u7121\u6CD5\u8B80\u53D6\uFF0C\u4E0D\u80FD\u9084\u539F\u3002",
  "settings.backup.noTime": "\u6642\u9593\u4E0D\u660E",
  "settings.backup.summary.words": "{n} \u500B\u55AE\u5B57",
  "settings.backup.summary.threads": "{n} \u4E32\u8A0E\u8AD6\uFF08{q} \u984C\uFF09",
  "settings.backup.summary.families": "{n} \u500B\u5B57\u65CF",
  "settings.backup.summary.trivia": "{n} \u5247\u51B7\u77E5\u8B58\u6536\u85CF",
  "settings.backup.summary.reviews": "{n} \u7B46\u8907\u7FD2\u7D00\u9304",
  "settings.backup.restore.button": "\u9084\u539F\u2026",
  "settings.backup.lastRestore": "\u5DF2\u9084\u539F\u3002\u9084\u539F\u524D\u7684\u8CC7\u6599\u5B58\u5728 {path}\uFF0C\u8981\u5FA9\u539F\u7684\u8A71\uFF0C\u5F9E\u6E05\u55AE\u9084\u539F\u90A3\u4E00\u4EFD\u5C31\u597D\u3002",
  "backup.restore.title": "\u5F9E\u9019\u500B\u5099\u4EFD\u9084\u539F\uFF1F",
  "backup.restore.loading": "\u6B63\u5728\u8DDF\u76EE\u524D\u7684\u8CC7\u6599\u6BD4\u5C0D\u2026",
  "backup.restore.from": "\u5099\u4EFD\uFF1A{time} \xB7 {summary}",
  "backup.restore.what": "\u6703\u767C\u751F\u7684\u4E8B",
  "backup.restore.words": "\u55AE\u5B57\uFF1A{changed} \u500B\u6539\u56DE\u5099\u4EFD\u6642\u7684\u5167\u5BB9\uFF08\u91CB\u7FA9\u3001\u7B49\u7D1A\u3001\u55AE\u5B57\u5361\u9032\u5EA6\u90FD\u6703\u56DE\u5230\u7576\u6642\uFF09\uFF1B{revived} \u500B\u5DF2\u522A\u9664\u7684\u5B57\u6703\u56DE\u4F86\u3002",
  "backup.restore.threads": "\u8A0E\u8AD6\u4E32\uFF1A{n} \u4E32\u6539\u56DE\u5099\u4EFD\u6642\u7684\u5167\u5BB9\uFF1B{q} \u984C\u522A\u6389\u7684\u554F\u984C\u6703\u56DE\u4F86\u3002",
  "backup.restore.learn": "\u5B57\u65CF\u8207\u51B7\u77E5\u8B58\u6536\u85CF\uFF1A{families} \u500B\u5B57\u65CF\u3001{trivia} \u5247\u6536\u85CF\u6539\u56DE\u5099\u4EFD\u6642\u7684\u5167\u5BB9\u3002",
  "backup.restore.reviews": "\u8907\u7FD2\u7D00\u9304\uFF1A\u88DC\u56DE {n} \u7B46\uFF08\u7D00\u9304\u53EA\u6703\u589E\u52A0\uFF0C\u4E0D\u6703\u522A\u9664\uFF09\u3002",
  "backup.restore.same": "\u76EE\u524D\u7684\u8CC7\u6599\u8DDF\u9019\u500B\u5099\u4EFD\u4E00\u6A23\uFF0C\u9084\u539F\u4E0D\u6703\u6539\u8B8A\u4EFB\u4F55\u6771\u897F\u3002",
  "backup.restore.missing": "\u9019\u500B\u5099\u4EFD\u88E1\u6C92\u6709{parts}\uFF0C\u9019\u4E9B\u6703\u7DAD\u6301\u73FE\u5728\u7684\u6A23\u5B50\u3002",
  "backup.restore.part.threads": "\u8A0E\u8AD6\u4E32",
  "backup.restore.part.learn": "\u5B57\u65CF\u548C\u51B7\u77E5\u8B58\u6536\u85CF",
  "backup.restore.part.reviews": "\u8907\u7FD2\u7D00\u9304",
  "backup.restore.settings": "\u8A2D\u5B9A\uFF08AI\u3001\u55AE\u5B57\u5361\u3001\u8003\u8A66\u5B57\u8868\u2026\uFF09\u548C AI \u7528\u91CF\u7D71\u8A08\u4E0D\u6703\u8B8A\u3002",
  "backup.restore.extras.title": "\u5099\u4EFD\u4E4B\u5F8C\u65B0\u589E\u7684",
  "backup.restore.extras.desc": "\u76EE\u524D\u6709\u3001\u4F46\u5099\u4EFD\u88E1\u6C92\u6709\u7684\uFF1A{words} \u500B\u55AE\u5B57\u3001{questions} \u984C\u8A0E\u8AD6\u3001{learn} \u500B\u5B57\u65CF\uFF0F\u6536\u85CF\u3002\u6C92\u6253\u958B\u4E0B\u9762\u7684\u958B\u95DC\u5C31\u6703\u4FDD\u7559\u3002",
  "backup.restore.extras.remove": "\u4E00\u4F75\u522A\u9664\u9019\u4E9B\uFF08\u5176\u4ED6\u88DD\u7F6E\u540C\u6B65\u5F8C\u4E5F\u6703\u522A\u9664\uFF09",
  "backup.restore.extras.undoHint": "\u7528\u300C\u9084\u539F\u524D\u81EA\u52D5\u5099\u4EFD\u300D\u5FA9\u539F\u6642\uFF0C\u8ACB\u6253\u958B\u9019\u500B\u958B\u95DC\uFF0C\u624D\u6703\u5B8C\u5168\u56DE\u5230\u9084\u539F\u524D\u7684\u72C0\u614B\u3002",
  "backup.restore.safety": "\u9084\u539F\u4E4B\u524D\uFF0C\u6703\u5148\u628A\u76EE\u524D\u7684\u5168\u90E8\u8CC7\u6599\uFF08data.json \u548C\u6574\u500B store/ \u8CC7\u6599\u593E\uFF09\u53E6\u5B58\u5230 {folder}\uFF0C\u6A94\u540D\u662F full-<\u6642\u9593>-before-restore.json\u3002\u9084\u539F\u932F\u4E86\uFF0C\u53EF\u4EE5\u518D\u5F9E\u9019\u500B\u6A94\u6848\u9084\u539F\u56DE\u4F86\u3002",
  "backup.restore.devices.title": "\u5176\u4ED6\u88DD\u7F6E\u6703\u600E\u6A23",
  "backup.restore.devices.sync": "\u540C\u6B65\u4E4B\u5F8C\uFF0C\u5176\u4ED6\u88DD\u7F6E\u4E5F\u6703\u8B8A\u6210\u9084\u539F\u5F8C\u7684\u6A23\u5B50\uFF1A\u9019\u6B21\u9084\u539F\u6703\u88AB\u7576\u6210\u300C\u73FE\u5728\u505A\u7684\u4FEE\u6539\u300D\uFF0C\u6240\u4EE5\u6703\u53D6\u4EE3\u5176\u4ED6\u88DD\u7F6E\u4E0A\u6BD4\u8F03\u820A\u7684\u5167\u5BB9\u3002",
  "backup.restore.devices.unsynced": "\u5176\u4ED6\u88DD\u7F6E\u4E0A\u9084\u6C92\u540C\u6B65\u904E\u4F86\u7684\u4FEE\u6539\uFF1A\u9019\u6B21\u9084\u539F\u6709\u6539\u5230\u7684\u5B57\uFF0C\u4EE5\u9084\u539F\u70BA\u6E96\uFF1B\u6C92\u6539\u5230\u7684\u5B57\u3001\u4EE5\u53CA\u90A3\u53F0\u88DD\u7F6E\u65B0\u589E\u7684\u5B57\uFF0C\u6703\u4FDD\u7559\u90A3\u53F0\u7684\u7248\u672C\u3002",
  "backup.restore.devices.after": "\u9084\u539F\u4E4B\u5F8C\uFF0C\u5728\u4EFB\u4F55\u88DD\u7F6E\u4E0A\u505A\u7684\u4FEE\u6539\u90FD\u6703\u7167\u5E38\u540C\u6B65\uFF0C\u4E0D\u6703\u88AB\u9019\u6B21\u9084\u539F\u84CB\u6389\u3002",
  "backup.restore.devices.tip": "\u5EFA\u8B70\u5148\u8B93\u6BCF\u53F0\u88DD\u7F6E\u90FD\u540C\u6B65\u5B8C\u6210\u518D\u9084\u539F\uFF1B\u9084\u539F\u5F8C\uFF0C\u5230\u5176\u4ED6\u88DD\u7F6E\u6253\u958B Obsidian\uFF0C\u8B93\u5B83\u540C\u6B65\u4E00\u6B21\u3002",
  "backup.restore.cancel": "\u53D6\u6D88",
  "backup.restore.confirm": "\u9084\u539F",
  "backup.restore.working": "\u9084\u539F\u4E2D\u2026",
  "backup.restore.done": "\u5DF2\u5F9E\u5099\u4EFD\u9084\u539F\u3002\u9084\u539F\u524D\u7684\u8CC7\u6599\u5B58\u5728 {path}",
  "backup.restore.failed": "\u9084\u539F\u5931\u6557\uFF1A{error}",
  "backup.restore.safetyFailed": "\u6C92\u8FA6\u6CD5\u5148\u5099\u4EFD\u76EE\u524D\u7684\u8CC7\u6599\uFF0C\u6240\u4EE5\u6C92\u6709\u9084\u539F\uFF0C\u4EC0\u9EBC\u90FD\u6C92\u6539\uFF1A{error}"
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
function joinWords(words) {
  return words.join(activeLocale === "zh-TW" ? "\u3001" : ", ");
}
function t(key3, params) {
  var _a;
  const template = (_a = dictionaries[activeLocale][key3]) != null ? _a : dictionaries.en[key3];
  if (!params) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (match, name) => name in params ? String(params[name]) : match
  );
}

// src/core/model/thread.ts
function wordThreadId(entryId) {
  return `word:${entryId}`;
}
function liveTurns(thread) {
  return thread ? thread.turns.filter((t2) => !t2.deletedAt) : [];
}

// src/ui/kit/pronounce.ts
var import_obsidian4 = require("obsidian");

// src/services/speech/Pronouncer.ts
var DEFAULT_TIMEOUT_MS = 1500;
var DEFAULT_CACHE_SIZE = 40;
var FAILED_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var FAILED_KEY = "pronounce.failed";
var FAILED_MAX = 200;
var WATCHDOG_MS = 8e3;
var MIME_BY_EXT = {
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: 'audio/ogg; codecs="opus"',
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
  flac: "audio/flac"
};
function audioMime(url) {
  var _a;
  const path = url.split(/[?#]/)[0];
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? (_a = MIME_BY_EXT[m[1].toLowerCase()]) != null ? _a : null : null;
}
var Pronouncer = class {
  constructor(deps) {
    this.deps = deps;
    this.cache = /* @__PURE__ */ new Map();
    // Formats this platform can't play: per device and permanent, so just
    // recomputed each session rather than stored.
    this.unsupported = /* @__PURE__ */ new Set();
    this.current = null;
    this.seq = 0;
    this.failed = this.loadFailed();
  }
  get source() {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.deps).source) == null ? void 0 : _b.call(_a)) != null ? _c : "auto";
  }
  // The recording URL an attempt would try first, or null for the system
  // voice straight away.
  recordingFor(req) {
    var _a;
    const url = (_a = req.audio) == null ? void 0 : _a.trim();
    if (!url || this.source === "synth" || this.hasFailed(url)) return null;
    if (!this.playable(url)) {
      this.unsupported.add(url);
      return null;
    }
    const cached = this.cache.get(url);
    if (this.isCached(url)) return url;
    if (this.deps.online && !this.deps.online()) return null;
    if ((cached == null ? void 0 : cached.timedOut) && this.source === "auto") return null;
    return url;
  }
  hasFailed(url) {
    if (this.unsupported.has(url)) return true;
    const at = this.failed.get(url);
    if (at === void 0) return false;
    if (this.now() - at < FAILED_TTL_MS) return true;
    this.failed.delete(url);
    this.saveFailed();
    return false;
  }
  isCached(url) {
    const c = this.cache.get(url);
    return !!c && (c.ready || c.clip.ready);
  }
  // Speaks the word. Resolves with how it was spoken once that's decided
  // (the recording started, or the system voice took over).
  pronounce(req, onState = () => {
  }) {
    this.stop();
    return new Promise((resolve) => {
      const a = {
        id: ++this.seq,
        onState,
        state: "idle",
        clip: null,
        synth: false,
        timer: null,
        watchdog: null,
        offs: [],
        resolve,
        settled: false
      };
      this.current = a;
      const url = this.recordingFor(req);
      if (url && this.source === "auto" && this.instant() && !this.isCached(url)) {
        this.preload(req);
        this.speakSynth(a, req.word);
      } else if (url) this.playRecording(a, url, req.word);
      else this.speakSynth(a, req.word);
    });
  }
  // Starts fetching a recording without playing it (the next flashcard).
  preload(req) {
    const url = this.recordingFor(req);
    if (!url || this.cache.has(url)) return;
    const c = this.entry(url);
    try {
      c.clip.load();
    } catch (e) {
      console.error("Vocab Tracker: audio preload failed", e);
    }
  }
  // Stops whatever is playing or loading.
  stop() {
    var _a, _b;
    const a = this.current;
    if (!a) return;
    this.current = null;
    if (a.clip) a.clip.pause();
    if (a.synth) (_b = (_a = this.deps.synth).cancel) == null ? void 0 : _b.call(_a);
    this.finish(a, "stopped");
  }
  dispose() {
    this.stop();
    for (const c of this.cache.values()) this.drop(c);
    this.cache.clear();
  }
  // ── Internals ─────────────────────────────────────────────────
  now() {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.deps).now) == null ? void 0 : _b.call(_a)) != null ? _c : Date.now();
  }
  instant() {
    var _a, _b, _c;
    try {
      return (_c = (_b = (_a = this.deps).instantFallback) == null ? void 0 : _b.call(_a)) != null ? _c : false;
    } catch (e) {
      return false;
    }
  }
  loadFailed() {
    const out = /* @__PURE__ */ new Map();
    const store = this.deps.deviceState;
    if (!store) return out;
    try {
      const raw = store.get(FAILED_KEY);
      if (!raw) return out;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return out;
      const now = this.now();
      for (const [url, at] of Object.entries(data)) {
        if (typeof at === "number" && now - at < FAILED_TTL_MS) out.set(url, at);
      }
    } catch (e) {
      console.error("Vocab Tracker: couldn't read failed pronunciations", e);
    }
    return out;
  }
  saveFailed() {
    const store = this.deps.deviceState;
    if (!store) return;
    while (this.failed.size > FAILED_MAX) {
      const oldest = this.failed.keys().next().value;
      if (oldest === void 0) break;
      this.failed.delete(oldest);
    }
    try {
      store.set(FAILED_KEY, this.failed.size ? JSON.stringify(Object.fromEntries(this.failed)) : null);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save failed pronunciations", e);
    }
  }
  playable(url) {
    const mime = audioMime(url);
    if (!mime) return true;
    try {
      return this.deps.canPlayType(mime) !== "";
    } catch (e) {
      return true;
    }
  }
  entry(url) {
    var _a, _b;
    const hit = this.cache.get(url);
    if (hit) {
      this.cache.delete(url);
      this.cache.set(url, hit);
      return hit;
    }
    const clip2 = this.deps.createClip(url);
    const c = { clip: clip2, ready: clip2.ready, timedOut: false, offs: [] };
    c.offs.push(
      clip2.on("ready", () => {
        c.ready = true;
        c.timedOut = false;
      }),
      clip2.on("error", () => this.markFailed(url))
    );
    this.cache.set(url, c);
    const max = (_a = this.deps.cacheSize) != null ? _a : DEFAULT_CACHE_SIZE;
    for (const [key3, old] of this.cache) {
      if (this.cache.size <= max) break;
      if (old === c || ((_b = this.current) == null ? void 0 : _b.clip) === old.clip) continue;
      this.drop(old);
      this.cache.delete(key3);
    }
    return c;
  }
  drop(c) {
    for (const off of c.offs) off();
    c.offs = [];
    try {
      c.clip.pause();
    } catch (e) {
    }
  }
  markFailed(url) {
    this.failed.delete(url);
    this.failed.set(url, this.now());
    this.saveFailed();
    const c = this.cache.get(url);
    if (c) {
      this.drop(c);
      this.cache.delete(url);
    }
  }
  live(a) {
    return this.current === a;
  }
  setState(a, s) {
    if (a.state === s) return;
    a.state = s;
    if (a.watchdog) clearTimeout(a.watchdog);
    a.watchdog = null;
    if (s === "playing") {
      a.watchdog = setTimeout(() => {
        if (this.live(a)) {
          this.current = null;
          this.finish(a, a.synth ? "synth" : "recording");
        }
      }, WATCHDOG_MS);
    }
    a.onState(s);
  }
  settle(a, via) {
    if (a.settled) return;
    a.settled = true;
    a.resolve(via);
  }
  // Ends an attempt: clears its timers and listeners, reports idle.
  finish(a, via) {
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    for (const off of a.offs) off();
    a.offs = [];
    this.setState(a, "idle");
    if (a.watchdog) clearTimeout(a.watchdog);
    a.watchdog = null;
    this.settle(a, via);
  }
  playRecording(a, url, word) {
    var _a;
    const c = this.entry(url);
    const clip2 = c.clip;
    a.clip = clip2;
    if (clip2.ready) c.ready = true;
    if (!c.ready) this.setState(a, "loading");
    let fellBack = false;
    const fallBack = () => {
      if (!this.live(a) || fellBack) return;
      fellBack = true;
      for (const off of a.offs) off();
      a.offs = [];
      if (a.timer) clearTimeout(a.timer);
      a.timer = null;
      clip2.pause();
      a.clip = null;
      this.speakSynth(a, word);
    };
    a.offs.push(
      clip2.on("playing", () => {
        if (!this.live(a) || fellBack) return;
        if (a.timer) clearTimeout(a.timer);
        a.timer = null;
        c.ready = true;
        this.setState(a, "playing");
        this.settle(a, "recording");
      }),
      clip2.on("ended", () => {
        if (!this.live(a) || fellBack) return;
        this.current = null;
        this.finish(a, "recording");
      }),
      // markFailed (registered with the clip) has already run.
      clip2.on("error", fallBack)
    );
    if (this.source === "auto" && !c.ready) {
      const ms5 = (_a = this.deps.timeoutMs) != null ? _a : DEFAULT_TIMEOUT_MS;
      a.timer = setTimeout(() => {
        a.timer = null;
        if (!this.live(a) || fellBack || a.state === "playing") return;
        c.timedOut = true;
        fallBack();
      }, ms5);
    }
    try {
      clip2.rewind();
    } catch (e) {
    }
    let started;
    try {
      started = clip2.play();
    } catch (e) {
      started = Promise.reject(e);
    }
    started.then(
      () => {
        if (!this.live(a) || fellBack || a.state === "playing") return;
        if (a.timer) clearTimeout(a.timer);
        a.timer = null;
        c.ready = true;
        this.setState(a, "playing");
        this.settle(a, "recording");
      },
      (err) => {
        const name = err == null ? void 0 : err.name;
        if (name === "AbortError") return;
        if (name !== "NotAllowedError") this.markFailed(url);
        fallBack();
      }
    );
  }
  speakSynth(a, word) {
    if (!this.live(a)) return;
    a.synth = true;
    this.setState(a, "loading");
    let ok = false;
    try {
      ok = this.deps.synth.speak(word, {
        onStart: () => {
          if (!this.live(a)) return;
          this.setState(a, "playing");
        },
        onEnd: () => {
          if (!this.live(a)) return;
          this.current = null;
          this.finish(a, "synth");
        }
      });
    } catch (e) {
      console.error("Vocab Tracker: speechSynthesis failed", e);
    }
    if (!ok) {
      if (this.live(a)) this.current = null;
      this.finish(a, "none");
      return;
    }
    this.settle(a, "synth");
    if (a.state === "loading") {
      a.watchdog = setTimeout(() => {
        if (this.live(a) && a.state === "loading") {
          this.current = null;
          this.finish(a, "synth");
        }
      }, WATCHDOG_MS);
    }
  }
};

// src/ui/mobile/formFactor.ts
function formFactorOf(p, body) {
  const has = (cls) => !!(body == null ? void 0 : body.contains(cls));
  if (p.isPhone || has("is-phone")) return "phone";
  if (p.isMobile || p.isTablet || has("is-mobile") || has("is-tablet")) return "tablet";
  return "desktop";
}
function isMobileForm(f) {
  return f !== "desktop";
}
function wordSurface(f) {
  return f === "phone" ? "sheet" : "sidebar";
}

// src/ui/mobile/platform.ts
var import_obsidian3 = require("obsidian");
function currentFormFactor() {
  var _a;
  const body = typeof document !== "undefined" ? (_a = document.body) == null ? void 0 : _a.classList : null;
  return formFactorOf(import_obsidian3.Platform, body);
}

// src/ui/mobile/speech.ts
var Speaker = class {
  constructor(synth, makeUtterance) {
    this.synth = synth;
    this.makeUtterance = makeUtterance;
    this.warmed = false;
    // Held so Chromium doesn't garbage-collect the utterance mid-speech
    // (its onend would then never fire).
    this.utterance = null;
  }
  get available() {
    return !!this.synth;
  }
  warmUp() {
    if (!this.synth || this.warmed) return;
    this.warmed = true;
    try {
      this.synth.getVoices();
    } catch (e) {
      console.error("Vocab Tracker: speechSynthesis warm-up failed", e);
    }
  }
  // false when the device has no speech synthesis at all.
  speak(word, events = {}) {
    const synth = this.synth;
    if (!synth) return false;
    this.warmUp();
    const u = this.makeUtterance(word);
    u.lang = "en-US";
    const done = () => {
      var _a;
      if (this.utterance === u) this.utterance = null;
      (_a = events.onEnd) == null ? void 0 : _a.call(events);
    };
    if (events.onStart) u.onstart = () => {
      var _a;
      return (_a = events.onStart) == null ? void 0 : _a.call(events);
    };
    u.onend = done;
    u.onerror = done;
    if (synth.speaking || synth.pending) synth.cancel();
    this.utterance = u;
    synth.speak(u);
    return true;
  }
  // Stops the current utterance (only when something is playing — see
  // the WebKit note above).
  cancel() {
    const synth = this.synth;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }
};
function browserSpeaker() {
  var _a;
  const w = typeof window !== "undefined" ? window : void 0;
  const synth = (_a = w == null ? void 0 : w.speechSynthesis) != null ? _a : null;
  return new Speaker(synth, (text) => new SpeechSynthesisUtterance(text));
}
var shared = null;
function sharedSpeaker() {
  shared != null ? shared : shared = browserSpeaker();
  return shared;
}

// src/ui/kit/pronounce.ts
var CLIP_EVENTS = {
  playing: "playing",
  ended: "ended",
  error: "error",
  ready: "canplaythrough"
};
function htmlAudioClip(url) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  return {
    play: () => audio.play(),
    pause: () => audio.pause(),
    rewind: () => {
      if (audio.currentTime > 0) audio.currentTime = 0;
    },
    load: () => audio.load(),
    get ready() {
      return audio.readyState >= 3;
    },
    on(event, cb) {
      const type = CLIP_EVENTS[event];
      audio.addEventListener(type, cb);
      return () => audio.removeEventListener(type, cb);
    }
  };
}
var probe = null;
function canPlayType(mime) {
  probe != null ? probe : probe = document.createElement("audio");
  return probe.canPlayType(mime);
}
function isMobileNow() {
  try {
    return isMobileForm(currentFormFactor());
  } catch (e) {
    return false;
  }
}
var config = {};
var shared2 = null;
function pronouncer() {
  shared2 != null ? shared2 : shared2 = new Pronouncer({
    createClip: htmlAudioClip,
    canPlayType,
    synth: sharedSpeaker(),
    source: () => {
      var _a, _b;
      return (_b = (_a = config.source) == null ? void 0 : _a.call(config)) != null ? _b : "auto";
    },
    online: () => typeof navigator === "undefined" ? true : navigator.onLine !== false,
    timeoutMs: config.timeoutMs,
    deviceState: config.deviceState,
    instantFallback: () => {
      var _a;
      return ((_a = config.mobile) != null ? _a : isMobileNow)();
    }
  });
  return shared2;
}
function configurePronouncer(next) {
  config = { ...config, ...next };
  if ((next.timeoutMs !== void 0 || next.deviceState !== void 0) && shared2) {
    shared2.dispose();
    shared2 = null;
  }
}
function disposePronouncer() {
  shared2 == null ? void 0 : shared2.dispose();
  shared2 = null;
  active = null;
  buttons.clear();
}
function keyOf(entry) {
  return entry.id || entry.word.toLowerCase();
}
var buttons = /* @__PURE__ */ new Set();
var active = null;
var token = 0;
function applyPronounceState(el, state) {
  el.toggleClass("is-loading", state === "loading");
  el.toggleClass("is-playing", state === "playing");
  if (state === "loading") {
    el.setAttr("aria-busy", "true");
    el.setAttr("title", t("pronounce.loading"));
  } else {
    el.removeAttribute("aria-busy");
    el.removeAttribute("title");
  }
}
function paint() {
  for (const b of buttons) {
    if (!b.el.isConnected) continue;
    applyPronounceState(b.el, active && active.key === b.key ? active.state : "idle");
  }
}
function track(el, key3) {
  if (buttons.size > 100) {
    for (const b of buttons) if (!b.el.isConnected) buttons.delete(b);
  }
  buttons.add({ el, key: key3 });
  el.addClass("vt-pronounce");
  applyPronounceState(el, active && active.key === key3 ? active.state : "idle");
}
function pronounce(entry) {
  const key3 = keyOf(entry);
  const mine = ++token;
  return pronouncer().pronounce(entry, (state) => {
    if (state === "idle") {
      if ((active == null ? void 0 : active.token) !== mine) return;
      active = null;
    } else {
      active = { key: key3, state, token: mine };
    }
    paint();
  }).then((via) => {
    if (via === "none") new import_obsidian4.Notice(t("pronounce.noVoice"));
    return via;
  });
}
function bindPronounceButton(el, entry, opts = {}) {
  const get = typeof entry === "function" ? entry : () => entry;
  const first = get();
  if (first) track(el, keyOf(first));
  el.addEventListener("click", (e) => {
    var _a;
    if (opts.stopPropagation) e.stopPropagation();
    const target = get();
    if (target) void pronounce(target);
    (_a = opts.after) == null ? void 0 : _a.call(opts, e);
  });
}
function preloadPronunciation(entry) {
  if (entry) pronouncer().preload(entry);
}
function stopPronouncingIn(root) {
  if (!active) return;
  const key3 = active.key;
  for (const b of buttons) {
    if (b.key === key3 && root.contains(b.el)) {
      shared2 == null ? void 0 : shared2.stop();
      return;
    }
  }
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
var TOKEN_RE = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;
var MAX_GAP = 3;
function tokens(text) {
  var _a;
  return (_a = text.toLowerCase().replace(/[‘’]/g, "'").replace(/[‐‑]/g, "-").match(TOKEN_RE)) != null ? _a : [];
}
var isConsonant = (c) => /[b-df-hj-np-tv-z]/.test(c);
var ACCIDENTAL = /* @__PURE__ */ new Set(["she", "the", "her"]);
function wordForms(token2, side) {
  const w = token2.endsWith("'s") ? token2.slice(0, -2) : token2;
  const out = /* @__PURE__ */ new Set([token2, w]);
  const ends = (suf) => w.length > suf.length && w.endsWith(suf);
  const add2 = (form) => {
    if (!(side === "word" && ACCIDENTAL.has(form))) out.add(form);
  };
  const stem = (base, min2) => {
    if (base.length < min2) return;
    add2(base);
    const last2 = base[base.length - 1];
    if (last2 === base[base.length - 2] && isConsonant(last2)) add2(base.slice(0, -1));
  };
  const rebuilt = (base, min2) => {
    if (base.length >= min2) add2(base);
  };
  const min = side === "word" ? 4 : 3;
  if (ends("ies") || ends("ied")) rebuilt(w.slice(0, -3) + "y", 3);
  if (ends("s") && !ends("ss")) {
    const base = w.slice(0, -1);
    if (side === "word" && base.endsWith("e")) rebuilt(base, 3);
    else stem(base, min);
  }
  if (ends("es")) {
    const base = w.slice(0, -2);
    if (side === "selection") stem(base, min);
    else if (/(?:[sxzo]|ch|sh)$/.test(base)) rebuilt(base, 3);
  }
  if (ends("eed")) {
    rebuilt(w.slice(0, -1), 4);
  } else if (ends("ed")) {
    stem(w.slice(0, -2), min);
    rebuilt(w.slice(0, -1), 3);
  }
  if (ends("ing")) {
    stem(w.slice(0, -3), min);
    rebuilt(w.slice(0, -3) + "e", 3);
  }
  if (ends("ying")) rebuilt(w.slice(0, -4) + "ie", 3);
  if (side === "word") {
    if (ends("ier")) rebuilt(w.slice(0, -3) + "y", 4);
    if (ends("iest")) rebuilt(w.slice(0, -4) + "y", 4);
    return out;
  }
  if (ends("ier")) rebuilt(w.slice(0, -3) + "y", 4);
  if (ends("iest")) rebuilt(w.slice(0, -4) + "y", 4);
  if (ends("ily")) rebuilt(w.slice(0, -3) + "y", 4);
  for (const suf of ["er", "est", "r", "st", "ly", "y"]) {
    if (ends(suf)) stem(w.slice(0, -suf.length), 4);
  }
  return out;
}
function sameWord(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
function inOrder(want, have) {
  const from = (wi, si) => {
    if (wi === want.length) return true;
    const end = wi === 0 ? have.length : Math.min(have.length, si + MAX_GAP + 1);
    for (let i = si; i < end; i++) {
      if (sameWord(want[wi], have[i]) && from(wi + 1, i + 1)) return true;
    }
    return false;
  };
  return from(0, 0);
}
function selectionHasWord(selection, word) {
  const sel = selection.trim();
  if (!sel) return false;
  if (buildWordRe(word.trim()).test(sel)) return true;
  const wordToks = tokens(word);
  if (wordToks.length === 0) return true;
  const selToks = tokens(sel);
  const whole = wordToks.join(" ");
  if (selToks.length === 1 && selToks[0] === sel.toLowerCase()) {
    const s = selToks[0];
    if (s.length >= 4 && s.length * 2 > whole.length && whole.startsWith(s)) return true;
  }
  const parts = (toks, side) => toks.flatMap((t2) => t2.split("-")).filter(Boolean).map((t2) => wordForms(t2, side));
  if (inOrder(parts(wordToks, "word"), parts(selToks, "selection"))) return true;
  if (wordToks.length === 1) {
    const joined = wordForms(wordToks[0].replace(/-/g, ""), "word");
    return selToks.some((t2) => sameWord(joined, wordForms(t2.replace(/-/g, ""), "selection")));
  }
  return false;
}
function buildWordContext(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const e = input.entry;
  const sourceParagraph = (_b = (_a = input.sourceParagraph) == null ? void 0 : _a.trim()) != null ? _b : "";
  const selection = (_d = (_c = input.selection) == null ? void 0 : _c.trim()) != null ? _d : "";
  const example = (_f = (_e = e.example) == null ? void 0 : _e.trim()) != null ? _f : "";
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
      sourceTitle: (_g = input.sourceTitle) == null ? void 0 : _g.trim(),
      example,
      otherExamples: ((_h = input.otherExamples) != null ? _h : []).map((s) => `- ${s.trim()}`).join("\n")
    }),
    slots: {
      word: e.word,
      selection,
      question: (_j = (_i = input.question) == null ? void 0 : _i.trim()) != null ? _j : "",
      compareWith: (_l = (_k = input.compareWith) == null ? void 0 : _k.trim()) != null ? _l : "",
      hasSource: sourceParagraph || example ? "yes" : "",
      selectionMissesWord: selection && !selectionHasWord(selection, e.word) ? "yes" : "",
      sourceKind: sourceParagraph ? "\u6BB5\u843D" : example ? "\u53E5\u5B50" : ""
    }
  };
}

// src/services/ai/context/profile.ts
var PROFILE_TEMPLATE = `\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015
\u6211\u662F{{who}}\u7684\u82F1\u6587\u5B78\u7FD2\u8005\u3002\u8ACB\u7528{{language}}\u56DE\u7B54\uFF0C\u7C21\u660E\u627C\u8981{{#maxChars}}\uFF0C\u76E1\u91CF\u5728 {{maxChars}} \u5B57\u4EE5\u5167\u5B8C\u6210\u8AAA\u660E\uFF08\u82F1\u6587\u539F\u6587\u8207\u4F8B\u53E5\u4E0D\u8A08\u5165\u5B57\u6578\uFF09{{/maxChars}}\u3002
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
var HISTORY_DROP_ROUNDS = 3;
function dropLeadingNonUser(msgs) {
  let i = 0;
  while (i < msgs.length && msgs[i].role !== "user") i++;
  return msgs.slice(i);
}
function trimHistory(history, rounds = HISTORY_ROUNDS, dropRounds = HISTORY_DROP_ROUNDS) {
  const all = dropLeadingNonUser(
    history.filter((m) => m.content.trim() !== "").map((m) => ({ role: m.role, content: m.content }))
  );
  const over = all.length - rounds * 2;
  if (over <= 0) return all;
  const step = Math.max(1, dropRounds) * 2;
  return dropLeadingNonUser(all.slice(Math.ceil(over / step) * step));
}
function composeRequest(p) {
  var _a, _b;
  const system = [
    { text: p.base, cache: true },
    ...((_a = p.cached) != null ? _a : []).map((text) => ({ text, cache: true })),
    ...((_b = p.context) != null ? _b : []).filter(Boolean).map((text) => ({ text })),
    { text: renderProfile(p.profile) }
  ];
  const history = trimHistory(p.history);
  if (history.length) history[history.length - 1].cache = true;
  const req = {
    system,
    messages: [...history, { role: "user", content: p.user }],
    maxTokens: p.maxTokens,
    tier: p.tier
  };
  if (p.output) req.output = p.output;
  return req;
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
- \u8FFD\u554F\u6642\uFF08\u524D\u9762\u7684\u5C0D\u8A71\u5DF2\u7D93\u5BEB\u904E\u300C\u4F60\u554F\u7684\u662F\u300D\uFF09\uFF0C\u5982\u679C\u9019\u6B21\u554F\u7684\u9084\u662F\u540C\u4E00\u53E5\uFF0C\u5C31\u4E0D\u8981\u518D\u5BEB\u9019\u4E00\u884C\uFF0C\u76F4\u63A5\u56DE\u7B54\uFF1B\u63DB\u4E86\u53E5\u5B50\u624D\u91CD\u65B0\u5BEB\u3002
- \u771F\u7684\u7121\u6CD5\u5224\u65B7\u6642\uFF0C\u5217\u51FA\u6700\u53EF\u80FD\u7684\u4E00\u5230\u5169\u53E5\u8ACB\u4F7F\u7528\u8005\u78BA\u8A8D\uFF0C\u4E0D\u8981\u786C\u731C\u3002`;
var SELECTION_HEADER = `{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015
{{selection}}

{{/selection}}{{#selectionMissesWord}}\u3014\u6CE8\u610F\u3015\u4E0A\u9762\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u88E1\u4F3C\u4E4E\u6C92\u6709 {{word}}\u3002\u5982\u679C\u5B83\u5176\u5BE6\u542B\u6709 {{word}} \u7684\u8B8A\u5316\u5F62\uFF08\u4F8B\u5982\u4E0D\u898F\u5247\u7684\u904E\u53BB\u5F0F\u6216\u8907\u6578\uFF09\uFF0C\u5C31\u5FFD\u7565\u9019\u6BB5\u6CE8\u610F\uFF0C\u7167\u4E00\u822C\u898F\u5247\u4EE5\u9078\u53D6\u6240\u5728\u7684\u53E5\u5B50\u70BA\u6E96\u3002
\u5426\u5247\u4E0D\u8981\u7528\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u4F86\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\uFF0C\u56DE\u7B54\u7684\u7B2C\u4E00\u884C\u56FA\u5B9A\u5BEB\uFF1A\u4F60\u9078\u53D6\u7684\u6587\u5B57\u88E1\u4F3C\u4E4E\u6C92\u6709 {{word}}\uFF0C{{#sourceKind}}\u4EE5\u4E0B\u4EE5\u51FA\u8655{{sourceKind}}\u70BA\u6E96\u3002{{/sourceKind}}{{^sourceKind}}\u4EE5\u4E0B\u76F4\u63A5\u8AAA\u660E {{word}}\u3002{{/sourceKind}}
\u7A7A\u4E00\u884C\u5F8C\u518D\u56DE\u7B54{{#sourceKind}}\uFF0C\u7167\u300C\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\u300D\u7684\u5176\u4ED6\u7DDA\u7D22\uFF08\u554F\u984C\u88E1\u5F15\u7528\u7684\u82F1\u6587\u7247\u6BB5\uFF0C\u6216\u3014\u51FA\u8655{{sourceKind}}\u3015\u4E2D\u542B\u6709 {{word}} \u7684\u53E5\u5B50\uFF09\u6C7A\u5B9A\u662F\u54EA\u4E00\u53E5\uFF1B\u9700\u8981\u5BEB\u300C\u4F60\u554F\u7684\u662F\uFF1A\u2026\u300D\u90A3\u4E00\u884C\u6642\uFF0C\u653E\u5728\u9019\u53E5\u63D0\u9192\u4E4B\u5F8C{{/sourceKind}}\u3002

{{/selectionMissesWord}}`;
var WORD_TEMPLATES = {
  usage: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u7528\u6CD5\uFF08{{word}}\uFF09
\u8AAA\u660E {{word}} \u6700\u5E38\u898B\u7684 2 \u5230 3 \u7A2E\u7528\u6CD5\u6216\u642D\u914D\uFF08collocation\uFF09\uFF0C\u6BCF\u7A2E\u9644\u4E00\u500B\u7C21\u77ED\u4F8B\u53E5\u548C\u4E2D\u6587\u7FFB\u8B6F\u3002{{#hasSource}}\u5982\u679C\u3014\u51FA\u8655\u6BB5\u843D\u3015\u88E1\u7684\u7528\u6CD5\u5C6C\u65BC\u5176\u4E2D\u4E00\u7A2E\uFF0C\u6A19\u51FA\u4F86\u3002{{/hasSource}}`,
  compare: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u6BD4\u8F03\uFF08{{word}}{{#compareWith}} vs {{compareWith}}{{/compareWith}}\uFF09
{{^compareWith}}\u5148\u6311\u4E00\u5230\u5169\u500B\u5B78\u7FD2\u8005\u6700\u5BB9\u6613\u548C {{word}} \u6DF7\u6DC6\u7684\u8FD1\u7FA9\u5B57\u3002{{/compareWith}}\u5F9E\u610F\u601D\u3001\u8A9E\u6C23\u8207\u6B63\u5F0F\u7A0B\u5EA6\u3001\u5E38\u898B\u642D\u914D\u4E09\u65B9\u9762\u6BD4\u8F03\uFF0C\u5404\u9644\u4E00\u500B\u4F8B\u53E5\u3002{{#hasSource}}\u6700\u5F8C\u7528\u4E00\u5169\u53E5\u8AAA\u660E\u3014\u51FA\u8655\u6BB5\u843D\u3015\u70BA\u4EC0\u9EBC\u7528 {{word}}\u3002{{/hasSource}}`,
  sentence: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u9020\u53E5\uFF08{{word}}\uFF09
\u7528 {{word}} \u9020 3 \u500B\u53E5\u5B50\uFF0C\u96E3\u5EA6\u7B26\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF0C\u60C5\u5883\u76E1\u91CF\u8CBC\u8FD1\u5B78\u7FD2\u8005\u7684\u76EE\u6A19\u3002{{#hasSource}}\u5176\u4E2D\u4E00\u53E5\u6CBF\u7528\u3014\u51FA\u8655\u6BB5\u843D\u3015\u88E1\u7684\u610F\u601D\u3002{{/hasSource}}\u6BCF\u53E5\u9644\u4E2D\u6587\u7FFB\u8B6F\u3002`,
  mnemonic: `${SELECTION_HEADER}\u4EFB\u52D9\uFF1A\u8A18\u61B6\u6CD5\uFF08{{word}}\uFF09
\u7D66 {{word}} \u4E00\u5230\u5169\u500B\u597D\u8A18\u7684\u65B9\u6CD5\uFF08\u5B57\u6839\u5B57\u9996\u3001\u806F\u60F3\u3001\u62C6\u5B57\u64C7\u4E00\uFF09\u3002\u5B57\u6839\u6216\u5B57\u6E90\u4E0D\u78BA\u5B9A\u6642\u76F4\u63A5\u8AAA\u4E0D\u78BA\u5B9A\uFF0C\u6539\u7528\u806F\u60F3\u6CD5\uFF0C\u4E0D\u8981\u7DE8\u9020\u3002`,
  custom: `${SELECTION_HEADER}\u3014\u4F7F\u7528\u8005\u7684\u554F\u984C\u3015\uFF08\u95DC\u65BC {{word}}\uFF09
{{question}}

\u5982\u679C\u554F\u984C\u727D\u6D89\u539F\u6587\u88E1\u7684\u67D0\u4E00\u53E5\uFF0C\u4F9D\u300C\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\u300D\u7684\u898F\u5247\u6C7A\u5B9A\u7B2C\u4E00\u884C\u8981\u4E0D\u8981\u5BEB\u51FA\u90A3\u4E00\u53E5\uFF0C\u518D\u56DE\u7B54\u554F\u984C\u3002`
};
function wordTask(id, opts) {
  return {
    id: `word.${id}`,
    // v2: follow-ups skip a repeated 「你問的是」 line (規劃書 06 §6.4.1 #3).
    // v3: a selection that doesn't seem to contain the word (checked in code
    //     by wordContext.selectionHasWord) adds a 〔注意〕 block: first line
    //     reminds the learner (「你選取的文字裡似乎沒有 X，以下以出處段落／
    //     句子為準。」), then the source is used as before; the model ignores
    //     the notice if the selection holds an irregular form of the word.
    //     Unchanged output when the selection contains the word.
    version: 3,
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

// src/core/text/listItems.ts
var LIST_ITEM_SPLIT_CHARS = 120;
var LIST_TOTAL_SPLIT_CHARS = 480;
var LIST_MARKER_RE = /^\s*([-*+]|\d+[.)])\s/;
function indentOf(line) {
  return line.length - line.trimStart().length;
}
function stripLinkUrls(text) {
  return text.replace(/\]\([^)\n]*\)/g, "]");
}
function visibleLength(text) {
  return stripLinkUrls(text).length;
}
function splitListItems(lines4, absoluteStart) {
  const indent = indentOf(lines4[0]);
  const items = [];
  for (let i = 0; i < lines4.length; i++) {
    const startsItem = indentOf(lines4[i]) <= indent && LIST_MARKER_RE.test(lines4[i]);
    if (startsItem || !items.length) items.push({ start: i, end: i });
    else items[items.length - 1].end = i;
  }
  return items.map((it) => ({
    lineStart: absoluteStart + it.start,
    lineEnd: absoluteStart + it.end,
    text: lines4.slice(it.start, it.end + 1).join("\n")
  }));
}
function shouldSplitList(lines4) {
  const items = splitListItems(lines4, 0);
  if (items.some((it) => visibleLength(it.text) >= LIST_ITEM_SPLIT_CHARS)) return true;
  return visibleLength(lines4.join("\n")) >= LIST_TOTAL_SPLIT_CHARS;
}
function listItemOwnEndIndex(lines4) {
  const indent = indentOf(lines4[0]);
  for (let i = 1; i < lines4.length; i++) {
    if (indentOf(lines4[i]) > indent && LIST_MARKER_RE.test(lines4[i])) return i - 1;
  }
  return lines4.length - 1;
}

// src/core/text/paragraphs.ts
var HEADING_RE = /^#{1,6}(\s|$)/;
var FENCE_RE = /^\s*(`{3,}|~{3,})/;
function splitParagraphSpans(markdown) {
  const lines4 = markdown.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  if (lines4[0] === "---") {
    const close = lines4.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }
  const out = [];
  let start = -1;
  const flush = (end) => {
    if (start < 0) return;
    const block = lines4.slice(start, end + 1);
    if (LIST_MARKER_RE.test(block[0]) && shouldSplitList(block)) {
      for (const item of splitListItems(block, start)) out.push(item);
    } else {
      out.push({ text: block.join("\n"), lineStart: start, lineEnd: end });
    }
    start = -1;
  };
  for (; i < lines4.length; i++) {
    const line = lines4[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flush(i - 1);
      const marker = fence[1];
      let end = i + 1;
      while (end < lines4.length && !lines4[end].trimStart().startsWith(marker)) end++;
      end = Math.min(end, lines4.length - 1);
      out.push({ text: lines4.slice(i, end + 1).join("\n"), lineStart: i, lineEnd: end });
      i = end;
      continue;
    }
    if (line.trim() === "") {
      flush(i - 1);
      continue;
    }
    if (HEADING_RE.test(line)) {
      flush(i - 1);
      out.push({ text: line, lineStart: i, lineEnd: i });
      continue;
    }
    if (start < 0) start = i;
  }
  flush(lines4.length - 1);
  return out;
}
function paragraphAtLine(markdown, line) {
  const spans = splitParagraphSpans(markdown);
  const index = spans.findIndex((p) => line >= p.lineStart && line <= p.lineEnd);
  return index < 0 ? null : { index, text: spans[index].text };
}
function plainParagraph(text) {
  return text.replace(/==([^=\n]+)==/g, "$1").replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").trim();
}

// src/services/threads/wordInput.ts
function basename(path) {
  var _a;
  return ((_a = path.split("/").pop()) != null ? _a : path).replace(/\.md$/i, "");
}
async function findWordSource(entry, notes) {
  const src = entry.source;
  if (!(src == null ? void 0 : src.path)) return null;
  let content;
  try {
    content = await notes.read(src.path);
  } catch (e) {
    return null;
  }
  if (content === null) return null;
  const hit = paragraphAtLine(content, src.line);
  if (!hit) return null;
  return { title: basename(src.path), paragraphNumber: hit.index + 1, paragraph: plainParagraph(hit.text) };
}
function wordInput(entry, source, extra = {}) {
  return {
    entry,
    sourceParagraph: source == null ? void 0 : source.paragraph,
    sourceTitle: source == null ? void 0 : source.title,
    ...extra
  };
}

// src/ui/chat/ChatPanel.ts
var import_obsidian8 = require("obsidian");

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
var SECRET_PATTERNS = [
  // Anthropic / OpenAI style: sk-ant-…, sk-proj-…, sk-…
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]"],
  // Google API keys (Gemini)
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]"],
  [/\b(Bearer|x-api-key:?)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"]
];
function redactSecrets(text, extra = []) {
  let out = text;
  for (const secret of extra) if (secret && secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out;
}
function formatAiRequest(req) {
  const parts = [];
  req.system.forEach((b, i) => parts.push(`[system${req.system.length > 1 ? ` ${i + 1}` : ""}]
${b.text}`));
  for (const m of req.messages) parts.push(`[${m.role}]
${m.content}`);
  const meta = [req.tier && `tier: ${req.tier}`, req.maxTokens && `max_tokens: ${req.maxTokens}`, req.output && `schema: ${req.output.name}`].filter(Boolean).join(" \xB7 ");
  if (meta) parts.push(`[request]
${meta}`);
  return redactSecrets(parts.join("\n\n"));
}
function withDebug(e, info) {
  var _a;
  if (!isAiError(e) || e.code !== "bad_output" || e.extra.debug) return e;
  const d = info();
  if (d) e.extra.debug = { ...d, prompt: redactSecrets(d.prompt), output: redactSecrets(d.output), reason: (_a = d.reason) != null ? _a : e.message };
  return e;
}
function aiDebugOf(e) {
  return isAiError(e) ? e.extra.debug : void 0;
}
function aiDebugReport(d, labels) {
  const head = [d.taskId && `task: ${d.taskId}`, d.model && `model: ${d.model}`, d.stop && `stop: ${d.stop}`, d.reason && `error: ${d.reason}`].filter(Boolean).join("\n");
  return [head, `===== ${labels.prompt} =====`, d.prompt || labels.empty, `===== ${labels.output} =====`, d.output || labels.empty].filter(Boolean).join("\n\n");
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

// src/ui/kit/emptyState.ts
var import_obsidian5 = require("obsidian");
function emptyState(opts) {
  const el = createDiv({ cls: "vt-empty" });
  if (opts.icon) (0, import_obsidian5.setIcon)(el.createSpan({ cls: "vt-empty-icon" }), opts.icon);
  el.createDiv({ cls: "vt-empty-title", text: opts.title });
  if (opts.body) el.createDiv({ cls: "vt-empty-body", text: opts.body });
  if (opts.action) {
    const { action } = opts;
    const btn = el.createDiv({ cls: "vt-empty-action" }).createEl("button", { cls: "mod-cta vt-btn" });
    if (action.icon) (0, import_obsidian5.setIcon)(btn.createSpan({ cls: "vt-btn-icon" }), action.icon);
    btn.createSpan({ text: action.label });
    btn.addEventListener("click", action.onClick);
  }
  return el;
}

// src/ui/kit/inlineNote.ts
var import_obsidian6 = require("obsidian");
var TONE_ICON = {
  info: "info",
  offline: "wifi-off",
  error: "alert-circle"
};
function inlineNote(opts) {
  var _a, _b;
  const tone = (_a = opts.tone) != null ? _a : "info";
  const el = createDiv({ cls: `vt-note is-${tone}` });
  (0, import_obsidian6.setIcon)(el.createSpan({ cls: "vt-note-icon" }), (_b = opts.icon) != null ? _b : TONE_ICON[tone]);
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
function renderAiGate(parent, status, opts) {
  if (status === "ready") return false;
  if (status === "offline") {
    parent.appendChild(inlineNote({ tone: "offline", text: t("ai.gate.offline") }));
    return true;
  }
  const disabled = status === "disabled";
  parent.appendChild(
    emptyState({
      icon: disabled ? "sparkles" : "key-round",
      title: t(disabled ? "ai.gate.disabled.title" : "ai.gate.noKey.title"),
      body: t(disabled ? "ai.gate.disabled.body" : "ai.gate.noKey.body"),
      action: { label: t("ai.action.openSettings"), icon: "settings", onClick: opts.onOpenSettings }
    })
  );
  return true;
}

// src/ui/kit/bubble.ts
var import_obsidian7 = require("obsidian");
function bubble(opts) {
  var _a;
  const el = createDiv({ cls: `vt-bubble is-${opts.role}` });
  el.toggleClass("is-streaming", !!opts.streaming);
  const body = el.createDiv({ cls: "vt-bubble-body" });
  if (opts.render && opts.role === "assistant") opts.render(body, opts.text);
  else body.setText(opts.text);
  if (opts.streaming) el.createSpan({ cls: "vt-cursor" });
  if (opts.error) el.createDiv({ cls: "vt-bubble-error", text: opts.error });
  if ((_a = opts.actions) == null ? void 0 : _a.length) {
    const bar = el.createDiv({ cls: "vt-bubble-actions" });
    for (const a of opts.actions) {
      const btn = bar.createEl("button", { cls: "vt-bubble-action clickable-icon" });
      if (a.icon) (0, import_obsidian7.setIcon)(btn.createSpan(), a.icon);
      if (a.iconOnly && a.icon) btn.setAttr("aria-label", a.label);
      else btn.createSpan({ text: a.label });
      btn.toggleClass("is-active", !!a.active);
      btn.toggleClass("is-icon-only", !!a.iconOnly && !!a.icon);
      if (a.active !== void 0) btn.setAttr("aria-pressed", String(a.active));
      btn.addEventListener("click", a.onClick);
    }
  }
  return el;
}

// src/ui/chat/ChatPanel.ts
function createChatUiState() {
  return { drafts: /* @__PURE__ */ new Map(), focused: null };
}
function shortDate(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
var ChatPanel = class extends import_obsidian8.Component {
  constructor(parent, opts) {
    super();
    this.opts = opts;
    this.selectionEl = null;
    this.input = null;
    this.sendBtn = null;
    this.quickBtns = [];
    // Turn-list markdown lives in its own child component, reset on every
    // re-render so old render children don't pile up.
    this.turnsScope = null;
    this.streamScope = null;
    this.streamBody = null;
    this.streamTurnId = null;
    this.streamText = "";
    this.frame = null;
    this.paintSeq = 0;
    this.scrollOnNextRender = false;
    this.alive = false;
    this.root = parent.createDiv({ cls: "vt-chat" });
  }
  onload() {
    var _a;
    const { threads, threadId } = this.opts;
    this.alive = true;
    this.register(() => this.alive = false);
    this.metaEl = this.root.createDiv({ cls: "vt-chat-meta" });
    this.turnsEl = this.root.createDiv({ cls: "vt-chat-turns" });
    this.renderControls();
    this.renderTurns();
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.id === threadId) this.renderTurns();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.renderTurns()));
    this.register(
      threads.events.on("thread:turn-delta", (d) => {
        if (d.threadId !== threadId) return;
        if (d.turnId !== this.streamTurnId) return this.renderTurns();
        this.streamText = d.text;
        this.schedulePaint();
      })
    );
    this.register(
      threads.events.on("thread:retry-wait", (d) => {
        if (d.threadId === threadId && d.turnId === this.streamTurnId && !this.streamText && this.streamBody) {
          this.streamBody.setText(t("chat.retryWait", { seconds: Math.ceil(d.delayMs / 1e3) }));
        }
      })
    );
    this.register(this.opts.selection.events.on("change", () => this.renderSelection()));
    this.register(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    });
    void threads.ensureLoaded().then(() => {
      if (this.alive) this.renderTurns();
    });
    void ((_a = this.opts.origin) == null ? void 0 : _a.then((text) => {
      this.originText = text;
      if (this.alive) this.renderMeta(threads.get(threadId));
    }));
  }
  get thread() {
    return this.opts.threads.get(this.opts.threadId);
  }
  get busy() {
    return this.opts.threads.isBusy(this.opts.threadId);
  }
  // ── Meta line: 「比較 · 10/02 · 出自 ¶12」 ─────────────────────────
  renderMeta(thread) {
    var _a;
    this.metaEl.empty();
    const turns = liveTurns(thread);
    if (!turns.length) return;
    const parts = [];
    const labels = /* @__PURE__ */ new Set();
    for (const turn of turns) {
      const label = turn.role === "user" && turn.taskId ? (_a = this.opts.ai.tasks.get(turn.taskId)) == null ? void 0 : _a.label : void 0;
      if (label) labels.add(t(label));
    }
    parts.push(...labels);
    parts.push(shortDate(turns[turns.length - 1].at));
    if (this.originText) parts.push(this.originText);
    (0, import_obsidian8.setIcon)(this.metaEl.createSpan({ cls: "vt-chat-meta-icon" }), "sparkles");
    this.metaEl.createSpan({ text: parts.join(" \xB7 ") });
  }
  // ── Turns ────────────────────────────────────────────────────────
  // Redraws the turns when something outside the thread changed what
  // turnActions / turnHeader return (e.g. a trivia favorite). The composer
  // and its draft are left alone.
  refresh() {
    this.renderTurns();
  }
  renderTurns() {
    var _a;
    const thread = this.thread;
    this.renderMeta(thread);
    if (this.turnsScope) this.removeChild(this.turnsScope);
    this.turnsScope = this.addChild(new import_obsidian8.Component());
    this.streamBody = null;
    this.streamTurnId = null;
    this.turnsEl.empty();
    const turns = liveTurns(thread);
    if (!turns.length) {
      this.turnsEl.createDiv({ cls: "vt-chat-empty", text: t("chat.empty") });
    }
    for (const turn of turns) {
      this.turnsEl.appendChild(turn.role === "user" ? this.userBubble(turn) : this.answerBubble(turn));
    }
    this.updateBusy();
    if (this.scrollOnNextRender) {
      this.scrollOnNextRender = false;
      ((_a = this.input) != null ? _a : this.turnsEl).scrollIntoView({ block: "nearest" });
    }
  }
  userBubble(turn) {
    const el = bubble({ role: "user", text: turn.content });
    if (turn.selection) {
      const quote = createDiv({ cls: "vt-bubble-quote", text: turn.selection });
      quote.setAttr("aria-label", turn.selection);
      el.prepend(quote);
    }
    return el;
  }
  answerBubble(turn) {
    var _a, _b, _c, _d, _e;
    const scope = this.turnsScope;
    const render = (el2, md) => void import_obsidian8.MarkdownRenderer.render(this.opts.app, md, el2, this.opts.sourcePath, scope);
    if (turn.status === "streaming") {
      this.streamTurnId = turn.id;
      this.streamText = (_a = this.opts.threads.streamingText(turn.id)) != null ? _a : "";
      const el2 = bubble({ role: "assistant", text: "", streaming: true });
      this.streamBody = el2.querySelector(".vt-bubble-body");
      this.paint();
      return this.withHeader(el2, turn);
    }
    const actions = [];
    if (turn.status === "error") {
      actions.push({ label: t("ai.action.retry"), icon: "rotate-ccw", onClick: () => this.run(() => this.opts.retry(turn.id)) });
    }
    if (turn.content.trim()) {
      if (turn.status === "done") actions.push(...(_d = (_c = (_b = this.opts).turnActions) == null ? void 0 : _c.call(_b, turn)) != null ? _d : []);
      actions.push({ label: t("chat.action.copy"), icon: "copy", onClick: () => this.copy(turn.content) });
    }
    let error;
    if (turn.status === "error") {
      error = aiErrorText(new AiError((_e = turn.error) != null ? _e : "network", turn.errorMessage));
    } else if (turn.status === "aborted") {
      error = t("ai.error.aborted");
    } else if (turn.stop === "max_tokens") {
      error = t("chat.truncated");
    }
    const el = bubble({ role: "assistant", text: turn.content, render, actions, error });
    el.toggleClass("is-muted-error", turn.status === "aborted");
    if (!turn.content.trim()) el.addClass("is-empty");
    return this.withHeader(el, turn);
  }
  withHeader(el, turn) {
    var _a, _b;
    const h = (_b = (_a = this.opts).turnHeader) == null ? void 0 : _b.call(_a, turn);
    if (!h) return el;
    const head = createDiv({ cls: "vt-bubble-head" });
    if (h.icon) (0, import_obsidian8.setIcon)(head.createSpan({ cls: "vt-bubble-head-icon" }), h.icon);
    head.createSpan({ text: h.text });
    el.prepend(head);
    return el;
  }
  schedulePaint() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }
  // Repaints the streaming bubble's body with the markdown so far. Rendered
  // off-DOM first and swapped in, so the bubble never flashes empty; a
  // sequence number drops renders that finish out of order.
  paint() {
    const body = this.streamBody;
    if (!body) return;
    if (!this.streamText) {
      body.setText(t("ai.bubble.streaming"));
      body.addClass("vt-chat-waiting");
      return;
    }
    body.removeClass("vt-chat-waiting");
    const seq = ++this.paintSeq;
    if (this.streamScope) this.removeChild(this.streamScope);
    const scope = this.streamScope = this.addChild(new import_obsidian8.Component());
    const tmp = createDiv();
    void import_obsidian8.MarkdownRenderer.render(this.opts.app, this.streamText, tmp, this.opts.sourcePath, scope).then(() => {
      if (seq !== this.paintSeq || this.streamBody !== body) return;
      body.replaceChildren(...Array.from(tmp.childNodes));
    });
  }
  // ── Controls: gate, quick actions, selection chip, composer ──────
  renderControls() {
    var _a;
    const status = this.opts.ai.status();
    const controls = this.root.createDiv({ cls: "vt-chat-controls" });
    if (renderAiGate(controls, status, { onOpenSettings: this.opts.onOpenSettings }) && status !== "offline") return;
    const offline = status === "offline";
    const quick = controls.createDiv({ cls: "vt-chat-quick" });
    for (const task of this.opts.ai.tasks.forSurface(this.opts.surface)) {
      if (!task.label) continue;
      const btn2 = quick.createEl("button", { cls: "vt-chip", text: t(task.label) });
      btn2.disabled = offline;
      btn2.addEventListener("click", () => this.submit(task.id, ""));
      this.quickBtns.push(btn2);
    }
    this.selectionEl = controls.createDiv({ cls: "vt-chat-selection" });
    this.renderSelection();
    const composer = controls.createDiv({ cls: "vt-chat-composer" });
    const input = this.input = composer.createEl("textarea", { cls: "vt-chat-input" });
    input.rows = 1;
    input.setAttr("enterkeyhint", "send");
    input.placeholder = this.opts.placeholder;
    input.disabled = offline;
    const key3 = this.opts.threadId;
    input.value = (_a = this.opts.state.drafts.get(key3)) != null ? _a : "";
    autoGrow(input);
    input.addEventListener("input", () => {
      this.opts.state.drafts.set(key3, input.value);
      autoGrow(input);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (!this.busy) this.submit(this.opts.customTaskId, input.value);
    });
    input.addEventListener("focus", () => this.opts.state.focused = key3);
    input.addEventListener("blur", () => {
      if (input.isConnected) this.opts.state.focused = null;
    });
    const btn = this.sendBtn = composer.createEl("button", { cls: "vt-chat-send clickable-icon" });
    btn.disabled = offline;
    btn.addEventListener("click", () => {
      if (this.busy) this.opts.threads.stop(this.opts.threadId);
      else this.submit(this.opts.customTaskId, input.value);
    });
    if (this.opts.state.focused === key3 && !offline) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  renderSelection() {
    const el = this.selectionEl;
    if (!el) return;
    el.empty();
    const sel = this.opts.selection.get();
    el.toggle(!!sel);
    if (!sel) return;
    el.setAttr("aria-label", t("chat.selection.hint"));
    (0, import_obsidian8.setIcon)(el.createSpan({ cls: "vt-chat-selection-icon" }), "text-cursor");
    el.createSpan({ cls: "vt-chat-selection-text", text: t("chat.selection", { text: sel.text }) });
    const remove = el.createSpan({ cls: "vt-chat-selection-remove clickable-icon" });
    (0, import_obsidian8.setIcon)(remove, "x");
    remove.setAttr("aria-label", t("chat.selection.remove"));
    remove.addEventListener("click", () => this.opts.selection.clear());
  }
  updateBusy() {
    const busy = this.busy;
    for (const b of this.quickBtns) b.disabled = busy || this.opts.ai.status() === "offline";
    const btn = this.sendBtn;
    if (!btn) return;
    btn.empty();
    (0, import_obsidian8.setIcon)(btn, busy ? "square" : "arrow-up");
    btn.setAttr("aria-label", t(busy ? "chat.stop" : "chat.send"));
    btn.toggleClass("is-stop", busy);
  }
  submit(taskId, text) {
    var _a;
    const question = text.trim();
    if (taskId === this.opts.customTaskId && !question) return;
    if (this.busy) return;
    const selection = (_a = this.opts.selection.get()) == null ? void 0 : _a.text;
    if (question && this.input) {
      this.input.value = "";
      autoGrow(this.input);
      this.opts.state.drafts.delete(this.opts.threadId);
    }
    if (selection) this.opts.selection.clear();
    this.scrollOnNextRender = true;
    this.run(() => this.opts.send({ taskId, question: question || void 0, selection }));
  }
  run(fn) {
    fn().catch((e) => {
      console.error("Vocab Tracker: AI request failed", e);
      new import_obsidian8.Notice(e instanceof Error ? e.message : String(e));
    });
  }
  copy(text) {
    void navigator.clipboard.writeText(text).then(
      () => new import_obsidian8.Notice(t("chat.copied")),
      (e) => console.error("Vocab Tracker: copy failed", e)
    );
  }
};

// src/ui/kit/openSettings.ts
function openPluginSettings(app, pluginId) {
  var _a, _b;
  const setting = app.setting;
  (_a = setting == null ? void 0 : setting.open) == null ? void 0 : _a.call(setting);
  (_b = setting == null ? void 0 : setting.openTabById) == null ? void 0 : _b.call(setting, pluginId);
}

// src/ui/word/AiTab.ts
function renderWordAiTab(plugin, container, entry, ui) {
  var _a, _b;
  const pinAction = (turn) => {
    const pinned = !!turn.pinnedToGrammar;
    return [
      {
        label: t(pinned ? "chat.action.unpin" : "chat.action.pin"),
        icon: pinned ? "pin-off" : "pin",
        onClick: () => void plugin.threads.setPinned(entry, turn.id, !pinned)
      }
    ];
  };
  ui.component.addChild(
    new ChatPanel(container, {
      app: plugin.app,
      threads: plugin.threads,
      ai: plugin.ai,
      selection: plugin.selection,
      threadId: wordThreadId(entry.id),
      surface: "word",
      customTaskId: wordCustom.id,
      sourcePath: (_b = (_a = entry.source) == null ? void 0 : _a.path) != null ? _b : "",
      placeholder: t("chat.placeholder.word", { word: entry.word }),
      state: ui.chat,
      send: (req) => plugin.threads.askWord(entry, req),
      retry: (turnId) => plugin.threads.retryWord(entry, turnId),
      turnActions: pinAction,
      origin: findWordSource(entry, plugin.notes).then(
        (s) => s ? t("chat.meta.origin", { n: s.paragraphNumber }) : void 0
      ),
      onOpenSettings: () => openPluginSettings(plugin.app, plugin.manifest.id)
    })
  );
}

// src/core/model/family.ts
function familyOrigin(familyId) {
  return `family:${familyId}`;
}
function originFamilyId(origin) {
  if (!(origin == null ? void 0 : origin.startsWith("family:"))) return null;
  const id = origin.slice("family:".length).trim();
  return id || null;
}
function familyScope(f) {
  var _a;
  if (f.scope === "list" || f.scope === "word") return f.scope;
  if (f.source === "manual") return "word";
  return ((_a = f.seedEntryIds) == null ? void 0 : _a.length) ? "word" : "list";
}
function familyMembers(f) {
  return f.groups.flatMap((g) => g.members);
}

// src/ui/word/wordOrder.ts
var LOCAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function stampMs2(s) {
  var _a, _b, _c;
  if (!s) return NaN;
  const m = LOCAL_STAMP.exec(s.trim());
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +((_a = m[4]) != null ? _a : 0), +((_b = m[5]) != null ? _b : 0), +((_c = m[6]) != null ? _c : 0)).getTime();
  }
  return ISO.test(s) ? Date.parse(s) : NaN;
}
function firstMs(...values) {
  for (const v of values) {
    const ms5 = stampMs2(v);
    if (!Number.isNaN(ms5)) return ms5;
  }
  return 0;
}
function entryRecency(e) {
  return firstMs(e.updatedAt, e.createdAt, e.added);
}
function entryAddedMs(e) {
  return firstMs(e.createdAt, e.added);
}
function sortByRecent(entries) {
  return entries.map((entry, i) => ({ entry, i, r: entryRecency(entry), a: entryAddedMs(entry) })).sort((x, y) => y.r - x.r || y.a - x.a || x.i - y.i).map((x) => x.entry);
}
function groupOf(e) {
  var _a;
  const path = (_a = e.source) == null ? void 0 : _a.path;
  if (path) return { key: `note:${path}`, kind: "note", path };
  const origin = e.origin;
  const familyId = originFamilyId(origin);
  if (familyId) return { key: familyOrigin(familyId), kind: "family", familyId };
  if (origin === "wordlist") return { key: "wordlist", kind: "wordlist" };
  return { key: "none", kind: "none" };
}
function groupEntries(entries, order, titleOf = (g) => g.key) {
  const byKey = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const ref = groupOf(entry);
    let g = byKey.get(ref.key);
    if (!g) {
      g = { ...ref, entries: [], latest: 0 };
      byKey.set(ref.key, g);
    }
    g.entries.push(entry);
    g.latest = Math.max(g.latest, entryRecency(entry));
  }
  const groups = [...byKey.values()];
  if (order === "recent") {
    for (const g of groups) g.entries = sortByRecent(g.entries);
    return groups.sort((a, b) => b.latest - a.latest || a.key.localeCompare(b.key));
  }
  return groups.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
}
function noteTitle(path) {
  return path.split("/").pop().replace(/\.md$/, "");
}
function displayStamp(s) {
  const ms5 = stampMs2(s);
  if (Number.isNaN(ms5)) return s != null ? s : "";
  return nowStamp(new Date(ms5));
}
function displayDate(s) {
  const ms5 = stampMs2(s);
  if (Number.isNaN(ms5)) return s != null ? s : "";
  return nowStamp(new Date(ms5)).slice(0, 10);
}
function entryDates(e) {
  return { added: e.added || e.createdAt || "", updated: e.updatedAt || "" };
}

// src/ui/word/WordRow.ts
function autoGrowTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
function renderVocabRow(plugin, container, entry, state, setState, refresh, opts = {}) {
  var _a;
  const sheet = opts.variant === "sheet";
  if (sheet && state === "collapsed") state = "half";
  const row = container.createEl("div", { cls: "vt-row" });
  row.setAttr("data-entry-id", entry.id);
  row.toggleClass("vt-sheet-card", sheet);
  const due = plugin.srs.nextDue(entry);
  row.toggleClass("is-expanded", state !== "collapsed");
  const remove = async () => {
    var _a2;
    const deleted = await plugin.confirmDeleteEntry(entry);
    if (!deleted) return;
    (_a2 = opts.onDeleted) == null ? void 0 : _a2.call(opts, entry);
    refresh();
  };
  const head = row.createEl("div", { cls: "vt-row-header" });
  if (!sheet) {
    const del = head.createEl("span", { cls: "vt-row-delete" });
    (0, import_obsidian9.setIcon)(del, "x");
    del.setAttr("aria-label", t("row.delete"));
    del.onclick = async (e) => {
      e.stopPropagation();
      await remove();
    };
  }
  const wordWrap = head.createEl("span", { cls: "vt-row-wordwrap" });
  wordWrap.createEl("span", { text: entry.word, cls: "vt-row-word" });
  for (const tag of entry.level.split(",").map((t2) => t2.trim()).filter(Boolean)) {
    wordWrap.createEl("span", { text: tag, cls: "vt-row-badge" });
  }
  (_a = opts.decorateWord) == null ? void 0 : _a.call(opts, wordWrap, entry);
  head.createEl("span", { cls: "vt-row-spacer" });
  if (opts.showDue && due) {
    const label = dueLabel(due, /* @__PURE__ */ new Date());
    const chip2 = head.createEl("span", { cls: "vt-row-due" });
    chip2.toggleClass("is-today", label.kind === "today");
    (0, import_obsidian9.setIcon)(chip2.createSpan({ cls: "vt-row-due-icon" }), "calendar");
    chip2.createSpan({ text: label.kind === "today" ? t("row.due.today") : label.text });
    chip2.setAttr("aria-label", t("row.nextReview", { date: due.toLocaleString() }));
  }
  const headSpeak = () => {
    const speak = head.createEl("span", {
      cls: ["vt-speak-icon", "vt-row-speak"]
    });
    (0, import_obsidian9.setIcon)(speak, "volume-2");
    speak.setAttr("aria-label", t("row.pronounce"));
    speak.setAttr("role", "button");
    bindPronounceButton(speak, entry, { stopPropagation: true });
  };
  if (sheet) {
    headSpeak();
  } else {
    const arrow = head.createEl("span", { cls: "vt-row-arrow" });
    (0, import_obsidian9.setIcon)(arrow, state === "collapsed" ? "chevron-up" : "chevron-down");
    arrow.setAttr("aria-label", state === "collapsed" ? t("row.expand") : t("row.collapse"));
    head.onclick = () => {
      setState(state === "collapsed" ? "half" : "collapsed");
      refresh();
    };
  }
  if (state === "collapsed") {
    headSpeak();
    return;
  }
  const body = row.createEl("div", { cls: "vt-row-body" });
  const subText = body.createEl("div", { cls: "vt-row-subtext" });
  subText.textContent = [entry.phonetic, entry.partOfSpeech].filter(Boolean).join("  \xB7  ") || entry.word;
  if (opts.ui) {
    const tab = renderTabs(plugin, body, entry, opts.ui, refresh);
    if (tab === "ai") {
      renderWordAiTab(plugin, body, entry, opts.ui);
      renderWordPageButton(body, entry, opts);
      return;
    }
  }
  const commitField = async (key3, value) => {
    entry[key3] = value;
    await plugin.store.touch(entry);
    refresh();
  };
  const mkField = (label, key3, opts2 = {}) => {
    var _a2;
    const value = (_a2 = entry[key3]) != null ? _a2 : "";
    const wrap = body.createEl("div", { cls: "vt-field" });
    if (value) wrap.addClass("is-filled");
    const cls = ["vt-input", "vt-field-box"];
    if (opts2.multiline) cls.push("vt-textarea");
    if (opts2.multiline) {
      const inp = wrap.createEl("textarea", { cls });
      inp.rows = 1;
      inp.value = value;
      inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
      inp.onclick = (e) => e.stopPropagation();
      autoGrowTextarea(inp);
      inp.addEventListener("input", () => autoGrowTextarea(inp));
      inp.onchange = () => commitField(key3, inp.value);
    } else {
      const inp = wrap.createEl("input", { cls });
      inp.type = "text";
      inp.value = value;
      inp.placeholder = t("row.field.placeholder", { label: label.toLowerCase() });
      inp.onclick = (e) => e.stopPropagation();
      inp.onchange = () => commitField(key3, inp.value);
    }
  };
  mkField(t("row.field.synonyms"), "synonyms", { multiline: true });
  mkField(t("row.field.definition"), "definition", { multiline: true });
  mkField(t("row.field.definitionZh"), "definitionZh", { multiline: true });
  if (state === "full") {
    if (entry.antonyms) mkField(t("row.field.antonyms"), "antonyms");
    mkField(t("row.field.example"), "example", { multiline: true });
    mkField(t("row.field.grammar"), "grammar", { multiline: true });
    if (entry.source && entry.source.path) {
      const src = body.createEl("div", { cls: "vt-row-source-link" });
      const name = entry.source.path.split("/").pop();
      src.textContent = `\u{1F4CD} ${name} : line ${entry.source.line + 1}`;
      src.setAttr("aria-label", t("row.jumpToSource"));
      src.onclick = async (e) => {
        var _a2;
        e.stopPropagation();
        await plugin.jumpToSource(entry);
        (_a2 = opts.onJump) == null ? void 0 : _a2.call(opts, entry);
      };
    }
    const dates = entryDates(entry);
    body.createEl("div", { text: t("row.meta.added", { date: displayStamp(dates.added) }), cls: "vt-meta" });
    if (dates.updated) {
      body.createEl("div", { text: t("row.meta.updated", { date: displayStamp(dates.updated) }), cls: ["vt-meta", "vt-row-updated"] });
    }
    body.createEl("div", {
      text: t("row.meta.reviewed", { date: entry.lastReviewed, count: entry.reviews }),
      cls: "vt-meta"
    });
    if (due) {
      body.createEl("div", {
        text: t("row.nextReview", { date: due.toLocaleString() }),
        cls: "vt-meta"
      });
    }
    mkField(t("row.field.level"), "level", { multiline: true });
  }
  if (state === "half") renderDatesLine(body, entry);
  const footer = body.createEl("div", { cls: "vt-row-footer" });
  const footerBtn = (parent, icon, label) => {
    const btn = parent.createEl("span", { cls: "vt-row-footer-icon" });
    (0, import_obsidian9.setIcon)(btn, icon);
    btn.setAttr("aria-label", label);
    btn.setAttr("role", "button");
    return btn;
  };
  const moreBtn = footerBtn(footer, state === "full" ? "chevron-down" : "info", state === "full" ? t("row.showLess") : t("row.showMore"));
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    setState(state === "full" ? "half" : "full");
    refresh();
  };
  const actions = footer.createEl("span", { cls: "vt-row-footer-actions" });
  const fetchBtn = footerBtn(actions, "refresh-cw", t("row.fetch"));
  fetchBtn.onclick = async (e) => {
    e.stopPropagation();
    fetchBtn.textContent = "\u2026";
    await plugin.enrichEntry(entry, { verbose: true });
    refresh();
  };
  const reviewBtn = footerBtn(actions, "check", t("row.markReviewed"));
  reviewBtn.onclick = async (e) => {
    e.stopPropagation();
    await plugin.srs.rate(entry, Rating.Good, "manual");
    refresh();
  };
  if (sheet) {
    const del = footerBtn(actions, "trash-2", t("row.delete"));
    del.addClass("vt-sheet-delete");
    del.onclick = async (e) => {
      e.stopPropagation();
      await remove();
    };
  } else {
    const speak = actions.createEl("span", { cls: "vt-speak-icon" });
    (0, import_obsidian9.setIcon)(speak, "volume-2");
    speak.setAttr("aria-label", t("row.pronounce"));
    speak.setAttr("role", "button");
    bindPronounceButton(speak, entry, { stopPropagation: true });
  }
  renderWordPageButton(body, entry, opts);
}
function renderDatesLine(body, entry) {
  const { added, updated } = entryDates(entry);
  if (!added && !updated) return;
  const text = updated ? t("row.meta.dates", { added: displayDate(added) || "\u2014", updated: displayDate(updated) }) : t("row.meta.addedOnly", { added: displayDate(added) });
  const el = body.createEl("div", { text, cls: ["vt-meta", "vt-row-dates"] });
  el.setAttr(
    "aria-label",
    [t("row.meta.added", { date: displayStamp(added) }), updated ? t("row.meta.updated", { date: displayStamp(updated) }) : ""].filter(Boolean).join("\n")
  );
}
function renderWordPageButton(body, entry, opts) {
  const open = opts.openWordPage;
  if (!open) return;
  const btn = body.createEl("button", { cls: "vt-word-page-btn" });
  (0, import_obsidian9.setIcon)(btn.createSpan({ cls: "vt-word-page-btn-icon" }), "external-link");
  btn.createSpan({ text: t("word.openPage") });
  btn.setAttr("aria-label", t("word.openPageTitle"));
  btn.onclick = (e) => {
    e.stopPropagation();
    open(entry);
  };
}
function renderTabs(plugin, body, entry, ui, refresh) {
  var _a;
  const current = (_a = ui.tabs.get(entry.id)) != null ? _a : "data";
  const bar = body.createDiv({ cls: "vt-tabs" });
  const mkTab = (tab, label, icon) => {
    const el = bar.createEl("button", { cls: "vt-tab" });
    el.toggleClass("is-active", tab === current);
    if (icon) (0, import_obsidian9.setIcon)(el.createSpan({ cls: "vt-tab-icon" }), icon);
    el.createSpan({ text: label });
    el.onclick = (e) => {
      e.stopPropagation();
      if (tab === current) return;
      ui.tabs.set(entry.id, tab);
      refresh();
    };
    return el;
  };
  mkTab("data", t("word.tab.data"));
  const count = mkTab("ai", t("word.tab.ai"), "sparkles").createSpan({ cls: "vt-tab-count" });
  const update = () => {
    const n = plugin.threads.wordQuestionCount(entry.id);
    count.setText(n > 0 ? String(n) : "");
  };
  const threadId = wordThreadId(entry.id);
  ui.component.register(
    plugin.threads.events.on("thread:upsert", (th) => {
      if (th.id === threadId) update();
    })
  );
  ui.component.register(plugin.threads.events.on("threads:reloaded", update));
  void plugin.threads.ensureLoaded().then(update);
  return current;
}

// src/ui/word/GroupedWordList.ts
var import_obsidian10 = require("obsidian");
function groupTitle(g, learn, settled = true) {
  switch (g.kind) {
    case "note":
      return noteTitle(g.path);
    case "family": {
      const f = learn == null ? void 0 : learn.family(g.familyId);
      if (f) return t("sidebar.group.family", { name: f.label || f.topic });
      return settled ? t("sidebar.group.familyGone") : t("sidebar.group.family", { name: "\u2026" });
    }
    case "wordlist":
      return t("sidebar.group.wordlist");
    case "none":
      return t("sidebar.group.none");
  }
}
function renderGroupedVocabList(plugin, container, rows, collapsedGroups, expandState, refresh, rowOpts = {}, groupOpts = {}) {
  var _a, _b;
  const learn = plugin.learn;
  const groups = groupEntries(rows, (_a = groupOpts.order) != null ? _a : "title", (g) => groupTitle(g, learn, false));
  const pendingTitles = [];
  for (const group of groups) {
    const { key: key3 } = group;
    const isCollapsed = collapsedGroups.has(key3);
    const known = group.kind !== "family" || !!learn.family(group.familyId);
    const title = groupTitle(group, learn, known);
    const heading = container.createEl("div", { cls: "vt-group-heading" });
    heading.setAttr("data-group-key", key3);
    const arrow = heading.createEl("span", { cls: "vt-group-arrow" });
    (0, import_obsidian10.setIcon)(arrow, isCollapsed ? "chevron-up" : "chevron-down");
    const titleEl = heading.createEl("span", { text: title, cls: "vt-group-title", attr: { "aria-label": title } });
    if (group.kind === "family") {
      titleEl.addClass("vt-group-title-link");
      titleEl.setAttr("aria-label", t("sidebar.group.familyOpen"));
      titleEl.setAttr("role", "link");
      titleEl.onclick = (e) => {
        e.stopPropagation();
        void plugin.openEntryFile("families");
      };
      if (!known) pendingTitles.push({ el: titleEl, group });
    }
    heading.createEl("span", { cls: "vt-group-spacer" });
    heading.createEl("span", { text: String(group.entries.length), cls: "vt-group-count" });
    heading.onclick = () => {
      if (isCollapsed) collapsedGroups.delete(key3);
      else collapsedGroups.add(key3);
      refresh();
    };
    if (isCollapsed) continue;
    for (const entry of group.entries) {
      const state = (_b = expandState.get(entry.id)) != null ? _b : "collapsed";
      renderVocabRow(plugin, container, entry, state, (s) => expandState.set(entry.id, s), () => refresh(entry.id), rowOpts);
    }
  }
  if (pendingTitles.length) {
    void learn.ensureLoaded().then(() => {
      for (const { el, group } of pendingTitles) {
        if (el.isConnected) el.setText(groupTitle(group, learn));
      }
    });
  }
}

// src/ui/word/wordUi.ts
var import_obsidian11 = require("obsidian");
var WordUi = class {
  constructor(owner) {
    this.owner = owner;
    this.tabs = /* @__PURE__ */ new Map();
    this.chat = createChatUiState();
    this.scope = null;
  }
  // Call at the start of every full redraw: unloads the previous draw's
  // chat panels (their event subscriptions) before new ones are made.
  beginRender() {
    if (this.scope) this.owner.removeChild(this.scope);
    this.scope = this.owner.addChild(new import_obsidian11.Component());
  }
  // Owner of everything rendered in the current draw.
  get component() {
    if (!this.scope) this.beginRender();
    return this.scope;
  }
};

// src/ui/sidebar/examStrip.ts
var import_obsidian12 = require("obsidian");

// src/core/model/wordlists.ts
var DEFAULT_WORDLIST_FOLDER = "vocab-wordlists";
function resolveWordlistSettings(partial) {
  var _a, _b, _c;
  const folder = typeof (partial == null ? void 0 : partial.folder) === "string" ? partial.folder.trim().replace(/^\/+|\/+$/g, "") : "";
  return {
    folder: folder || DEFAULT_WORDLIST_FOLDER,
    highlight: (_a = partial == null ? void 0 : partial.highlight) != null ? _a : true,
    inflections: (_b = partial == null ? void 0 : partial.inflections) != null ? _b : true,
    autoImport: (_c = partial == null ? void 0 : partial.autoImport) != null ? _c : true,
    tags: (partial == null ? void 0 : partial.tags) && typeof partial.tags === "object" ? partial.tags : {}
  };
}
var KNOWN = [
  [/toefl/i, "#3b82f6"],
  [/ielts/i, "#10b981"],
  [/toeic/i, "#f59e0b"],
  [/gept|全民/i, "#8b5cf6"],
  [/\b(gre|gmat|sat)\b/i, "#ef4444"]
];
var PALETTE = ["#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48", "#a855f7"];
function defaultTagColor(tag) {
  for (const [re, color] of KNOWN) if (re.test(tag)) return color;
  let h = 0;
  for (const c of tag) h = h * 31 + c.charCodeAt(0) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function tagColor(s, tag) {
  var _a;
  return ((_a = s.tags[tag]) == null ? void 0 : _a.color) || defaultTagColor(tag);
}
function tagEnabled(s, tag) {
  var _a;
  return ((_a = s.tags[tag]) == null ? void 0 : _a.enabled) !== false;
}

// src/core/wordlists/parse.ts
function tagFromBasename(basename2) {
  const name = basename2.trim();
  const i = name.indexOf("-");
  return i > 0 && i < name.length - 1 ? `${name.slice(0, i)}/${name.slice(i + 1)}` : name;
}
function tagLabel(tag) {
  return tag.slice(tag.lastIndexOf("/") + 1);
}
var POS = /* @__PURE__ */ new Set([
  "n",
  "v",
  "vt",
  "vi",
  "adj",
  "adv",
  "a",
  "ad",
  "prep",
  "conj",
  "pron",
  "int",
  "interj",
  "art",
  "num",
  "aux",
  "pl",
  "phr"
]);
var ENGLISH_RUN = /^[A-Za-z][A-Za-z'-]*(?:[ \t]+[A-Za-z][A-Za-z'-]*)*/;
function headword(line) {
  let s = line.trim();
  if (!s || s.startsWith("#") || s.startsWith("//")) return null;
  if (/^\|?[\s:|-]+$/.test(s)) return null;
  s = s.replace(/^[-*+]\s+(\[.\]\s+)?/, "").replace(/^\d+[.)、]\s*/, "").replace(/^[|\s[*_`"']+/, "");
  s = s.split(/[,\t|;]/)[0];
  const m = ENGLISH_RUN.exec(s);
  if (!m) return null;
  const parts = m[0].split(/[ \t]+/);
  if (parts.length > 1 && !POS.has(parts[1].toLowerCase())) return null;
  const word = parts[0].replace(/^['-]+|['-]+$/g, "").toLowerCase();
  return word.length > 1 || word === "a" || word === "i" ? word : null;
}
function parseWordlist(content) {
  var _a;
  const lines4 = content.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let tag;
  if (((_a = lines4[0]) == null ? void 0 : _a.trim()) === "---") {
    const close = lines4.findIndex((l4, j) => j > 0 && l4.trim() === "---");
    if (close > 0) {
      for (const l4 of lines4.slice(1, close)) {
        const m = /^tag\s*:\s*["']?#?([^"']+?)["']?\s*$/.exec(l4.trim());
        if (m) tag = m[1];
      }
      i = close + 1;
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const words = [];
  let inFence = false;
  for (; i < lines4.length; i++) {
    if (/^\s*(```|~~~)/.test(lines4[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const w = headword(lines4[i]);
    if (w && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  return { tag, words };
}

// src/ui/sidebar/examStrip.ts
function renderExamStrip(root, plugin, file) {
  var _a;
  const service = plugin.wordlists;
  const index = service.index;
  if (index.isEmpty || !(file instanceof import_obsidian12.TFile) || file.extension !== "md") return;
  const strip = root.createDiv({ cls: "vt-exam-strip" });
  const title = strip.createDiv({ cls: "vt-exam-strip-title" });
  const result = service.cachedScan(file.path, file.stat.mtime);
  if (!result) {
    title.setText(t("exam.strip.scanning"));
    void plugin.scanNote(file);
    return;
  }
  title.setText(t("exam.strip.title", { total: result.uniqueWords }));
  const settings = resolveWordlistSettings(plugin.store.settings.wordlists);
  const chips = strip.createDiv({ cls: "vt-exam-chips" });
  for (const tag of index.tags) {
    const stats = result.byTag[tag];
    const on = settings.highlight && tagEnabled(settings, tag);
    const chip2 = chips.createSpan({ cls: "vt-exam-chip" });
    chip2.toggleClass("is-off", !on);
    chip2.style.setProperty("--vt-exam-color", tagColor(settings, tag));
    chip2.createSpan({ cls: "vt-exam-chip-dot" });
    chip2.createSpan({ text: tagLabel(tag) });
    chip2.createSpan({ cls: "vt-exam-chip-count", text: String((_a = stats == null ? void 0 : stats.unique) != null ? _a : 0) });
    chip2.setAttr("role", "button");
    chip2.setAttr("aria-label", t(on ? "exam.strip.hide" : "exam.strip.show", { tag: tagLabel(tag) }));
    chip2.onclick = () => void plugin.toggleExamTag(tag);
  }
}

// src/ui/sidebar/ParagraphThreadList.ts
var import_obsidian13 = require("obsidian");

// src/core/text/blockId.ts
var VT_BLOCK_PREFIX = "vt-";
var TRAILING_RE = /(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*\r?$/;
function lines(markdown) {
  return markdown.split("\n");
}
function trailingBlockId(text) {
  const last2 = text.replace(/\s+$/, "");
  const m = TRAILING_RE.exec(last2);
  return m ? m[1] : null;
}
function blockIdsIn(markdown) {
  const out = /* @__PURE__ */ new Set();
  for (const line of lines(markdown)) {
    const id = trailingBlockId(line);
    if (id) out.add(id);
  }
  return out;
}
function newBlockId(taken, random = Math.random, maxTries = 100) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    let id = VT_BLOCK_PREFIX;
    for (let i = 0; i < 6; i++) id += Math.min(35, Math.floor(random() * 36)).toString(36);
    if (!taken(id)) return id;
  }
  throw new Error("Couldn't find an unused block id");
}
function withBlockId(markdown, line, id) {
  const all = lines(markdown);
  if (line < 0 || line >= all.length) throw new RangeError(`line ${line} out of range (0..${all.length - 1})`);
  const cr = all[line].endsWith("\r");
  const body = (cr ? all[line].slice(0, -1) : all[line]).replace(/[ \t]+$/, "");
  all[line] = `${body} ^${id}${cr ? "\r" : ""}`;
  return all.join("\n");
}

// src/core/text/hash.ts
var PARAGRAPH_HASH_LENGTH = 12;
function utf8Bytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 56320 && d <= 57343) {
        c = 65536 + (c - 55296 << 10) + (d - 56320);
        i++;
      } else {
        c = 65533;
      }
    } else if (c >= 56320 && c <= 57343) {
      c = 65533;
    }
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | c >> 6, 128 | c & 63);
    else if (c < 65536) out.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
    else out.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
  }
  return out;
}
function sha1(text) {
  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 4294967296);
  for (let s = 24; s >= 0; s -= 8) bytes.push(hi >>> s & 255);
  for (let s = 24; s >= 0; s -= 8) bytes.push(bitLen >>> s & 255);
  let h0 = 1732584193;
  let h1 = 4023233417;
  let h2 = 2562383102;
  let h3 = 271733878;
  let h4 = 3285377520;
  const w = new Int32Array(80);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = bytes[j] << 24 | bytes[j + 1] << 16 | bytes[j + 2] << 8 | bytes[j + 3];
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = x << 1 | x >>> 31;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f;
      let k;
      if (i < 20) {
        f = b & c | ~b & d;
        k = 1518500249;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 1859775393;
      } else if (i < 60) {
        f = b & c | b & d | c & d;
        k = 2400959708;
      } else {
        f = b ^ c ^ d;
        k = 3395469782;
      }
      const t2 = (a << 5 | a >>> 27) + f + e + k + w[i] | 0;
      e = d;
      d = c;
      c = b << 30 | b >>> 2;
      b = a;
      a = t2;
    }
    h0 = h0 + a | 0;
    h1 = h1 + b | 0;
    h2 = h2 + c | 0;
    h3 = h3 + d | 0;
    h4 = h4 + e | 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}
function normalizeParagraph(text) {
  return text.replace(/\r\n?/g, "\n").replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, "").replace(/==([^=\n]+)==/g, "$1").normalize("NFC").replace(/\s+/g, " ").trim();
}
function paragraphHash(text) {
  return sha1(normalizeParagraph(text)).slice(0, PARAGRAPH_HASH_LENGTH);
}

// src/services/anchors/sections.ts
var ANCHORABLE = /* @__PURE__ */ new Set(["paragraph", "list", "blockquote"]);
function isAnchorable(type) {
  return ANCHORABLE.has(type);
}
var FENCE_RE2 = /^\s*(`{3,}|~{3,})/;
var HEADING_RE2 = /^#{1,6}(\s|$)/;
var LIST_RE = LIST_MARKER_RE;
var BREAK_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
function classify(lines4) {
  const first = lines4[0];
  if (/^\s*>\s*\[!/.test(first)) return "callout";
  if (/^\s*>/.test(first)) return "blockquote";
  if (LIST_RE.test(first)) return "list";
  if (lines4.length === 1 && BREAK_RE.test(first)) return "thematicBreak";
  if (lines4.length >= 2 && /^\s*\|/.test(first) && /^\s*\|?\s*:?-+/.test(lines4[1])) return "table";
  return "paragraph";
}
function noteSections(markdown) {
  const lines4 = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  if (lines4[0] === "---") {
    const close = lines4.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }
  let start = -1;
  const flush = (end) => {
    if (start < 0) return;
    const block = lines4.slice(start, end + 1);
    const type = classify(block);
    if (type === "list" && shouldSplitList(block)) {
      for (const item of splitListItems(block, start)) out.push({ type: "list", ...item });
    } else {
      out.push({ type, lineStart: start, lineEnd: end, text: block.join("\n") });
    }
    start = -1;
  };
  for (; i < lines4.length; i++) {
    const line = lines4[i];
    const fence = FENCE_RE2.exec(line);
    if (fence) {
      flush(i - 1);
      const marker = fence[1];
      let end = i + 1;
      while (end < lines4.length && !lines4[end].trimStart().startsWith(marker)) end++;
      end = Math.min(end, lines4.length - 1);
      out.push({ type: "code", lineStart: i, lineEnd: end, text: lines4.slice(i, end + 1).join("\n") });
      i = end;
      continue;
    }
    if (line.trim() === "") {
      flush(i - 1);
      continue;
    }
    if (HEADING_RE2.test(line)) {
      flush(i - 1);
      out.push({ type: "heading", lineStart: i, lineEnd: i, text: line });
      continue;
    }
    if (start < 0) start = i;
  }
  flush(lines4.length - 1);
  return out;
}
function sectionText(markdown, lineStart, lineEnd) {
  return markdown.replace(/\r\n?/g, "\n").split("\n").slice(lineStart, lineEnd + 1).join("\n");
}
function sectionAt(sections, line) {
  return sections.find((s) => line >= s.lineStart && line <= s.lineEnd);
}
function ownBlockIdLine(section3) {
  if (section3.type !== "list") return section3.lineEnd;
  return section3.lineStart + listItemOwnEndIndex(section3.text.split("\n"));
}
function ownBlockIdText(section3) {
  if (section3.type !== "list") return section3.text;
  const lines4 = section3.text.split("\n");
  return lines4.slice(0, listItemOwnEndIndex(lines4) + 1).join("\n");
}
function mergedListSections(sections) {
  const out = [];
  let i = 0;
  while (i < sections.length) {
    if (sections[i].type !== "list") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sections.length && sections[j + 1].type === "list" && sections[j + 1].lineStart === sections[j].lineEnd + 1) j++;
    if (j > i) out.push({ section: sections[i], text: sections.slice(i, j + 1).map((s) => s.text).join("\n") });
    i = j + 1;
  }
  return out;
}

// src/services/anchors/noteIndex.ts
var Index = class {
  constructor(content) {
    this.content = content;
    this.blockLines = null;
    this.hashes = null;
    this.groupHashes = null;
    this.sections = noteSections(content);
  }
  sectionOfBlock(id) {
    if (!this.blockLines) {
      const map = /* @__PURE__ */ new Map();
      const lines4 = this.content.split("\n");
      for (let i = 0; i < lines4.length; i++) {
        if (!lines4[i].includes("^")) continue;
        const found = trailingBlockId(lines4[i]);
        if (found && !map.has(found)) map.set(found, i);
      }
      this.blockLines = map;
    }
    const line = this.blockLines.get(id);
    return line === void 0 ? void 0 : sectionAt(this.sections, line);
  }
  sectionOfHash(hash) {
    if (!this.hashes) {
      const map = /* @__PURE__ */ new Map();
      for (const s of this.sections) {
        if (!isAnchorable(s.type)) continue;
        const h = paragraphHash(s.text);
        if (!map.has(h)) map.set(h, s);
      }
      this.hashes = map;
    }
    const hit = this.hashes.get(hash);
    if (hit) return hit;
    if (!this.groupHashes) {
      const map = /* @__PURE__ */ new Map();
      for (const g of mergedListSections(this.sections)) {
        const h = paragraphHash(g.text);
        if (!map.has(h)) map.set(h, g.section);
      }
      this.groupHashes = map;
    }
    return this.groupHashes.get(hash);
  }
};
var last = null;
function noteIndex(content) {
  if ((last == null ? void 0 : last.content) !== content) last = new Index(content);
  return last;
}

// src/services/anchors/ParagraphAnchorService.ts
var AnchorError = class extends Error {
  constructor(code, message) {
    super(message != null ? message : code);
    this.code = code;
    this.name = "AnchorError";
  }
};
function locateSection(content, ref) {
  var _a, _b;
  const sections = noteSections(content);
  const want = normalizeParagraph(ref.text);
  const atRange = sectionText(content, ref.lineStart, ref.lineEnd);
  if (normalizeParagraph(atRange) === want) {
    const s = sectionAt(sections, ref.lineEnd);
    if (s && s.lineStart === ref.lineStart && s.lineEnd === ref.lineEnd) return s;
    return { type: (_a = s == null ? void 0 : s.type) != null ? _a : "paragraph", lineStart: ref.lineStart, lineEnd: ref.lineEnd, text: atRange };
  }
  const hash = paragraphHash(ref.text);
  return (_b = sections.find((s) => isAnchorable(s.type) && paragraphHash(s.text) === hash)) != null ? _b : null;
}
function resolveIn(content, anchor) {
  const index = noteIndex(content);
  const found = (via, section3) => ({
    status: "found",
    via,
    // A copy: the index's sections are shared.
    section: { ...section3 },
    content,
    edited: normalizeParagraph(section3.text) !== normalizeParagraph(anchor.snapshot)
  });
  if (anchor.blockId) {
    const section3 = index.sectionOfBlock(anchor.blockId);
    if (section3) return found("blockId", section3);
  }
  const bySnapshot = index.sectionOfHash(anchor.hash);
  if (bySnapshot) return found("hash", bySnapshot);
  return { status: "orphan", reason: "missing-paragraph" };
}
var ParagraphAnchorService = class {
  constructor(deps) {
    this.deps = deps;
    var _a;
    this.random = (_a = deps.random) != null ? _a : Math.random;
  }
  // Anchors a paragraph for a new discussion. In block mode this writes
  // ` ^vt-xxxxxx` at the end of the paragraph's last line through
  // vault.process (atomic). A paragraph that already ends in a block id
  // (the user's own, or one we wrote earlier) reuses it and writes
  // nothing. If the write can't be done — the paragraph moved or vanished
  // between render and write, or the vault refused — the anchor falls back
  // to hash mode rather than failing the question.
  async create(ref) {
    const content = await this.deps.vault.read(ref.path);
    if (content === null) throw new AnchorError("missing-file", `Note not found: ${ref.path}`);
    const section3 = locateSection(content, ref);
    if (!section3) throw new AnchorError("missing-paragraph");
    if (!isAnchorable(section3.type)) throw new AnchorError("not-anchorable", `Can't anchor a ${section3.type}`);
    const base = {
      kind: "paragraph",
      path: ref.path,
      hash: paragraphHash(section3.text),
      snapshot: plainParagraph(section3.text)
    };
    const existing = trailingBlockId(ownBlockIdText(section3));
    if (existing) return { ...base, blockId: existing };
    if (this.deps.mode() === "hash") return base;
    try {
      const blockId = await this.writeBlockId(ref.path, section3);
      return { ...base, blockId };
    } catch (e) {
      console.warn("Vocab Tracker: couldn't write a block id, using a text hash instead", e);
      return base;
    }
  }
  async writeBlockId(path, section3) {
    let id = "";
    await this.deps.vault.process(path, (current) => {
      const target = locateSection(current, section3);
      if (!target) throw new AnchorError("missing-paragraph");
      const already = trailingBlockId(ownBlockIdText(target));
      if (already) {
        id = already;
        return current;
      }
      const inNote = blockIdsIn(current);
      id = newBlockId((x) => inNote.has(x) || this.deps.vault.blockIdTaken(x), this.random);
      return withBlockId(current, ownBlockIdLine(target), id);
    });
    return id;
  }
  // Where the anchored paragraph is now, or why it can't be found.
  async resolve(anchor) {
    let content;
    try {
      content = await this.deps.vault.read(anchor.path);
    } catch (e) {
      content = null;
    }
    if (content === null) return { status: "orphan", reason: "missing-file" };
    return resolveIn(content, anchor);
  }
};

// src/services/anchors/ParagraphIndex.ts
function paragraphKey(anchor) {
  return anchor.blockId ? `b:${anchor.blockId}` : `h:${anchor.hash}`;
}
function questionCount(thread) {
  return liveTurns(thread).filter((t2) => t2.role === "user").length;
}
var ParagraphIndex = class {
  constructor() {
    this.events = new TypedEmitter();
    this.byPath = /* @__PURE__ */ new Map();
    this.byThread = /* @__PURE__ */ new Map();
  }
  // Subscribes to a ThreadService and fills the index once threads.json is
  // loaded. Returns the unsubscribe function.
  attach(source) {
    const offs = [
      source.events.on("thread:upsert", (th) => this.upsert(th)),
      source.events.on("threads:reloaded", () => this.rebuild(source.paragraphThreads()))
    ];
    void source.ensureLoaded().then(() => this.rebuild(source.paragraphThreads()));
    return () => offs.forEach((off) => off());
  }
  rebuild(threads) {
    const touched = new Set(this.byPath.keys());
    this.byPath.clear();
    this.byThread.clear();
    for (const th of threads) this.add(th);
    for (const p of this.byPath.keys()) touched.add(p);
    if (touched.size) this.events.emit("paragraph-index:change", { paths: [...touched] });
  }
  upsert(thread) {
    const before = this.byThread.get(thread.id);
    if (before) this.remove(thread.id);
    const after = this.add(thread);
    if ((before == null ? void 0 : before.path) === (after == null ? void 0 : after.path) && (before == null ? void 0 : before.key) === (after == null ? void 0 : after.key) && (before == null ? void 0 : before.count) === (after == null ? void 0 : after.count)) return;
    const paths = /* @__PURE__ */ new Set();
    if (before) paths.add(before.path);
    if (after) paths.add(after.path);
    this.events.emit("paragraph-index:change", { paths: [...paths] });
  }
  // Badge count for a reading-mode section (its raw text, as
  // getSectionInfo covers it). Notes without paragraph discussions return
  // before any hashing.
  count(path, sectionText2) {
    var _a;
    const keys = this.byPath.get(path);
    if (!keys) return 0;
    const id = trailingBlockId(sectionText2);
    if (id) {
      const n = keys.get(`b:${id}`);
      if (n) return n;
    }
    return (_a = keys.get(`h:${paragraphHash(sectionText2)}`)) != null ? _a : 0;
  }
  hasPath(path) {
    return this.byPath.has(path);
  }
  add(thread) {
    var _a;
    if (thread.deletedAt || thread.anchor.kind !== "paragraph") return void 0;
    const count = questionCount(thread);
    if (!count) return void 0;
    const c = { path: thread.anchor.path, key: paragraphKey(thread.anchor), count };
    let keys = this.byPath.get(c.path);
    if (!keys) {
      keys = /* @__PURE__ */ new Map();
      this.byPath.set(c.path, keys);
    }
    keys.set(c.key, ((_a = keys.get(c.key)) != null ? _a : 0) + count);
    this.byThread.set(thread.id, c);
    return c;
  }
  remove(threadId) {
    var _a;
    const c = this.byThread.get(threadId);
    if (!c) return;
    this.byThread.delete(threadId);
    const keys = this.byPath.get(c.path);
    if (!keys) return;
    const left = ((_a = keys.get(c.key)) != null ? _a : 0) - c.count;
    if (left > 0) keys.set(c.key, left);
    else keys.delete(c.key);
    if (!keys.size) this.byPath.delete(c.path);
  }
};

// src/ui/sidebar/paragraphRows.ts
function paragraphNumberAt(spans, lineStart) {
  return spans.filter((s) => s.lineEnd < lineStart).length + 1;
}
function lastTurnAt(thread) {
  const turns = liveTurns(thread);
  return turns.length ? turns[turns.length - 1].at : thread.createdAt;
}
function taskLabelKeys(thread, labelOf) {
  const out = [];
  for (const turn of liveTurns(thread)) {
    if (turn.role !== "user" || !turn.taskId) continue;
    const label = labelOf(turn.taskId);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}
function paragraphRows(threads, content, labelOf) {
  const spans = content === null ? [] : splitParagraphSpans(content);
  const rows = [];
  for (const thread of threads) {
    if (thread.deletedAt || thread.anchor.kind !== "paragraph") continue;
    const anchor = thread.anchor;
    const where = content === null ? null : resolveIn(content, anchor);
    const base = {
      threadId: thread.id,
      labels: taskLabelKeys(thread, labelOf),
      count: questionCount(thread),
      lastAt: lastTurnAt(thread),
      createdAt: thread.createdAt,
      hashOnly: !anchor.blockId
    };
    if ((where == null ? void 0 : where.status) === "found") {
      rows.push({
        ...base,
        number: paragraphNumberAt(spans, where.section.lineStart),
        preview: plainParagraph(where.section.text),
        orphan: false,
        edited: where.edited,
        line: where.section.lineStart
      });
    } else {
      rows.push({ ...base, number: null, preview: anchor.snapshot, orphan: true, edited: false, line: -1 });
    }
  }
  return rows.sort(compareRows);
}
function compareRows(a, b) {
  var _a, _b, _c, _d;
  if (a.orphan !== b.orphan) return a.orphan ? 1 : -1;
  if (!a.orphan && a.line !== b.line) return a.line - b.line;
  if (a.orphan) return ((_a = b.lastAt) != null ? _a : "").localeCompare((_b = a.lastAt) != null ? _b : "");
  return ((_c = a.createdAt) != null ? _c : "").localeCompare((_d = b.createdAt) != null ? _d : "") || a.threadId.localeCompare(b.threadId);
}
function threadsWithMissingNote(threads, exists) {
  return threads.filter((th) => !th.deletedAt && th.anchor.kind === "paragraph" && !exists(th.anchor.path)).sort((a, b) => {
    var _a, _b;
    return ((_a = lastTurnAt(b)) != null ? _a : "").localeCompare((_b = lastTurnAt(a)) != null ? _b : "");
  });
}
function shortDate2(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// src/ui/sidebar/ParagraphThreadList.ts
function rowMeta(row) {
  const parts = row.labels.map((key3) => t(key3));
  parts.push(t("paragraph.list.count", { n: row.count }));
  const date = shortDate2(row.lastAt);
  if (date) parts.push(date);
  return parts.join(" \xB7 ");
}
function confirmButton(parent, label, confirmLabel, onConfirm) {
  const btn = parent.createEl("button", { cls: "vt-plist-action", text: label });
  let armed = false;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      btn.setText(confirmLabel);
      btn.addClass("mod-warning");
      return;
    }
    onConfirm();
  });
  btn.addEventListener("blur", () => {
    armed = false;
    btn.setText(label);
    btn.removeClass("mod-warning");
  });
  return btn;
}
function orphanActions(parent, threadId, actions) {
  const bar = parent.createDiv({ cls: "vt-plist-actions" });
  const rebind = bar.createEl("button", { cls: "vt-plist-action", text: t("paragraph.action.rebind") });
  rebind.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.rebind(threadId);
  });
  confirmButton(bar, t("paragraph.action.delete"), t("paragraph.action.confirmDelete"), () => actions.remove(threadId));
}
function drawRow(parent, row, actions, current, note) {
  const el = parent.createDiv({ cls: "vt-plist-row" });
  el.toggleClass("is-current", current);
  el.toggleClass("is-orphan", row.orphan);
  el.setAttr("role", "button");
  el.setAttr("tabindex", "0");
  el.addEventListener("click", () => actions.open(row.threadId));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") actions.open(row.threadId);
  });
  const title = el.createDiv({ cls: "vt-plist-text" });
  if (row.number !== null) title.createSpan({ cls: "vt-plist-num", text: `\xB6${row.number}` });
  title.createSpan({ text: row.preview });
  title.setAttr("aria-label", row.preview);
  const meta = el.createDiv({ cls: "vt-plist-meta" });
  (0, import_obsidian13.setIcon)(meta.createSpan({ cls: "vt-plist-meta-icon" }), "sparkles");
  meta.createSpan({ text: rowMeta(row) });
  if (row.orphan) meta.createSpan({ cls: "vt-plist-flag is-orphan", text: t("paragraph.list.orphan") });
  else if (row.edited) meta.createSpan({ cls: "vt-plist-flag", text: t("paragraph.list.edited") });
  if (note) el.createDiv({ cls: "vt-plist-path", text: note });
  if (row.orphan) orphanActions(el, row.threadId, actions);
}
var ParagraphThreadList = class extends import_obsidian13.Component {
  constructor(parent, path, deps, actions, currentThreadId = () => null, onCount) {
    super();
    this.path = path;
    this.deps = deps;
    this.actions = actions;
    this.currentThreadId = currentThreadId;
    this.onCount = onCount;
    this.seq = 0;
    this.alive = false;
    // Threads drawn last time.
    this.mine = /* @__PURE__ */ new Set();
    this.el = parent.createDiv({ cls: "vt-plist" });
  }
  get notePath() {
    return this.path;
  }
  onload() {
    this.alive = true;
    this.register(() => this.alive = false);
    const { threads } = this.deps;
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind !== "paragraph") return;
        if (th.anchor.path === this.path || this.mine.has(th.id)) void this.refresh();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => void this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }
  // Re-reads the note (paragraph positions, edits) and redraws the list.
  // Called by the sidebar when the note is modified.
  async refresh() {
    const seq = ++this.seq;
    const threads = this.deps.threads.paragraphThreads(this.path);
    let content = null;
    if (threads.length) {
      try {
        content = await this.deps.notes.read(this.path);
      } catch (e) {
        content = null;
      }
    }
    if (!this.alive || seq !== this.seq) return;
    this.mine.clear();
    for (const th of threads) this.mine.add(th.id);
    this.draw(paragraphRows(threads, content, (id) => this.deps.taskLabel(id)));
  }
  draw(rows) {
    var _a;
    this.el.empty();
    (_a = this.onCount) == null ? void 0 : _a.call(this, rows.length);
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("paragraph.list.hint") });
      return;
    }
    const current = this.currentThreadId();
    for (const row of rows) drawRow(this.el, row, this.actions, row.threadId === current);
  }
};
var MissingNoteThreadList = class extends import_obsidian13.Component {
  constructor(parent, deps, actions) {
    super();
    this.deps = deps;
    this.actions = actions;
    this.alive = false;
    this.el = parent.createDiv({ cls: "vt-plist" });
  }
  onload() {
    this.alive = true;
    this.register(() => this.alive = false);
    const { threads } = this.deps;
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind === "paragraph") this.refresh();
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }
  refresh() {
    var _a;
    if (!this.alive) return;
    const orphans = threadsWithMissingNote(this.deps.threads.paragraphThreads(), (p) => this.deps.exists(p));
    this.el.empty();
    if (!orphans.length) return;
    this.el.createDiv({ cls: "vt-plist-head" }).createSpan({ text: t("paragraph.list.orphanTitle", { n: orphans.length }) });
    const rows = paragraphRows(orphans, null, (id) => this.deps.taskLabel(id));
    for (const row of rows) {
      const anchor = (_a = orphans.find((x) => x.id === row.threadId)) == null ? void 0 : _a.anchor;
      const note = (anchor == null ? void 0 : anchor.kind) === "paragraph" ? t("paragraph.list.missingNote", { path: anchor.path }) : void 0;
      drawRow(this.el, row, this.actions, false, note);
    }
  }
};

// src/ui/sidebar/ParagraphThreadPane.ts
var import_obsidian14 = require("obsidian");

// src/core/text/tokens.ts
var CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
function estimateTokens(text) {
  var _a, _b;
  if (!text) return 0;
  const cjk = (_b = (_a = text.match(CJK_RE)) == null ? void 0 : _a.length) != null ? _b : 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
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
  const paragraphNumber2 = input.paragraphIndex + 1;
  return {
    articleBlock,
    focusBlock: renderTemplate(FOCUS_TEMPLATE, { paragraph, paragraphNumber: paragraphNumber2 }),
    truncated,
    slots: {
      paragraph,
      paragraphNumber: paragraphNumber2,
      selection: (_e = (_d = input.selection) == null ? void 0 : _d.trim()) != null ? _e : "",
      question: (_g = (_f = input.question) == null ? void 0 : _f.trim()) != null ? _g : "",
      knownWords: ((_h = input.knownWords) != null ? _h : []).join(", ")
    }
  };
}

// src/services/ai/tasks/length.ts
function scaledChars(profileMax, sourceChars2, ratio) {
  if (profileMax <= 0) return 0;
  return Math.ceil((profileMax + sourceChars2 * ratio) / 50) * 50;
}
function profileForTask(profile, task, input) {
  if (!task.answerChars || profile.maxAnswerChars <= 0) return profile;
  return { ...profile, maxAnswerChars: task.answerChars(input, profile.maxAnswerChars) };
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
- \u8FFD\u554F\u6642\uFF08\u524D\u9762\u7684\u5C0D\u8A71\u5DF2\u7D93\u5BEB\u904E\u300C\u4F60\u554F\u7684\u662F\u300D\uFF09\uFF0C\u5982\u679C\u9019\u6B21\u554F\u7684\u9084\u662F\u540C\u4E00\u53E5\u6216\u540C\u4E00\u500B\u7BC4\u570D\uFF0C\u5C31\u4E0D\u8981\u518D\u5BEB\u9019\u4E00\u884C\uFF0C\u76F4\u63A5\u56DE\u7B54\uFF1B\u63DB\u4E86\u53E5\u5B50\u6216\u7BC4\u570D\u624D\u91CD\u65B0\u5BEB\u3002
- \u771F\u7684\u7121\u6CD5\u5224\u65B7\u6642\uFF0C\u5217\u51FA\u6700\u53EF\u80FD\u7684\u4E00\u5230\u5169\u53E5\u8ACB\u4F7F\u7528\u8005\u78BA\u8A8D\uFF0C\u4E0D\u8981\u786C\u731C\u3002
- \u7B2C\u4E00\u884C\u4E4B\u5F8C\u7A7A\u4E00\u884C\uFF0C\u518D\u958B\u59CB\u56DE\u7B54\u3002`;
var SELECTION_HEADER2 = `{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015
{{selection}}

{{/selection}}`;
var PARAGRAPH_TEMPLATES = {
  grammar: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u6587\u6CD5\u89E3\u6790\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u90A3\u4E00\u53E5\u3002{{/selection}}{{^selection}}\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u7D50\u69CB\u6700\u503C\u5F97\u5B78\u7684\u4E00\u53E5\uFF1B\u6BB5\u843D\u53EA\u6709\u4E00\u53E5\u6642\u5C31\u662F\u90A3\u4E00\u53E5\u3002{{/selection}}
\u8ACB\u62C6\u89E3\u53E5\u5B50\u7D50\u69CB\uFF08\u4E3B\u8981\u5B50\u53E5\u3001\u5F9E\u5C6C\u5B50\u53E5\u3001\u7247\u8A9E\u5404\u81EA\u4FEE\u98FE\u8AB0\uFF09\uFF0C\u9EDE\u51FA\u95DC\u9375\u6587\u6CD5\uFF08\u6642\u614B\u3001\u8A9E\u614B\u3001\u5047\u8A2D\u8A9E\u6C23\u3001\u5012\u88DD\u3001\u7701\u7565\u7B49\uFF09\u5728\u9019\u88E1\u7684\u4F5C\u7528\uFF0C\u6700\u5F8C\u7528\u4E00\u53E5\u8A71\u8AAA\u660E\u9019\u53E5\u7684\u610F\u601D\u3002`,
  translate: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u7FFB\u8B6F\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u53E5\u5B50\u3002{{/selection}}{{^selection}}\u6574\u6BB5\u3002{{/selection}}
\u5148\u7D66\u901A\u9806\u3001\u81EA\u7136\u7684\u7E41\u9AD4\u4E2D\u6587\u7FFB\u8B6F\uFF1B\u518D\u6311\u4E00\u5230\u4E09\u500B\u76F4\u8B6F\u5BB9\u6613\u51FA\u932F\u7684\u5730\u65B9\uFF08\u7247\u8A9E\u3001\u6163\u7528\u8A9E\u3001\u6587\u5316\u80CC\u666F\uFF09\u7C21\u77ED\u8AAA\u660E\u3002`,
  vocab: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u751F\u5B57\u6574\u7406\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A\u6574\u6BB5\u3002
\u4F9D\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF0C\u6311\u51FA\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u6700\u503C\u5F97\u5B78\u7684 3 \u5230 6 \u500B\u55AE\u5B57\u6216\u7247\u8A9E\u3002{{#knownWords}}\u5B78\u7FD2\u8005\u5DF2\u7D93\u6536\u9304\u7684\u5B57\u4E0D\u8981\u518D\u5217\uFF1A{{knownWords}}\u3002{{/knownWords}}
\u6BCF\u500B\u4E00\u884C\uFF0C\u683C\u5F0F\uFF1A- **\u55AE\u5B57** \u8A5E\u6027\uFF1A\u4E2D\u6587\u610F\u601D \u2014 \u5728\u9019\u6BB5\u88E1\u7684\u7528\u6CD5`,
  paraphrase: `${SELECTION_HEADER2}\u4EFB\u52D9\uFF1A\u63DB\u53E5\u8A71\u8AAA\uFF08\xB6{{paragraphNumber}}\uFF09
\u7BC4\u570D\uFF1A{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015\u6240\u5728\u7684\u90A3\u4E00\u53E5\u3002{{/selection}}{{^selection}}\u3014\u76EE\u524D\u6BB5\u843D\u3015\u88E1\u6700\u96E3\u61C2\u7684\u4E00\u53E5\u3002{{/selection}}
\u7D66\u5169\u7A2E\u82F1\u6587\u6539\u5BEB\uFF1A\u4E00\u7A2E\u66F4\u7C21\u55AE\u3001\u9069\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u7684\u7A0B\u5EA6\uFF1B\u4E00\u7A2E\u66F4\u81EA\u7136\u9053\u5730\u3002\u6BCF\u7A2E\u90FD\u9644\u4E2D\u6587\u8AAA\u660E\uFF0C\u8B1B\u6E05\u695A\u548C\u539F\u53E5\u5DEE\u5728\u54EA\u88E1\u3002`,
  custom: `${SELECTION_HEADER2}\u3014\u4F7F\u7528\u8005\u7684\u554F\u984C\u3015\uFF08\xB6{{paragraphNumber}}\uFF09
{{question}}

\u8ACB\u4F9D\u300C\u5224\u65B7\u4F7F\u7528\u8005\u5728\u554F\u54EA\u4E00\u53E5\u300D\u7684\u898F\u5247\u6C7A\u5B9A\u7B2C\u4E00\u884C\u8981\u4E0D\u8981\u5BEB\u51FA\u7BC4\u570D\uFF0C\u518D\u56DE\u7B54\u554F\u984C\u3002`
};
function paragraphTask(id, opts) {
  const task = {
    id: `paragraph.${id}`,
    // v2: follow-ups skip a repeated 「你問的是」 line (規劃書 06 §6.4.1 #3).
    version: 2,
    surface: "paragraph",
    ...opts,
    build(input, ctx) {
      const c = buildParagraphContext(input);
      return composeRequest({
        base: PARAGRAPH_BASE_PROMPT,
        cached: [c.articleBlock],
        context: [c.focusBlock],
        profile: profileForTask(ctx.profile, task, input),
        history: ctx.history,
        user: renderTemplate(PARAGRAPH_TEMPLATES[id], c.slots),
        tier: opts.tier,
        maxTokens: opts.maxTokens
      });
    }
  };
  return task;
}
function sourceChars(input) {
  var _a;
  const selection = (_a = input.selection) == null ? void 0 : _a.trim();
  return (selection || input.article.paragraphs[input.paragraphIndex] || "").trim().length;
}
var paragraphGrammar = paragraphTask("grammar", { tier: "smart", maxTokens: 4096, label: "ai.task.paragraph.grammar" });
var paragraphTranslate = paragraphTask("translate", {
  tier: "fast",
  maxTokens: 2048,
  label: "ai.task.paragraph.translate",
  answerChars: (input, max) => scaledChars(max, sourceChars(input), 0.6)
});
var paragraphVocab = paragraphTask("vocab", { tier: "fast", maxTokens: 2048, label: "ai.task.paragraph.vocab" });
var paragraphParaphrase = paragraphTask("paraphrase", {
  tier: "smart",
  maxTokens: 4096,
  label: "ai.task.paragraph.paraphrase",
  answerChars: (input, max) => scaledChars(max, sourceChars(input), 0.3)
});
var paragraphCustom = paragraphTask("custom", { tier: "smart", maxTokens: 4096 });
var PARAGRAPH_TASKS = [paragraphGrammar, paragraphTranslate, paragraphVocab, paragraphParaphrase, paragraphCustom];

// src/ui/sidebar/anchorSettings.ts
function resolveAnchorSettings(settings) {
  const raw = settings == null ? void 0 : settings.anchors;
  const mode = (raw == null ? void 0 : raw.mode) === "hash" ? "hash" : "block";
  const out = { mode, blockIdNoticeSeen: (raw == null ? void 0 : raw.blockIdNoticeSeen) === true };
  if (typeof (raw == null ? void 0 : raw.updatedAt) === "string") out.updatedAt = raw.updatedAt;
  return out;
}
function patchAnchorSettings(settings, patch) {
  var _a;
  const s = settings;
  s.anchors = { ...(_a = s.anchors) != null ? _a : {}, ...resolveAnchorSettings(settings), ...patch };
}
function needsBlockIdNotice(s, sectionText2) {
  return s.mode === "block" && !s.blockIdNoticeSeen && !trailingBlockId(sectionText2);
}

// src/ui/sidebar/routes.ts
var LIST_ROUTE = { name: "list" };
var REBINDING_BODY_CLS = "vt-rebinding";
function routeKey(route) {
  switch (route.name) {
    case "list":
      return "list";
    case "paragraph":
      return `paragraph:${route.threadId}`;
    case "paragraph-draft":
      return `draft:${route.section.path}:${route.section.lineStart}`;
  }
}
function sameRoute(a, b) {
  return routeKey(a) === routeKey(b);
}
function routePath(route, threadPath) {
  switch (route.name) {
    case "list":
      return null;
    case "paragraph":
      return threadPath(route.threadId);
    case "paragraph-draft":
      return route.section.path;
  }
}
function routeForActiveNote(route, activePath, threadPath) {
  if (route.name === "list" || activePath === null) return route;
  const path = routePath(route, threadPath);
  if (path === null) return route.name === "paragraph-draft" ? LIST_ROUTE : route;
  return path === activePath ? route : LIST_ROUTE;
}
var SidebarRouter = class {
  constructor() {
    this.route = LIST_ROUTE;
  }
  get current() {
    return this.route;
  }
  get canGoBack() {
    return this.route.name !== "list";
  }
  // Returns false when already there (nothing to redraw).
  go(route) {
    if (sameRoute(route, this.route)) return false;
    this.route = route;
    return true;
  }
  back() {
    return this.go(LIST_ROUTE);
  }
  // The draft's first question created thread `threadId`. Ignored unless
  // the draft for that same section is still showing (the user may have
  // gone back, or opened another paragraph, while the anchor was written).
  promoteDraft(section3, threadId) {
    const r = this.route;
    if (r.name !== "paragraph-draft" || r.section.path !== section3.path || r.section.lineStart !== section3.lineStart) return false;
    this.route = { name: "paragraph", threadId };
    return true;
  }
};

// src/ui/sidebar/ParagraphThreadPane.ts
var ParagraphThreadPane = class extends import_obsidian14.Component {
  constructor(parent, route, host, chatState, nav) {
    super();
    this.route = route;
    this.host = host;
    this.chatState = chatState;
    this.nav = nav;
    this.noticeEl = null;
    this.seq = 0;
    this.aiNoteSeq = 0;
    this.alive = false;
    // Where the quote jumps to.
    this.target = null;
    this.root = parent.createDiv({ cls: "vt-ppane" });
  }
  get key() {
    return routeKey(this.route);
  }
  get threadId() {
    return this.route.name === "paragraph" ? this.route.threadId : null;
  }
  // The note this pane is about (for the sidebar's modify listener).
  get path() {
    if (this.route.name === "paragraph-draft") return this.route.section.path;
    const th = this.host.threads.get(this.route.threadId);
    return (th == null ? void 0 : th.anchor.kind) === "paragraph" ? th.anchor.path : null;
  }
  onload() {
    this.alive = true;
    this.register(() => this.alive = false);
    this.renderShell();
    const id = this.threadId;
    if (id) {
      const { threads } = this.host;
      this.register(
        threads.events.on("thread:upsert", (th) => {
          if (th.id !== id) return;
          if (th.deletedAt) return this.nav.removed(id);
          void this.refreshStatus();
        })
      );
      this.register(
        threads.events.on("threads:reloaded", () => {
          if (!threads.get(id)) return this.nav.removed(id);
          void this.refreshStatus();
        })
      );
    }
    void this.refreshStatus();
    const { vault } = this.host.app;
    const onNote = (path) => {
      if (/\.ai\.md$/i.test(path)) void this.refreshAiNote();
    };
    this.registerEvent(vault.on("create", (f) => onNote(f.path)));
    this.registerEvent(vault.on("rename", (f) => onNote(f.path)));
    this.registerEvent(vault.on("delete", (f) => onNote(f.path)));
  }
  // ── Static parts ───────────────────────────────────────────────────────
  renderShell() {
    const back = this.root.createDiv({ cls: "vt-ppane-back" });
    back.setAttr("role", "button");
    back.setAttr("tabindex", "0");
    back.setAttr("aria-label", t("paragraph.pane.back"));
    (0, import_obsidian14.setIcon)(back.createSpan({ cls: "vt-ppane-back-icon" }), "arrow-left");
    back.createSpan({ text: t("sidebar.filter.note") });
    back.addEventListener("click", () => this.nav.back());
    back.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.nav.back();
    });
    const head = this.root.createDiv({ cls: "vt-ppane-head" });
    this.titleEl = head.createSpan({ cls: "vt-ppane-title", text: t("paragraph.pane.titleNoNumber") });
    const id = this.threadId;
    if (id) {
      const del = head.createSpan({ cls: "vt-ppane-delete clickable-icon" });
      (0, import_obsidian14.setIcon)(del, "trash-2");
      del.setAttr("aria-label", t("paragraph.pane.delete"));
      let armed = false;
      del.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          del.addClass("mod-warning");
          del.setAttr("aria-label", t("paragraph.action.confirmDelete"));
          window.setTimeout(() => {
            armed = false;
            del.removeClass("mod-warning");
            del.setAttr("aria-label", t("paragraph.pane.delete"));
          }, 3e3);
          return;
        }
        void this.host.threads.deleteThread(id).then(() => new import_obsidian14.Notice(t("paragraph.deleted")));
      });
    }
    this.quoteEl = this.root.createDiv({ cls: "vt-ppane-quote" });
    this.quoteEl.setAttr("aria-label", t("paragraph.pane.jump"));
    this.quoteEl.addEventListener("click", () => void this.jump());
    if (this.route.name === "paragraph-draft") {
      this.quoteEl.setText(plainParagraph(this.route.section.text));
      this.target = { path: this.route.section.path, line: this.route.section.lineStart };
    } else {
      const anchor = this.anchor();
      if (anchor) this.quoteEl.setText(anchor.snapshot);
    }
    this.notesEl = this.root.createDiv({ cls: "vt-ppane-notes" });
    if (this.route.name === "paragraph-draft") this.renderBlockIdNotice(this.route.section);
    this.renderChat(this.root.createDiv({ cls: "vt-ppane-chat" }));
    this.aiNoteEl = this.root.createDiv({ cls: "vt-ppane-ainote" });
    this.aiNoteEl.setAttr("role", "button");
    this.aiNoteEl.setAttr("tabindex", "0");
  }
  // 「開啟 討論串/<文章>.ai.md」 under the chat (design D5): only when the
  // article's note exists.
  async refreshAiNote() {
    const seq = ++this.aiNoteSeq;
    const article = this.path;
    let note = null;
    if (article) {
      try {
        note = await this.host.exporter.aiNotePath(article);
      } catch (e) {
        console.error("Vocab Tracker: couldn't find the article's .ai.md", e);
      }
    }
    if (!this.alive || seq !== this.aiNoteSeq) return;
    const el = this.aiNoteEl;
    el.empty();
    if (!note) return;
    const path = note;
    (0, import_obsidian14.setIcon)(el.createSpan({ cls: "vt-ppane-ainote-icon" }), "file-text");
    el.createSpan({ text: t("paragraph.pane.openAiNote", { path: path.split("/").slice(-2).join("/") }) });
    el.onclick = () => void this.host.openNote(path, "tab");
    el.onkeydown = (e) => {
      if (e.key === "Enter") void this.host.openNote(path, "tab");
    };
  }
  anchor() {
    const id = this.threadId;
    const th = id ? this.host.threads.get(id) : void 0;
    return (th == null ? void 0 : th.anchor.kind) === "paragraph" ? th.anchor : null;
  }
  // ── First block id write: one-time explanation (§5.1) ─────────────────
  renderBlockIdNotice(section3) {
    const settings = resolveAnchorSettings(this.host.store.settings);
    if (!needsBlockIdNotice(settings, section3.text)) return;
    const el = this.noticeEl = this.root.createDiv({ cls: "vt-ppane-notice" });
    el.appendChild(inlineNote({ tone: "info", icon: "hash", text: t("paragraph.notice.blockId") }));
    const bar = el.createDiv({ cls: "vt-ppane-notice-actions" });
    const ok = bar.createEl("button", { cls: "mod-cta", text: t("paragraph.notice.ok") });
    ok.addEventListener("click", () => void this.dismissNotice(false));
    const hash = bar.createEl("button", { text: t("paragraph.notice.useHash") });
    hash.addEventListener("click", () => void this.dismissNotice(true));
  }
  async dismissNotice(useHash) {
    var _a;
    (_a = this.noticeEl) == null ? void 0 : _a.remove();
    this.noticeEl = null;
    await this.host.store.updateSettings(
      (s) => patchAnchorSettings(s, useHash ? { mode: "hash", blockIdNoticeSeen: true } : { blockIdNoticeSeen: true })
    );
    if (useHash) new import_obsidian14.Notice(t("paragraph.notice.hashOn"));
  }
  // ── Chat ───────────────────────────────────────────────────────────────
  renderChat(el) {
    var _a, _b;
    const { app, threads, ai, selection, manifest } = this.host;
    const route = this.route;
    const threadId = route.name === "paragraph" ? route.threadId : this.key;
    const sourcePath = route.name === "paragraph-draft" ? route.section.path : (_b = (_a = this.anchor()) == null ? void 0 : _a.path) != null ? _b : "";
    this.addChild(
      new ChatPanel(el, {
        app,
        threads,
        ai,
        selection,
        threadId,
        surface: "paragraph",
        customTaskId: paragraphCustom.id,
        sourcePath,
        placeholder: t("paragraph.pane.placeholder"),
        state: this.chatState,
        send: (req) => friendlyErrors(route.name === "paragraph-draft" ? this.sendDraft(route.section, req) : this.sendThread(threadId, req)),
        retry: (turnId) => friendlyErrors(threads.retryParagraph(threadId, turnId)),
        onOpenSettings: () => openPluginSettings(app, manifest.id)
      })
    );
  }
  async sendThread(threadId, req) {
    await this.host.threads.askParagraph({ threadId }, req);
  }
  // The first question about a paragraph: askParagraph writes the anchor
  // and creates the thread, then streams the answer — and only resolves
  // once the answer is done. The thread id is needed as soon as the
  // thread exists, so the pane listens for the new thread's first upsert
  // (it's marked busy before that event fires) and hands over to the real
  // thread's pane, which picks up the stream mid-way.
  async sendDraft(section3, req) {
    const { threads, store } = this.host;
    if (this.noticeEl) {
      this.noticeEl.remove();
      this.noticeEl = null;
      await store.updateSettings((s) => patchAnchorSettings(s, { blockIdNoticeSeen: true }));
    }
    const busyBefore = new Set(threads.paragraphThreads(section3.path).filter((th) => threads.isBusy(th.id)).map((th) => th.id));
    let started = false;
    const start = (id) => {
      if (started) return;
      started = true;
      off();
      window.setTimeout(() => this.nav.threadStarted(section3, id), 0);
    };
    const off = threads.events.on("thread:upsert", (th) => {
      if (th.anchor.kind !== "paragraph" || th.anchor.path !== section3.path) return;
      if (threads.isBusy(th.id) && !busyBefore.has(th.id)) start(th.id);
    });
    try {
      const id = await threads.askParagraph(section3, req);
      if (id) start(id);
    } finally {
      off();
    }
  }
  // ── Header, quote and notes from where the anchor resolves now ─────────
  async refreshStatus() {
    void this.refreshAiNote();
    const seq = ++this.seq;
    const route = this.route;
    if (route.name === "paragraph-draft") {
      const content = await this.readNote(route.section.path);
      if (!this.alive || seq !== this.seq || content === null) return;
      const n = paragraphNumberAt(splitParagraphSpans(content), route.section.lineStart);
      this.titleEl.setText(t("paragraph.pane.title", { n }));
      return;
    }
    let where = null;
    try {
      where = await this.host.threads.paragraphStatus(route.threadId);
    } catch (e) {
      console.error("Vocab Tracker: couldn't resolve a paragraph anchor", e);
    }
    if (!this.alive || seq !== this.seq) return;
    const anchor = this.anchor();
    if (!anchor) return;
    this.notesEl.empty();
    if ((where == null ? void 0 : where.status) === "found") {
      const n = paragraphNumberAt(splitParagraphSpans(where.content), where.section.lineStart);
      this.titleEl.setText(t("paragraph.pane.title", { n }));
      this.quoteEl.setText(plainParagraph(where.section.text));
      this.quoteEl.removeClass("is-orphan");
      this.target = { path: anchor.path, line: where.section.lineStart };
      if (where.edited) this.notesEl.appendChild(inlineNote({ tone: "info", icon: "file-diff", text: t("paragraph.pane.edited") }));
      if (!anchor.blockId) this.notesEl.appendChild(inlineNote({ tone: "info", icon: "hash", text: t("paragraph.pane.hashAnchor") }));
      return;
    }
    this.titleEl.setText(t("paragraph.pane.titleNoNumber"));
    this.quoteEl.setText(anchor.snapshot);
    this.quoteEl.addClass("is-orphan");
    this.target = null;
    const missingFile = (where == null ? void 0 : where.status) === "orphan" && where.reason === "missing-file";
    const note = inlineNote({ tone: "error", icon: "unlink", text: t(missingFile ? "paragraph.pane.orphanFile" : "paragraph.pane.orphanParagraph") });
    this.notesEl.appendChild(note);
    const bar = this.notesEl.createDiv({ cls: "vt-plist-actions" });
    const rebind = bar.createEl("button", { cls: "vt-plist-action", text: t("paragraph.action.rebind") });
    const id = route.threadId;
    rebind.addEventListener("click", () => this.nav.rebind(id));
    confirmButton(bar, t("paragraph.action.delete"), t("paragraph.action.confirmDelete"), () => {
      void this.host.threads.deleteThread(id).then(() => new import_obsidian14.Notice(t("paragraph.deleted")));
    });
  }
  async readNote(path) {
    try {
      return await this.host.notes.read(path);
    } catch (e) {
      return null;
    }
  }
  // Opens the note at the paragraph — in the pane that already shows it,
  // if there is one.
  async jump() {
    var _a, _b, _c;
    const target = this.target;
    if (!target) return;
    const { workspace, vault } = this.host.app;
    const file = vault.getAbstractFileByPath(target.path);
    if (!(file instanceof import_obsidian14.TFile)) return;
    const leaf = (_a = workspace.getLeavesOfType("markdown").find((l4) => {
      var _a2;
      return ((_a2 = l4.view.file) == null ? void 0 : _a2.path) === target.path;
    })) != null ? _a : workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: target.line } });
    workspace.revealLeaf(leaf);
    (_c = (_b = this.nav).jumped) == null ? void 0 : _c.call(_b);
  }
};
async function friendlyErrors(p) {
  try {
    await p;
  } catch (e) {
    if (e instanceof AnchorError && e.code === "not-anchorable") throw new Error(t("paragraph.error.notAnchorable"), { cause: e });
    throw e;
  }
}

// src/ui/sidebar/DiscussionList.ts
var import_obsidian15 = require("obsidian");

// src/ui/sidebar/discussionRows.ts
function questions(thread) {
  return liveTurns(thread).filter((t2) => t2.role === "user").length;
}
function ms(iso) {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}
function discussionRows(src, entries) {
  const rows = [];
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const thread = src.wordThread(entry.id);
    if (!thread || thread.deletedAt) continue;
    const count = questions(thread);
    if (!count) continue;
    rows.push({ threadId: thread.id, entryId: entry.id, title: entry.word, count, lastAt: lastTurnAt(thread) });
  }
  return rows.sort((a, b) => ms(b.lastAt) - ms(a.lastAt) || a.threadId.localeCompare(b.threadId));
}
var RECENT_DISCUSSIONS = 20;

// src/ui/sidebar/DiscussionList.ts
var DiscussionList = class extends import_obsidian15.Component {
  constructor(parent, deps, actions, view = { showAll: false }) {
    super();
    this.deps = deps;
    this.actions = actions;
    this.view = view;
    this.alive = false;
    this.el = parent.createDiv({ cls: "vt-dlist" });
  }
  onload() {
    this.alive = true;
    this.register(() => this.alive = false);
    const { threads } = this.deps;
    this.register(threads.events.on("thread:upsert", () => this.refresh()));
    this.register(threads.events.on("threads:reloaded", () => this.refresh()));
    void threads.ensureLoaded().then(() => this.refresh());
  }
  refresh() {
    if (!this.alive) return;
    const rows = discussionRows(this.deps.threads, this.deps.entries());
    this.actions.counted(rows.length);
    this.draw(rows);
  }
  draw(rows) {
    this.el.empty();
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("sidebar.ai.empty") });
      return;
    }
    const shown = this.view.showAll ? rows : rows.slice(0, RECENT_DISCUSSIONS);
    for (const row of shown) this.drawRow(row);
    if (rows.length > RECENT_DISCUSSIONS) {
      const more = this.el.createEl("button", {
        cls: "vt-dlist-more",
        text: this.view.showAll ? t("sidebar.ai.showLess") : t("sidebar.ai.showAll", { n: rows.length })
      });
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        this.view.showAll = !this.view.showAll;
        this.draw(rows);
      });
    }
  }
  drawRow(row) {
    const el = this.el.createDiv({ cls: "vt-dlist-row is-word" });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-thread-id", row.threadId);
    const open = () => this.actions.openWord(row.entryId);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    const title = el.createDiv({ cls: "vt-dlist-title" });
    (0, import_obsidian15.setIcon)(title.createSpan({ cls: "vt-dlist-icon" }), "type");
    title.createSpan({ cls: "vt-dlist-text", text: row.title });
    title.setAttr("aria-label", row.title);
    const parts = [t("paragraph.list.count", { n: row.count })];
    const date = shortDate2(row.lastAt);
    if (date) parts.push(date);
    el.createDiv({ cls: "vt-dlist-meta", text: parts.join(" \xB7 ") });
  }
};

// src/ui/sidebar/GrammarSection.ts
var import_obsidian16 = require("obsidian");

// src/ui/sidebar/grammarRows.ts
function ms2(iso) {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}
function later(a, b) {
  if (!a) return b;
  if (!b) return a;
  return ms2(b) > ms2(a) ? b : a;
}
function verbUsageRows(entries, favoriteOf) {
  var _a;
  const rows = [];
  for (const e of entries) {
    if (e.deletedAt || !e.usage) continue;
    const fav = favoriteOf(e.id);
    const lastAt = (_a = later(e.usage.generatedAt, fav == null ? void 0 : fav.updatedAt)) != null ? _a : e.usage.generatedAt;
    rows.push({ entryId: e.id, word: e.word, favorited: !!fav, lastAt });
  }
  return rows.sort((a, b) => ms2(b.lastAt) - ms2(a.lastAt) || a.entryId.localeCompare(b.entryId));
}
var RECENT_VERB_USAGE = 10;

// src/ui/sidebar/GrammarSection.ts
var GrammarSection = class extends import_obsidian16.Component {
  constructor(parent, deps, actions) {
    super();
    this.deps = deps;
    this.actions = actions;
    this.alive = false;
    this.el = parent.createDiv({ cls: "vt-glist" });
  }
  onload() {
    this.alive = true;
    this.register(() => this.alive = false);
    const { verbs, learn } = this.deps;
    this.register(verbs.events.on("verb:usage", () => this.refresh()));
    this.register(learn.events.on("verbFavorite:upsert", () => this.refresh()));
    this.register(learn.events.on("learn:reloaded", () => this.refresh()));
    this.refresh();
    void learn.ensureLoaded().then(() => this.refresh());
  }
  rows() {
    return verbUsageRows(this.deps.verbs.verbs(), (id) => this.deps.learn.verbFavorite(id));
  }
  refresh() {
    if (!this.alive) return;
    const rows = this.rows();
    this.actions.counted(rows.length);
    this.draw(rows);
  }
  draw(rows) {
    this.el.empty();
    this.el.createDiv({ cls: "vt-glist-sub", text: t("sidebar.grammar.verbs") });
    if (!rows.length) {
      this.el.createDiv({ cls: "vt-plist-hint", text: t("sidebar.grammar.empty") });
    } else {
      for (const row of rows.slice(0, RECENT_VERB_USAGE)) this.drawRow(row);
    }
    const more = this.el.createEl("button", { cls: "vt-glist-more", text: t("sidebar.grammar.viewAll") });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.actions.viewAll();
    });
  }
  drawRow(row) {
    const el = this.el.createDiv({ cls: "vt-glist-row" });
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.setAttr("data-entry-id", row.entryId);
    const open = () => this.actions.openWord(row.entryId);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    const title = el.createDiv({ cls: "vt-glist-title" });
    const icon = title.createSpan({ cls: "vt-glist-icon" });
    if (row.favorited) {
      icon.addClass("is-saved");
      (0, import_obsidian16.setIcon)(icon, "bookmark-check");
      icon.setAttr("aria-label", t("learn.verb.rowFavorited"));
    } else {
      (0, import_obsidian16.setIcon)(icon, "sparkles");
    }
    title.createSpan({ cls: "vt-glist-text", text: row.word });
    const date = shortDate2(row.lastAt);
    if (date) el.createDiv({ cls: "vt-glist-meta", text: date });
  }
};

// src/ui/sidebar/sections.ts
var SECTION_IDS = ["words", "paragraphs", "ai", "grammar"];
function isSectionId(value) {
  return SECTION_IDS.includes(value);
}
var SECTIONS_STORAGE_KEY = "vt-sidebar-sections";
var SectionState = class {
  constructor(store) {
    this.store = store;
    this.collapsed = /* @__PURE__ */ new Set();
    try {
      const saved = store == null ? void 0 : store.loadLocalStorage(SECTIONS_STORAGE_KEY);
      if (Array.isArray(saved)) {
        for (const id of saved) if (isSectionId(id)) this.collapsed.add(id);
      }
    } catch (e) {
    }
  }
  isCollapsed(id) {
    return this.collapsed.has(id);
  }
  set(id, collapsed) {
    var _a;
    if (collapsed === this.collapsed.has(id)) return;
    if (collapsed) this.collapsed.add(id);
    else this.collapsed.delete(id);
    try {
      (_a = this.store) == null ? void 0 : _a.saveLocalStorage(SECTIONS_STORAGE_KEY, [...this.collapsed]);
    } catch (e) {
    }
  }
  toggle(id) {
    this.set(id, !this.isCollapsed(id));
  }
};
function planReveal({ filterMode, activePath, entry }) {
  var _a;
  const mode = filterMode != null ? filterMode : "note";
  if (mode === "note") {
    if (!activePath || ((_a = entry.source) == null ? void 0 : _a.path) === activePath) return { filterMode: "note", openGroup: null };
  }
  return { filterMode: "all", openGroup: groupOf(entry).key };
}
var FLASH_MS = 1600;

// src/ui/sidebar/VocabSidebarView.ts
var VOCAB_VIEW_TYPE = "vocab-tracker-sidebar";
var NOTE_REFRESH_MS = 400;
var VocabSidebarView = class extends import_obsidian17.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    // Word clicked via a plain ==mark== that isn't tracked yet — prompts an
    // "add to vocab" banner instead of a full row (see processMarks).
    this.pendingWord = "";
    this.expandState = /* @__PURE__ */ new Map();
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.wordUi = new WordUi(this);
    this.router = new SidebarRouter();
    // The AI 討論 list's 「顯示全部」 (view memory, like expandState).
    this.discussionView = { showAll: false };
    // A discussion waiting for its new paragraph: the next ✦ clicked in
    // reading view rebinds it instead of opening that paragraph.
    this.rebindThreadId = null;
    // Exam word stats for the active note; refreshed on its own (see
    // refreshExamStrip) so a background scan never re-renders the word list
    // — that would wipe a half-typed question in an open AI tab.
    this.examStripEl = null;
    this.rebindEl = null;
    // Owner of the current draw's paragraph list / pane (their event
    // subscriptions end with the draw).
    this.drawScope = null;
    this.pane = null;
    this.paragraphList = null;
    this.missingList = null;
    // Word id → its ✦ n chip in the word list (either tab).
    this.wordChips = /* @__PURE__ */ new Map();
    this.changedPaths = /* @__PURE__ */ new Set();
    this.refreshChangedNotes = (0, import_obsidian17.debounce)(() => this.flushChangedNotes(), NOTE_REFRESH_MS, true);
    // The note a paragraph thread belongs to, if that note still exists.
    this.threadPath = (threadId) => {
      const th = this.plugin.threads.get(threadId);
      if ((th == null ? void 0 : th.anchor.kind) !== "paragraph") return null;
      return this.app.vault.getAbstractFileByPath(th.anchor.path) ? th.anchor.path : null;
    };
    this.plugin = plugin;
    this.sections = new SectionState(this.app);
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
    const { threads } = this.plugin;
    this.register(
      threads.events.on("thread:upsert", (th) => {
        if (th.anchor.kind === "word") this.updateWordChip(th.anchor.entryId);
      })
    );
    this.register(threads.events.on("threads:reloaded", () => this.updateWordChips()));
    void threads.ensureLoaded().then(() => this.updateWordChips());
    const { vault } = this.app;
    this.registerEvent(vault.on("modify", (f) => this.noteChanged(f.path)));
    this.registerEvent(vault.on("delete", (f) => this.noteChanged(f.path, true)));
    this.registerEvent(
      vault.on("rename", (f, oldPath) => {
        var _a;
        if (((_a = this.paragraphList) == null ? void 0 : _a.notePath) === oldPath) {
          window.setTimeout(() => this.render(), 0);
          return;
        }
        this.noteChanged(oldPath, true);
        this.noteChanged(f.path, true);
      })
    );
    this.register(() => document.body.removeClass(REBINDING_BODY_CLS));
    this.render();
  }
  // Called when a word is clicked (reading-mode word / ==mark==, through
  // WordSurfaces.revealWord). A tracked word is brought into view (see
  // revealEntry); an untracked one gets the 「加入單字庫」 banner.
  setWord(word) {
    var _a, _b;
    const entry = this.findEntry(word);
    if (entry) {
      this.revealEntry(entry);
      return;
    }
    this.pendingWord = word;
    this.router.back();
    this.render();
    (_b = (_a = this.scrollRoot()) == null ? void 0 : _a.scrollTo) == null ? void 0 : _b.call(_a, { top: 0 });
  }
  // A tracked word was clicked in reading view while the sidebar is open
  // (tap action 「選單」, 1005 回饋 3): follow it here without bringing the
  // sidebar to the front. False when the word isn't tracked.
  locateWord(word) {
    const entry = this.findEntry(word);
    if (!entry) return false;
    this.revealEntry(entry);
    return true;
  }
  // Shows one word's card, expanded and on the given tab (the word page's
  // 「在側欄開啟」 opens it on "ai", so does the AI 討論 list).
  openWord(entryId, tab) {
    const entry = this.plugin.store.entries.find((e) => e.id === entryId);
    if (entry) this.revealEntry(entry, tab);
  }
  findEntry(word) {
    const lower = word.toLowerCase();
    return this.plugin.store.entries.find((e) => e.word.toLowerCase() === lower);
  }
  // Brings a word into view (1005 回饋 3): back to the list, the 單字
  // section open, This note → All when the word is from another note (its
  // group opened there), the card expanded — then scrolled to and briefly
  // highlighted.
  revealEntry(entry, tab) {
    var _a, _b;
    const plan = planReveal({
      filterMode: this.filterMode,
      activePath: (_b = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : null,
      entry
    });
    this.filterMode = plan.filterMode;
    if (plan.openGroup) this.collapsedGroups.delete(plan.openGroup);
    this.sections.set("words", false);
    const state = this.expandState.get(entry.id);
    if (state === void 0 || state === "collapsed") this.expandState.set(entry.id, "half");
    if (tab) this.wordUi.tabs.set(entry.id, tab);
    this.pendingWord = "";
    this.router.back();
    this.draw();
    this.flashRow(entry.id);
  }
  // A card redrew the list (an edit, a fold, ✓). An edit makes the word
  // the most recent one, so it moves to the top: keep it in view there.
  renderKeeping(entryId) {
    this.render();
    if (!entryId) return;
    const row = this.rowEl(entryId);
    row == null ? void 0 : row.scrollIntoView({ block: "nearest" });
  }
  rowEl(entryId) {
    var _a, _b;
    return (_b = (_a = this.scrollRoot()) == null ? void 0 : _a.querySelector(`.vt-row[data-entry-id="${CSS.escape(entryId)}"]`)) != null ? _b : null;
  }
  scrollRoot() {
    var _a;
    return (_a = this.containerEl.children[1]) != null ? _a : null;
  }
  flashRow(entryId) {
    const row = this.rowEl(entryId);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    window.setTimeout(() => {
      if (row.isConnected) row.scrollIntoView({ block: "center" });
    }, 60);
    row.removeClass("vt-row-flash");
    row.addClass("vt-row-flash");
    window.setTimeout(() => row.removeClass("vt-row-flash"), FLASH_MS);
  }
  refreshExamStrip() {
    if (!this.examStripEl) return;
    this.examStripEl.empty();
    renderExamStrip(this.examStripEl, this.plugin, this.plugin.app.workspace.getActiveFile());
  }
  // ── Paragraph discussions ───────────────────────────────────────────────
  // A reading-mode ✦ was clicked (ParagraphBadges → main.ts). Opens that
  // paragraph's discussion, or a new one; while rebinding, the paragraph
  // becomes the waiting discussion's new anchor instead.
  async openParagraph(ref) {
    if (this.rebindThreadId) return this.finishRebind(ref);
    const { threads } = this.plugin;
    await threads.ensureLoaded();
    const thread = threads.paragraphThread(ref.path, ref.text);
    this.navigate(thread ? { name: "paragraph", threadId: thread.id } : { name: "paragraph-draft", section: ref });
  }
  openThread(threadId) {
    this.navigate({ name: "paragraph", threadId });
  }
  navigate(route) {
    if (this.router.go(route)) this.draw();
  }
  startRebind(threadId) {
    this.rebindThreadId = threadId;
    document.body.addClass(REBINDING_BODY_CLS);
    this.drawRebindBanner();
  }
  cancelRebind() {
    this.rebindThreadId = null;
    document.body.removeClass(REBINDING_BODY_CLS);
    this.drawRebindBanner();
  }
  async finishRebind(ref) {
    const threadId = this.rebindThreadId;
    this.cancelRebind();
    try {
      if (!await this.plugin.threads.rebindParagraph(threadId, ref)) return;
      new import_obsidian17.Notice(t("paragraph.rebind.done"));
      this.navigate({ name: "paragraph", threadId });
    } catch (e) {
      console.error("Vocab Tracker: rebind failed", e);
      new import_obsidian17.Notice(t("paragraph.rebind.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  drawRebindBanner() {
    const el = this.rebindEl;
    if (!el) return;
    el.empty();
    el.toggle(!!this.rebindThreadId);
    if (!this.rebindThreadId) return;
    (0, import_obsidian17.setIcon)(el.createSpan({ cls: "vt-rebind-icon" }), "link");
    el.createSpan({ cls: "vt-rebind-text", text: t("paragraph.rebind.banner") });
    const cancel = el.createEl("button", { text: t("paragraph.rebind.cancel") });
    cancel.addEventListener("click", () => this.cancelRebind());
  }
  listActions() {
    return {
      open: (id) => this.openThread(id),
      rebind: (id) => this.startRebind(id),
      remove: (id) => void this.plugin.threads.deleteThread(id).then(() => new import_obsidian17.Notice(t("paragraph.deleted")))
    };
  }
  paneNav() {
    return {
      back: () => this.navigate(LIST_ROUTE),
      threadStarted: (section3, threadId) => {
        const draftKey = routeKey({ name: "paragraph-draft", section: section3 });
        if (!this.router.promoteDraft(section3, threadId)) return;
        const chat = this.wordUi.chat;
        if (chat.focused === draftKey) chat.focused = threadId;
        this.draw();
      },
      rebind: (id) => this.startRebind(id),
      removed: (id) => {
        const r = this.router.current;
        if (r.name === "paragraph" && r.threadId === id) this.navigate(LIST_ROUTE);
      }
    };
  }
  listDeps() {
    const { threads, notes, ai } = this.plugin;
    return { threads, notes, taskLabel: (id) => {
      var _a;
      return (_a = ai.tasks.get(id)) == null ? void 0 : _a.label;
    } };
  }
  noteChanged(path, structural = false) {
    var _a, _b;
    const watched = ((_a = this.paragraphList) == null ? void 0 : _a.notePath) === path || ((_b = this.pane) == null ? void 0 : _b.path) === path;
    if (!watched && !(structural && this.missingList)) return;
    this.changedPaths.add(path);
    this.refreshChangedNotes();
  }
  flushChangedNotes() {
    var _a, _b;
    const paths = this.changedPaths;
    this.changedPaths = /* @__PURE__ */ new Set();
    if (this.paragraphList && paths.has(this.paragraphList.notePath)) void this.paragraphList.refresh();
    const panePath = (_a = this.pane) == null ? void 0 : _a.path;
    if (this.pane && panePath && paths.has(panePath)) void this.pane.refreshStatus();
    (_b = this.missingList) == null ? void 0 : _b.refresh();
  }
  // ── ✦ n on words with discussions ───────────────────────────────────────
  drawWordChip(chip2, entryId) {
    const n = this.plugin.threads.wordQuestionCount(entryId);
    chip2.empty();
    chip2.toggle(n > 0);
    if (!n) return;
    (0, import_obsidian17.setIcon)(chip2.createSpan({ cls: "vt-word-tc-icon" }), "sparkles");
    chip2.createSpan({ text: String(n) });
    chip2.setAttr("aria-label", t("word.discussions", { n }));
  }
  updateWordChip(entryId) {
    const chip2 = this.wordChips.get(entryId);
    if (chip2 == null ? void 0 : chip2.isConnected) this.drawWordChip(chip2, entryId);
  }
  updateWordChips() {
    for (const id of this.wordChips.keys()) this.updateWordChip(id);
  }
  // ── Drawing ─────────────────────────────────────────────────────────────
  // Public entry point (main.ts calls it on note switches and after word
  // edits). Closes a paragraph pane that belongs to another note; keeps an
  // open pane as is when its route didn't change.
  render() {
    var _a, _b;
    const active2 = (_b = (_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : null;
    const route = routeForActiveNote(this.router.current, active2, this.threadPath);
    this.router.go(route);
    if (this.pane && sameRoute(this.pane.route, this.router.current)) return;
    this.draw();
  }
  draw() {
    const root = this.containerEl.children[1];
    this.wordUi.beginRender();
    if (this.drawScope) this.removeChild(this.drawScope);
    const scope = this.drawScope = this.addChild(new import_obsidian17.Component());
    this.pane = null;
    this.paragraphList = null;
    this.missingList = null;
    this.examStripEl = null;
    this.wordChips.clear();
    root.empty();
    root.addClass("vt-sidebar");
    const header = root.createEl("div", { cls: "vt-sidebar-header" });
    header.createEl("h4", { text: t("sidebar.title") });
    const openList = header.createEl("span", { cls: "vt-icon-btn clickable-icon" });
    (0, import_obsidian17.setIcon)(openList, "file-text");
    openList.setAttr("role", "button");
    openList.setAttr("aria-label", t("sidebar.openList"));
    openList.onclick = () => this.plugin.openVocabFile();
    this.rebindEl = root.createDiv({ cls: "vt-rebind-banner" });
    this.drawRebindBanner();
    const route = this.router.current;
    if (route.name === "list") {
      this.drawList(root, scope);
    } else {
      this.pane = scope.addChild(new ParagraphThreadPane(root, route, this.plugin, this.wordUi.chat, this.paneNav()));
    }
  }
  drawList(root, scope) {
    if (this.pendingWord) {
      const banner = root.createEl("div", { cls: "vt-sidebar-add-prompt" });
      banner.createEl("span", { text: `"${this.pendingWord}"`, cls: "vt-sidebar-add-prompt-word" });
      const addBtn = banner.createEl("button", { text: t("sidebar.addPrompt.cta"), cls: "vt-sidebar-add-btn" });
      addBtn.onclick = async () => {
        const word = this.pendingWord;
        await this.plugin.addWordToVocab(word, {}, { reveal: false });
        this.setWord(word);
      };
      const dismiss = banner.createEl("span", { cls: "vt-close-btn" });
      (0, import_obsidian17.setIcon)(dismiss, "x");
      dismiss.onclick = () => {
        this.pendingWord = "";
        this.render();
      };
    }
    const words = this.drawSection(root, "words", t("sidebar.section.words"));
    if (words) this.drawWords(words);
    const pCounter = { el: null };
    const paragraphs = this.drawSection(root, "paragraphs", t("paragraph.list.title", { n: "\u2026" }), pCounter);
    if (paragraphs) {
      this.drawParagraphs(paragraphs, scope, (n) => {
        var _a;
        return (_a = pCounter.el) == null ? void 0 : _a.setText(t("paragraph.list.title", { n }));
      });
    } else {
      const { threads } = this.plugin;
      const recount = () => {
        var _a;
        if (!((_a = pCounter.el) == null ? void 0 : _a.isConnected)) return;
        pCounter.el.setText(t("paragraph.list.title", { n: this.currentNoteParagraphCount() }));
      };
      scope.register(threads.events.on("thread:upsert", recount));
      scope.register(threads.events.on("threads:reloaded", recount));
      void threads.ensureLoaded().then(recount);
    }
    const counter = { el: null };
    const ai = this.drawSection(root, "ai", t("sidebar.section.ai", { n: "\u2026" }), counter);
    if (ai) {
      const { threads } = this.plugin;
      scope.addChild(
        new DiscussionList(
          ai,
          { threads, entries: () => this.plugin.store.entries },
          {
            openWord: (entryId) => this.openWord(entryId, "ai"),
            counted: (n) => {
              var _a;
              return (_a = counter.el) == null ? void 0 : _a.setText(t("sidebar.section.ai", { n }));
            }
          },
          this.discussionView
        )
      );
    } else {
      const { threads } = this.plugin;
      const recount = () => {
        var _a;
        if (!((_a = counter.el) == null ? void 0 : _a.isConnected)) return;
        const n = discussionRows(threads, this.plugin.store.entries).length;
        counter.el.setText(t("sidebar.section.ai", { n }));
      };
      scope.register(threads.events.on("thread:upsert", recount));
      scope.register(threads.events.on("threads:reloaded", recount));
      void threads.ensureLoaded().then(recount);
    }
    const gCounter = { el: null };
    const grammar = this.drawSection(root, "grammar", t("sidebar.section.grammar", { n: "\u2026" }), gCounter);
    if (grammar) {
      scope.addChild(
        new GrammarSection(
          grammar,
          { verbs: this.plugin.verbs, learn: this.plugin.learn },
          {
            openWord: (entryId) => void this.plugin.openWordPage(entryId),
            viewAll: () => void this.plugin.openEntryFile("verbs"),
            counted: (n) => {
              var _a;
              return (_a = gCounter.el) == null ? void 0 : _a.setText(t("sidebar.section.grammar", { n }));
            }
          }
        )
      );
    } else {
      const { verbs, learn } = this.plugin;
      const recount = () => {
        var _a;
        if (!((_a = gCounter.el) == null ? void 0 : _a.isConnected)) return;
        const n = verbUsageRows(verbs.verbs(), (id) => learn.verbFavorite(id)).length;
        gCounter.el.setText(t("sidebar.section.grammar", { n }));
      };
      scope.register(verbs.events.on("verb:usage", recount));
      scope.register(learn.events.on("verbFavorite:upsert", recount));
      scope.register(learn.events.on("learn:reloaded", recount));
      void learn.ensureLoaded().then(recount);
    }
  }
  // The active note's live paragraph threads — the 段落討論 section's
  // count while it's folded (unfolded, ParagraphThreadList reports its
  // own row count via onCount instead).
  currentNoteParagraphCount() {
    var _a;
    const path = (_a = this.plugin.app.workspace.getActiveFile()) == null ? void 0 : _a.path;
    return path ? this.plugin.threads.paragraphThreads(path).length : 0;
  }
  // ── 段落討論（n）/ orphaned discussions ─────────────────────────
  //
  // Independent of the 單字 tab (This note / All, Wave 6 W): always the
  // note in front's paragraph discussions, plus any discussion whose note
  // is gone — that list hides itself when there's none (regardless of
  // which note, if any, is in front).
  drawParagraphs(root, scope, onCount) {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (activeFile instanceof import_obsidian17.TFile && activeFile.extension === "md") {
      this.paragraphList = scope.addChild(
        new ParagraphThreadList(root, activeFile.path, this.listDeps(), this.listActions(), void 0, onCount)
      );
    } else {
      onCount(0);
      root.createDiv({ cls: "vt-sidebar-hint", text: t("sidebar.paragraphs.noNote") });
    }
    this.missingList = scope.addChild(
      new MissingNoteThreadList(
        root,
        { ...this.listDeps(), exists: (p) => !!this.app.vault.getAbstractFileByPath(p) },
        this.listActions()
      )
    );
  }
  // A section heading (click to fold); returns the body to fill, or null
  // when the section is folded.
  drawSection(root, id, title, titleRef) {
    const collapsed = this.sections.isCollapsed(id);
    const section3 = root.createDiv({ cls: "vt-sb-section" });
    section3.setAttr("data-section", id);
    section3.toggleClass("is-collapsed", collapsed);
    const head = section3.createDiv({ cls: "vt-sb-section-head" });
    head.setAttr("role", "button");
    head.setAttr("tabindex", "0");
    head.setAttr("aria-expanded", String(!collapsed));
    (0, import_obsidian17.setIcon)(head.createSpan({ cls: "vt-sb-section-arrow" }), collapsed ? "chevron-right" : "chevron-down");
    const label = head.createSpan({ cls: "vt-sb-section-title", text: title });
    if (titleRef) titleRef.el = label;
    const toggle = () => {
      this.sections.toggle(id);
      this.draw();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    if (collapsed) return null;
    return section3.createDiv({ cls: "vt-sb-section-body" });
  }
  drawWords(root) {
    var _a;
    const entries = this.plugin.store.entries;
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const canFilter = !!activeFile;
    if (this.filterMode === void 0) this.filterMode = "note";
    const noteMode = this.filterMode === "note" && canFilter;
    let list = entries;
    let scopeLabel = t("sidebar.scope.all");
    if (noteMode) {
      list = entries.filter(
        (e) => e.source && e.source.path === activeFile.path
      );
      scopeLabel = t("sidebar.scope.note");
    }
    const listHeader = root.createEl("div", { cls: "vt-sidebar-list-header" });
    const countLabel = listHeader.createEl("div", { cls: "vt-sidebar-count-label" });
    countLabel.textContent = `${scopeLabel} (${list.length})`;
    const toggle = listHeader.createEl("div", { cls: "vt-toggle-group" });
    const mkToggle = (label, mode) => {
      const on = this.filterMode === mode;
      const b = toggle.createEl("span", { text: label, cls: "vt-toggle-btn" });
      b.toggleClass("is-active", on);
      b.onclick = () => {
        this.filterMode = mode;
        this.draw();
      };
    };
    mkToggle(t("sidebar.filter.note"), "note");
    mkToggle(t("sidebar.filter.all"), "all");
    this.examStripEl = root.createDiv();
    this.refreshExamStrip();
    if (list.length === 0) {
      root.createEl("div", {
        text: noteMode ? t("sidebar.hint.noteEmpty") : t("sidebar.hint.allEmpty"),
        cls: "vt-sidebar-hint"
      });
    } else {
      const listEl = root.createEl("div", { cls: "vt-word-list" });
      const rowOpts = {
        ui: this.wordUi,
        // ✦ n after the word (design D1); the dashboard doesn't pass this.
        decorateWord: (wrap, entry) => {
          const chip2 = wrap.createSpan({ cls: "vt-word-tc" });
          this.wordChips.set(entry.id, chip2);
          this.drawWordChip(chip2, entry.id);
        },
        openWordPage: (entry) => void this.plugin.openWordPage(entry.id)
      };
      if (this.filterMode === "all") {
        renderGroupedVocabList(
          this.plugin,
          listEl,
          list,
          this.collapsedGroups,
          this.expandState,
          (entryId) => this.renderKeeping(entryId),
          rowOpts,
          { order: "recent" }
        );
      } else {
        for (const entry of sortByRecent(list)) {
          const state = (_a = this.expandState.get(entry.id)) != null ? _a : "collapsed";
          renderVocabRow(
            this.plugin,
            listEl,
            entry,
            state,
            (s) => this.expandState.set(entry.id, s),
            () => this.renderKeeping(entry.id),
            rowOpts
          );
        }
      }
    }
  }
};

// src/ui/blocks/dashboard.ts
var import_obsidian18 = require("obsidian");
function renderDashboard(plugin, _source, el, ctx) {
  var _a;
  const entries = plugin.store.entries;
  el.addClass("vt-dash");
  if (entries.length === 0) {
    el.createEl("p", {
      text: t("dashboard.empty"),
      cls: "vt-dash-empty"
    });
    return;
  }
  const stats = el.createEl("div", { cls: "vt-dash-stats" });
  stats.createEl("span", {
    text: entries.length === 1 ? t("dashboard.stat.word", { count: entries.length }) : t("dashboard.stat.words", { count: entries.length }),
    cls: "vt-stat-pill"
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
      cls: ["vt-stat-pill", "is-accent"]
    });
  }
  renderReviewButton(plugin, el, ctx);
  const search = el.createEl("input", { cls: ["vt-dash-search", "vt-field-box"] });
  search.placeholder = t("dashboard.search");
  const listWrap = el.createEl("div", { cls: "vt-word-list" });
  const owner = new import_obsidian18.MarkdownRenderChild(listWrap);
  ctx.addChild(owner);
  const wordUi = new WordUi(owner);
  const expandState = /* @__PURE__ */ new Map();
  const collapsedGroups = /* @__PURE__ */ new Set();
  const draw = (q) => {
    wordUi.beginRender();
    listWrap.empty();
    const rows = entries.filter(
      (e) => e.word.toLowerCase().includes(q.toLowerCase())
    );
    renderGroupedVocabList(plugin, listWrap, rows, collapsedGroups, expandState, () => draw(search.value), {
      showDue: true,
      ui: wordUi
    });
  };
  draw("");
  search.oninput = () => draw(search.value);
}
function renderReviewButton(plugin, el, ctx) {
  const btn = el.createEl("button", { cls: "vt-dash-review" });
  (0, import_obsidian18.setIcon)(btn.createSpan({ cls: "vt-dash-review-icon" }), "layers");
  const label = btn.createSpan();
  btn.onclick = () => void plugin.openFlashcards();
  const update = () => {
    const n = plugin.srs.queue().length;
    label.setText(n > 0 ? t("dashboard.startReview", { count: n }) : t("dashboard.startReview.none"));
    btn.toggleClass("mod-cta", n > 0);
  };
  update();
  const child = new import_obsidian18.MarkdownRenderChild(el);
  let alive = true;
  child.register(() => alive = false);
  child.register(plugin.store.events.on("data:changed", update));
  ctx.addChild(child);
  void plugin.srs.ensureLoaded().then(() => {
    if (alive) update();
  });
}

// src/ui/blocks/families.ts
var import_obsidian21 = require("obsidian");

// src/ui/kit/aiDebug.ts
var import_obsidian19 = require("obsidian");
function debugText(key3) {
  return t(`ai.debug.${key3}`);
}
function debugReportText(d) {
  return aiDebugReport(d, { prompt: debugText("prompt"), output: debugText("output"), empty: debugText("empty") });
}
function aiErrorBox(opts) {
  const box = createDiv({ cls: "vt-ai-error-box" });
  box.appendChild(inlineNote({ tone: "error", text: opts.text }));
  const debug = aiDebugOf(opts.error);
  if (debug) box.appendChild(aiDebugDetails(debug));
  return box;
}
function aiDebugDetails(d) {
  const details = createEl("details", { cls: "vt-ai-debug" });
  const summary = details.createEl("summary", { cls: "vt-ai-debug-summary" });
  (0, import_obsidian19.setIcon)(summary.createSpan({ cls: "vt-ai-debug-icon" }), "bug");
  summary.createSpan({ text: debugText("summary") });
  const bar = details.createDiv({ cls: "vt-ai-debug-bar" });
  bar.createSpan({ cls: "vt-ai-debug-hint", text: debugText("hint") });
  const copy = bar.createEl("button", { cls: "vt-btn vt-ai-debug-copy", attr: { type: "button" } });
  (0, import_obsidian19.setIcon)(copy.createSpan({ cls: "vt-btn-icon" }), "copy");
  copy.createSpan({ text: debugText("copy") });
  copy.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void copyText(debugReportText(d));
  });
  const meta = [d.taskId, d.model, d.stop && `stop: ${d.stop}`, d.reason].filter(Boolean).join(" \xB7 ");
  if (meta) details.createDiv({ cls: "vt-ai-debug-meta", text: meta });
  section(details, debugText("prompt"), d.prompt);
  section(details, debugText("output"), d.output);
  return details;
}
function section(parent, label, text) {
  parent.createDiv({ cls: "vt-ai-debug-label", text: label });
  parent.createEl("pre", { cls: "vt-ai-debug-pre", text: text || debugText("empty") });
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    new import_obsidian19.Notice(debugText("copied"));
  } catch (e) {
    new import_obsidian19.Notice(debugText("copyFailed"));
  }
}

// src/ui/kit/dates.ts
function dateLabel(key3, date) {
  return t(`learn.dates.${key3}`, { date });
}
var pad = (n) => String(n).padStart(2, "0");
function dayLabel(iso, now = /* @__PURE__ */ new Date()) {
  if (!iso) return void 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return void 0;
  const md = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}
function recordDates(rec, now = /* @__PURE__ */ new Date()) {
  const added = dayLabel(rec.createdAt, now);
  const updated = dayLabel(rec.updatedAt, now);
  const out = {};
  if (added) out.added = added;
  if (updated && updated !== added) out.updated = updated;
  return out;
}
function datesText(d, first = "added") {
  const parts = [];
  if (d.added) parts.push(dateLabel(first, d.added));
  if (d.updated) parts.push(dateLabel("updated", d.updated));
  return parts.join(" \xB7 ");
}

// src/core/wordlists/lemma.ts
var MIN_BASE = 3;
function isConsonant2(c) {
  return /[b-df-hj-np-tv-z]/.test(c);
}
function lemmaCandidates(lower) {
  const w = lower.endsWith("'s") ? lower.slice(0, -2) : lower;
  const out = w !== lower ? [w] : [];
  const add2 = (base) => {
    if (base.length >= MIN_BASE && base !== w && !out.includes(base)) out.push(base);
  };
  if (w.endsWith("ies") || w.endsWith("ied")) {
    add2(w.slice(0, -3) + "y");
  }
  if (w.endsWith("s") && !w.endsWith("ss")) {
    add2(w.slice(0, -1));
    if (w.endsWith("es")) add2(w.slice(0, -2));
  }
  if (w.endsWith("ed") && !w.endsWith("eed")) {
    add2(w.slice(0, -1));
    const stem = w.slice(0, -2);
    add2(stem);
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && isConsonant2(stem[stem.length - 1])) {
      add2(stem.slice(0, -1));
    }
  }
  if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    add2(stem);
    add2(stem + "e");
    if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && isConsonant2(stem[stem.length - 1])) {
      add2(stem.slice(0, -1));
    }
    if (stem.endsWith("y")) add2(stem.slice(0, -1) + "ie");
  }
  if (w.endsWith("ily")) add2(w.slice(0, -3) + "y");
  if (w.endsWith("ly") && w.length - 2 >= 4) add2(w.slice(0, -2));
  return out;
}

// src/services/learn/wordIndex.ts
var TOKEN_RE2 = /[A-Za-z][A-Za-z'-]*/g;
var STOP = /* @__PURE__ */ new Set(["the", "she", "new", "even", "like", "use", "her", "his", "one"]);
function pluralBases(w) {
  if (w.length > 4 && w.endsWith("ies")) return [w.slice(0, -3) + "y"];
  if (/(?:s|x|z|ch|sh)es$/.test(w)) return [w.slice(0, -2)];
  if (w.length > 3 && w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) return [w.slice(0, -1)];
  return [];
}
var WordIndex = class {
  constructor(entries) {
    this.exact = /* @__PURE__ */ new Map();
    // Base forms of the entries' own words ("aprons" → "apron").
    this.base = /* @__PURE__ */ new Map();
    // Multi-word entries ("paring knife", "gloss over") are matched as phrases.
    this.phrases = [];
    for (const e of entries) {
      if (e.deletedAt) continue;
      const w = e.word.trim().toLowerCase();
      if (!w) continue;
      if (/\s/.test(w)) {
        this.phrases.push(e);
        continue;
      }
      if (!this.exact.has(w)) this.exact.set(w, e);
    }
    for (const [w, e] of this.exact) {
      for (const b of pluralBases(w)) if (!STOP.has(b) && !this.exact.has(b) && !this.base.has(b)) this.base.set(b, e);
    }
  }
  // The entry for a single word or phrase, if it's in the list.
  find(word) {
    var _a;
    const w = word.trim().toLowerCase();
    if (!w) return void 0;
    if (/\s/.test(w)) return this.phrases.find((e) => e.word.trim().toLowerCase() === w);
    const hit = (_a = this.exact.get(w)) != null ? _a : this.base.get(w);
    if (hit) return hit;
    for (const b of lemmaCandidates(w)) {
      const e = this.exact.get(b);
      if (e) return e;
    }
    return void 0;
  }
  // Ids of the learned words appearing in `text`, in order of first
  // appearance (phrases after single words), minus `exclude`.
  mentions(text, exclude = /* @__PURE__ */ new Set()) {
    var _a;
    const out = [];
    const add2 = (e) => {
      if (e && !exclude.has(e.id) && !out.includes(e.id)) out.push(e.id);
    };
    for (const token2 of (_a = text.match(TOKEN_RE2)) != null ? _a : []) add2(this.find(token2.replace(/^['-]+|['-]+$/g, "")));
    for (const e of this.phrases) if (buildWordRe(e.word.trim()).test(text)) add2(e);
    return out;
  }
};

// src/ui/blocks/params.ts
function parseBlockParams(source) {
  const out = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key3 = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key3) out[key3] = value;
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
  const unquote3 = (s) => (s != null ? s : "").replace(/^["']|["']$/g, "").trim();
  const id = unquote3(p.id);
  const word = unquote3(p.word);
  if (id) out.id = id;
  else if (word) out.word = word;
  return out;
}

// src/ui/blocks/familiesModel.ts
var unquote = (s) => (s != null ? s : "").trim().replace(/^["']|["']$/g, "").trim();
function parseFamiliesParams(source) {
  var _a;
  const p = parseBlockParams(source);
  const out = {};
  const topic = unquote((_a = p.topic) != null ? _a : p.family);
  if (topic) out.topic = topic;
  const word = unquote(p.word);
  if (word) out.word = word;
  return out;
}
var key = (w) => w.trim().toLowerCase();
function familyTitle(f) {
  const topic = f.topic.trim();
  const label = f.label.trim();
  if (!label) return topic;
  if (!topic || key(label).includes(key(topic))) return label;
  return `${topic} ${label}`;
}
function findFamily(families, topic) {
  if (!topic) return void 0;
  const k = key(topic);
  return families.find((f) => key(f.topic) === k || key(f.label) === k || key(familyTitle(f)) === k);
}
var MemberLookup = class {
  constructor(entries) {
    const live = entries.filter((e) => !e.deletedAt);
    this.byId = new Map(live.map((e) => [e.id, e]));
    this.index = new WordIndex(live);
  }
  entry(m) {
    var _a;
    return (_a = m.entryId ? this.byId.get(m.entryId) : void 0) != null ? _a : this.index.find(m.word);
  }
  byEntryId(id) {
    return this.byId.get(id);
  }
};
function familyTree(f, lookup, opts = {}) {
  var _a;
  let knownCount = 0;
  let suggestedCount = 0;
  const columns = [];
  for (const g of f.groups) {
    const chips = [];
    for (const m of g.members) {
      if (!m.word.trim()) continue;
      const e = lookup.entry(m);
      if (e) knownCount++;
      else suggestedCount++;
      const chip2 = e ? { word: m.word, zh: m.zh, known: true, entryId: e.id } : { word: m.word, zh: m.zh, known: false };
      if (e && opts.focusEntryId && e.id === opts.focusEntryId) chip2.focus = true;
      chips.push(chip2);
    }
    if (chips.length) columns.push({ label: g.label, chips });
  }
  const seeds = ((_a = f.seedEntryIds) != null ? _a : []).map((id) => {
    var _a2;
    return (_a2 = lookup.byEntryId(id)) == null ? void 0 : _a2.word;
  }).filter((w) => !!w);
  return { id: f.id, title: familyTitle(f), columns, seeds, knownCount, suggestedCount, dates: recordDates(f, opts.now) };
}
function familiesWith(families, entry) {
  const word = key(entry.word);
  return families.filter(
    (f) => familyMembers(f).some((m) => m.entryId === entry.id || key(m.word) === word)
  );
}
function pickSelected(families, current, preferTopic) {
  var _a, _b;
  if (current && families.some((f) => f.id === current)) return current;
  return (_b = (_a = findFamily(families, preferTopic)) != null ? _a : families[0]) == null ? void 0 : _b.id;
}
var pendingFocus = null;
var focusListeners = /* @__PURE__ */ new Set();
function focusFamily(focus) {
  pendingFocus = focus;
  for (const fn of focusListeners) fn(focus);
}
function takeFamilyFocus() {
  const f = pendingFocus;
  pendingFocus = null;
  return f;
}
function onFamilyFocus(fn) {
  focusListeners.add(fn);
  return () => focusListeners.delete(fn);
}

// src/ui/blocks/learnUi.ts
var import_obsidian20 = require("obsidian");
function guardReadingClicks(owner, root) {
  owner.registerDomEvent(root, "click", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("a")) return;
    e.stopPropagation();
  });
}
function learnErrorText(e) {
  if (isAiError(e)) return aiErrorText(e);
  return e instanceof Error ? e.message : String(e);
}
var isAbort = (e) => isAiError(e) && e.code === "aborted";
function renderLearnAiGate(parent, plugin) {
  const status = plugin.ai.status();
  if (status === "ready") return false;
  if (status === "offline") {
    parent.appendChild(inlineNote({ tone: "offline", text: t("learn.ai.offline") }));
    return true;
  }
  parent.appendChild(
    emptyState({
      icon: status === "disabled" ? "sparkles" : "key-round",
      title: t(status === "disabled" ? "learn.ai.disabled.title" : "learn.ai.noKey.title"),
      body: t("learn.ai.body"),
      action: {
        label: t("ai.action.openSettings"),
        icon: "settings",
        onClick: () => openPluginSettings(plugin.app, plugin.manifest.id)
      }
    })
  );
  return true;
}
function wordOpener(host) {
  const open = host.openWordCard;
  return typeof open === "function" ? (entry) => void open.call(host, entry) : void 0;
}
function wordChip(parent, host, entry, cls) {
  const open = entry ? wordOpener(host) : void 0;
  if (!entry || !open) return parent.createSpan({ cls });
  const el = parent.createEl("button", { cls, attr: { type: "button", title: t("learn.openWord", { word: entry.word }) } });
  el.addClass("is-link");
  el.addEventListener("click", () => open(entry));
  return el;
}
function learnButton(parent, opts) {
  const btn = parent.createEl("button", { cls: "vt-btn vt-learn-btn" });
  if (opts.cta) btn.addClass("mod-cta");
  if (opts.ghost) btn.addClass("is-ghost");
  if (opts.icon) (0, import_obsidian20.setIcon)(btn.createSpan({ cls: "vt-btn-icon" }), opts.icon);
  btn.createSpan({ text: opts.label });
  btn.addEventListener("click", opts.onClick);
  return btn;
}

// src/ui/blocks/families.ts
function renderFamilies(plugin, source, el, ctx) {
  ctx.addChild(new FamiliesBlock(el, plugin, parseFamiliesParams(source)));
}
var FamiliesBlock = class extends import_obsidian21.MarkdownRenderChild {
  constructor(containerEl, plugin, params) {
    super(containerEl);
    this.plugin = plugin;
    this.params = params;
    this.loaded = false;
    this.disposed = false;
    this.generating = null;
    // The failure and what was thrown (an unreadable answer carries the
    // prompt and raw output for the debug box).
    this.error = null;
    // Suggested words being added (「點一下加入」), so a double tap adds once.
    this.adding = /* @__PURE__ */ new Set();
  }
  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-families"] });
    guardReadingClicks(this, this.root);
    if (!this.params.word) {
      const focus = takeFamilyFocus();
      if (focus) {
        this.selectedId = focus.familyId;
        this.focusEntryId = focus.entryId;
      }
      this.register(onFamilyFocus((f) => this.focus(f)));
    }
    const redraw = () => this.render();
    this.register(this.plugin.learn.events.on("family:upsert", redraw));
    this.register(this.plugin.learn.events.on("learn:reloaded", redraw));
    this.register(this.plugin.store.events.on("data:changed", redraw));
    this.render();
    void this.plugin.families.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.render();
    });
  }
  onunload() {
    this.disposed = true;
    if (this.generating) this.plugin.families.stop();
  }
  focus(focus) {
    if (this.disposed) return;
    takeFamilyFocus();
    this.selectedId = focus.familyId;
    this.focusEntryId = focus.entryId;
    this.render();
    this.root.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  // ── Data ──────────────────────────────────────────────────────
  wordEntry(lookup) {
    return this.params.word ? lookup.entry({ word: this.params.word }) : void 0;
  }
  shownFamilies(entry) {
    const all = this.plugin.families.families();
    return entry ? familiesWith(all, entry) : all;
  }
  // ── Actions ───────────────────────────────────────────────────
  // AI 結果直接存成字族 (1005 回饋: 審核清單移除) — nothing is shown for
  // review first; a candidate's not-yet-learned members land in the tree
  // as plain text, and the learner adds them one at a time from there
  // (addSuggested, below) instead of ticking a batch up front.
  async generate(replace, seed) {
    if (this.generating) return;
    const ctrl = this.generating = new AbortController();
    this.error = null;
    this.render();
    try {
      const candidates = await this.plugin.families.generate({
        seedEntryIds: seed ? [seed.id] : void 0,
        signal: ctrl.signal
      });
      if (this.disposed) return;
      if (!candidates.length) this.error = { text: t("learn.family.noneFound") };
      else await this.save(candidates, replace);
    } catch (e) {
      if (this.disposed) return;
      if (!isAbort(e)) {
        console.error("Vocab Tracker: family generation failed", e);
        this.error = { text: learnErrorText(e), cause: e };
      }
    } finally {
      if (this.generating === ctrl) this.generating = null;
      if (!this.disposed) this.render();
    }
  }
  stop() {
    var _a;
    (_a = this.generating) == null ? void 0 : _a.abort();
    this.plugin.families.stop();
  }
  async save(candidates, replace) {
    var _a, _b;
    try {
      const { families } = await this.plugin.families.save(candidates, { replace });
      if (this.disposed) return;
      this.selectedId = (_b = (_a = families[0]) == null ? void 0 : _a.id) != null ? _b : this.selectedId;
      new import_obsidian21.Notice(t("learn.family.saved", { families: families.length }));
    } catch (e) {
      console.error("Vocab Tracker: saving families failed", e);
      new import_obsidian21.Notice(learnErrorText(e));
    }
  }
  async addSuggested(familyId, word) {
    const k = `${familyId}\0${word.toLowerCase()}`;
    if (this.adding.has(k)) return;
    this.adding.add(k);
    this.render();
    try {
      const entry = await this.plugin.families.addSuggested(familyId, word);
      if (entry) new import_obsidian21.Notice(t("learn.family.added", { word: entry.word }));
    } catch (e) {
      console.error("Vocab Tracker: adding a family word failed", e);
      new import_obsidian21.Notice(learnErrorText(e));
    } finally {
      this.adding.delete(k);
      if (!this.disposed) this.render();
    }
  }
  remove(f) {
    this.plugin.families.remove(f.id);
    if (this.selectedId === f.id) this.selectedId = void 0;
    new import_obsidian21.Notice(t("learn.family.deleted", { name: f.label || f.topic }));
  }
  // ── Render ────────────────────────────────────────────────────
  render() {
    const root = this.root;
    root.empty();
    if (!this.loaded) {
      root.createDiv({ cls: "vt-learn-loading", text: t("learn.loading") });
      return;
    }
    const lookup = new MemberLookup(this.plugin.store.entries);
    const entry = this.wordEntry(lookup);
    if (this.params.word && !entry) {
      root.appendChild(emptyState({ icon: "git-fork", title: t("learn.notFound", { word: this.params.word }) }));
      return;
    }
    const families = this.shownFamilies(entry);
    this.selectedId = pickSelected(families, this.selectedId, this.params.topic);
    if (families.length) this.renderToolbar(families, entry);
    if (!entry && !this.generating && this.plugin.families.needsRegroup()) {
      const note = root.createDiv({ cls: "vt-fam-regroup-note" });
      note.appendChild(inlineNote({ tone: "info", icon: "refresh-cw", text: t("learn.family.regroup.hint") }));
      learnButton(note, { label: t("learn.family.regroup"), icon: "refresh-cw", onClick: () => void this.generate(true) });
    }
    if (this.generating) return this.renderGenerating();
    if (this.error) {
      const box = root.createDiv({ cls: "vt-learn-error" });
      box.appendChild(aiErrorBox({ text: this.error.text, error: this.error.cause }));
      learnButton(box, { label: t("learn.retry"), icon: "rotate-ccw", onClick: () => void this.generate(false, entry) });
    }
    const selected = families.find((f) => f.id === this.selectedId);
    if (selected) return this.renderTree(selected, familyTree(selected, lookup, { focusEntryId: this.focusEntryId }), lookup);
    const empty = root.createDiv({ cls: "vt-fam-empty" });
    const title = entry ? t("learn.family.word.empty.title", { word: entry.word }) : t("learn.family.empty.title");
    if (renderLearnAiGate(empty, this.plugin)) return;
    empty.appendChild(
      emptyState({
        icon: "git-fork",
        title,
        body: t("learn.family.empty.body"),
        action: { label: t("learn.family.generate"), icon: "sparkles", onClick: () => void this.generate(false, entry) }
      })
    );
  }
  // Family chips + 重新分群 (L5) / 找字族 (word page).
  renderToolbar(families, entry) {
    const bar = this.root.createDiv({ cls: "vt-fam-toolbar" });
    for (const f of families) {
      const chip2 = bar.createEl("button", { cls: "vt-fam-tab", text: familyTitle(f) });
      chip2.toggleClass("is-active", f.id === this.selectedId);
      chip2.setAttr("aria-pressed", String(f.id === this.selectedId));
      chip2.addEventListener("click", () => {
        this.selectedId = f.id;
        this.focusEntryId = void 0;
        this.error = null;
        this.render();
      });
    }
    const ready = this.plugin.ai.status() === "ready";
    const btn = learnButton(bar, {
      label: t(entry ? "learn.family.generate" : "learn.family.regroup"),
      icon: entry ? "sparkles" : "refresh-cw",
      ghost: true,
      onClick: () => void this.generate(!entry, entry)
    });
    btn.addClass("vt-fam-toolbar-action");
    btn.disabled = !ready;
    if (!ready) btn.title = t(this.plugin.ai.status() === "offline" ? "learn.ai.offline" : "learn.ai.body");
  }
  renderGenerating() {
    const box = this.root.createDiv({ cls: "vt-learn-busy" });
    const line = box.createDiv({ cls: "vt-learn-busy-text" });
    (0, import_obsidian21.setIcon)(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
    line.createSpan({ text: t("learn.family.generating") });
    learnButton(box, { label: t("learn.stop"), icon: "square", onClick: () => this.stop() });
  }
  // ── L5 tree ───────────────────────────────────────────────────
  renderTree(f, view, lookup) {
    const tree = this.root.createDiv({ cls: "vt-fam-tree" });
    const head = tree.createDiv({ cls: "vt-fam-root" });
    (0, import_obsidian21.setIcon)(head.createSpan({ cls: "vt-fam-root-icon" }), "git-fork");
    head.createSpan({ text: view.title });
    const more = head.createEl("button", { cls: "vt-fam-root-more clickable-icon" });
    (0, import_obsidian21.setIcon)(more, "more-horizontal");
    more.setAttr("aria-label", t("learn.family.more"));
    more.addEventListener("click", (e) => {
      const menu = new import_obsidian21.Menu();
      menu.addItem(
        (item) => item.setTitle(t("learn.family.delete")).setIcon("trash-2").onClick(() => this.remove(f))
      );
      menu.showAtMouseEvent(e);
    });
    const dates = datesText(view.dates);
    if (dates) tree.createDiv({ cls: "vt-fam-dates", text: dates });
    tree.createDiv({ cls: "vt-fam-stem" });
    const cols = tree.createDiv({ cls: "vt-fam-cols" });
    for (const col of view.columns) {
      const c = cols.createDiv({ cls: "vt-fam-col" });
      c.createDiv({ cls: "vt-fam-col-stem" });
      c.createDiv({ cls: "vt-fam-group", text: col.label });
      c.createDiv({ cls: "vt-fam-col-stem is-short" });
      const list = c.createDiv({ cls: "vt-fam-chips" });
      for (const chip2 of col.chips) {
        if (chip2.known) {
          const entry = chip2.entryId ? lookup.byEntryId(chip2.entryId) : void 0;
          const el2 = wordChip(list, this.plugin, entry, ["vt-fam-chip", "is-known", ...chip2.focus ? ["is-focus"] : []]);
          el2.createSpan({ cls: "vt-fam-chip-word", text: chip2.word });
          if (chip2.zh) el2.createSpan({ cls: "vt-fam-chip-zh", text: chip2.zh });
          continue;
        }
        const busy = this.adding.has(`${f.id}\0${chip2.word.toLowerCase()}`);
        const el = list.createEl("button", { cls: "vt-fam-chip is-suggested" });
        el.createSpan({ cls: "vt-fam-chip-word", text: chip2.word });
        if (chip2.zh) el.createSpan({ cls: "vt-fam-chip-zh", text: chip2.zh });
        (0, import_obsidian21.setIcon)(el.createSpan({ cls: "vt-fam-chip-icon" }), busy ? "loader" : "plus");
        el.disabled = busy;
        el.setAttr("aria-label", t("learn.family.add", { word: chip2.word }));
        el.addEventListener("click", () => void this.addSuggested(f.id, chip2.word));
      }
    }
    const legend = this.root.createDiv({ cls: "vt-fam-legend" });
    const known = legend.createSpan({ cls: "vt-fam-legend-item" });
    known.createSpan({ cls: "vt-fam-chip is-known is-mini", text: t("learn.family.known") });
    known.createSpan({ text: t("learn.family.legend.known") });
    if (view.suggestedCount) {
      const sug = legend.createSpan({ cls: "vt-fam-legend-item" });
      (0, import_obsidian21.setIcon)(sug.createSpan({ cls: "vt-fam-chip is-suggested is-mini" }), "plus");
      sug.createSpan({ text: t("learn.family.legend.suggested") });
    }
    if (view.seeds.length) {
      legend.createSpan({ cls: "vt-fam-legend-item", text: t("learn.family.legend.seeds", { words: joinWords(view.seeds) }) });
    }
  }
};

// src/ui/blocks/flashcards.ts
var import_obsidian23 = require("obsidian");

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

// src/core/text/interval.ts
var MIN = 60 * 1e3;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;
function splitInterval(ms5) {
  const round = (n) => Math.max(1, Math.round(n));
  if (ms5 < HOUR) return { value: round(ms5 / MIN), unit: "m" };
  if (ms5 < DAY) return { value: round(ms5 / HOUR), unit: "h" };
  if (ms5 < 30 * DAY) return { value: round(ms5 / DAY), unit: "d" };
  if (ms5 < 365 * DAY) return { value: round(ms5 / (30 * DAY)), unit: "mo" };
  return { value: Math.max(1, Math.round(ms5 / (365 * DAY) * 10) / 10), unit: "y" };
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
function reviewTiming(entry, now) {
  if (isNewCard(entry) || !entry.srs) return { kind: "new" };
  const due = new Date(entry.srs.due);
  if (Number.isNaN(due.getTime())) return { kind: "new" };
  return due.getTime() <= now.getTime() ? { kind: "due", due } : { kind: "early", due };
}
function countDueBetween(entries, filter, from, to) {
  const a = from.getTime();
  const b = to.getTime();
  return entries.filter((e) => {
    if (!matchesFilter(e, filter) || isNewCard(e)) return false;
    const ms5 = dueMs(e);
    return ms5 >= a && ms5 < b;
  }).length;
}

// src/ui/blocks/flashcardsBatch.ts
function hiddenFields(mode) {
  switch (mode) {
    case "en-zh":
      return { word: false, zh: true };
    case "zh-en":
    case "cloze":
      return { word: true, zh: false };
    case "listen":
      return { word: true, zh: true };
  }
}
function briefMeaning(text) {
  return (text != null ? text : "").split(/\r?\n/)[0].trim();
}
function buildBatchRows(state, lookup) {
  const ratings = /* @__PURE__ */ new Map();
  for (const r of state.results) ratings.set(r.id, r.rating);
  const hide = hiddenFields(state.mode);
  const rows = [];
  state.session.forEach((id, i) => {
    const w = lookup(id);
    if (!w) return;
    const rating = ratings.get(id);
    const isCurrent = state.phase === "card" && i === state.index;
    const status = rating !== void 0 ? "rated" : isCurrent ? "current" : "pending";
    const revealed = status === "rated" || status === "current" && state.flipped;
    const zh = briefMeaning(w.zh);
    rows.push({
      id,
      status,
      isNew: state.newIds.has(id),
      ...rating !== void 0 ? { rating } : {},
      word: revealed || !hide.word ? w.word : null,
      zh: revealed || !hide.zh ? zh || null : null
    });
  });
  return rows;
}

// src/ui/blocks/wordHeader.ts
var import_obsidian22 = require("obsidian");

// src/core/text/slug.ts
var FORBIDDEN = /[/\\:*?"<>|#^[\]]/g;
var CONTROL = /[\u0000-\u001f\u007f]/g;
var MAX_NAME_BYTES = 200;
function utf8Bytes2(s) {
  var _a;
  let n = 0;
  for (const ch of s) {
    const cp = (_a = ch.codePointAt(0)) != null ? _a : 0;
    n += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
  }
  return n;
}
function truncateBytes(s, maxBytes) {
  if (utf8Bytes2(s) <= maxBytes) return s;
  let out = "";
  let n = 0;
  for (const ch of Array.from(s)) {
    const size = utf8Bytes2(ch);
    if (n + size > maxBytes) break;
    out += ch;
    n += size;
  }
  return out.replace(/\u200d+$/, "");
}
function slugify(name, fallback = "untitled", maxBytes = MAX_NAME_BYTES) {
  let s = name.normalize("NFC").replace(CONTROL, "").replace(FORBIDDEN, "-");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/-{2,}/g, "-");
  s = s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  s = truncateBytes(s, Math.max(0, maxBytes)).replace(/[.\s]+$/, "");
  return s || fallback;
}
function wordSlug(word) {
  return slugify(word.toLocaleLowerCase("en"), "word", MAX_NAME_BYTES - utf8Bytes2(".md"));
}
function joinPath(...parts) {
  return parts.map((p) => p.replace(/^\/+|\/+$/g, "")).filter((p) => p !== "").join("/");
}
function noteBasename(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
function linkTarget(path) {
  return path.replace(/\.md$/i, "");
}

// src/services/files/paragraphNumber.ts
function paragraphNumber(markdown, line) {
  let n = 0;
  for (const s of noteSections(markdown)) {
    if (!isAnchorable(s.type)) continue;
    n++;
    if (line >= s.lineStart && line <= s.lineEnd) return n;
    if (s.lineStart > line) return null;
  }
  return null;
}

// src/ui/blocks/wordHeader.ts
var WORD_BLOCK_LANG = "vocab-word";
function l(key3, vars) {
  return t(`wordPage.${key3}`, vars);
}
function lo(key3, name) {
  return name === void 0 ? t(`wordPage.${key3}`) : t(`wordPage.${key3}`, { name });
}
function originView(entry, family) {
  const familyId = originFamilyId(entry.origin);
  if (!familyId) return null;
  if (!family || family.deletedAt) return { familyId };
  const word = entry.word.toLowerCase();
  const group = family.groups.find(
    (g) => g.members.some((m) => m.entryId === entry.id || !m.entryId && m.word.toLowerCase() === word)
  );
  const title = familyTitle(family);
  return { familyId, name: (group == null ? void 0 : group.label.trim()) ? `${title} \u203A ${group.label.trim()}` : title };
}
function originLabel(v) {
  return v.name ? lo("origin", v.name) : lo("originUnknown");
}
function wordTarget(params, frontmatter2, sourcePath) {
  if (params.id) return { id: params.id };
  if (params.word) return { word: params.word };
  const fmId = frontmatter2 == null ? void 0 : frontmatter2["vocab-tracker-id"];
  if ((frontmatter2 == null ? void 0 : frontmatter2["vocab-tracker"]) === "word" && (typeof fmId === "string" || typeof fmId === "number")) {
    return { id: String(fmId) };
  }
  return { word: noteBasename(sourcePath) };
}
function findTarget(entries, target) {
  var _a;
  const live = entries.filter((e) => !e.deletedAt);
  if (target.id) return live.find((e) => e.id === target.id);
  const word = (_a = target.word) == null ? void 0 : _a.trim().toLowerCase();
  return word ? live.find((e) => e.word.toLowerCase() === word) : void 0;
}
function shortDay(d) {
  const pad3 = (n) => String(n).padStart(2, "0");
  return `${pad3(d.getMonth() + 1)}/${pad3(d.getDate())}`;
}
function dueLabel2(entry, now = /* @__PURE__ */ new Date()) {
  if (isNewCard(entry) || !entry.srs) return l("dueNew");
  const due = new Date(entry.srs.due);
  if (Number.isNaN(due.getTime())) return l("dueNew");
  const tomorrow = startOfLocalDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return due.getTime() < tomorrow.getTime() ? l("dueToday") : l("dueOn", { date: shortDay(due) });
}
function sourceLabel(path, paragraph) {
  const name = noteBasename(path);
  return l("source", { source: paragraph ? `${name} \xB6${paragraph}` : name });
}
function renderWordHeader(host, source, el, ctx) {
  var _a;
  const frontmatter2 = (_a = ctx.frontmatter) != null ? _a : host.frontmatterOf(ctx.sourcePath);
  const target = wordTarget(parseBlockParams(source), frontmatter2, ctx.sourcePath);
  ctx.addChild(new WordHeaderBlock(el, host, target));
}
var WordHeaderBlock = class extends import_obsidian22.MarkdownRenderChild {
  constructor(containerEl, host, target) {
    super(containerEl);
    this.host = host;
    this.target = target;
    // "path\nline" → ¶ number, so a redraw doesn't re-read the note.
    this.paragraphs = /* @__PURE__ */ new Map();
    this.disposed = false;
  }
  onload() {
    this.registerDomEvent(this.containerEl, "click", (e) => e.stopPropagation());
    this.register(this.host.store.events.on("data:changed", () => this.render()));
    this.render();
    const entry = findTarget(this.host.store.entries, this.target);
    if (this.host.learn && originFamilyId(entry == null ? void 0 : entry.origin)) {
      void this.host.learn.ensureLoaded().then(() => this.render(), () => void 0);
    }
  }
  onunload() {
    this.disposed = true;
  }
  render() {
    var _a, _b, _c, _d, _e;
    if (this.disposed) return;
    const el = this.containerEl;
    el.empty();
    const root = el.createDiv({ cls: ["vt", "vt-word-header"] });
    const entry = findTarget(this.host.store.entries, this.target);
    if (!entry) {
      root.appendChild(inlineNote({ text: l("missing") }));
      return;
    }
    const top = root.createDiv({ cls: "vt-wh-top" });
    top.createSpan({ cls: "vt-wh-word", text: entry.word });
    const meta = [entry.phonetic, entry.partOfSpeech].map((s) => s == null ? void 0 : s.trim()).filter(Boolean).join(" \xB7 ");
    if (meta) top.createSpan({ cls: "vt-wh-meta", text: meta });
    const speak = top.createEl("button", { cls: ["clickable-icon", "vt-wh-speak"], attr: { "aria-label": l("speak") } });
    (0, import_obsidian22.setIcon)(speak, "volume-2");
    bindPronounceButton(speak, entry);
    const def = ((_a = entry.definitionZh) == null ? void 0 : _a.trim()) || ((_b = entry.definition) == null ? void 0 : _b.trim());
    if (def) root.createDiv({ cls: "vt-wh-def", text: def });
    const chips = root.createDiv({ cls: "vt-wh-chips" });
    if ((_c = entry.source) == null ? void 0 : _c.path) this.renderSource(chips, entry, entry.source.path, entry.source.line);
    this.renderOrigin(chips, entry);
    chip(chips, "calendar", dueLabel2(entry));
    const reps = (_e = (_d = entry.srs) == null ? void 0 : _d.reps) != null ? _e : 0;
    if (reps > 0) chip(chips, "rotate-ccw", l("reviewed", { n: reps }));
    const review = this.host.reviewWord;
    if (review) {
      const btn = chips.createEl("button", { cls: ["mod-cta", "vt-wh-review"] });
      (0, import_obsidian22.setIcon)(btn.createSpan({ cls: "vt-wh-btn-icon" }), "layers");
      btn.createSpan({ text: l("review") });
      btn.addEventListener("click", () => void review.call(this.host, entry));
    }
  }
  // 「來源：字族樹 clothing 服裝 › 舞台」 — a word added from a family; a
  // click opens 字族樹.md on that family with the word highlighted.
  renderOrigin(parent, entry) {
    var _a;
    const familyId = originFamilyId(entry.origin);
    if (!familyId) return;
    const view = originView(entry, (_a = this.host.learn) == null ? void 0 : _a.family(familyId));
    if (!view) return;
    const el = chip(parent, "git-fork", originLabel(view));
    el.addClass("vt-wh-origin");
    const open = this.host.openEntryFile;
    if (!open) return;
    el.addClass("is-link");
    el.setAttr("title", lo("originTitle"));
    el.setAttr("role", "link");
    el.tabIndex = 0;
    const go = () => {
      if (view.name) focusFamily({ familyId, entryId: entry.id });
      void open.call(this.host, "families", "tab");
    };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }
  renderSource(parent, entry, path, line) {
    const key3 = `${path}
${line}`;
    const known = this.paragraphs.get(key3);
    const el = chip(parent, "file-text", sourceLabel(path, known != null ? known : null));
    el.addClass("is-link");
    el.setAttr("title", l("sourceTitle"));
    el.setAttr("role", "link");
    el.tabIndex = 0;
    el.addEventListener("click", () => void this.host.jumpToSource(entry));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.host.jumpToSource(entry);
    });
    const read = this.host.readNote;
    if (known !== void 0 || !read || line < 0) return;
    this.paragraphs.set(key3, null);
    void read.call(this.host, path).then((text) => {
      var _a;
      const n = text === null ? null : paragraphNumber(text, line);
      this.paragraphs.set(key3, n);
      if (n !== null && !this.disposed) (_a = el.querySelector(".vt-chip-text")) == null ? void 0 : _a.setText(sourceLabel(path, n));
    }).catch(() => void 0);
  }
};
function chip(parent, icon, text) {
  const el = parent.createSpan({ cls: "vt-wh-chip" });
  (0, import_obsidian22.setIcon)(el.createSpan({ cls: "vt-chip-icon" }), icon);
  el.createSpan({ cls: "vt-chip-text", text });
  return el;
}

// src/ui/blocks/verbsModel.ts
function parseVerbsParams(source) {
  var _a, _b;
  const p = parseBlockParams(source);
  const word = ((_b = (_a = p.word) != null ? _a : p.verb) != null ? _b : "").trim().replace(/^["']|["']$/g, "").trim();
  return word ? { word } : {};
}
function filterVerbs(verbs, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [...verbs];
  return verbs.filter((e) => {
    var _a;
    return e.word.toLowerCase().includes(q) || ((_a = e.definitionZh) != null ? _a : "").toLowerCase().includes(q);
  });
}
function pickVerb(verbs, current) {
  var _a, _b;
  if (current && verbs.some((e) => e.id === current)) return current;
  return (_b = (_a = verbs.find((e) => e.usage)) != null ? _a : verbs[0]) == null ? void 0 : _b.id;
}
function noteName(path) {
  var _a;
  if (!path) return void 0;
  const base = (_a = path.split("/").pop()) != null ? _a : path;
  return base.replace(/\.md$/i, "") || void 0;
}
function shortDate3(iso) {
  if (!iso) return void 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return void 0;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function phoneticLine(e) {
  var _a, _b;
  const parts = [];
  const ph = ((_a = e.phonetic) != null ? _a : "").trim();
  if (ph) parts.push(/^[/[]/.test(ph) ? ph : `/${ph}/`);
  const pos = ((_b = e.partOfSpeech) != null ? _b : "").trim();
  if (pos) parts.push(pos);
  return parts.join(" \xB7 ");
}
function usageMeta(e, usage) {
  var _a;
  const out = {};
  const source = noteName((_a = e.source) == null ? void 0 : _a.path);
  if (source) out.source = source;
  const date = shortDate3(usage == null ? void 0 : usage.generatedAt);
  if (date) out.date = date;
  return out;
}
function usageRows(usage) {
  var _a, _b;
  return {
    patterns: ((_a = usage.patterns) != null ? _a : []).filter((p) => {
      var _a2, _b2, _c;
      return ((_a2 = p.pattern) == null ? void 0 : _a2.trim()) || ((_b2 = p.meaningZh) == null ? void 0 : _b2.trim()) || ((_c = p.example) == null ? void 0 : _c.trim());
    }),
    related: ((_b = usage.related) != null ? _b : []).filter((r) => {
      var _a2;
      return (_a2 = r.phrase) == null ? void 0 : _a2.trim();
    })
  };
}
function usageDates(usage, now = /* @__PURE__ */ new Date()) {
  var _a;
  if (!usage) return "";
  return datesText(recordDates({ createdAt: (_a = usage.createdAt) != null ? _a : usage.generatedAt, updatedAt: usage.generatedAt }, now));
}

// src/ui/blocks/wordReviewModel.ts
function parseCardMode(raw) {
  var _a;
  return (_a = CARD_MODES.find((m) => m === raw)) != null ? _a : null;
}
function singleReviewMode(entry, preferred) {
  const mode = preferred != null ? preferred : CARD_MODES[0];
  return matchesFilter(entry, { mode }) ? mode : CARD_MODES[0];
}
function timingText(timing) {
  var _a;
  switch (timing.kind) {
    case "new":
      return t("flashcards.single.new");
    case "due":
      return t("flashcards.single.due");
    case "early":
      return t("flashcards.single.early", { date: (_a = shortDate3(timing.due.toISOString())) != null ? _a : "" });
  }
}
var DAY_MS = 24 * 60 * 60 * 1e3;
function nextReviewText(due, now, interval) {
  var _a;
  const ms5 = due.getTime() - now.getTime();
  if (ms5 < DAY_MS) return t("flashcards.single.nextSoon", { interval: interval(ms5) });
  return t("flashcards.single.next", { date: (_a = shortDate3(due.toISOString())) != null ? _a : "", interval: interval(ms5) });
}

// src/ui/blocks/flashcards.ts
function renderFlashcards(plugin, source, el, ctx) {
  ctx.addChild(new FlashcardsBlock(el, plugin, parseFlashcardParams(source)));
}
function formatInterval(ms5) {
  const { value, unit } = splitInterval(ms5);
  return t(`srs.interval.${unit}`, { n: value });
}
var MODE_KEY = "vocab-tracker:flashcards.mode";
var lastMode = null;
function rememberedMode(app) {
  if (lastMode) return lastMode;
  if (typeof app.loadLocalStorage !== "function") return null;
  const raw = app.loadLocalStorage(MODE_KEY);
  return parseCardMode(typeof raw === "string" ? raw : null);
}
function rememberMode(app, mode) {
  lastMode = mode;
  if (typeof app.saveLocalStorage === "function") app.saveLocalStorage(MODE_KEY, mode);
}
var batchSeq = 0;
var FlashcardsBlock = class extends import_obsidian23.MarkdownRenderChild {
  constructor(containerEl, plugin, params, opts = {}) {
    super(containerEl);
    this.plugin = plugin;
    this.params = params;
    this.opts = opts;
    this.phase = "loading";
    this.session = [];
    this.index = 0;
    this.flipped = false;
    this.shownAt = 0;
    this.typed = "";
    this.results = [];
    this.initialDue = 0;
    this.initialNew = 0;
    // Ids that were new when the session started (rating changes the state).
    this.newIds = /* @__PURE__ */ new Set();
    // "本批單字" panel: closed while reviewing, open on the done screen.
    // Kept in memory only, per phase.
    this.batchOpen = { card: false, done: true };
    this.batchId = `vt-fc-batch-${++batchSeq}`;
    // Set while rate() is in flight: rate() fires data:changed itself, and
    // reacting to our own write would double-render mid-transition.
    this.busy = false;
    this.disposed = false;
    this.mode = params.mode;
    this.single = !!(params.id || params.word);
  }
  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-flashcards"] });
    this.root.tabIndex = 0;
    this.registerDomEvent(this.root, "keydown", (e) => this.onKey(e));
    this.registerDomEvent(this.root, "click", (e) => e.stopPropagation());
    this.register(this.plugin.store.events.on("data:changed", () => this.onStoreChanged()));
    this.render();
    if (!this.single) rememberMode(this.plugin.app, this.mode);
    void this.plugin.srs.ensureLoaded().then(() => {
      var _a;
      if (this.disposed) return;
      this.startSession(void 0, { speak: this.single });
      if (this.opts.autoFocus) ((_a = this.root.querySelector("input")) != null ? _a : this.root).focus({ preventScroll: true });
    });
  }
  onunload() {
    this.disposed = true;
    stopPronouncingIn(this.root);
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
  // The word of a one-word review, if it's (still) in the vocab list.
  target() {
    return findTarget(this.plugin.store.entries, { id: this.params.id, word: this.params.word });
  }
  // What a session starts with when no ids are given: the due queue, or
  // the one word — due or not.
  defaultCards() {
    if (!this.single) return this.plugin.srs.queue(this.filter());
    const entry = this.target();
    return entry && matchesFilter(entry, { mode: this.mode }) ? [entry] : [];
  }
  // `ids` replays a specific set (e.g. "practice forgotten words") instead
  // of the due queue; they're still filtered by mode so cloze never shows
  // a card it can't blank out.
  startSession(ids, opts = {}) {
    const cards = ids ? ids.map((id) => this.live(id)).filter((e) => !!e && matchesFilter(e, { mode: this.mode })) : this.defaultCards();
    this.session = cards.map((e) => e.id);
    this.newIds = new Set(cards.filter(isNewCard).map((e) => e.id));
    this.initialNew = this.newIds.size;
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
    if (this.mode === "listen" && this.phase === "card" && entry) void pronounce(entry);
  }
  onStoreChanged() {
    if (this.busy || this.disposed) return;
    if (this.phase === "card" && !this.current()) {
      this.skipMissing();
      this.render();
    } else if (this.phase === "empty") {
      if (this.defaultCards().length > 0) this.startSession();
      else if (this.single) this.render();
    }
  }
  onKey(e) {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || this.phase !== "card") return;
    const target = e.target;
    if ((e.key === " " || e.key === "Enter") && (target == null ? void 0 : target.tagName) === "BUTTON" && target.closest(".vt-fc-batch, .vt-fc-batch-toggle")) {
      return;
    }
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
    if (this.phase === "card") this.preloadAudio();
  }
  // This card's recording and the next one's, so 🔊 (and listen mode's
  // auto-play after rating) doesn't wait on the network. Cached per URL:
  // re-renders don't refetch.
  preloadAudio() {
    preloadPronunciation(this.current());
    preloadPronunciation(this.live(this.session[this.index + 1]));
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
        rememberMode(this.plugin.app, mode);
        this.startSession(void 0, { speak: true });
      };
    }
    const src = bar.createDiv({ cls: "vt-fc-source" });
    (0, import_obsidian23.setIcon)(src.createSpan({ cls: "vt-fc-icon" }), this.single ? "crosshair" : "folder");
    src.createSpan({
      text: this.single ? t("flashcards.single.source") : (_a = this.params.source) != null ? _a : t("flashcards.source.all")
    });
  }
  renderCard() {
    const entry = this.current();
    if (!entry) return;
    if (this.single) {
      const timing = this.plugin.srs.timing(entry);
      this.root.createDiv({ cls: ["vt-fc-timing", `is-${timing.kind}`], text: timingText(timing) });
    } else {
      const progress = this.root.createDiv({ cls: "vt-fc-progress" });
      progress.createSpan({
        cls: "vt-fc-progress-n",
        text: `${this.index + 1} / ${this.session.length}`
      });
      this.renderBatch(progress, this.root, "card");
    }
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
      const flip = card.createEl("button", { cls: ["vt-fc-btn", "vt-fc-flip"] });
      flip.createSpan({ text: t("flashcards.flip") });
      flip.createEl("kbd", { cls: "vt-fc-kbd", text: t("flashcards.flipKey") });
      flip.onclick = () => this.flip();
    } else {
      this.renderBack(card.createDiv({ cls: "vt-fc-back" }), entry);
      this.renderRatings(entry);
    }
    if (this.single) return;
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
    (0, import_obsidian23.setIcon)(speak, "volume-2");
    bindPronounceButton(speak, entry);
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
    (0, import_obsidian23.setIcon)(play, "volume-2");
    bindPronounceButton(play, entry);
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
    (0, import_obsidian23.setIcon)(result.createSpan({ cls: "vt-fc-icon" }), ok ? "check" : "x");
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
      (0, import_obsidian23.setIcon)(src.createSpan({ cls: "vt-fc-icon" }), "file-text");
      src.createSpan({ text: entry.source.path.split("/").pop().replace(/\.md$/, "") });
      src.onclick = () => {
        var _a2, _b;
        (_b = (_a2 = this.opts).onClose) == null ? void 0 : _b.call(_a2);
        void this.plugin.jumpToSource(entry);
      };
    }
  }
  renderRatings(entry) {
    const preview2 = this.plugin.srs.preview(entry);
    const grid = this.root.createDiv({ cls: "vt-fc-ratings" });
    for (const rating of RATINGS) {
      const b = grid.createEl("button", { cls: ["vt-fc-rate", `is-r${rating}`] });
      b.createEl("kbd", { cls: ["vt-fc-kbd", "vt-fc-rate-key"], text: String(rating) });
      b.createSpan({ cls: "vt-fc-rate-label", text: t(`srs.rating.${rating}`) });
      b.createSpan({ cls: "vt-fc-rate-interval", text: formatInterval(preview2[rating].intervalMs) });
      b.onclick = () => void this.rate(rating);
    }
  }
  renderEmpty() {
    if (this.single) return this.renderSingleEmpty();
    const box = this.root.createDiv({ cls: "vt-fc-empty" });
    (0, import_obsidian23.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "layers");
    box.createDiv({ cls: "vt-fc-empty-title", text: t("flashcards.empty.title") });
    box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.body") });
    if (this.mode === "cloze") {
      box.createDiv({ cls: "vt-fc-empty-body", text: t("flashcards.empty.cloze") });
    }
    const tiles = box.createDiv({ cls: "vt-fc-tiles" });
    tile(tiles, String(this.plugin.srs.dueTomorrow(this.filter())), t("flashcards.done.dueTomorrow"));
  }
  // ── One-word review ───────────────────────────────────────────
  // The word is gone, or the mode can't show it (cloze without an example).
  renderSingleEmpty() {
    const box = this.root.createDiv({ cls: "vt-fc-empty" });
    (0, import_obsidian23.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "layers");
    const missing = !this.target();
    box.createDiv({
      cls: "vt-fc-empty-body",
      text: missing ? t("wordPage.missing") : t("flashcards.single.noCloze")
    });
    this.renderSingleActions(box, false);
  }
  // After rating: what was recorded and when the word comes back.
  renderSingleDone() {
    const box = this.root.createDiv({ cls: ["vt-fc-empty", "vt-fc-done", "vt-fc-single-done"] });
    (0, import_obsidian23.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "check-circle-2");
    const last2 = this.results[this.results.length - 1];
    if (last2) {
      box.createDiv({
        cls: "vt-fc-empty-title",
        text: t("flashcards.single.done", { rating: t(`srs.rating.${last2.rating}`) })
      });
    }
    const entry = this.live(last2 == null ? void 0 : last2.id);
    if (entry == null ? void 0 : entry.srs) {
      const due = new Date(entry.srs.due);
      if (!Number.isNaN(due.getTime())) {
        box.createDiv({ cls: "vt-fc-empty-body", text: nextReviewText(due, /* @__PURE__ */ new Date(), formatInterval) });
      }
    }
    this.renderSingleActions(box, !!entry);
  }
  renderSingleActions(box, again) {
    const actions = box.createDiv({ cls: "vt-fc-actions" });
    if (again) {
      const retry = actions.createEl("button", { cls: "vt-fc-btn" });
      (0, import_obsidian23.setIcon)(retry.createSpan({ cls: "vt-fc-icon" }), "rotate-ccw");
      retry.createSpan({ text: t("flashcards.single.again") });
      retry.onclick = () => this.startSession(void 0, { speak: true });
    }
    const close = this.opts.onClose;
    if (close) {
      const done = actions.createEl("button", { cls: ["vt-fc-btn", "mod-cta"], text: t("flashcards.single.close") });
      done.onclick = () => close();
    }
  }
  renderDone() {
    if (this.single) return this.renderSingleDone();
    const box = this.root.createDiv({ cls: ["vt-fc-empty", "vt-fc-done"] });
    (0, import_obsidian23.setIcon)(box.createDiv({ cls: "vt-fc-empty-icon" }), "check-circle-2");
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
        (0, import_obsidian23.setIcon)(speak, "volume-2");
        bindPronounceButton(speak, entry);
      }
    }
    const actions = box.createDiv({ cls: "vt-fc-actions" });
    if (forgotten.length > 0) {
      const retry = actions.createEl("button", { cls: ["vt-fc-btn", "mod-cta"] });
      (0, import_obsidian23.setIcon)(retry.createSpan({ cls: "vt-fc-icon" }), "rotate-ccw");
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
    this.renderBatch(box.createDiv({ cls: "vt-fc-batch-head" }), box, "done");
  }
  // ── 本批單字 list ─────────────────────────────────────────────
  // Toggle goes in `toggleHost`, the (collapsible) list in `panelHost`.
  // Opening/closing only flips `hidden` instead of re-rendering, so the
  // card underneath — a half-typed spelling, the flip state — is untouched.
  renderBatch(toggleHost, panelHost, phase) {
    const entries = new Map(this.plugin.store.entries.map((e) => [e.id, e]));
    const rows = buildBatchRows(
      {
        mode: this.mode,
        session: this.session,
        results: this.results,
        index: this.index,
        flipped: this.flipped,
        phase,
        newIds: this.newIds
      },
      (id) => {
        const e = entries.get(id);
        return e && { word: e.word, zh: e.definitionZh || e.definition };
      }
    );
    if (rows.length === 0) return;
    const open = this.batchOpen[phase];
    const toggle = toggleHost.createEl("button", {
      cls: "vt-fc-batch-toggle",
      attr: { type: "button", "aria-expanded": String(open), "aria-controls": this.batchId }
    });
    toggle.toggleClass("is-open", open);
    (0, import_obsidian23.setIcon)(toggle.createSpan({ cls: "vt-fc-icon" }), "list");
    toggle.createSpan({ text: t("flashcards.batch.toggle", { n: rows.length }) });
    (0, import_obsidian23.setIcon)(toggle.createSpan({ cls: ["vt-fc-icon", "vt-fc-batch-chevron"] }), "chevron-down");
    const panel = panelHost.createDiv({ cls: "vt-fc-batch", attr: { id: this.batchId } });
    panel.hidden = !open;
    const list = panel.createEl("ol", { cls: "vt-fc-batch-list" });
    for (const row of rows) this.renderBatchRow(list, row, entries.get(row.id), phase);
    if (open) scrollToCurrent(panel);
    toggle.onclick = (e) => {
      const next = !this.batchOpen[phase];
      this.batchOpen[phase] = next;
      toggle.setAttr("aria-expanded", String(next));
      toggle.toggleClass("is-open", next);
      panel.hidden = !next;
      if (next) scrollToCurrent(panel);
      this.keepCardKeys(e);
    };
  }
  renderBatchRow(list, row, entry, phase) {
    var _a;
    const li = list.createEl("li", { cls: ["vt-fc-batch-row", `is-${row.status}`] });
    if (row.status === "current") li.setAttr("aria-current", "step");
    const text = li.createDiv({ cls: "vt-fc-batch-text" });
    if (row.word === null) {
      text.createSpan({
        cls: ["vt-fc-batch-word", "is-hidden"],
        text: "\u2022\u2022\u2022",
        attr: { "aria-label": t("flashcards.batch.hidden"), title: t("flashcards.batch.hidden") }
      });
    } else {
      text.createSpan({ cls: "vt-fc-batch-word", text: row.word });
    }
    if (row.zh) text.createSpan({ cls: "vt-fc-batch-zh", text: row.zh });
    const meta = li.createDiv({ cls: "vt-fc-batch-meta" });
    meta.createSpan({
      cls: ["vt-fc-batch-kind", row.isNew ? "is-new" : "is-due"],
      text: row.isNew ? t("flashcards.batch.new") : t("flashcards.batch.due")
    });
    if (row.rating !== void 0) {
      meta.createSpan({
        cls: ["vt-fc-batch-rating", `is-r${row.rating}`],
        text: t(`srs.rating.${row.rating}`)
      });
    } else {
      meta.createSpan({
        cls: "vt-fc-batch-state",
        text: row.status === "current" ? t("flashcards.batch.current") : t("flashcards.batch.pending")
      });
    }
    if (!entry || row.status !== "rated") return;
    const speak = meta.createEl("button", {
      cls: "vt-fc-icon-btn",
      attr: { type: "button", "aria-label": t("row.pronounce") }
    });
    (0, import_obsidian23.setIcon)(speak, "volume-2");
    bindPronounceButton(speak, entry, { after: (e) => this.keepCardKeys(e) });
    if (phase === "done" && ((_a = entry.source) == null ? void 0 : _a.path)) {
      const jump = meta.createEl("button", {
        cls: "vt-fc-icon-btn",
        attr: { type: "button", "aria-label": t("flashcards.batch.openSource"), title: entry.source.path }
      });
      (0, import_obsidian23.setIcon)(jump, "file-text");
      jump.onclick = () => void this.plugin.jumpToSource(entry);
    }
  }
  // After a mouse/touch click on a list control, hand focus back to the
  // block so Space / 1–4 keep acting on the card. Keyboard activation
  // (detail 0) leaves focus where the user put it.
  keepCardKeys(e) {
    if (e.detail > 0 && this.phase === "card") this.root.focus({ preventScroll: true });
  }
};
function scrollToCurrent(panel) {
  const row = panel.querySelector(".vt-fc-batch-row.is-current");
  if (row) panel.scrollTop = Math.max(0, row.offsetTop - panel.clientHeight / 2);
}
function zhOf(entry) {
  return entry.definitionZh || entry.definition || t("flashcards.noTranslation");
}
function tile(container, value, label) {
  const el = container.createDiv({ cls: "vt-fc-tile" });
  el.createDiv({ cls: "vt-fc-tile-value", text: value });
  el.createDiv({ cls: "vt-fc-tile-label", text: label });
}

// src/ui/blocks/trivia.ts
var import_obsidian24 = require("obsidian");

// src/core/model/trivia.ts
var TRIVIA_THREAD_ID = "trivia-session";

// src/services/ai/context/triviaContext.ts
var MAX_KNOWN_WORDS = 200;
var MAX_TOLD = 40;
var KNOWN_TEMPLATE = `\u3014\u5DF2\u5B78\u55AE\u5B57\u3015{{#capped}}\uFF08\u5171 {{total}} \u500B\uFF0C\u4EE5\u4E0B\u662F\u6700\u8FD1\u5B78\u7684 {{count}} \u500B\uFF09{{/capped}}
{{words}}`;
var SUBJECT_TEMPLATE = `\u3014\u9019\u6B21\u7684\u4E3B\u89D2\u3015{{word}}
{{#phonetic}}\u97F3\u6A19\uFF1A{{phonetic}}
{{/phonetic}}{{#partOfSpeech}}\u8A5E\u6027\uFF1A{{partOfSpeech}}
{{/partOfSpeech}}{{#definitionZh}}\u4E2D\u6587\uFF1A{{definitionZh}}
{{/definitionZh}}{{#definition}}\u82F1\u6587\u5B9A\u7FA9\uFF1A{{definition}}
{{/definition}}{{#example}}\u5B78\u7FD2\u8005\u9047\u5230\u5B83\u7684\u53E5\u5B50\uFF1A{{example}}
{{/example}}`;
var TOLD_TEMPLATE = `\u3014\u5DF2\u8B1B\u904E\u7684\u51B7\u77E5\u8B58\u3015\uFF08\u4E0D\u8981\u91CD\u8907\u9019\u4E9B\u5167\u5BB9\uFF1B\u540C\u4E00\u500B\u5B57\u8981\u63DB\u4E00\u500B\u89D2\u5EA6\uFF09
{{told}}`;
function entryAddedMs2(e) {
  const iso = e.createdAt ? Date.parse(e.createdAt) : NaN;
  if (!Number.isNaN(iso)) return iso;
  const legacy = e.added ? Date.parse(e.added.replace(" ", "T")) : NaN;
  return Number.isNaN(legacy) ? 0 : legacy;
}
function knownWordList(entries, max = MAX_KNOWN_WORDS) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const sorted = entries.filter((e) => !e.deletedAt).sort((a, b) => entryAddedMs2(b) - entryAddedMs2(a));
  for (const e of sorted) {
    const key3 = e.word.trim().toLowerCase();
    if (!key3 || seen.has(key3)) continue;
    seen.add(key3);
    out.push(e.word.trim());
    if (out.length >= max) break;
  }
  return out;
}
function buildTriviaContext(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const s = input.subject;
  const total = Math.max((_a = input.knownTotal) != null ? _a : 0, input.knownWords.length);
  const told = ((_b = input.told) != null ? _b : []).slice(0, MAX_TOLD);
  return {
    knownBlock: renderTemplate(KNOWN_TEMPLATE, {
      capped: total > input.knownWords.length ? "yes" : "",
      total,
      count: input.knownWords.length,
      words: input.knownWords.join(", ")
    }),
    subjectBlock: s ? renderTemplate(SUBJECT_TEMPLATE, {
      word: s.word,
      phonetic: s.phonetic,
      partOfSpeech: s.partOfSpeech,
      definitionZh: s.definitionZh,
      definition: s.definition,
      example: (_c = s.example) == null ? void 0 : _c.trim()
    }) : "",
    toldBlock: told.length ? renderTemplate(TOLD_TEMPLATE, { told: told.map((t2) => `- ${t2.word}\uFF1A${t2.title}`).join("\n") }) : "",
    slots: {
      word: (_d = s == null ? void 0 : s.word) != null ? _d : "",
      question: (_f = (_e = input.question) == null ? void 0 : _e.trim()) != null ? _f : "",
      selection: (_h = (_g = input.selection) == null ? void 0 : _g.trim()) != null ? _h : ""
    }
  };
}

// src/services/ai/tasks/trivia.ts
var TRIVIA_BASE_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u98A8\u8DA3\u3001\u56B4\u8B39\u7684\u82F1\u6587\u55AE\u5B57\u8AAA\u66F8\u4EBA\uFF0C\u7528\u300C\u51B7\u77E5\u8B58\u300D\u5E6B\u4E00\u4F4D\u4EE5\u4E2D\u6587\u70BA\u6BCD\u8A9E\u7684\u5B78\u7FD2\u8005\u8A18\u4F4F\u4ED6\u5B78\u904E\u7684\u55AE\u5B57\u3002\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\u662F\u4ED6\u5B78\u904E\u7684\u5B57\uFF0C\u3014\u9019\u6B21\u7684\u4E3B\u89D2\u3015\u662F\u9019\u4E00\u5247\u8981\u8B1B\u7684\u5B57\u3002

\u56DE\u7B54\u898F\u5247\uFF1A
1. \u9810\u8A2D\u7528\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09\u56DE\u7B54\uFF0C\u82F1\u6587\u55AE\u5B57\u8207\u4F8B\u53E5\u4FDD\u7559\u82F1\u6587\uFF1B\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u82E5\u6307\u5B9A\u4E86\u5176\u4ED6\u56DE\u7B54\u8A9E\u8A00\uFF0C\u4EE5\u5B78\u7FD2\u8005\u8A2D\u5B9A\u70BA\u6E96\u3002
2. \u53EA\u8B1B\u53EF\u9760\u3001\u6709\u6839\u64DA\u7684\u77E5\u8B58\u3002\u4E0D\u78BA\u5B9A\u5C31\u76F4\u63A5\u8AAA\u300C\u4E0D\u78BA\u5B9A\u300D\u6216\u300C\u8AAA\u6CD5\u4E0D\u4E00\u300D\uFF0C\u4E0D\u8981\u7DE8\u9020\u5B57\u6E90\u3001\u5E74\u4EE3\u3001\u4EBA\u540D\u3001\u6578\u64DA\u6216\u51FA\u8655\uFF1B\u6C92\u6709\u53EF\u9760\u7684\u5B57\u6E90\u6545\u4E8B\u6642\uFF0C\u6539\u8B1B\u7528\u6CD5\u3001\u642D\u914D\u6216\u5BB9\u6613\u6DF7\u6DC6\u7684\u5B57\uFF0C\u4E0D\u8981\u786C\u6E4A\u3002
3. \u65B0\u7684\u4E00\u5247\uFF08\u4E0D\u662F\u8FFD\u554F\uFF09\u7B2C\u4E00\u884C\u56FA\u5B9A\u5BEB\u6A19\u984C\uFF0C\u683C\u5F0F\u662F\u300C**<\u6A19\u984C>**\u300D\uFF0C\u6A19\u984C 20 \u5B57\u4EE5\u5167\uFF1B\u7A7A\u4E00\u884C\u518D\u5BEB\u5167\u5BB9\u3002\u8FFD\u554F\u76F4\u63A5\u56DE\u7B54\uFF0C\u4E0D\u7528\u6A19\u984C\u3002
4. \u6BCF\u5247\u5167\u5BB9 50 \u5230 200 \u5B57\uFF0C\u7528 Markdown\uFF0C\u91CD\u9EDE\u7528\u7C97\u9AD4\uFF0C\u4E0D\u8981\u7528\u6A19\u984C\uFF08#\uFF09\u3002
5. \u53EF\u4EE5\u7684\u8A71\uFF0C\u81EA\u7136\u5730\u5E36\u5230 1 \u5230 2 \u500B\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\u88E1\u7684\u5176\u4ED6\u5B57\uFF0C\u5E6B\u5B78\u7FD2\u8005\u8907\u7FD2\uFF1B\u4E0D\u8981\u786C\u585E\uFF0C\u4E5F\u4E0D\u8981\u5217\u6E05\u55AE\u3002
6. \u4E0D\u8981\u91CD\u8907\u3014\u5DF2\u8B1B\u904E\u7684\u51B7\u77E5\u8B58\u3015\u88E1\u7684\u5167\u5BB9\uFF1B\u540C\u4E00\u500B\u5B57\u8B1B\u904E\u4E86\uFF0C\u5C31\u63DB\u4E00\u500B\u89D2\u5EA6\u3002`;
var SELECTION_HEADER3 = `{{#selection}}\u3014\u9078\u53D6\u7684\u6587\u5B57\u3015
{{selection}}

{{/selection}}`;
var TRIVIA_TEMPLATES = {
  next: `\u4EFB\u52D9\uFF1A\u518D\u4F86\u4E00\u5247\u51B7\u77E5\u8B58\uFF08\u4E3B\u89D2\uFF1A{{word}}\uFF09
\u8B1B\u4E00\u5247\u548C {{word}} \u6709\u95DC\u7684\u51B7\u77E5\u8B58\uFF0C\u5F9E\u5B57\u6E90\u3001\u7528\u6CD5\u7684\u6F14\u8B8A\u3001\u6587\u5316\u80CC\u666F\u3001\u5BB9\u6613\u6DF7\u6DC6\u7684\u5B57\u3001\u6709\u8DA3\u7684\u642D\u914D\u88E1\u6311\u4E00\u500B\u6700\u6709\u8A18\u61B6\u9EDE\u7684\u89D2\u5EA6\u3002`,
  quiz: `\u4EFB\u52D9\uFF1A\u8003\u6211\u4E00\u984C\uFF08\u4E3B\u89D2\uFF1A{{word}}\uFF09
\u51FA\u4E00\u984C\u95DC\u65BC {{word}} \u7684\u5C0F\u984C\u76EE\uFF1A\u9078\u64C7\u984C\uFF08\u6700\u591A\u56DB\u500B\u9078\u9805\uFF09\u6216\u586B\u7A7A\u984C\uFF0C\u7528\u82F1\u6587\u4F8B\u53E5\u6216\u60C5\u5883\u51FA\u984C\uFF0C\u96E3\u5EA6\u7B26\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u3002\u5148\u4E0D\u8981\u516C\u5E03\u7B54\u6848\uFF0C\u6700\u5F8C\u4E00\u884C\u5BEB\uFF1A\u300C\u56DE\u8986\u4F60\u7684\u7B54\u6848\uFF0C\u6211\u518D\u544A\u8A34\u4F60\u5C0D\u4E0D\u5C0D\u3002\u300D`,
  etymology: `\u4EFB\u52D9\uFF1A\u5B57\u6E90\uFF08\u4E3B\u89D2\uFF1A{{word}}\uFF09
\u8B1B {{word}} \u7684\u5B57\u6E90\u6216\u5B57\u6839\u5B57\u9996\uFF0C\u4EE5\u53CA\u5B83\u548C\u54EA\u4E9B\u5E38\u898B\u7684\u5B57\u6709\u95DC\u4FC2\u3002\u5B57\u6E90\u4E0D\u78BA\u5B9A\u3001\u6216\u5404\u5BB6\u8AAA\u6CD5\u4E0D\u4E00\u6642\uFF0C\u76F4\u63A5\u8AAA\u660E\uFF0C\u518D\u6539\u8B1B\u53EF\u9760\u7684\u69CB\u8A5E\u6216\u7528\u6CD5\uFF0C\u4E0D\u8981\u7DE8\u9020\u3002`,
  joke: `\u4EFB\u52D9\uFF1A\u7B11\u8A71\uFF08\u4E3B\u89D2\uFF1A{{word}}\uFF09
\u7528 {{word}} \u8AAA\u4E00\u500B\u7C21\u77ED\u7684\u7B11\u8A71\u3001\u96D9\u95DC\u6216\u6587\u5B57\u904A\u6232\uFF0C\u6700\u5F8C\u7528\u4E00\u5169\u53E5\u8AAA\u660E\u7B11\u9EDE\uFF0C\u4EE5\u53CA {{word}} \u5728\u9019\u88E1\u7684\u610F\u601D\u3002`,
  followup: `${SELECTION_HEADER3}\u3014\u4F7F\u7528\u8005\u7684\u8FFD\u554F\u3015{{#word}}\uFF08\u76EE\u524D\u7684\u4E3B\u89D2\uFF1A{{word}}\uFF09{{/word}}
{{question}}

\u63A5\u8457\u524D\u9762\u7684\u5C0D\u8A71\u56DE\u7B54\uFF0C\u4E0D\u7528\u5BEB\u6A19\u984C\u3002\u5982\u679C\u662F\u5728\u56DE\u7B54\u524D\u9762\u51FA\u7684\u984C\u76EE\uFF0C\u5148\u8AAA\u5C0D\u6216\u4E0D\u5C0D\uFF0C\u518D\u89E3\u91CB\u3002`
};
var TITLE_MAX = 40;
var BOLD_LINE_RE = /^\s*(?:#+\s*)?\*\*(.+?)\*\*\s*[:：]?\s*$/;
var LABEL_LINE_RE = /^\s*(?:標題|title)\s*[:：]\s*(.+)$/i;
function clip(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}
function splitTrivia(text) {
  var _a, _b, _c;
  const trimmed = text.trim();
  const nl = trimmed.indexOf("\n");
  const first = nl === -1 ? trimmed : trimmed.slice(0, nl);
  const rest = nl === -1 ? "" : trimmed.slice(nl + 1).trim();
  const titled = (_a = BOLD_LINE_RE.exec(first)) != null ? _a : LABEL_LINE_RE.exec(first);
  if (titled && rest) return { title: clip(titled[1].trim(), TITLE_MAX), body: rest };
  const plain = trimmed.replace(/\*\*|__|`/g, "");
  const sentence = (_c = (_b = /^[^。！？!?\n]+[。！？!?]?/.exec(plain)) == null ? void 0 : _b[0]) != null ? _c : plain;
  return { title: clip(sentence.trim(), TITLE_MAX), body: trimmed };
}
function triviaTask(id, opts) {
  const task = {
    id: `trivia.${id}`,
    version: 2,
    surface: "trivia",
    tier: "smart",
    // Headroom for adaptive thinking on Sonnet 5; the visible answer is
    // kept to 50–200 字 by the prompt.
    maxTokens: 4096,
    ...opts,
    build(input, ctx) {
      const c = buildTriviaContext(input);
      return composeRequest({
        base: TRIVIA_BASE_PROMPT,
        cached: [c.knownBlock],
        profile: profileForTask(ctx.profile, task, input),
        history: ctx.history,
        // The subject and the told list change every round, so they ride
        // in this round's message: kept in the system prompt they would
        // break the history cache on every request (規劃書 06 §6.4.1 #5).
        user: [c.subjectBlock, c.toldBlock, renderTemplate(TRIVIA_TEMPLATES[id], c.slots)].filter(Boolean).join("\n\n"),
        tier: task.tier,
        maxTokens: task.maxTokens
      });
    },
    parse(r) {
      return splitTrivia(r.text);
    }
  };
  return task;
}
var TRIVIA_CHARS = 200;
var capped = (_input, max) => Math.min(max, TRIVIA_CHARS);
var triviaNext = triviaTask("next", { label: "ai.task.trivia.next", answerChars: capped });
var triviaQuiz = triviaTask("quiz", { label: "ai.task.trivia.quiz", answerChars: capped });
var triviaEtymology = triviaTask("etymology", { label: "ai.task.trivia.etymology", answerChars: capped });
var triviaJoke = triviaTask("joke", { label: "ai.task.trivia.joke", answerChars: capped });
var triviaFollowup = triviaTask("followup", {});
var TRIVIA_TASKS = [triviaNext, triviaQuiz, triviaEtymology, triviaJoke, triviaFollowup];
var TRIVIA_TASK_BY_KIND = {
  next: triviaNext,
  quiz: triviaQuiz,
  etymology: triviaEtymology,
  joke: triviaJoke
};

// src/services/learn/triviaPick.ts
var RECENT_DAYS = 14;
var EXCLUDE_LAST = 30;
var RECENT_WEIGHT = 0.7;
var DAY_MS2 = 24 * 60 * 60 * 1e3;
function triviaRounds(thread) {
  var _a;
  if (!thread) return [];
  const live = thread.turns.filter((t2) => !t2.deletedAt);
  const out = [];
  for (let i = live.length - 1; i >= 0; i--) {
    const t2 = live[i];
    if (t2.role !== "assistant" || t2.status === "error") continue;
    if (!((_a = t2.taskId) == null ? void 0 : _a.startsWith("trivia.")) || t2.taskId === "trivia.followup") continue;
    const q = live[i - 1];
    out.push({ answer: t2, question: (q == null ? void 0 : q.role) === "user" ? q : void 0 });
  }
  return out;
}
function subjectOf(thread, turn) {
  if (turn.subjectEntryId) return turn.subjectEntryId;
  if (!thread) return void 0;
  const i = thread.turns.indexOf(turn);
  for (let j = i - 1; j >= 0; j--) {
    const prev = thread.turns[j];
    if (prev.deletedAt) continue;
    return prev.role === "user" ? prev.subjectEntryId : void 0;
  }
  return void 0;
}
function recentSubjects(thread, n = EXCLUDE_LAST) {
  var _a, _b;
  const out = [];
  for (const r of triviaRounds(thread).slice(0, n)) {
    const id = (_b = r.answer.subjectEntryId) != null ? _b : (_a = r.question) == null ? void 0 : _a.subjectEntryId;
    if (id) out.push(id);
  }
  return out;
}
function pickSubject(entries, recent, opts) {
  var _a, _b, _c;
  const live = entries.filter((e) => !e.deletedAt && e.word.trim());
  if (!live.length) return void 0;
  const excluded = new Set(recent.slice(0, (_a = opts.excludeLast) != null ? _a : EXCLUDE_LAST));
  const candidates = live.filter((e) => !excluded.has(e.id));
  if (!candidates.length) {
    const lastTold = (e) => recent.indexOf(e.id);
    return [...live].sort((a, b) => lastTold(b) - lastTold(a))[0];
  }
  const since = opts.now.getTime() - ((_b = opts.recentDays) != null ? _b : RECENT_DAYS) * DAY_MS2;
  const fresh = candidates.filter((e) => entryAddedMs2(e) >= since);
  const older = candidates.filter((e) => entryAddedMs2(e) < since);
  let pool;
  if (!fresh.length) pool = older;
  else if (!older.length) pool = fresh;
  else pool = opts.random() < ((_c = opts.recentWeight) != null ? _c : RECENT_WEIGHT) ? fresh : older;
  const i = Math.min(pool.length - 1, Math.floor(opts.random() * pool.length));
  return pool[i];
}

// src/ui/blocks/triviaModel.ts
var OFF = /* @__PURE__ */ new Set(["off", "false", "no", "0", "hide", "\u95DC", "\u5426"]);
function parseTriviaParams(source) {
  var _a, _b;
  const p = parseBlockParams(source);
  const out = { favorites: !OFF.has(((_a = p.favorites) != null ? _a : "").trim().toLowerCase()) };
  const word = ((_b = p.word) != null ? _b : "").trim().replace(/^["']|["']$/g, "").trim();
  if (word) out.word = word;
  return out;
}
var KIND_BY_TASK = new Map(
  Object.entries(TRIVIA_TASK_BY_KIND).map(([kind, task]) => [task.id, kind])
);
function triviaKindOf(taskId) {
  return taskId ? KIND_BY_TASK.get(taskId) : void 0;
}
function triviaCall(req, pinnedEntryId) {
  var _a;
  const kind = triviaKindOf(req.taskId);
  if (kind) return pinnedEntryId ? { type: "ask", kind, entryId: pinnedEntryId } : { type: "ask", kind };
  const question = (_a = req.question) == null ? void 0 : _a.trim();
  if (req.taskId !== triviaFollowup.id || !question) return null;
  return req.selection ? { type: "followup", question, selection: req.selection } : { type: "followup", question };
}
function triviaTurnActions(turn, ctx) {
  if (turn.role !== "assistant" || turn.status !== "done" || !turn.content.trim()) return [];
  const out = [];
  if (ctx.feedback) {
    out.push({ kind: "up", label: "learn.trivia.up", icon: "thumbs-up", active: turn.feedback === "up", iconOnly: true });
    out.push({ kind: "down", label: "learn.trivia.down", icon: "thumbs-down", active: turn.feedback === "down", iconOnly: true });
  }
  if (ctx.favorite) {
    out.push({ kind: "unfavorite", label: "learn.trivia.favorited", icon: "bookmark-check", active: true, iconOnly: false });
  } else if (ctx.subjectWord) {
    const round = !!triviaKindOf(turn.taskId);
    out.push(
      round ? { kind: "favorite", label: "learn.trivia.favoriteTo", params: { word: ctx.subjectWord }, icon: "bookmark", active: false, iconOnly: false } : { kind: "favorite", label: "learn.trivia.favorite", icon: "bookmark", active: false, iconOnly: false }
    );
  }
  return out;
}
function nextFeedback(current, clicked) {
  return current === clicked ? void 0 : clicked;
}
function triviaTurnHeader(turn, subjectWord, labelOf) {
  if (turn.role !== "assistant" || !subjectWord) return void 0;
  const kind = triviaKindOf(turn.taskId);
  return kind ? `${labelOf(kind)} \xB7 ${subjectWord}` : void 0;
}
function splitAround(text, marker) {
  const i = text.indexOf(marker);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + marker.length)];
}
function favoriteViews(items, wordOf, dateOf) {
  return items.map((it) => {
    const word = wordOf(it.entryId);
    const date = dateOf(it.createdAt);
    const updated = dateOf(it.updatedAt);
    return {
      id: it.id,
      heading: word ? `${word} \xB7 ${it.title}` : it.title,
      body: it.body,
      date,
      ...updated && updated !== date ? { updated } : {},
      mentions: it.mentions.flatMap((entryId) => {
        const w = wordOf(entryId);
        return w ? [{ entryId, word: w }] : [];
      })
    };
  });
}

// src/ui/blocks/trivia.ts
function renderTrivia(plugin, source, el, ctx) {
  ctx.addChild(new TriviaBlock(el, plugin, parseTriviaParams(source), ctx.sourcePath));
}
var WordPickModal = class extends import_obsidian24.FuzzySuggestModal {
  constructor(app, entries, onPick) {
    super(app);
    this.entries = entries;
    this.onPick = onPick;
    this.setPlaceholder(t("learn.trivia.pick.placeholder"));
  }
  getItems() {
    return this.entries;
  }
  getItemText(e) {
    return e.definitionZh ? `${e.word}  ${e.definitionZh}` : e.word;
  }
  onChooseItem(e) {
    this.onPick(e);
  }
};
var TriviaBlock = class extends import_obsidian24.MarkdownRenderChild {
  constructor(containerEl, plugin, params, sourcePath) {
    super(containerEl);
    this.plugin = plugin;
    this.params = params;
    this.sourcePath = sourcePath;
    this.chipEl = null;
    this.chatHost = null;
    this.chat = null;
    this.favEl = null;
    this.favScope = null;
    this.chatState = createChatUiState();
    this.hasWords = false;
    this.ready = false;
    this.disposed = false;
  }
  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-trivia"] });
    guardReadingClicks(this, this.root);
    this.root.createDiv({ cls: "vt-learn-loading", text: t("learn.loading") });
    this.register(this.plugin.store.events.on("data:changed", () => this.onStoreChanged()));
    const favChanged = () => {
      var _a;
      if (!this.ready) return;
      this.renderFavorites();
      (_a = this.chat) == null ? void 0 : _a.refresh();
    };
    this.register(this.plugin.learn.events.on("trivia:upsert", favChanged));
    this.register(this.plugin.learn.events.on("learn:reloaded", favChanged));
    this.register(() => this.disposed = true);
    void this.plugin.trivia.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.ready = true;
      this.build();
    });
  }
  get entries() {
    return this.plugin.store.entries;
  }
  pinned() {
    return this.params.word ? new WordIndex(this.entries).find(this.params.word) : void 0;
  }
  entryById(id) {
    return id ? this.entries.find((e) => e.id === id) : void 0;
  }
  onStoreChanged() {
    if (!this.ready) return;
    if (this.entries.length > 0 !== this.hasWords) return this.build();
    this.updateChip();
    this.renderFavorites();
  }
  // ── Layout ────────────────────────────────────────────────────
  build() {
    const root = this.root;
    root.empty();
    this.chipEl = null;
    this.chatHost = null;
    this.favEl = null;
    if (this.chat) this.removeChild(this.chat);
    this.chat = null;
    this.hasWords = this.entries.length > 0;
    if (this.params.word && !this.pinned()) {
      root.appendChild(emptyState({ icon: "lightbulb", title: t("learn.notFound", { word: this.params.word }) }));
    } else if (!this.hasWords) {
      root.appendChild(
        emptyState({ icon: "lightbulb", title: t("learn.trivia.empty.title"), body: t("learn.trivia.empty.body") })
      );
    } else {
      const card = root.createDiv({ cls: "vt-trivia-card" });
      const head = card.createDiv({ cls: "vt-trivia-head" });
      const title = head.createSpan({ cls: "vt-trivia-title" });
      (0, import_obsidian24.setIcon)(title.createSpan({ cls: "vt-trivia-title-icon" }), "lightbulb");
      title.createSpan({ text: t("learn.trivia.title") });
      this.chipEl = head.createEl("button", { cls: "vt-trivia-subject" });
      this.chipEl.addEventListener("click", () => this.pickWord());
      this.updateChip();
      this.chatHost = card.createDiv({ cls: "vt-trivia-chat" });
      this.mountChat();
      card.createDiv({ cls: "vt-trivia-footer", text: t("learn.trivia.footer") });
    }
    if (this.params.favorites) {
      this.favEl = root.createDiv({ cls: "vt-trivia-favs" });
      this.renderFavorites();
    }
  }
  // 「從已學的 24 個字隨機 ⌄」 — a click picks the word for the next round.
  updateChip() {
    const chip2 = this.chipEl;
    if (!chip2) return;
    chip2.empty();
    const pinned = this.pinned();
    chip2.createSpan({
      text: pinned ? t("learn.trivia.subject", { word: pinned.word }) : t("learn.trivia.random", { n: this.entries.length })
    });
    if (!pinned) (0, import_obsidian24.setIcon)(chip2.createSpan({ cls: "vt-trivia-subject-icon" }), "chevron-down");
    chip2.disabled = !!pinned || this.plugin.ai.status() !== "ready";
    chip2.title = pinned ? "" : t("learn.trivia.pick");
  }
  pickWord() {
    if (this.pinned() || this.plugin.trivia.isBusy()) return;
    new WordPickModal(this.plugin.app, [...this.entries], (e) => {
      this.run({ type: "ask", kind: "next", entryId: e.id });
    }).open();
  }
  mountChat() {
    const host = this.chatHost;
    if (!host) return;
    if (this.chat) this.removeChild(this.chat);
    host.empty();
    const opts = {
      app: this.plugin.app,
      threads: this.plugin.threads,
      ai: this.plugin.ai,
      selection: this.plugin.selection,
      threadId: TRIVIA_THREAD_ID,
      surface: "trivia",
      customTaskId: triviaFollowup.id,
      sourcePath: this.sourcePath,
      placeholder: t("learn.trivia.placeholder"),
      state: this.chatState,
      send: (req) => this.send(req),
      retry: (turnId) => this.retry(turnId),
      turnActions: (turn) => this.turnActions(turn),
      turnHeader: (turn) => this.turnHeader(turn),
      onOpenSettings: () => openPluginSettings(this.plugin.app, this.plugin.manifest.id)
    };
    this.chat = this.addChild(new ChatPanel(host, opts));
  }
  // ── Conversation ──────────────────────────────────────────────
  async call(c) {
    if (c.type === "followup") return this.plugin.trivia.followup(c.question, c.selection);
    const subject = await this.plugin.trivia.ask(c.kind, c.entryId ? { entryId: c.entryId } : {});
    if (!subject && !this.plugin.trivia.isBusy()) new import_obsidian24.Notice(t("learn.trivia.noWords"));
  }
  run(c) {
    this.call(c).catch((e) => {
      console.error("Vocab Tracker: trivia request failed", e);
      new import_obsidian24.Notice(learnErrorText(e));
    });
  }
  async send(req) {
    var _a;
    const c = triviaCall(req, (_a = this.pinned()) == null ? void 0 : _a.id);
    if (c) await this.call(c);
  }
  retry(turnId) {
    return this.plugin.trivia.retry(turnId);
  }
  subjectWord(turn) {
    var _a;
    return (_a = this.entryById(subjectOf(this.plugin.trivia.thread(), turn))) == null ? void 0 : _a.word;
  }
  turnHeader(turn) {
    const text = triviaTurnHeader(
      turn,
      this.subjectWord(turn),
      (kind) => kind === "next" ? t("learn.trivia.turn.next") : t(`ai.task.trivia.${kind}`)
    );
    return text ? { text, icon: "lightbulb" } : void 0;
  }
  turnActions(turn) {
    const { threads, trivia } = this.plugin;
    const favorite = trivia.favoriteOf(turn.id);
    const specs = triviaTurnActions(turn, { subjectWord: this.subjectWord(turn), favorite, feedback: true });
    return specs.map((s) => {
      const label = t(s.label, s.params);
      const base = { label, icon: s.icon, active: s.active, iconOnly: s.iconOnly };
      switch (s.kind) {
        case "up":
        case "down": {
          const kind = s.kind;
          return {
            ...base,
            onClick: () => void threads.setFeedback(TRIVIA_THREAD_ID, turn.id, nextFeedback(turn.feedback, kind))
          };
        }
        case "favorite":
          return {
            ...base,
            onClick: () => {
              const item = this.plugin.trivia.favorite(turn.id);
              if (!item) return void new import_obsidian24.Notice(t("learn.trivia.noWords"));
              const entry = this.entryById(item.entryId);
              if (!entry) return;
              const page = this.plugin.exporter.wordPagePath(entry.id, entry.word);
              new import_obsidian24.Notice(t("learn.trivia.savedTo", { path: page.split("/").slice(-2).join("/") }));
            }
          };
        case "unfavorite":
          return { ...base, onClick: () => favorite && this.plugin.trivia.unfavorite(favorite.id) };
      }
    });
  }
  // ── 收藏的冷知識 ───────────────────────────────────────────────
  renderFavorites() {
    const el = this.favEl;
    if (!el) return;
    el.empty();
    if (this.favScope) this.removeChild(this.favScope);
    const scope = this.favScope = this.addChild(new import_obsidian24.Component());
    el.createDiv({ cls: "vt-trivia-favs-title", text: t("learn.trivia.favorites") });
    const pinned = this.pinned();
    const items = this.plugin.trivia.favorites(pinned == null ? void 0 : pinned.id);
    const now = /* @__PURE__ */ new Date();
    const views = favoriteViews(items, (id) => {
      var _a;
      return (_a = this.entryById(id)) == null ? void 0 : _a.word;
    }, (iso) => dayLabel(iso, now));
    if (!views.length) {
      el.createDiv({ cls: "vt-trivia-favs-empty", text: t("learn.trivia.favorites.empty") });
      return;
    }
    for (const v of views) {
      const card = el.createDiv({ cls: "vt-trivia-fav" });
      const head = card.createDiv({ cls: "vt-trivia-fav-head" });
      head.createSpan({ cls: "vt-trivia-fav-title", text: v.heading });
      const remove = head.createEl("button", { cls: "vt-trivia-fav-remove clickable-icon" });
      (0, import_obsidian24.setIcon)(remove, "bookmark-minus");
      remove.setAttr("aria-label", t("learn.trivia.unfavorite"));
      remove.addEventListener("click", () => this.plugin.trivia.unfavorite(v.id));
      const body = card.createDiv({ cls: "vt-trivia-fav-body" });
      void import_obsidian24.MarkdownRenderer.render(this.plugin.app, v.body, body, this.sourcePath, scope);
      if (v.date || v.mentions.length) this.renderFavoriteMeta(card.createDiv({ cls: "vt-trivia-fav-meta" }), v);
    }
  }
  // 「收藏 10/03 · 也提到 napkin、kitchenware」 — each mentioned word opens its card.
  renderFavoriteMeta(el, v) {
    const dates = datesText({ added: v.date, updated: v.updated }, "saved");
    if (dates) el.appendText(dates);
    if (!v.mentions.length) return;
    if (dates) el.appendText(" \xB7 ");
    const marker = "\0";
    const [before, after] = splitAround(t("learn.trivia.mentions", { words: marker }), marker);
    el.appendText(before);
    const sep = joinWords(["", ""]);
    v.mentions.forEach((m, i) => {
      if (i) el.appendText(sep);
      wordChip(el, this.plugin, this.entryById(m.entryId), "vt-trivia-fav-mention").setText(m.word);
    });
    el.appendText(after);
  }
};

// src/ui/blocks/verbs.ts
var import_obsidian25 = require("obsidian");
function l2(key3, path) {
  return path === void 0 ? t(`learn.verb.${key3}`) : t(`learn.verb.${key3}`, { path });
}
function renderVerbs(plugin, source, el, ctx) {
  ctx.addChild(new VerbsBlock(el, plugin, parseVerbsParams(source)));
}
var VerbsBlock = class extends import_obsidian25.MarkdownRenderChild {
  constructor(containerEl, plugin, params) {
    super(containerEl);
    this.plugin = plugin;
    this.params = params;
    this.listEl = null;
    this.countEl = null;
    this.query = "";
    // Last failure per entry, shown under its usage until the next try
    // (with what was thrown, for the debug box).
    this.errors = /* @__PURE__ */ new Map();
  }
  onload() {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-verbs"] });
    guardReadingClicks(this, this.root);
    if (this.params.word) {
      this.root.addClass("is-single");
      this.detailEl = this.root.createDiv({ cls: "vt-verb-detail" });
    } else {
      this.buildLayout();
    }
    const redraw = () => this.render();
    this.register(this.plugin.store.events.on("data:changed", redraw));
    this.register(this.plugin.verbs.events.on("verb:busy", redraw));
    this.register(this.plugin.learn.events.on("verbFavorite:upsert", redraw));
    this.register(this.plugin.learn.events.on("learn:reloaded", redraw));
    this.render();
    void this.plugin.learn.ensureLoaded().then(redraw);
  }
  favorited(e) {
    return this.plugin.learn.loaded && !!this.plugin.learn.verbFavorite(e.id);
  }
  toggleFavorite(e) {
    const learn = this.plugin.learn;
    if (learn.verbFavorite(e.id)) return learn.unfavoriteVerb(e.id);
    learn.favoriteVerb(e);
    const page = this.plugin.exporter.wordPagePath(e.id, e.word);
    new import_obsidian25.Notice(l2("savedTo", page.split("/").slice(-2).join("/")));
  }
  buildLayout() {
    const grid = this.root.createDiv({ cls: "vt-verbs-grid" });
    const side = grid.createDiv({ cls: "vt-verbs-side" });
    const search = side.createDiv({ cls: "vt-verbs-search" });
    (0, import_obsidian25.setIcon)(search.createSpan({ cls: "vt-verbs-search-icon" }), "search");
    const input = search.createEl("input", { cls: "vt-verbs-filter", type: "search" });
    input.placeholder = t("learn.verb.filter");
    input.addEventListener("input", () => {
      this.query = input.value;
      this.render();
    });
    this.countEl = side.createDiv({ cls: "vt-verbs-count" });
    this.listEl = side.createDiv({ cls: "vt-verbs-list" });
    this.detailEl = grid.createDiv({ cls: "vt-verb-detail" });
  }
  render() {
    if (this.params.word) return this.renderSingle(this.params.word);
    const all = this.plugin.verbs.verbs();
    const shown = filterVerbs(all, this.query);
    this.selectedId = pickVerb(shown, this.selectedId);
    this.root.toggleClass("is-empty", !all.length);
    if (this.countEl) this.countEl.setText(t("learn.verb.count", { n: all.length }));
    const list = this.listEl;
    if (list) {
      list.empty();
      if (all.length && !shown.length) list.createDiv({ cls: "vt-verbs-nomatch", text: t("learn.verb.noMatch") });
      for (const e of shown) {
        const row = list.createEl("button", { cls: "vt-verbs-row" });
        row.toggleClass("is-active", e.id === this.selectedId);
        row.setAttr("aria-pressed", String(e.id === this.selectedId));
        row.createSpan({ cls: "vt-verbs-row-word", text: e.word });
        if (this.plugin.verbs.isBusy(e.id)) (0, import_obsidian25.setIcon)(row.createSpan({ cls: "vt-verbs-row-icon is-busy" }), "loader");
        else if (this.favorited(e)) {
          const icon = row.createSpan({ cls: "vt-verbs-row-icon is-saved" });
          (0, import_obsidian25.setIcon)(icon, "bookmark-check");
          icon.setAttr("aria-label", l2("rowFavorited"));
        } else if (e.usage) {
          const icon = row.createSpan({ cls: "vt-verbs-row-icon" });
          (0, import_obsidian25.setIcon)(icon, "check");
          icon.setAttr("aria-label", t("learn.verb.hasUsage"));
        }
        row.addEventListener("click", () => {
          this.selectedId = e.id;
          this.render();
        });
      }
    }
    this.detailEl.empty();
    if (!all.length) {
      this.detailEl.appendChild(
        emptyState({ icon: "list", title: t("learn.verb.none.title"), body: t("learn.verb.none.body") })
      );
      return;
    }
    const selected = shown.find((e) => e.id === this.selectedId);
    if (selected) this.renderDetail(selected);
  }
  renderSingle(word) {
    this.detailEl.empty();
    const entry = new WordIndex(this.plugin.store.entries).find(word);
    if (!entry) {
      this.detailEl.appendChild(inlineNote({ text: t("learn.notFound", { word }) }));
      return;
    }
    if (!this.plugin.verbs.canGenerate(entry)) {
      this.detailEl.appendChild(inlineNote({ text: t("learn.verb.notVerb", { word: entry.word }) }));
      return;
    }
    this.renderDetail(entry);
  }
  // ── Right pane ────────────────────────────────────────────────
  renderDetail(e) {
    const el = this.detailEl;
    const head = el.createDiv({ cls: "vt-verb-head" });
    head.createSpan({ cls: "vt-verb-word", text: e.word });
    const phon = phoneticLine(e);
    if (phon) head.createSpan({ cls: "vt-verb-phon", text: phon });
    const speak = head.createEl("button", { cls: "vt-verb-speak clickable-icon" });
    (0, import_obsidian25.setIcon)(speak, "volume-2");
    speak.setAttr("aria-label", t("learn.verb.speak"));
    bindPronounceButton(speak, e);
    const usage = this.plugin.verbs.usage(e);
    const meta = usageMeta(e, usage);
    const metaParts = [];
    if (meta.source) metaParts.push(t("learn.verb.meta.source", { source: meta.source }));
    const dates = usageDates(usage);
    if (dates) metaParts.push(dates);
    if (metaParts.length) el.createDiv({ cls: "vt-verb-meta", text: metaParts.join(" \xB7 ") });
    const busy = this.plugin.verbs.isBusy(e.id);
    if (busy) {
      const box = el.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      (0, import_obsidian25.setIcon)(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: t("learn.verb.generating", { word: e.word }) });
      learnButton(box, { label: t("learn.stop"), icon: "square", onClick: () => this.plugin.verbs.stop(e.id) });
    }
    const error = this.errors.get(e.id);
    if (error && !busy) el.appendChild(aiErrorBox({ text: error.text, error: error.cause }));
    if (usage) {
      const { patterns, related } = usageRows(usage);
      const list = el.createDiv({ cls: "vt-verb-patterns" });
      for (const p of patterns) {
        const row = list.createDiv({ cls: "vt-verb-pattern" });
        row.createSpan({ cls: "vt-verb-pattern-p", text: p.pattern });
        const right = row.createDiv({ cls: "vt-verb-pattern-body" });
        if (p.meaningZh) right.createDiv({ cls: "vt-verb-pattern-zh", text: p.meaningZh });
        if (p.example) right.createDiv({ cls: "vt-verb-pattern-ex", text: p.example });
      }
      if (related.length) {
        el.createDiv({ cls: "vt-verb-section", text: t("learn.verb.related") });
        const chips = el.createDiv({ cls: "vt-verb-related" });
        const index = new WordIndex(this.plugin.store.entries);
        for (const r of related) {
          const known = index.find(r.phrase);
          const chip2 = wordChip(chips, this.plugin, known && known.id !== e.id ? known : void 0, "vt-verb-related-chip");
          chip2.createSpan({ text: r.phrase });
          if (r.zh) chip2.createSpan({ cls: "vt-verb-related-zh", text: r.zh });
        }
      }
      if (!busy) {
        const actions = el.createDiv({ cls: "vt-verb-actions" });
        const saved = this.favorited(e);
        const fav = learnButton(actions, {
          label: l2(saved ? "favorited" : "favorite"),
          icon: saved ? "bookmark-check" : "bookmark",
          onClick: () => this.toggleFavorite(e)
        });
        fav.addClass("vt-verb-favorite");
        fav.toggleClass("is-active", saved);
        fav.setAttr("aria-pressed", String(saved));
        if (saved) fav.title = l2("unfavorite");
        fav.disabled = !this.plugin.learn.loaded;
        const regen = learnButton(actions, {
          label: t("learn.verb.regenerate"),
          icon: "refresh-cw",
          onClick: () => void this.generate(e)
        });
        const status = this.plugin.ai.status();
        if (status !== "ready") {
          regen.disabled = true;
          const offline = status === "offline";
          actions.appendChild(
            inlineNote({ tone: offline ? "offline" : "info", text: t(offline ? "learn.ai.offline" : "learn.ai.body") })
          );
        }
      }
      return;
    }
    if (busy) return;
    if (renderLearnAiGate(el, this.plugin)) return;
    el.appendChild(
      emptyState({
        icon: "sparkles",
        title: t("learn.verb.empty.title", { word: e.word }),
        body: t("learn.verb.empty.body"),
        action: { label: t("learn.verb.generate"), icon: "sparkles", onClick: () => void this.generate(e) }
      })
    );
  }
  async generate(e) {
    if (this.plugin.verbs.isBusy(e.id)) return;
    this.errors.delete(e.id);
    try {
      await this.plugin.verbs.generate(e);
    } catch (err) {
      if (!isAbort(err)) {
        console.error("Vocab Tracker: verb usage failed", err);
        this.errors.set(e.id, { text: learnErrorText(err), cause: err });
      }
    }
    this.render();
  }
};

// src/ui/blocks/registry.ts
var BLOCKS = [
  { lang: "vocab-dashboard", render: renderDashboard },
  { lang: "vocab-flashcards", render: renderFlashcards },
  // The plugin is the block's WordHeaderHost.
  { lang: WORD_BLOCK_LANG, render: renderWordHeader },
  // M7 (規劃書 06 §7): 字族樹, 動詞用法, 冷知識.
  { lang: "vocab-families", render: renderFamilies },
  { lang: "vocab-verbs", render: renderVerbs },
  { lang: "vocab-trivia", render: renderTrivia }
];
function registerBlocks(plugin) {
  for (const def of BLOCKS) {
    plugin.registerMarkdownCodeBlockProcessor(
      def.lang,
      (source, el, ctx) => def.render(plugin, source, el, ctx)
    );
  }
}

// ../../../node_modules/ts-fsrs/dist/index.mjs
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
function dateDiffInDays(last2, cur) {
  const utc1 = Date.UTC(
    last2.getUTCFullYear(),
    last2.getUTCMonth(),
    last2.getUTCDate()
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
  const clip2 = CLAMP_PARAMETERS(W17_W18_Ceiling, enableShortTerm).slice(
    0,
    parameters.length
  );
  if (Math.max(0, numRelearningSteps) > 1) {
    const w11 = clamp(parameters[11] || 0, clip2[11][0], clip2[11][1]);
    const w13 = clamp(parameters[13] || 0, clip2[13][0], clip2[13][1]);
    const w14 = clamp(parameters[14] || 0, clip2[14][0], clip2[14][1]);
    const value = -(Math.log(w11) + Math.log(Math.pow(2, w13) - 1) + w14 * 0.3) / numRelearningSteps;
    const w17_w18_ceiling = clamp(
      roundTo(Math.sqrt(Math.max(value, 0)), 8),
      0.01,
      W17_W18_Ceiling
    );
    if (clip2[17]) clip2[17] = [clip2[17][0], w17_w18_ceiling];
    if (clip2[18]) clip2[18] = [clip2[18][0], w17_w18_ceiling];
  }
  return clip2.map(
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
    for (const key3 in _params) {
      const paramKey = key3;
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
function reviewLogsFingerprint(logs) {
  return logs.map((l4) => l4.id).sort().join("\n");
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
  // §4.3: when memory has reviews the synced copy lacks (the other
  // device's file overwrote ours), the union is written back.
  async reloadLogs() {
    if (await this.mergeDiskLogs()) this.enqueueLogWrite();
  }
  // true when the merged logs differ from what's on disk (age pruning
  // aside, so expiring old logs alone never triggers a write).
  async mergeDiskLogs() {
    try {
      const disk = await this.deps.storage.readShard(REVIEWS_SHARD);
      const now = this.clock();
      const onDisk = Array.isArray(disk == null ? void 0 : disk.logs) ? disk.logs : [];
      this.logs = pruneReviewLogs(mergeReviewLogs(this.logs, onDisk), now);
      return reviewLogsFingerprint(this.logs) !== reviewLogsFingerprint(pruneReviewLogs(onDisk, now));
    } catch (e) {
      console.error("Vocab Tracker: couldn't read review logs", e);
      return false;
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
    return this.logs.filter((l4) => ids.has(l4.entryId) && new Date(l4.at).getTime() >= dayStart).length;
  }
  // When this entry is next due, or null for a card that's never been
  // scheduled (shown as "new" rather than a date).
  nextDue(entry) {
    return isNewCard(entry) || !entry.srs ? null : new Date(entry.srs.due);
  }
  // A one-word review (「複習這個字」) rates whatever the word's state —
  // even before it's due. Nothing special happens to an early review:
  // rate() hands FSRS the real time since the last review, and FSRS gives
  // a card recalled sooner than planned a smaller stability gain (it was
  // easier to remember), so the next interval grows less than it would on
  // the due date; Again still counts as a lapse. preview() shows exactly
  // that. A new word rated here starts its schedule and takes one of
  // today's new-card slots, like in the queue.
  timing(entry) {
    return reviewTiming(entry, this.clock());
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
        await this.mergeDiskLogs();
        await this.deps.storage.writeShard(REVIEWS_SHARD, { logs: this.logs });
      } catch (e) {
        console.error("Vocab Tracker: couldn't save review logs", e);
      }
    });
  }
};

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
      headers: Object.fromEntries(res.headers.entries()),
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
  get(key3) {
    if (typeof this.app.loadLocalStorage === "function") {
      const v = this.app.loadLocalStorage(LS_PREFIX + key3);
      return typeof v === "string" ? v : null;
    }
    try {
      return window.localStorage.getItem(LS_PREFIX + key3);
    } catch (e) {
      return null;
    }
  }
  set(key3, value) {
    if (typeof this.app.saveLocalStorage === "function") {
      this.app.saveLocalStorage(LS_PREFIX + key3, value);
      return;
    }
    try {
      if (value === null) window.localStorage.removeItem(LS_PREFIX + key3);
      else window.localStorage.setItem(LS_PREFIX + key3, value);
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
var import_obsidian26 = require("obsidian");
var ObsidianRequest = class {
  async request(req) {
    var _a;
    const res = await (0, import_obsidian26.requestUrl)({
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
var EPHEMERAL = { type: "ephemeral" };
function sonnetVersion(model) {
  const m = /(?:^|[^a-z0-9])sonnet-(\d{1,2})(?:[-.](\d{1,2}))?(?!\d)/.exec(model.trim().toLowerCase());
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] ? Number(m[2]) : 0 };
}
function effortFor(model) {
  const v = sonnetVersion(model);
  if (!v) return void 0;
  return v.major > 4 || v.major === 4 && v.minor >= 6 ? "low" : void 0;
}
function outputConfig(model, output) {
  const effort = effortFor(model);
  if (!output && !effort) return void 0;
  return {
    ...output ? { format: { type: "json_schema", schema: output.schema } } : {},
    ...effort ? { effort } : {}
  };
}
function buildAnthropicBody(req, model) {
  let msgMark = -1;
  req.messages.forEach((m, i) => {
    if (m.cache && m.content.trim()) msgMark = i;
  });
  const systemBudget = MAX_CACHE_BREAKPOINTS - (msgMark >= 0 ? 1 : 0);
  const cacheIdx = req.system.map((b, i) => b.cache ? i : -1).filter((i) => i >= 0);
  const keep = new Set(cacheIdx.slice(Math.max(0, cacheIdx.length - systemBudget)));
  const body = {
    model,
    max_tokens: req.maxTokens,
    stream: true,
    system: req.system.map((b, i) => ({
      type: "text",
      text: b.text,
      ...keep.has(i) ? { cache_control: EPHEMERAL } : {}
    })),
    // A string is shorthand for a single text block, so the marked message
    // renders exactly like the plain string it is in the next request.
    messages: req.messages.map(
      (m, i) => i === msgMark ? { role: m.role, content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }] } : { role: m.role, content: m.content }
    )
  };
  const config2 = outputConfig(model, req.output);
  if (config2) body.output_config = config2;
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
      const config2 = outputConfig(model);
      const res = await this.deps.transport.send(
        this.request({
          model,
          max_tokens: TEST_MAX_TOKENS,
          stream: true,
          messages: [{ role: "user", content: "ping" }],
          ...config2 ? { output_config: config2 } : {}
        }),
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

// src/services/ai/providers/openaiCompat.ts
function isOfficialOpenAi(baseUrl) {
  try {
    return new URL(baseUrl).hostname === "api.openai.com";
  } catch (e) {
    return false;
  }
}
function normalizeBaseUrl(raw) {
  var _a, _b;
  const url = trimSlash(raw.trim()).replace(/\/chat\/completions$/i, "");
  try {
    const u = new URL(url);
    if (u.hostname === "generativelanguage.googleapis.com" && !/\/openai$/i.test(u.pathname)) {
      const version2 = (_b = (_a = /^\/(v1(?:alpha|beta)?)\b/i.exec(u.pathname)) == null ? void 0 : _a[1]) != null ? _b : "v1beta";
      return `${u.origin}/${version2}/openai`;
    }
  } catch (e) {
  }
  return url;
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
  var _a, _b, _c, _d;
  if (!u || u.prompt_tokens === void 0) return false;
  const cached = (_b = (_a = u.prompt_tokens_details) == null ? void 0 : _a.cached_tokens) != null ? _b : 0;
  target.input = u.prompt_tokens - cached;
  target.cacheRead = cached;
  target.output = Math.max((_c = u.completion_tokens) != null ? _c : 0, ((_d = u.total_tokens) != null ? _d : 0) - u.prompt_tokens);
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
    return normalizeBaseUrl(this.deps.config.baseUrl);
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
function isMissingKey(id, key3) {
  return providerDef(id).key === "required" && !key3;
}

// src/services/ai/tasks/family.ts
var FAMILY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["families"],
  properties: {
    families: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "label", "groups"],
        properties: {
          topic: { type: "string", description: "English key, lowercase, e.g. clothing or gl-" },
          label: { type: "string", description: "\u7E41\u9AD4\u4E2D\u6587\u540D\u7A31\uFF0C\u4F8B\u5982\u300C\u670D\u88DD\u300D\u300Cgl- \u767C\u5149\u5BB6\u65CF\u300D" },
          groups: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "members"],
              properties: {
                label: { type: "string" },
                members: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["word", "zh"],
                    properties: {
                      word: { type: "string" },
                      zh: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
var FAMILY_BASE_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u82F1\u6587\u5B57\u5F59\u8001\u5E2B\uFF0C\u5E6B\u4E00\u4F4D\u4EE5\u4E2D\u6587\u70BA\u6BCD\u8A9E\u7684\u5B78\u7FD2\u8005\u628A\u5B78\u904E\u7684\u55AE\u5B57\u6574\u7406\u6210\u300C\u5B57\u65CF\u300D\uFF0C\u4E26\u88DC\u4E0A\u503C\u5F97\u4E00\u8D77\u5B78\u7684\u5EF6\u4F38\u5B57\u3002

\u5206\u7FA4\u898F\u5247\uFF1A
1. \u5B57\u65CF\u53EF\u4EE5\u4F9D\u4E3B\u984C\uFF08\u4F8B\u5982 clothing \u670D\u88DD\uFF09\u3001\u5B57\u6839\u5B57\u9996\u6216\u97F3\u7D44\uFF08\u4F8B\u5982 gl- \u548C\u5149\u6709\u95DC\uFF09\u3001\u4F7F\u7528\u60C5\u5883\u4F86\u5206\u3002\u6BCF\u500B\u5B57\u65CF\u5E95\u4E0B\u518D\u5206 1 \u5230 4 \u500B\u5C0F\u7D44\uFF0C\u5C0F\u7D44\u540D\u7A31\u7528\u7E41\u9AD4\u4E2D\u6587\u3002
2. \u6BCF\u500B\u5B57\u65CF\u81F3\u5C11\u8981\u6709 2 \u500B\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\u88E1\u7684\u5B57\uFF1B\u9019\u4E9B\u5B57\u7684 word \u7167\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\u7684\u539F\u6A23\u5BEB\uFF0C\u4E0D\u8981\u6539\u6210\u539F\u5F62\u6216\u5176\u4ED6\u8A5E\u5F62\u3002
3. \u6BCF\u500B\u5B57\u65CF\u53EF\u4EE5\u88DC 2 \u5230 5 \u500B\u5B78\u7FD2\u8005\u9084\u6C92\u5B78\u3001\u4F46\u548C\u9019\u500B\u5B57\u65CF\u5BC6\u5207\u76F8\u95DC\u7684\u5E38\u7528\u5EF6\u4F38\u5B57\uFF0C\u7A0B\u5EA6\u7B26\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\uFF1B\u4E0D\u8981\u88DC\u7F55\u898B\u5B57\u3002
4. zh \u7528\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09\uFF0C10 \u500B\u5B57\u4EE5\u5167\u3002
5. \u5B57\u6839\u3001\u5B57\u6E90\u53EA\u7528\u53EF\u9760\u3001\u5E38\u898B\u7684\u77E5\u8B58\u3002\u4E0D\u78BA\u5B9A\u5C31\u4E0D\u8981\u7528\u5B57\u6839\u5206\u7FA4\uFF0C\u6539\u7528\u4E3B\u984C\u5206\u7FA4\uFF0C\u4E0D\u8981\u7DE8\u9020\u5B57\u6E90\u3002
6. topic \u7528\u82F1\u6587\u5C0F\u5BEB\uFF1Blabel \u7528\u7E41\u9AD4\u4E2D\u6587\uFF0C\u53EF\u4EE5\u593E\u82F1\u6587\u5B57\u6839\uFF08\u4F8B\u5982\u300Cgl- \u767C\u5149\u5BB6\u65CF\u300D\uFF09\u3002
7. \u53EA\u8F38\u51FA\u7B26\u5408 schema \u7684 JSON\u3002`;
var FAMILY_TEMPLATES = {
  seeded: `\u4EFB\u52D9\uFF1A\u627E\u5B57\u65CF
\u4EE5\u3014\u8D77\u9EDE\u55AE\u5B57\u3015\u70BA\u4E2D\u5FC3\u627E\u51FA 1 \u5230 3 \u500B\u5B57\u65CF\uFF0C\u6BCF\u500B\u5B57\u65CF\u90FD\u8981\u5305\u542B\u81F3\u5C11\u4E00\u500B\u8D77\u9EDE\u55AE\u5B57\u3002
\u3014\u8D77\u9EDE\u55AE\u5B57\u3015
{{seeds}}{{#existingTopics}}

\u5DF2\u7D93\u6709\u7684\u5B57\u65CF\uFF08\u4E0D\u8981\u91CD\u8907\uFF09\uFF1A{{existingTopics}}{{/existingTopics}}`,
  regroup: `\u4EFB\u52D9\uFF1A\u91CD\u65B0\u5206\u7FA4
\u628A\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\u6574\u7406\u6210 3 \u5230 8 \u500B\u5B57\u65CF\u3002\u4E0D\u4E00\u5B9A\u6BCF\u500B\u5B57\u90FD\u8981\u5206\u9032\u53BB\uFF0C\u627E\u4E0D\u5230\u5408\u9069\u5B57\u65CF\u7684\u5B57\u53EF\u4EE5\u7565\u904E\uFF1B\u540C\u4E00\u500B\u5B57\u53EF\u4EE5\u51FA\u73FE\u5728\u4E0D\u540C\u5B57\u65CF\u3002`
};
var KNOWN_FAMILY_TEMPLATE = `\u3014\u5DF2\u5B78\u55AE\u5B57\u3015\uFF08\u5171 {{count}} \u500B\uFF09
{{words}}`;
function wordLine(w) {
  var _a, _b;
  const pos = (_a = w.partOfSpeech) == null ? void 0 : _a.trim();
  const zh = (_b = w.zh) == null ? void 0 : _b.trim();
  return `- ${w.word}${pos ? `\uFF08${pos}\uFF09` : ""}${zh ? ` ${zh}` : ""}`;
}
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v) {
  return typeof v === "string" ? v.trim() : "";
}
function structuredJson(r) {
  if (r.json !== void 0) return r.json;
  if (r.stop === "max_tokens") throw new AiError("bad_output", "Structured answer was cut off (max_tokens)");
  return extractJson(r.text);
}
function parseFamilies(json) {
  if (!isObj(json) || !Array.isArray(json.families)) {
    throw new AiError("bad_output", "family.generate: expected { families: [...] }");
  }
  const out = [];
  for (const f of json.families) {
    if (!isObj(f) || !Array.isArray(f.groups)) throw new AiError("bad_output", "family.generate: malformed family");
    const groups = [];
    for (const g of f.groups) {
      if (!isObj(g) || !Array.isArray(g.members)) throw new AiError("bad_output", "family.generate: malformed group");
      const seen = /* @__PURE__ */ new Set();
      const members = [];
      for (const m of g.members) {
        if (!isObj(m)) throw new AiError("bad_output", "family.generate: malformed member");
        const word = str(m.word);
        const key3 = word.toLowerCase();
        if (!word || seen.has(key3)) continue;
        seen.add(key3);
        members.push({ word, zh: str(m.zh) });
      }
      if (members.length) groups.push({ label: str(g.label), members });
    }
    const topic = str(f.topic);
    if (!groups.length || !(topic || str(f.label))) continue;
    out.push({ topic: topic || str(f.label), label: str(f.label) || topic, groups });
  }
  return out;
}
var familyGenerate = {
  id: "family.generate",
  version: 1,
  surface: "family",
  label: "ai.task.family.generate",
  tier: "smart",
  // A full regroup lists many members; leave room for thinking too.
  maxTokens: 8192,
  // The learner's answer-length limit is for prose, not a JSON list.
  answerChars: () => 0,
  build(input, ctx) {
    var _a, _b;
    const seeds = (_a = input.seeds) != null ? _a : [];
    const user = seeds.length ? renderTemplate(FAMILY_TEMPLATES.seeded, {
      seeds: seeds.map(wordLine).join("\n"),
      existingTopics: ((_b = input.existingTopics) != null ? _b : []).join("\u3001")
    }) : renderTemplate(FAMILY_TEMPLATES.regroup, {});
    return composeRequest({
      base: FAMILY_BASE_PROMPT,
      context: [renderTemplate(KNOWN_FAMILY_TEMPLATE, { count: input.known.length, words: input.known.map(wordLine).join("\n") })],
      profile: profileForTask(ctx.profile, familyGenerate, input),
      // Each generation stands alone.
      history: [],
      user,
      tier: familyGenerate.tier,
      maxTokens: familyGenerate.maxTokens,
      output: { name: "word_families", schema: FAMILY_SCHEMA }
    });
  },
  parse(r) {
    return parseFamilies(structuredJson(r));
  }
};
var FAMILY_TASKS = [familyGenerate];

// src/services/ai/tasks/verbUsage.ts
var VERB_USAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["patterns", "related"],
  properties: {
    patterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "meaningZh", "example"],
        properties: {
          pattern: { type: "string", description: "e.g. sugarcoat + \u540D\u8A5E / sugarcoat it" },
          meaningZh: { type: "string" },
          example: { type: "string", description: "One natural English sentence" }
        }
      }
    },
    related: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "zh"],
        properties: {
          phrase: { type: "string" },
          zh: { type: "string" }
        }
      }
    }
  }
};
var VERB_BASE_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u82F1\u6587\u5B57\u5F59\u8001\u5E2B\uFF0C\u5E6B\u4E00\u4F4D\u4EE5\u4E2D\u6587\u70BA\u6BCD\u8A9E\u7684\u5B78\u7FD2\u8005\u6574\u7406\u4E00\u500B\u82F1\u6587\u52D5\u8A5E\u7684\u5E38\u898B\u7528\u6CD5\u3002\u3014\u55AE\u5B57\u3015\u662F\u9019\u500B\u5B57\u7684\u8CC7\u6599\u3002

\u898F\u5247\uFF1A
1. patterns \u5217 3 \u5230 5 \u500B\u6700\u5E38\u898B\u7684\u53E5\u578B\u6216\u642D\u914D\uFF0C\u4F9D\u5E38\u898B\u7A0B\u5EA6\u6392\u5E8F\u3002pattern \u7528\u300C\u52D5\u8A5E + \u540D\u8A5E\u300D\u300C\u52D5\u8A5E + to V\u300D\u300C\u52D5\u8A5E + that \u5B50\u53E5\u300D\u300Cbe + p.p.\u300D\u9019\u985E\u5BEB\u6CD5\uFF0C\u6216\u76F4\u63A5\u5BEB\u56FA\u5B9A\u642D\u914D\uFF08\u4F8B\u5982 sugarcoat it\uFF09\uFF1B\u5E38\u898B\u7684\u884D\u751F\u5F62\u5BB9\u8A5E\u4E5F\u53EF\u4EE5\u5217\u4E00\u500B\uFF08\u4F8B\u5982 sugarcoated (adj.)\uFF09\u3002
2. meaningZh \u7528\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\u7528\u8A9E\uFF09\u8AAA\u660E\u9019\u500B\u53E5\u578B\u7684\u610F\u601D\u548C\u4F7F\u7528\u6642\u6A5F\uFF0C25 \u5B57\u4EE5\u5167\u3002
3. example \u662F\u4E00\u500B\u81EA\u7136\u3001\u5B8C\u6574\u7684\u82F1\u6587\u4F8B\u53E5\uFF0C\u7A0B\u5EA6\u7B26\u5408\u3014\u5B78\u7FD2\u8005\u8A2D\u5B9A\u3015\u3002
4. related \u5217 2 \u5230 4 \u500B\u610F\u601D\u76F8\u8FD1\u6216\u5E38\u4E00\u8D77\u51FA\u73FE\u7684\u7247\u8A9E\uFF0Czh \u7528\u7E41\u9AD4\u4E2D\u6587 10 \u5B57\u4EE5\u5167\u3002
5. \u53EA\u5BEB\u53EF\u9760\u3001\u5E38\u898B\u7684\u7528\u6CD5\uFF0C\u4E0D\u78BA\u5B9A\u7684\u4E0D\u8981\u5217\uFF0C\u4E0D\u8981\u7DE8\u9020\u3002
6. \u53EA\u8F38\u51FA\u7B26\u5408 schema \u7684 JSON\u3002`;
var VERB_TEMPLATE = `\u4EFB\u52D9\uFF1A\u52D5\u8A5E\u7528\u6CD5\uFF08{{word}}\uFF09
\u6574\u7406 {{word}} \u7684\u5E38\u898B\u53E5\u578B\u8207\u76F8\u8FD1\u8AAA\u6CD5\u3002{{#hasSource}}\u3014\u51FA\u8655\u6BB5\u843D\u3015\u6216\u3014\u51FA\u8655\u53E5\u5B50\u3015\u88E1\u7684\u7528\u6CD5\u5982\u679C\u5C6C\u65BC\u5176\u4E2D\u4E00\u7A2E\uFF0C\u628A\u90A3\u500B\u53E5\u578B\u6392\u5728\u7B2C\u4E00\u500B\u3002{{/hasSource}}`;
function isObj2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str2(v) {
  return typeof v === "string" ? v.trim() : "";
}
function parseVerbUsage(json) {
  if (!isObj2(json) || !Array.isArray(json.patterns)) {
    throw new AiError("bad_output", "verb.usage: expected { patterns: [...], related: [...] }");
  }
  const patterns = [];
  for (const p of json.patterns) {
    if (!isObj2(p)) throw new AiError("bad_output", "verb.usage: malformed pattern");
    const pattern = str2(p.pattern);
    if (pattern) patterns.push({ pattern, meaningZh: str2(p.meaningZh), example: str2(p.example) });
  }
  if (!patterns.length) throw new AiError("bad_output", "verb.usage: no patterns");
  const related = [];
  for (const r of Array.isArray(json.related) ? json.related : []) {
    if (!isObj2(r)) continue;
    const phrase = str2(r.phrase);
    if (phrase) related.push({ phrase, zh: str2(r.zh) });
  }
  return { patterns, related };
}
var verbUsage = {
  id: "verb.usage",
  version: 1,
  surface: "verb",
  label: "ai.task.verb.usage",
  tier: "smart",
  maxTokens: 4096,
  answerChars: () => 0,
  build(input, ctx) {
    const c = buildWordContext(input);
    return composeRequest({
      base: VERB_BASE_PROMPT,
      context: [c.wordBlock],
      profile: profileForTask(ctx.profile, verbUsage, input),
      history: [],
      user: renderTemplate(VERB_TEMPLATE, c.slots),
      tier: verbUsage.tier,
      maxTokens: verbUsage.maxTokens,
      output: { name: "verb_usage", schema: VERB_USAGE_SCHEMA }
    });
  },
  parse(r) {
    return parseVerbUsage(structuredJson(r));
  }
};
var VERB_TASKS = [verbUsage];

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
  return new TaskRegistry([...PARAGRAPH_TASKS, ...WORD_TASKS, ...FAMILY_TASKS, ...VERB_TASKS, ...TRIVIA_TASKS]);
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
    return { status: res.status, header: (n) => res.header(n), headers: res.headers, chunks: res.chunks, mode: "fetch" };
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
        headers,
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

// src/services/ai/transport/tracing.ts
var SECRET_HEADERS = /* @__PURE__ */ new Set(["authorization", "x-api-key", "x-goog-api-key", "api-key"]);
var MAX_BODY_CHARS = 2e4;
function maskSecret(value) {
  var _a, _b;
  const m = /^(Bearer\s+)?(.*)$/is.exec(value);
  const prefix = (_a = m == null ? void 0 : m[1]) != null ? _a : "";
  const secret = (_b = m == null ? void 0 : m[2]) != null ? _b : value;
  const shown = secret.length <= 12 ? "\u2026" : `${secret.slice(0, 6)}\u2026${secret.slice(-4)}`;
  return `${prefix}${shown} [${secret.length}]`;
}
function maskHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? maskSecret(v) : v;
  return out;
}
var TracingTransport = class {
  constructor(inner, traces, now = Date.now) {
    this.inner = inner;
    this.traces = traces;
    this.now = now;
  }
  async send(req, signal) {
    var _a;
    const trace = { request: { ...req, headers: maskHeaders(req.headers) } };
    this.traces.push(trace);
    const started = this.now();
    let res;
    try {
      res = await this.inner.send(req, signal);
    } catch (e) {
      trace.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      trace.ms = this.now() - started;
      throw e;
    }
    trace.ms = this.now() - started;
    const recorded = { status: res.status, mode: res.mode, headers: (_a = res.headers) != null ? _a : {}, body: "" };
    trace.response = recorded;
    return { ...res, chunks: tee(res.chunks, recorded) };
  }
};
async function* tee(chunks, into) {
  for await (const c of chunks) {
    if (into.body.length < MAX_BODY_CHARS) into.body += c.slice(0, MAX_BODY_CHARS - into.body.length);
    yield c;
  }
}

// src/services/ai/AiService.ts
var MAX_CONCURRENT = 2;
var MAX_RETRIES = 2;
var BASE_BACKOFF_MS = 1e3;
var MAX_RETRY_WAIT_MS = 3e4;
function abortableSleep(ms5, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AiError("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiError("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms5);
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
  provider(id, transport = this.transport(id)) {
    const ai = this.deps.settings().ai;
    return providerDef(id).create({
      config: ai.providers[id],
      apiKey: this.deps.keys.get(id),
      transport
    });
  }
  // Works even with the master toggle off, so the user can verify their
  // setup before enabling AI. Clears the remembered transport fallback
  // first so a fixed CORS setup gets streaming back. `traces` (when given)
  // collects every HTTP exchange, success or failure, for the settings page.
  async testConnection(provider = this.deps.settings().ai.provider, signal, traces) {
    if (isMissingKey(provider, this.deps.keys.get(provider))) throw new AiError("no_key");
    const transport = this.transport(provider);
    transport.resetMemory();
    const p = this.provider(provider, traces ? new TracingTransport(transport, traces) : transport);
    return p.testConnection(signal != null ? signal : new AbortController().signal);
  }
  async run(task, input, opt = {}) {
    const { task: t2, request } = this.prepare(task, input, opt.history);
    const result = await this.complete(request, opt);
    return { ...result, taskId: t2.id, taskVersion: t2.version };
  }
  // Builds the request without sending it, so a caller (ThreadService) can
  // store the exact final message before calling complete().
  prepare(task, input, history = []) {
    const t2 = typeof task === "string" ? this.tasks.get(task) : task;
    if (!t2) throw new Error(`Unknown AI task "${String(task)}"`);
    return { task: t2, request: t2.build(input, { profile: this.deps.settings().learner, history }) };
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
  async set(provider, key3) {
    const trimmed = key3.trim();
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
      const key3 = localDayKey(this.now());
      days[key3] = add((_c = days[key3]) != null ? _c : emptyDay(), {
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
var import_obsidian27 = require("obsidian");
var VocabSettingsTab = class extends import_obsidian27.PluginSettingTab {
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
    for (const section3 of this.sections) {
      new import_obsidian27.Setting(containerEl).setName(t(section3.title)).setHeading();
      section3.render(containerEl.createDiv({ cls: `vt-settings-section vt-settings-${section3.id}` }), ctx);
    }
  }
};
function parseNonNegativeInt(value) {
  const n = Number(value.trim().replace(/[,_\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// src/ui/settings/sections/ai.ts
var import_obsidian28 = require("obsidian");

// src/ui/settings/traceView.ts
function prettyBody(body) {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch (e) {
    return body;
  }
}
function formatTrace(trace) {
  var _a, _b;
  const { request: req, response: res } = trace;
  const ms5 = (_a = trace.ms) != null ? _a : 0;
  const lines4 = [`${req.method} ${req.url}`];
  for (const [k, v] of Object.entries(req.headers)) lines4.push(`${k}: ${v}`);
  if (req.body) lines4.push("", prettyBody(req.body));
  lines4.push("");
  if (res) {
    lines4.push(t("settings.ai.test.response", { mode: res.mode, ms: ms5 }), `HTTP ${res.status}`);
    for (const [k, v] of Object.entries(res.headers)) lines4.push(`${k}: ${v}`);
    lines4.push("", prettyBody(res.body) || t("settings.ai.test.emptyBody"));
    if (res.body.length >= MAX_BODY_CHARS) lines4.push(t("settings.ai.test.truncated", { n: MAX_BODY_CHARS }));
  } else {
    lines4.push(t("settings.ai.test.noResponse", { ms: ms5 }), (_b = trace.error) != null ? _b : "");
  }
  return lines4.join("\n");
}
function renderTraces(parent, traces, open) {
  if (traces.length === 0) return;
  const text = traces.map(formatTrace).join("\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n");
  const details = parent.createEl("details", { cls: "vt-settings-trace" });
  details.open = open;
  const summary = details.createEl("summary", { text: t("settings.ai.test.details", { n: traces.length }) });
  const copy = summary.createEl("button", { cls: "vt-settings-trace-copy", text: t("settings.ai.test.copy") });
  copy.addEventListener("click", (ev) => {
    ev.preventDefault();
    void navigator.clipboard.writeText(text).then(() => copy.setText(t("settings.ai.test.copied")));
  });
  details.createEl("pre", { text });
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
  new import_obsidian28.Setting(el).setName(t("settings.ai.key.name")).setDesc(keyDesc.join(" ")).addText((text) => {
    text.inputEl.type = "password";
    text.inputEl.autocomplete = "off";
    text.setPlaceholder(id === "anthropic" ? "sk-ant-\u2026" : "sk-\u2026").setValue(ctx.keys.get(id));
    text.onChange((v) => void ctx.keys.set(id, v));
  });
  if (def.editableBaseUrl) {
    const baseUrl = new import_obsidian28.Setting(el).setName(t("settings.ai.baseUrl.name")).setDesc(t("settings.ai.baseUrl.desc"));
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
    const s = new import_obsidian28.Setting(el).setName(t(tier === "smart" ? "settings.ai.smartModel.name" : "settings.ai.fastModel.name")).setDesc(t(tier === "smart" ? "settings.ai.smartModel.desc" : "settings.ai.fastModel.desc"));
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
  const testSetting = new import_obsidian28.Setting(el).setName(t("settings.ai.test.name")).setDesc(t("settings.ai.test.desc"));
  const result = el.createDiv({ cls: "vt-settings-test-result" });
  const trace = el.createDiv();
  testSetting.addButton((b) => {
    b.setButtonText(t("settings.ai.test.button")).onClick(async () => {
      result.empty();
      trace.empty();
      result.removeClass("is-ok", "is-error");
      if (!cfg().smartModel && !cfg().fastModel) {
        result.setText(t("settings.ai.test.noModel"));
        result.addClass("is-error");
        return;
      }
      b.setDisabled(true).setButtonText(t("settings.ai.test.running"));
      const traces = [];
      let failed = false;
      try {
        const r = await ctx.ai.testConnection(id, void 0, traces);
        result.setText(
          t("settings.ai.test.ok", {
            models: r.models.join("\u3001"),
            transport: t(r.transport === "fetch" ? "settings.ai.test.fetch" : "settings.ai.test.requestUrl"),
            ms: r.latencyMs
          })
        );
        result.addClass("is-ok");
      } catch (e) {
        failed = true;
        result.setText(isAiError(e) ? aiErrorText(e) : String(e));
        result.addClass("is-error");
      } finally {
        renderTraces(trace, traces, failed);
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
    new import_obsidian28.Setting(el).setName(t("settings.ai.enabled.name")).setDesc(t("settings.ai.enabled.desc")).addToggle(
      (tg) => tg.setValue(ai().enabled).onChange(async (v) => {
        var _a;
        await ctx.store.updateSettings((s) => s.ai.enabled = v);
        (_a = ctx.onAiEnabledChanged) == null ? void 0 : _a.call(ctx);
      })
    );
    new import_obsidian28.Setting(el).setName(t("settings.ai.provider.name")).setDesc(t("settings.ai.provider.desc")).addDropdown((d) => {
      for (const p of PROVIDERS) d.addOption(p.id, t(p.label));
      d.setValue(ai().provider).onChange(async (v) => {
        await ctx.store.updateSettings((s) => s.ai.provider = v);
        ctx.redisplay();
      });
    });
    renderProviderFields(el, ctx, ai().provider);
    new import_obsidian28.Setting(el).setName(t("settings.ai.budget.name")).setDesc(t("settings.ai.budget.desc")).addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.setPlaceholder("0").setValue(ai().monthlyTokenBudget ? String(ai().monthlyTokenBudget) : "");
      text.onChange((v) => {
        const n = v.trim() === "" ? 0 : parseNonNegativeInt(v);
        if (n !== null) void ctx.store.updateSettings((s) => s.ai.monthlyTokenBudget = n);
      });
    });
    const usage = new import_obsidian28.Setting(el).setName(t("settings.ai.usage.name")).setDesc("\u2026");
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
var import_obsidian29 = require("obsidian");
var generalSection = {
  id: "general",
  title: "settings.section.general",
  render(el, ctx) {
    new import_obsidian29.Setting(el).setName(t("settings.general.locale.name")).setDesc(t("settings.general.locale.desc")).addDropdown(
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
var import_obsidian30 = require("obsidian");
var learnerSection = {
  id: "learner",
  title: "settings.section.learner",
  render(el, ctx) {
    const profile = () => ctx.store.settings.learner;
    el.createDiv({ cls: "setting-item-description vt-settings-intro", text: t("settings.learner.desc") });
    const preview2 = createEl("pre", { cls: "vt-settings-preview", text: renderProfile(profile()) });
    const update = async (mutate) => {
      await ctx.store.updateSettings((s) => mutate(s.learner));
      preview2.setText(renderProfile(profile()));
    };
    new import_obsidian30.Setting(el).setName(t("settings.learner.level.name")).addDropdown((d) => {
      d.addOption("", t("settings.learner.level.none"));
      for (const lv of CEFR_LEVELS) d.addOption(lv, lv);
      d.setValue(profile().level).onChange((v) => void update((p) => p.level = v));
    });
    new import_obsidian30.Setting(el).setName(t("settings.learner.goal.name")).addDropdown((d) => {
      for (const g of LEARNER_GOALS) d.addOption(g, t(`settings.learner.goal.${g}`));
      d.setValue(profile().goal).onChange((v) => void update((p) => p.goal = v));
    });
    new import_obsidian30.Setting(el).setName(t("settings.learner.language.name")).addDropdown((d) => {
      for (const l4 of ANSWER_LANGUAGES) d.addOption(l4, t(`settings.learner.language.${l4}`));
      d.setValue(profile().answerLanguage).onChange((v) => void update((p) => p.answerLanguage = v));
    });
    new import_obsidian30.Setting(el).setName(t("settings.learner.maxChars.name")).setDesc(t("settings.learner.maxChars.desc")).addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.setValue(String(profile().maxAnswerChars)).onChange((v) => {
        const n = parseNonNegativeInt(v);
        if (n !== null) void update((p) => p.maxAnswerChars = n);
      });
    });
    new import_obsidian30.Setting(el).setName(t("settings.learner.extra.name")).setDesc(t("settings.learner.extra.desc")).addTextArea((ta) => {
      ta.inputEl.rows = 3;
      ta.inputEl.addClass("vt-settings-wide");
      ta.setValue(profile().extra).onChange((v) => void update((p) => p.extra = v));
    });
    const previewSetting = new import_obsidian30.Setting(el).setName(t("settings.learner.preview.name"));
    previewSetting.settingEl.addClass("vt-settings-preview-row");
    el.appendChild(preview2);
  }
};

// src/ui/settings/sections/srs.ts
var import_obsidian31 = require("obsidian");
var srsSection = {
  id: "srs",
  title: "settings.section.srs",
  render(el, ctx) {
    const current = () => resolveSrsSettings(ctx.store.settings.srs);
    const update = (patch) => ctx.store.updateSettings((s) => s.srs = { ...current(), ...patch });
    new import_obsidian31.Setting(el).setName(t("settings.srs.retention.name")).setDesc(t("settings.srs.retention.desc")).addSlider(
      (s) => s.setLimits(0.7, 0.99, 0.01).setValue(current().retention).setDynamicTooltip().onChange((v) => void update({ retention: v }))
    );
    new import_obsidian31.Setting(el).setName(t("settings.srs.dailyNew.name")).setDesc(t("settings.srs.dailyNew.desc")).addText((text) => {
      text.inputEl.inputMode = "numeric";
      text.setValue(String(current().dailyNew)).onChange((v) => {
        const n = parseNonNegativeInt(v);
        if (n !== null) void update({ dailyNew: n });
      });
    });
  }
};

// src/ui/settings/sections/wordlists.ts
var import_obsidian32 = require("obsidian");
var wordlistsSection = {
  id: "wordlists",
  title: "settings.section.wordlists",
  render(el, ctx) {
    const current = () => resolveWordlistSettings(ctx.store.settings.wordlists);
    const update = async (patch, change) => {
      await ctx.store.updateSettings((s2) => s2.wordlists = { ...current(), ...patch });
      ctx.onWordlistsChanged(change);
    };
    const updateTag = (tag, patch) => {
      const tags = current().tags;
      return update({ tags: { ...tags, [tag]: { ...tags[tag], ...patch } } }, "display");
    };
    el.createDiv({ cls: "setting-item-description", text: t("settings.wordlists.desc") });
    new import_obsidian32.Setting(el).setName(t("settings.wordlists.folder.name")).setDesc(t("settings.wordlists.folder.desc")).addText((text) => {
      text.setValue(current().folder);
      text.inputEl.addEventListener("change", () => void update({ folder: text.getValue() }, "reload"));
    });
    new import_obsidian32.Setting(el).setName(t("settings.wordlists.highlight.name")).setDesc(t("settings.wordlists.highlight.desc")).addToggle((tg) => tg.setValue(current().highlight).onChange((v) => void update({ highlight: v }, "display")));
    new import_obsidian32.Setting(el).setName(t("settings.wordlists.inflections.name")).setDesc(t("settings.wordlists.inflections.desc")).addToggle(
      (tg) => tg.setValue(current().inflections).onChange((v) => void update({ inflections: v }, "scan"))
    );
    new import_obsidian32.Setting(el).setName(t("settings.wordlists.autoImport.name")).setDesc(t("settings.wordlists.autoImport.desc")).addToggle(
      (tg) => tg.setValue(current().autoImport).onChange((v) => void update({ autoImport: v }, "display"))
    );
    const lists = ctx.wordlists.index.lists;
    new import_obsidian32.Setting(el).setName(t("settings.wordlists.loaded.name")).setDesc(
      lists.length === 0 ? t("settings.wordlists.loaded.none", { folder: current().folder }) : t("settings.wordlists.loaded.some", { n: lists.length })
    ).addButton(
      (b) => b.setButtonText(t("settings.wordlists.reload")).onClick(async () => {
        await ctx.wordlists.reload();
        ctx.redisplay();
      })
    );
    const s = current();
    for (const list of lists) {
      const row = new import_obsidian32.Setting(el).setName(tagLabel(list.tag)).setDesc(t("settings.wordlists.list.desc", { n: list.words.toLocaleString(), paths: list.paths.join(", ") })).addColorPicker((c) => c.setValue(tagColor(s, list.tag)).onChange((v) => void updateTag(list.tag, { color: v }))).addToggle((tg) => tg.setValue(tagEnabled(s, list.tag)).onChange((v) => void updateTag(list.tag, { enabled: v })));
      row.settingEl.addClass("vt-wordlist-row");
    }
  }
};

// src/ui/settings/sections/files.ts
var import_obsidian33 = require("obsidian");

// src/services/files/settings.ts
var DEFAULT_FILES_SETTINGS = {
  folder: "vocab-list",
  wordsFolder: "\u55AE\u5B57",
  threadsFolder: "\u8A0E\u8AD6\u4E32"
};
function cleanFolder(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length ? parts.join("/") : null;
}
function resolveFilesSettings(raw) {
  var _a, _b, _c;
  return {
    folder: (_a = cleanFolder(raw == null ? void 0 : raw.folder)) != null ? _a : DEFAULT_FILES_SETTINGS.folder,
    wordsFolder: (_b = cleanFolder(raw == null ? void 0 : raw.wordsFolder)) != null ? _b : DEFAULT_FILES_SETTINGS.wordsFolder,
    threadsFolder: (_c = cleanFolder(raw == null ? void 0 : raw.threadsFolder)) != null ? _c : DEFAULT_FILES_SETTINGS.threadsFolder
  };
}
function filesPaths(s) {
  return {
    folder: s.folder,
    words: joinPath(s.folder, s.wordsFolder),
    threads: joinPath(s.folder, s.threadsFolder)
  };
}
function inFolderPath(path, folder) {
  return path === folder || path.startsWith(`${folder}/`);
}

// src/ui/settings/sections/files.ts
var FIELDS = [
  { key: "folder", name: "settings.files.folder.name", desc: "settings.files.folder.desc" },
  { key: "wordsFolder", name: "settings.files.wordsFolder.name", desc: "settings.files.wordsFolder.desc" },
  { key: "threadsFolder", name: "settings.files.threadsFolder.name", desc: "settings.files.threadsFolder.desc" }
];
var filesSection = {
  id: "files",
  title: "settings.section.files",
  render(el, ctx) {
    const current = () => resolveFilesSettings(ctx.store.settings.files);
    const update = (patch) => ctx.store.updateSettings((s) => s.files = { ...current(), ...patch });
    el.createDiv({ cls: "setting-item-description", text: t("settings.files.desc") });
    for (const field of FIELDS) {
      new import_obsidian33.Setting(el).setName(t(field.name)).setDesc(t(field.desc)).addText((text) => {
        text.setValue(current()[field.key]);
        text.inputEl.addEventListener("change", async () => {
          await update({ [field.key]: text.getValue() });
          text.setValue(current()[field.key]);
        });
      });
    }
  }
};

// src/ui/settings/sections/paragraphs.ts
var import_obsidian34 = require("obsidian");
var paragraphsSection = {
  id: "paragraphs",
  title: "settings.section.paragraphs",
  render(el, ctx) {
    new import_obsidian34.Setting(el).setName(t("settings.paragraphs.hashMode.name")).setDesc(t("settings.paragraphs.hashMode.desc")).addToggle(
      (tg) => tg.setValue(resolveAnchorSettings(ctx.store.settings).mode === "hash").onChange(
        (on) => ctx.store.updateSettings((s) => patchAnchorSettings(s, { mode: on ? "hash" : "block", blockIdNoticeSeen: true }))
      )
    );
  }
};

// src/ui/settings/sections/reading.ts
var import_obsidian35 = require("obsidian");
function tapOptions() {
  const out = {};
  for (const a of TAP_ACTIONS) out[a] = t(`settings.reading.tap.${a}`);
  return out;
}
function pronounceOptions() {
  const out = {};
  for (const s of PRONOUNCE_SOURCES) out[s] = t(`settings.reading.pronounceSource.${s}`);
  return out;
}
async function setPref(ctx, key3, value) {
  await ctx.store.updateSettings((s) => {
    const patch = { [key3]: value };
    Object.assign(s.ui, patch);
  });
}
var readingSection = {
  id: "reading",
  title: "settings.section.reading",
  render(el, ctx) {
    const prefs = resolveUiPrefs(ctx.store.settings.ui);
    new import_obsidian35.Setting(el).setName(t("settings.reading.tapAction.name")).setDesc(t("settings.reading.tapAction.desc")).addDropdown(
      (d) => d.addOptions(tapOptions()).setValue(prefs.tapAction).onChange((v) => setPref(ctx, "tapAction", v))
    );
    new import_obsidian35.Setting(el).setName(t("settings.reading.tapActionMobile.name")).setDesc(t("settings.reading.tapActionMobile.desc")).addDropdown(
      (d) => d.addOptions(tapOptions()).setValue(prefs.tapActionMobile).onChange((v) => setPref(ctx, "tapActionMobile", v))
    );
    new import_obsidian35.Setting(el).setName(t("settings.reading.pronounceSource.name")).setDesc(t("settings.reading.pronounceSource.desc")).addDropdown(
      (d) => d.addOptions(pronounceOptions()).setValue(prefs.pronounceSource).onChange((v) => setPref(ctx, "pronounceSource", v))
    );
    new import_obsidian35.Setting(el).setName(t("settings.reading.livePreviewHint.name")).setDesc(t("settings.reading.livePreviewHint.desc")).addToggle((tg) => tg.setValue(prefs.livePreviewHint).onChange((on) => setPref(ctx, "livePreviewHint", on)));
  }
};

// src/ui/settings/sections/backup.ts
var import_obsidian37 = require("obsidian");

// src/ui/settings/backupText.ts
function pad2(n) {
  return String(n).padStart(2, "0");
}
function backupTime(iso) {
  if (!iso) return t("settings.backup.noTime");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("settings.backup.noTime");
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
var REASON = {
  manual: "settings.backup.reason.manual",
  "before-restore": "settings.backup.reason.before-restore",
  migration: "settings.backup.reason.migration",
  unknown: "settings.backup.reason.unknown"
};
function backupTitle(item) {
  if (item.kind === "unreadable") return `${backupTime(item.createdAt)} \xB7 ${item.name}`;
  return `${backupTime(item.createdAt)} \xB7 ${t(REASON[item.reason])}`;
}
function summaryText(s) {
  var _a;
  const parts = [t("settings.backup.summary.words", { n: s.words })];
  if (s.threads !== void 0) parts.push(t("settings.backup.summary.threads", { n: s.threads, q: (_a = s.questions) != null ? _a : 0 }));
  if (s.families !== void 0) parts.push(t("settings.backup.summary.families", { n: s.families }));
  if (s.trivia !== void 0) parts.push(t("settings.backup.summary.trivia", { n: s.trivia }));
  if (s.reviews !== void 0) parts.push(t("settings.backup.summary.reviews", { n: s.reviews }));
  return parts.join(" \xB7 ");
}
function backupDesc(item) {
  return item.summary ? summaryText(item.summary) : t("settings.backup.unreadable");
}
function previewText(p) {
  const c = p.counts;
  const what = [];
  if (c.words.changed || c.words.revived) {
    what.push(t("backup.restore.words", { changed: c.words.changed, revived: c.words.revived }));
  }
  const threads = c.threads.changed + c.threads.revived;
  if (threads || c.questions.revived) {
    what.push(t("backup.restore.threads", { n: threads, q: c.questions.revived }));
  }
  const families = c.families.changed + c.families.revived;
  const trivia = c.trivia.changed + c.trivia.revived;
  if (families || trivia) what.push(t("backup.restore.learn", { families, trivia }));
  if (c.reviewsAdded) what.push(t("backup.restore.reviews", { n: c.reviewsAdded }));
  if (!what.length) what.push(t("backup.restore.same"));
  if (p.missing.length) {
    const parts = p.missing.map((m) => t(`backup.restore.part.${m}`));
    what.push(t("backup.restore.missing", { parts: joinWords(parts) }));
  }
  what.push(t("backup.restore.settings"));
  const learn = c.families.extra + c.trivia.extra;
  const anyExtra = c.words.extra || c.questions.extra || c.threads.extra || learn;
  const extras = anyExtra ? t("backup.restore.extras.desc", { words: c.words.extra, questions: c.questions.extra, learn }) : null;
  return { what, extras };
}
function deviceLines() {
  return [
    t("backup.restore.devices.sync"),
    t("backup.restore.devices.unsynced"),
    t("backup.restore.devices.after"),
    t("backup.restore.devices.tip")
  ];
}

// src/ui/settings/RestoreModal.ts
var import_obsidian36 = require("obsidian");

// src/services/learn/learnMerge.ts
var TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function ms3(iso) {
  const t2 = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t2) ? 0 : t2;
}
function pickNewer2(local, remote) {
  var _a, _b;
  const l4 = ms3(local.updatedAt);
  const r = ms3(remote.updatedAt);
  if (l4 !== r) return r > l4 ? remote : local;
  return ((_a = remote.rev) != null ? _a : 0) > ((_b = local.rev) != null ? _b : 0) ? remote : local;
}
function mergeRecords(local, remote, pick = pickNewer2) {
  const byId = /* @__PURE__ */ new Map();
  const order = [];
  for (const rec of local) {
    if (!byId.has(rec.id)) order.push(rec.id);
    byId.set(rec.id, rec);
  }
  for (const rec of remote) {
    const mine = byId.get(rec.id);
    if (!mine) order.push(rec.id);
    byId.set(rec.id, mine ? pick(mine, rec) : rec);
  }
  return order.map((id) => byId.get(id));
}
function pickFamily(local, remote) {
  const winner = pickNewer2(local, remote);
  const other = winner === local ? remote : local;
  if (winner.deletedAt && winner.deletedBy === "regroup" && !other.deletedAt && familyScope(other) === "word") {
    return other;
  }
  return winner;
}
function dropOldTombstones(records, now) {
  return records.filter((r) => !r.deletedAt || now - ms3(r.deletedAt) < TOMBSTONE_TTL_MS);
}
function emptyLearnShard() {
  return { families: [], trivia: [], verbs: [] };
}
function normalizeLearnShard(raw) {
  const s = raw != null ? raw : {};
  return {
    families: Array.isArray(s.families) ? s.families : [],
    trivia: Array.isArray(s.trivia) ? s.trivia : [],
    verbs: Array.isArray(s.verbs) ? s.verbs : []
  };
}
function learnFingerprint(shard) {
  var _a;
  const recs = (kind, list) => list.map((r) => {
    var _a2, _b, _c;
    return `${kind}|${r.id}|${(_a2 = r.updatedAt) != null ? _a2 : ""}|${(_b = r.rev) != null ? _b : 0}|${(_c = r.deletedAt) != null ? _c : ""}`;
  });
  return [...recs("f", shard.families), ...recs("t", shard.trivia), ...recs("v", (_a = shard.verbs) != null ? _a : [])].sort().join("\n");
}
function mergeLearn(local, remote) {
  var _a, _b;
  return {
    families: mergeRecords(local.families, remote.families, pickFamily),
    trivia: mergeRecords(local.trivia, remote.trivia),
    verbs: mergeRecords((_a = local.verbs) != null ? _a : [], (_b = remote.verbs) != null ? _b : [])
  };
}

// src/services/backup/format.ts
var FULL_BACKUP_FORMAT = 1;
var RESTORABLE_SHARDS = ["threads", "learn", "reviews", "imports", "files"];
function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function stringMap(v) {
  if (!isObject(v)) return {};
  const out = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
}
function arrayField(shard, key3) {
  const v = isObject(shard) ? shard[key3] : void 0;
  return Array.isArray(v) ? v : [];
}
function parseData(raw) {
  if (!isObject(raw) || !Array.isArray(raw.entries)) return null;
  return migrate(raw).data;
}
function snapshotOf(shards) {
  var _a;
  const out = {};
  if ("data" in shards) out.data = (_a = parseData(shards.data)) != null ? _a : { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] };
  if ("threads" in shards) out.threads = arrayField(shards.threads, "threads");
  if ("learn" in shards) out.learn = normalizeLearnShard(shards.learn);
  if ("reviews" in shards) out.reviews = arrayField(shards.reviews, "logs");
  if ("imports" in shards) out.imports = stringMap(isObject(shards.imports) ? shards.imports.notes : void 0);
  if ("files" in shards) out.files = stringMap(isObject(shards.files) ? shards.files.seeded : void 0);
  return out;
}
function fileStamp(iso) {
  return iso.replace(/:/g, "-");
}
function fullBackupName(iso, reason) {
  return `full-${fileStamp(iso)}-${reason}.json`;
}
function stampFromName(name) {
  var _a;
  const m = /(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)(\.\d+)?Z/.exec(name);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}${(_a = m[5]) != null ? _a : ""}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}
function isBackupName(name) {
  return /^[\w.-]+\.json$/.test(name) && !name.includes("..");
}
function isFullBackup(raw) {
  return isObject(raw) && raw.vocabTrackerBackup === FULL_BACKUP_FORMAT && isObject(raw.shards);
}
function parseBackup(name, raw) {
  if (isFullBackup(raw)) {
    const reason = raw.reason === "manual" || raw.reason === "before-restore" ? raw.reason : "unknown";
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : stampFromName(name);
    if (!("data" in raw.shards)) return null;
    return { kind: "full", createdAt, reason, snapshot: snapshotOf(raw.shards) };
  }
  const data = parseData(raw);
  if (!data) return null;
  return {
    kind: "data",
    createdAt: stampFromName(name),
    reason: name.startsWith("data-v1-") ? "migration" : "unknown",
    snapshot: { data }
  };
}
function fullBackupFile(shards, createdAt, reason, restoring) {
  const all = { data: null };
  for (const name of RESTORABLE_SHARDS) all[name] = null;
  Object.assign(all, shards);
  const file = { vocabTrackerBackup: FULL_BACKUP_FORMAT, createdAt, reason, shards: all };
  if (restoring) file.restoring = restoring;
  return file;
}
function liveQuestions(thread) {
  if (thread.deletedAt) return 0;
  return thread.turns.filter((t2) => t2.role === "user" && !t2.deletedAt).length;
}
function summarize(s) {
  var _a, _b;
  const out = { words: ((_b = (_a = s.data) == null ? void 0 : _a.entries) != null ? _b : []).filter((e) => !e.deletedAt).length };
  if (s.threads) {
    const asked = s.threads.map(liveQuestions).filter((n) => n > 0);
    out.threads = asked.length;
    out.questions = asked.reduce((a, b) => a + b, 0);
  }
  if (s.learn) {
    out.families = s.learn.families.filter((f) => !f.deletedAt).length;
    out.trivia = s.learn.trivia.filter((t2) => !t2.deletedAt).length;
  }
  if (s.reviews) out.reviews = s.reviews.length;
  return out;
}

// src/services/backup/restorePlan.ts
var META = /* @__PURE__ */ new Set(["updatedAt", "rev", "deletedAt"]);
function canonical(value, skip = META) {
  var _a;
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, /* @__PURE__ */ new Set())).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => !skip.has(k) && value[k] !== void 0).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k], /* @__PURE__ */ new Set())}`).join(",")}}`;
  }
  return (_a = JSON.stringify(value)) != null ? _a : "null";
}
function zero() {
  return { changed: 0, revived: 0, extra: 0 };
}
function restored(backup, current, now) {
  var _a, _b;
  const out = { ...backup, updatedAt: now, rev: Math.max((_a = backup.rev) != null ? _a : 0, (_b = current == null ? void 0 : current.rev) != null ? _b : 0) + 1 };
  delete out.deletedAt;
  delete out.deletedBy;
  return out;
}
function tombstone(rec, now) {
  var _a;
  const out = { ...rec, deletedAt: now, updatedAt: now, rev: ((_a = rec.rev) != null ? _a : 0) + 1 };
  delete out.deletedBy;
  return out;
}
function rebaseRecords(current, backup, opts, counts, changed) {
  const live = /* @__PURE__ */ new Map();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      if (!c.deletedAt && canonical(c) === canonical(b)) {
        out.push(c);
        continue;
      }
      out.push(restored(b, c, opts.now));
      if (c.deletedAt) counts.revived++;
      else counts.changed++;
    } else if (!c.deletedAt) {
      counts.extra++;
      if (!opts.removeExtras) {
        out.push(c);
        continue;
      }
      out.push(tombstone(c, opts.now));
    } else {
      out.push(c);
      continue;
    }
    changed.push(out[out.length - 1]);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    out.push(restored(b, void 0, opts.now));
    counts.revived++;
    changed.push(out[out.length - 1]);
  }
  return out;
}
var THREAD_META = /* @__PURE__ */ new Set([...META, "turns"]);
var TURN_META = /* @__PURE__ */ new Set(["updatedAt", "deletedAt"]);
function restoredTurn(turn, now) {
  const out = { ...turn, updatedAt: now };
  delete out.deletedAt;
  if (out.status === "streaming") out.status = "aborted";
  return out;
}
function rebaseTurns(current, backup, opts, questions2) {
  const live = /* @__PURE__ */ new Map();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = /* @__PURE__ */ new Set();
  const turns = [];
  let touched = false;
  const isQ = (t2) => t2.role === "user";
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      if (!c.deletedAt && canonical(c, TURN_META) === canonical(b, TURN_META)) {
        turns.push(c);
        continue;
      }
      turns.push(restoredTurn(b, opts.now));
      touched = true;
      if (isQ(b)) {
        if (c.deletedAt) questions2.revived++;
        else questions2.changed++;
      }
    } else if (!c.deletedAt) {
      if (isQ(c)) questions2.extra++;
      if (opts.removeExtras) {
        turns.push({ ...c, deletedAt: opts.now, updatedAt: opts.now });
        touched = true;
      } else turns.push(c);
    } else turns.push(c);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    turns.push(restoredTurn(b, opts.now));
    touched = true;
    if (isQ(b)) questions2.revived++;
  }
  turns.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  return { turns, touched };
}
function rebaseThreads(current, backup, opts, counts, changed) {
  const live = /* @__PURE__ */ new Map();
  for (const b of backup) if (!b.deletedAt) live.set(b.id, b);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const c of current) {
    seen.add(c.id);
    const b = live.get(c.id);
    if (b) {
      const { turns, touched } = rebaseTurns(c.turns, b.turns, opts, counts.questions);
      const fieldsSame = !c.deletedAt && canonical(c, THREAD_META) === canonical(b, THREAD_META);
      if (fieldsSame && !touched) {
        out.push(c);
        continue;
      }
      out.push({ ...restored(b, c, opts.now), turns });
      if (c.deletedAt) counts.threads.revived++;
      else counts.threads.changed++;
    } else if (!c.deletedAt) {
      counts.threads.extra++;
      counts.questions.extra += c.turns.filter((t2) => t2.role === "user" && !t2.deletedAt).length;
      if (!opts.removeExtras) {
        out.push(c);
        continue;
      }
      out.push(tombstone(c, opts.now));
    } else {
      out.push(c);
      continue;
    }
    changed.push(out[out.length - 1]);
  }
  for (const b of live.values()) {
    if (seen.has(b.id)) continue;
    const turns = b.turns.filter((t2) => !t2.deletedAt).map((t2) => restoredTurn(t2, opts.now));
    out.push({ ...restored(b, void 0, opts.now), turns });
    counts.threads.revived++;
    counts.questions.revived += turns.filter((t2) => t2.role === "user").length;
    changed.push(out[out.length - 1]);
  }
  return out;
}
function currentShard(current, shard) {
  var _a, _b, _c, _d, _e, _f;
  switch (shard) {
    case "data":
      return (_a = current.data) != null ? _a : emptyData();
    case "threads":
      return { threads: (_b = current.threads) != null ? _b : [] };
    case "learn":
      return (_c = current.learn) != null ? _c : { families: [], trivia: [], verbs: [] };
    case "reviews":
      return { logs: (_d = current.reviews) != null ? _d : [] };
    case "imports":
      return { notes: (_e = current.imports) != null ? _e : {} };
    case "files":
      return { seeded: (_f = current.files) != null ? _f : {} };
  }
}
function newest(iso, acc) {
  const t2 = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t2) ? acc : Math.max(acc, t2);
}
function restoreStamp(current, now) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  let max = now.getTime();
  const recs = [
    ...(_b = (_a = current.data) == null ? void 0 : _a.entries) != null ? _b : [],
    ...(_d = (_c = current.learn) == null ? void 0 : _c.families) != null ? _d : [],
    ...(_f = (_e = current.learn) == null ? void 0 : _e.trivia) != null ? _f : [],
    ...(_h = (_g = current.learn) == null ? void 0 : _g.verbs) != null ? _h : [],
    ...(_i = current.threads) != null ? _i : []
  ];
  for (const r of recs) max = newest(r.deletedAt, newest(r.updatedAt, max));
  for (const th of (_j = current.threads) != null ? _j : []) {
    for (const t2 of th.turns) max = newest(t2.at, newest(t2.deletedAt, newest(t2.updatedAt, max)));
  }
  return new Date(max === now.getTime() ? max : max + 1).toISOString();
}
function emptyData() {
  return { schemaVersion: 2, settings: { schemaVersion: 2 }, entries: [] };
}
function planRestore(current, backup, opts) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const counts = {
    words: zero(),
    threads: zero(),
    questions: zero(),
    families: zero(),
    trivia: zero(),
    reviewsAdded: 0
  };
  const changes = { entryIds: [], threads: [], families: [], trivia: [] };
  const changedEntries = [];
  const shards = {};
  const missing = [];
  let data;
  if (backup.data) {
    const cur = (_a = current.data) != null ? _a : emptyData();
    data = {
      ...cur,
      entries: rebaseRecords(cur.entries, backup.data.entries, opts, counts.words, changedEntries)
    };
    changes.entryIds = changedEntries.map((e) => e.id);
    shards.data = data;
  }
  if (backup.threads) {
    const threads = rebaseThreads((_b = current.threads) != null ? _b : [], backup.threads, opts, counts, changes.threads);
    shards.threads = { threads };
  } else missing.push("threads");
  if (backup.learn) {
    const cur = (_c = current.learn) != null ? _c : { families: [], trivia: [], verbs: [] };
    shards.learn = {
      families: rebaseRecords(cur.families, backup.learn.families, opts, counts.families, changes.families),
      trivia: rebaseRecords(cur.trivia, backup.learn.trivia, opts, counts.trivia, changes.trivia),
      // Saved verb usages (動詞用法收藏) go back too; not counted in the
      // confirmation (the usage itself lives on the entry, restored above).
      verbs: rebaseRecords((_d = cur.verbs) != null ? _d : [], (_e = backup.learn.verbs) != null ? _e : [], opts, zero(), [])
    };
  } else missing.push("learn");
  if (backup.reviews) {
    const cur = (_f = current.reviews) != null ? _f : [];
    const logs = pruneReviewLogs(mergeReviewLogs(cur, backup.reviews), new Date(opts.now));
    const had = new Set(cur.map((l4) => l4.id));
    counts.reviewsAdded = logs.filter((l4) => !had.has(l4.id)).length;
    shards.reviews = { logs };
  } else missing.push("reviews");
  if (backup.imports) shards.imports = { notes: { ...backup.imports, ...(_g = current.imports) != null ? _g : {} } };
  if (backup.files) shards.files = { seeded: { ...backup.files, ...(_h = current.files) != null ? _h : {} } };
  return { shards, data, counts, missing, changes };
}

// src/services/backup/BackupService.ts
var BackupError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var BackupService = class {
  constructor(deps) {
    this.deps = deps;
    this.busy = false;
    var _a;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
  }
  get folder() {
    return this.deps.storage.backupFolder;
  }
  pathOf(name) {
    return `${this.folder}/${name}`;
  }
  // Newest first. Files that aren't backups (or can't be read) are listed
  // as "unreadable" so the user sees why they can't be restored.
  async list() {
    const names = (await this.deps.storage.listBackups()).filter(isBackupName);
    const items = await Promise.all(names.map((name) => this.item(name)));
    const time = (i) => i.createdAt ? new Date(i.createdAt).getTime() : 0;
    return items.sort((a, b) => time(b) - time(a) || b.name.localeCompare(a.name));
  }
  async load(name) {
    if (!isBackupName(name)) return null;
    let raw = null;
    try {
      raw = await this.deps.storage.readBackup(name);
    } catch (e) {
      console.error(`Vocab Tracker: couldn't read backup ${name}`, e);
    }
    return raw === null ? null : parseBackup(name, raw);
  }
  async item(name) {
    const parsed = await this.load(name);
    const base = { name, path: this.pathOf(name) };
    if (!parsed) return { ...base, kind: "unreadable", createdAt: stampFromName(name), reason: "unknown", summary: null };
    return { ...base, kind: parsed.kind, createdAt: parsed.createdAt, reason: parsed.reason, summary: summarize(parsed.snapshot) };
  }
  // 立即備份: everything on disk right now. Resolves to the file's path.
  async create() {
    if (this.busy) throw new BackupError("busy", "a backup or restore is already running");
    this.busy = true;
    try {
      await this.deps.host.flush();
      return await this.writeFull("manual");
    } finally {
      this.busy = false;
    }
  }
  async writeFull(reason, restoring, shards) {
    const now = this.clock().toISOString();
    shards != null ? shards : shards = await this.deps.storage.readAllShards();
    return this.deps.storage.writeBackup(fullBackupName(now, reason), fullBackupFile(shards, now, reason, restoring));
  }
  // What restoring `name` would do, for the confirmation screen. Nothing
  // is written. Counts don't depend on removeExtras (`extra` is the number
  // that would be kept or deleted).
  async preview(name) {
    const { backup, current } = await this.inputs(name);
    const plan = planRestore(current, backup.snapshot, { removeExtras: false, now: this.clock().toISOString() });
    return {
      item: await this.item(name),
      counts: plan.counts,
      missing: plan.missing,
      safetyFolder: this.folder
    };
  }
  async inputs(name) {
    const backup = await this.load(name);
    if (!backup) throw new BackupError("unreadable", `backup ${name} can't be read`);
    await this.deps.host.flush();
    const raw = await this.deps.storage.readAllShards();
    return { backup, raw, current: snapshotOf(raw) };
  }
  // 1. lands pending writes; 2. backs up the current state (abort if that
  // fails — nothing has changed yet); 3. writes the rebased shards
  // (restorePlan.ts); 4. the services reload them, data.json goes into the
  // store, everything redraws.
  async restore(name, opts) {
    if (this.busy) throw new BackupError("busy", "a backup or restore is already running");
    this.busy = true;
    try {
      const { backup, raw, current } = await this.inputs(name);
      let safetyPath;
      try {
        safetyPath = await this.writeFull("before-restore", name, raw);
      } catch (e) {
        throw new BackupError("safety-failed", `couldn't back up the current data: ${String(e)}`);
      }
      const now = restoreStamp(current, this.clock());
      const plan = planRestore(current, backup.snapshot, { removeExtras: opts.removeExtras, now });
      for (const [shard, content] of Object.entries(plan.shards)) {
        if (JSON.stringify(content) === JSON.stringify(currentShard(current, shard))) continue;
        await this.deps.storage.writeShard(shard, content);
      }
      await this.deps.host.reload();
      if (plan.data) this.deps.host.applyData(plan.data);
      this.deps.host.restored(plan.changes);
      return { safetyPath, counts: plan.counts, missing: plan.missing };
    } finally {
      this.busy = false;
    }
  }
};

// src/ui/settings/RestoreModal.ts
var RestoreModal = class extends import_obsidian36.Modal {
  constructor(app, backups, item, onDone) {
    super(app);
    this.backups = backups;
    this.item = item;
    this.onDone = onDone;
    this.removeExtras = false;
    this.running = false;
  }
  onOpen() {
    this.titleEl.setText(t("backup.restore.title"));
    this.contentEl.addClass("vt-restore");
    this.contentEl.createEl("p", { text: t("backup.restore.loading"), cls: "vt-settings-muted" });
    void this.load();
  }
  onClose() {
    this.contentEl.empty();
  }
  async load() {
    try {
      const preview2 = await this.backups.preview(this.item.name);
      this.render(previewText(preview2), preview2.safetyFolder, preview2.item);
    } catch (e) {
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: t("backup.restore.failed", { error: errorMessage(e) }) });
    }
  }
  render(text, folder, item) {
    const el = this.contentEl;
    el.empty();
    const summary = item.summary ? summaryText(item.summary) : "";
    el.createEl("p", { text: t("backup.restore.from", { time: backupTime(item.createdAt), summary }) });
    el.createEl("h4", { text: t("backup.restore.what") });
    const what = el.createEl("ul");
    for (const line of text.what) what.createEl("li", { text: line });
    if (text.extras) {
      el.createEl("h4", { text: t("backup.restore.extras.title") });
      el.createEl("p", { text: text.extras });
      const remove = new import_obsidian36.Setting(el).setName(t("backup.restore.extras.remove")).addToggle(
        (toggle) => toggle.setValue(this.removeExtras).onChange((v) => this.removeExtras = v)
      );
      if (item.reason === "before-restore") remove.setDesc(t("backup.restore.extras.undoHint"));
    }
    el.createEl("p", { text: t("backup.restore.safety", { folder }) });
    el.createEl("h4", { text: t("backup.restore.devices.title") });
    const devices = el.createEl("ul");
    for (const line of deviceLines()) devices.createEl("li", { text: line });
    new import_obsidian36.Setting(el).addButton((b) => b.setButtonText(t("backup.restore.cancel")).onClick(() => this.close())).addButton(
      (b) => b.setButtonText(t("backup.restore.confirm")).setWarning().onClick(async () => {
        if (this.running) return;
        this.running = true;
        b.setDisabled(true).setButtonText(t("backup.restore.working"));
        await this.restore();
      })
    );
  }
  async restore() {
    try {
      const result = await this.backups.restore(this.item.name, { removeExtras: this.removeExtras });
      new import_obsidian36.Notice(t("backup.restore.done", { path: result.safetyPath }), 1e4);
      this.onDone(result);
    } catch (e) {
      const key3 = e instanceof BackupError && e.code === "safety-failed" ? "backup.restore.safetyFailed" : "backup.restore.failed";
      new import_obsidian36.Notice(t(key3, { error: errorMessage(e) }), 1e4);
      console.error("Vocab Tracker: restore failed", e);
    } finally {
      this.close();
    }
  }
};

// src/ui/settings/sections/backup.ts
var lastSafetyPath = null;
var backupSection = {
  id: "backup",
  title: "settings.section.backup",
  render(el, ctx) {
    const backups = ctx.backups;
    if (!backups) return;
    el.createDiv({ cls: "setting-item-description", text: t("settings.backup.desc", { folder: backups.folder }) });
    if (lastSafetyPath) {
      el.createDiv({ cls: "setting-item-description vt-backup-last", text: t("settings.backup.lastRestore", { path: lastSafetyPath }) });
    }
    const listEl = createDiv();
    const fill2 = () => void renderList(listEl, backups, ctx);
    new import_obsidian37.Setting(el).setName(t("settings.backup.create.name")).setDesc(t("settings.backup.create.desc")).addButton(
      (b) => b.setButtonText(t("settings.backup.create.button")).onClick(async () => {
        b.setDisabled(true);
        try {
          const path = await backups.create();
          new import_obsidian37.Notice(t("settings.backup.created", { path }), 8e3);
          fill2();
        } catch (e) {
          new import_obsidian37.Notice(t("settings.backup.failed", { error: errorMessage(e) }), 8e3);
        } finally {
          b.setDisabled(false);
        }
      })
    );
    new import_obsidian37.Setting(el).setName(t("settings.backup.list.name")).addExtraButton((b) => b.setIcon("refresh-cw").setTooltip(t("settings.backup.list.reload")).onClick(fill2));
    el.appendChild(listEl);
    fill2();
  }
};
async function renderList(listEl, backups, ctx) {
  listEl.empty();
  listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.list.loading") });
  let items;
  try {
    items = await backups.list();
  } catch (e) {
    listEl.empty();
    listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.failed", { error: errorMessage(e) }) });
    return;
  }
  listEl.empty();
  if (!items.length) {
    listEl.createDiv({ cls: "setting-item-description", text: t("settings.backup.list.empty") });
    return;
  }
  for (const item of items) {
    const row = new import_obsidian37.Setting(listEl).setName(backupTitle(item)).setDesc(backupDesc(item));
    if (item.kind === "unreadable") continue;
    row.addButton(
      (b) => b.setButtonText(t("settings.backup.restore.button")).onClick(
        () => new RestoreModal(ctx.app, backups, item, (result) => {
          lastSafetyPath = result.safetyPath;
          ctx.redisplay();
        }).open()
      )
    );
  }
}

// src/ui/settings/sections/index.ts
var SETTINGS_SECTIONS2 = [
  generalSection,
  readingSection,
  wordlistsSection,
  srsSection,
  aiSection,
  learnerSection,
  paragraphsSection,
  filesSection,
  backupSection
];

// src/platform/ObsidianNotes.ts
var import_obsidian38 = require("obsidian");
var ObsidianNotes = class {
  constructor(app) {
    this.app = app;
  }
  async read(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian38.TFile ? this.app.vault.cachedRead(file) : null;
  }
};

// src/core/store/threads.ts
function ms4(iso) {
  return iso ? new Date(iso).getTime() : 0;
}
function turnStamp(t2) {
  return Math.max(ms4(t2.updatedAt), ms4(t2.deletedAt), ms4(t2.at));
}
function pickTurn(a, b) {
  if (a.status === "streaming" && b.status !== "streaming") return b;
  if (b.status === "streaming" && a.status !== "streaming") return a;
  return turnStamp(b) > turnStamp(a) ? b : a;
}
function mergeTurns(local, remote) {
  const byId = /* @__PURE__ */ new Map();
  for (const t2 of local) byId.set(t2.id, t2);
  for (const t2 of remote) {
    const mine = byId.get(t2.id);
    byId.set(t2.id, mine ? pickTurn(mine, t2) : t2);
  }
  return [...byId.values()].sort((x, y) => ms4(x.at) - ms4(y.at));
}
function pickThreadFields(a, b) {
  var _a, _b;
  const aMs = ms4(a.updatedAt);
  const bMs = ms4(b.updatedAt);
  if (aMs !== bMs) return aMs > bMs ? a : b;
  return ((_a = a.rev) != null ? _a : 0) >= ((_b = b.rev) != null ? _b : 0) ? a : b;
}
function mergeThreads(local, remote) {
  const byId = /* @__PURE__ */ new Map();
  const order = [];
  for (const t2 of local) {
    byId.set(t2.id, t2);
    order.push(t2.id);
  }
  for (const t2 of remote) {
    const mine = byId.get(t2.id);
    if (!mine) {
      byId.set(t2.id, t2);
      order.push(t2.id);
      continue;
    }
    const newer = pickThreadFields(mine, t2);
    byId.set(t2.id, { ...newer, turns: mergeTurns(mine.turns, t2.turns) });
  }
  return order.map((id) => byId.get(id));
}
function threadsFingerprint(threads) {
  return threads.map(
    (th) => {
      var _a, _b, _c;
      return [
        th.id,
        (_a = th.updatedAt) != null ? _a : "",
        (_b = th.rev) != null ? _b : 0,
        (_c = th.deletedAt) != null ? _c : "",
        ...th.turns.map((t2) => {
          var _a2, _b2;
          return `${t2.id}|${(_a2 = t2.updatedAt) != null ? _a2 : ""}|${(_b2 = t2.deletedAt) != null ? _b2 : ""}|${t2.status}`;
        }).sort()
      ].join(",");
    }
  ).sort().join("\n");
}
function settleStaleTurns(threads) {
  for (const th of threads) {
    for (const t2 of th.turns) if (t2.status === "streaming") t2.status = "aborted";
  }
  return threads;
}

// src/services/anchors/paragraphInput.ts
function noteTitle2(path) {
  var _a;
  return ((_a = path.split("/").pop()) != null ? _a : path).replace(/\.md$/i, "");
}
function knownWordsIn(paragraph, words) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const w of words) {
    const word = w.trim();
    const key3 = word.toLowerCase();
    if (!word || seen.has(key3)) continue;
    if (buildWordRe(word).test(paragraph)) {
      seen.add(key3);
      out.push(word);
    }
  }
  return out;
}
function paragraphInput(anchor, where, extra = {}) {
  var _a;
  let paragraphs;
  let paragraphIndex;
  if (where.status === "found") {
    const { section: section3, content } = where;
    const spans = splitParagraphSpans(content);
    const before = spans.filter((s) => s.lineEnd < section3.lineStart).map((s) => plainParagraph(s.text));
    const after = spans.filter((s) => s.lineStart > section3.lineEnd).map((s) => plainParagraph(s.text));
    paragraphs = [...before, plainParagraph(section3.text), ...after];
    paragraphIndex = before.length;
  } else {
    paragraphs = [anchor.snapshot];
    paragraphIndex = 0;
  }
  const focus = paragraphs[paragraphIndex];
  const input = { article: { title: noteTitle2(anchor.path), paragraphs }, paragraphIndex };
  if (extra.selection) input.selection = extra.selection;
  if (extra.question) input.question = extra.question;
  const known = knownWordsIn(focus, (_a = extra.knownWords) != null ? _a : []);
  if (known.length) input.knownWords = known;
  return input;
}

// src/services/threads/pin.ts
var LEAD = String.raw`^\s*(?:[>*_]+\s*)?`;
var SELECTION_NOTICE_RE = new RegExp(`${LEAD}\u4F60\u9078\u53D6\u7684\u6587\u5B57[\u88E1\u91CC\u4E2D\u5167]?(?:\u4F3C\u4E4E|\u597D\u50CF)?\u6C92\u6709[^\\n]*(?:\\n+|$)`);
var SCOPE_LINE_RE = new RegExp(`${LEAD}\u4F60\u554F\u7684\u662F[:\uFF1A][^\\n]*\\n+`);
function pinText(answer) {
  return answer.replace(SELECTION_NOTICE_RE, "").replace(SCOPE_LINE_RE, "").trim();
}
function addPin(grammar, text) {
  const current = grammar.trim();
  if (current.includes(text)) return current;
  return current ? `${current}

${text}` : text;
}
function removePin(grammar, text) {
  const i = grammar.indexOf(text);
  if (i < 0) return grammar;
  return (grammar.slice(0, i) + grammar.slice(i + text.length)).replace(/\n{3,}/g, "\n\n").trim();
}

// src/services/threads/ThreadService.ts
var THREADS_SHARD = "threads";
var WRITE_DEBOUNCE_MS3 = 500;
var PARAGRAPH_THREAD_PREFIX = "paragraph:";
function defaultId2(now) {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function historyOf(thread) {
  var _a;
  const out = [];
  let pending = null;
  for (const turn of liveTurns(thread)) {
    if (turn.role === "user") {
      pending = turn;
      continue;
    }
    if (pending && turn.content.trim() && (turn.status === "done" || turn.status === "aborted")) {
      out.push({ role: "user", content: (_a = pending.sent) != null ? _a : pending.content });
      out.push({ role: "assistant", content: turn.content });
    }
    pending = null;
  }
  return out;
}
var ThreadService = class {
  constructor(deps) {
    this.deps = deps;
    this.events = new TypedEmitter();
    this.threads = [];
    this.loading = null;
    this.writeTimer = null;
    this.pendingWrite = Promise.resolve();
    // threadId → the assistant turn currently streaming.
    this.active = /* @__PURE__ */ new Map();
    this.partial = /* @__PURE__ */ new Map();
    // Sections whose anchor is being created (path + line), so a double
    // click can't write two block ids into the same paragraph.
    this.creating = /* @__PURE__ */ new Set();
    this.disposed = false;
    var _a, _b;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
    this.newId = (_b = deps.newId) != null ? _b : (() => defaultId2(this.clock()));
  }
  // store/threads.json is read the first time a discussion is opened
  // (規劃書 06 §4.2). Memoized, so callers can await it freely.
  ensureLoaded() {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        this.threads = mergeThreads(this.threads, settleStaleTurns(disk));
      });
    }
    return this.loading;
  }
  // Unions a synced copy from disk into memory. A no-op until something
  // has opened a discussion — the first load reads the latest file anyway.
  async reload() {
    if (!this.loading) return;
    await this.loading;
    const disk = await this.readDisk();
    this.threads = mergeThreads(this.threads, disk);
    this.events.emit("threads:reloaded", void 0);
    if (!this.disposed && threadsFingerprint(this.threads) !== threadsFingerprint(disk)) this.scheduleWrite();
  }
  async readDisk() {
    try {
      const shard = await this.deps.storage.readShard(THREADS_SHARD);
      return Array.isArray(shard == null ? void 0 : shard.threads) ? shard.threads : [];
    } catch (e) {
      console.error("Vocab Tracker: couldn't read threads", e);
      return [];
    }
  }
  get(threadId) {
    return this.threads.find((th) => th.id === threadId && !th.deletedAt);
  }
  wordThread(entryId) {
    return this.get(wordThreadId(entryId));
  }
  // Number of questions asked in a word's thread (the 「AI n」 tab badge).
  wordQuestionCount(entryId) {
    return liveTurns(this.wordThread(entryId)).filter((turn) => turn.role === "user").length;
  }
  isBusy(threadId) {
    return this.active.has(threadId);
  }
  // The answer streamed so far for a turn that's still streaming.
  streamingText(turnId) {
    return this.partial.get(turnId);
  }
  stop(threadId) {
    this.deps.ai.cancel(threadId);
  }
  async ask(p) {
    var _a, _b, _c;
    await this.ensureLoaded();
    if (this.disposed || this.active.has(p.threadId)) return;
    let thread = this.get(p.threadId);
    const { task, request } = this.deps.ai.prepare(p.taskId, p.input, historyOf(thread));
    if (!thread) {
      thread = { id: p.threadId, anchor: p.anchor, turns: [], createdAt: this.nowIso(), rev: 0 };
      this.threads.push(thread);
    }
    const at = this.nowIso();
    const user = {
      id: this.newId(),
      role: "user",
      content: p.display,
      at,
      taskId: task.id,
      status: "done",
      sent: (_a = request.messages[request.messages.length - 1]) == null ? void 0 : _a.content
    };
    if (p.question) user.question = p.question;
    if (p.selection) user.selection = p.selection;
    if (p.subjectEntryId) user.subjectEntryId = p.subjectEntryId;
    const answer = {
      id: this.newId(),
      role: "assistant",
      content: "",
      at,
      taskId: task.id,
      taskVersion: task.version,
      status: "streaming"
    };
    if (p.subjectEntryId) answer.subjectEntryId = p.subjectEntryId;
    thread.turns.push(user, answer);
    this.active.set(thread.id, answer);
    this.partial.set(answer.id, "");
    this.changed(thread);
    const threadId = thread.id;
    try {
      const r = await this.deps.ai.complete(request, {
        threadId,
        onDelta: (d) => {
          var _a2;
          const text = ((_a2 = this.partial.get(answer.id)) != null ? _a2 : "") + d;
          this.partial.set(answer.id, text);
          this.events.emit("thread:turn-delta", { threadId, turnId: answer.id, text });
        },
        onRetry: (_attempt, delayMs) => this.events.emit("thread:retry-wait", { threadId, turnId: answer.id, delayMs })
      });
      if (this.disposed) return;
      answer.content = r.text;
      answer.status = "done";
      answer.model = r.model;
      answer.provider = r.provider;
      answer.usage = { input: r.usage.input, output: r.usage.output, cacheRead: r.usage.cacheRead, cacheWrite: r.usage.cacheWrite };
      answer.stop = r.stop;
    } catch (e) {
      if (this.disposed) return;
      const streamed = (_b = this.partial.get(answer.id)) != null ? _b : "";
      answer.content = (_c = isAiError(e) ? e.extra.partialText : void 0) != null ? _c : streamed;
      if (isAiError(e) && e.code === "aborted") {
        answer.status = "aborted";
      } else {
        answer.status = "error";
        answer.error = isAiError(e) ? e.code : "network";
        const message = e instanceof Error ? e.message : String(e);
        if (message && message !== answer.error) answer.errorMessage = message;
      }
    } finally {
      if (!this.disposed) {
        this.active.delete(threadId);
        this.partial.delete(answer.id);
        this.changed(thread);
      }
    }
  }
  // What the user bubble shows: the question, else the quick action's label.
  displayFor(req) {
    var _a, _b;
    const label = (_a = this.deps.ai.tasks.get(req.taskId)) == null ? void 0 : _a.label;
    return ((_b = req.question) == null ? void 0 : _b.trim()) || (label ? t(label) : req.taskId);
  }
  async askWord(entry, req) {
    var _a;
    const source = await findWordSource(entry, this.deps.notes);
    const display = this.displayFor(req);
    const anchor = { kind: "word", entryId: entry.id };
    if ((_a = entry.source) == null ? void 0 : _a.path) anchor.origin = { path: entry.source.path };
    await this.ask({
      threadId: wordThreadId(entry.id),
      anchor,
      taskId: req.taskId,
      input: wordInput(entry, source, { question: req.question, selection: req.selection }),
      display,
      question: req.question,
      selection: req.selection
    });
  }
  // 重試: the failed answer and its question are tombstoned (not removed —
  // see Turn.deletedAt) and the same question is asked again.
  async retryWord(entry, turnId) {
    const question = this.dropFailedRound(this.wordThread(entry.id), turnId);
    if (!(question == null ? void 0 : question.taskId)) return;
    await this.askWord(entry, { taskId: question.taskId, question: question.question, selection: question.selection });
  }
  // Tombstones an answer and the question before it; returns the question.
  // Public for TriviaService.retry, which re-asks the round its own way.
  dropFailedRound(thread, turnId) {
    if (!thread || this.isBusy(thread.id)) return null;
    const turns = liveTurns(thread);
    const i = turns.findIndex((turn) => turn.id === turnId);
    if (i < 1) return null;
    const question = turns[i - 1];
    if (question.role !== "user" || !question.taskId) return null;
    const now = this.nowIso();
    for (const turn of [question, turns[i]]) {
      turn.deletedAt = now;
      turn.updatedAt = now;
    }
    this.changed(thread);
    return question;
  }
  // ─── Paragraph discussions (規劃書 06 §5.1, M5) ──────────────────────────
  // Live paragraph threads, optionally only those of one note — the
  // sidebar's 「段落討論（n）」 list and the badge index's source.
  paragraphThreads(path) {
    return this.threads.filter(
      (th) => !th.deletedAt && th.anchor.kind === "paragraph" && (path === void 0 || th.anchor.path === path)
    );
  }
  // The discussion of a reading-mode section (its raw text), matched the
  // same way the badge index is: a block anchor by its block id, a hash
  // anchor by the text hash. If two devices each started one, a block-id
  // match wins, then the most recently updated.
  paragraphThread(path, sectionText2) {
    var _a;
    const candidates = this.paragraphThreads(path);
    if (!candidates.length) return void 0;
    const id = trailingBlockId(sectionText2);
    const keys = /* @__PURE__ */ new Set([`h:${paragraphHash(sectionText2)}`]);
    if (id) keys.add(`b:${id}`);
    const hits = candidates.filter((th) => keys.has(paragraphKey(th.anchor)));
    hits.sort((a, b) => {
      var _a2, _b;
      return ((_a2 = b.updatedAt) != null ? _a2 : "").localeCompare((_b = a.updatedAt) != null ? _b : "");
    });
    return (_a = hits.find((th) => id && th.anchor.blockId === id)) != null ? _a : hits[0];
  }
  paragraphQuestionCount(threadId) {
    return questionCount(this.get(threadId));
  }
  // 孤立判斷: where the thread's paragraph is now (block id → hash), or
  // why it's orphaned (note deleted, paragraph gone). `edited` drives the
  // 「原文已修改」 banner. Null for unknown / non-paragraph threads.
  async paragraphStatus(threadId) {
    await this.ensureLoaded();
    const thread = this.get(threadId);
    if (!thread || thread.anchor.kind !== "paragraph") return null;
    return this.requireAnchors().resolve(thread.anchor);
  }
  // Asks about a paragraph. The first question about a section creates
  // its anchor (block mode writes ` ^vt-xxxxxx` into the note) and the
  // thread; later ones reuse them. Resolves to the thread id, or null when
  // nothing was sent (unknown thread, the thread is busy, or the same
  // section's anchor is still being created by another call).
  async askParagraph(target, req) {
    var _a;
    const anchors = this.requireAnchors();
    await this.ensureLoaded();
    if (this.disposed) return null;
    let thread = "threadId" in target ? this.get(target.threadId) : this.paragraphThread(target.path, target.text);
    if ("threadId" in target && !thread) return null;
    if (thread && thread.anchor.kind !== "paragraph") return null;
    let lock = null;
    let anchor;
    if ((thread == null ? void 0 : thread.anchor.kind) === "paragraph") {
      anchor = thread.anchor;
    } else {
      const ref = target;
      lock = `${ref.path}
${ref.lineStart}`;
      if (this.creating.has(lock)) return null;
      this.creating.add(lock);
      try {
        anchor = await anchors.create(ref);
      } catch (e) {
        this.creating.delete(lock);
        throw e;
      }
      const blockId = anchor.blockId;
      thread = blockId ? this.paragraphThreads(ref.path).find((th) => th.anchor.kind === "paragraph" && th.anchor.blockId === blockId) : void 0;
      if ((thread == null ? void 0 : thread.anchor.kind) === "paragraph") anchor = thread.anchor;
    }
    let threadId;
    try {
      if (thread && this.isBusy(thread.id)) return null;
      threadId = (_a = thread == null ? void 0 : thread.id) != null ? _a : PARAGRAPH_THREAD_PREFIX + this.newId();
      const where = await anchors.resolve(anchor);
      const input = paragraphInput(anchor, where, {
        question: req.question,
        selection: req.selection,
        // Auto-imported exam words aren't learned yet: still explain them.
        knownWords: this.deps.store.entries.filter((e) => e.origin !== "wordlist").map((e) => e.word)
      });
      await this.ask({
        threadId,
        anchor,
        taskId: req.taskId,
        input,
        display: this.displayFor(req),
        question: req.question,
        selection: req.selection
      });
    } finally {
      if (lock) this.creating.delete(lock);
    }
    return threadId;
  }
  async retryParagraph(threadId, turnId) {
    const question = this.dropFailedRound(this.get(threadId), turnId);
    if (!(question == null ? void 0 : question.taskId)) return;
    await this.askParagraph({ threadId }, { taskId: question.taskId, question: question.question, selection: question.selection });
  }
  // 文章改名 (規劃書 06 §4.6): paragraph anchors follow the note; a folder
  // rename moves every note under it. Returns how many threads moved.
  async renameParagraphPath(oldPath, newPath) {
    await this.ensureLoaded();
    let moved = 0;
    for (const th of this.paragraphThreads()) {
      const a = th.anchor;
      let next = null;
      if (a.path === oldPath) next = newPath;
      else if (a.path.startsWith(`${oldPath}/`)) next = newPath + a.path.slice(oldPath.length);
      if (next === null) continue;
      th.anchor = { ...a, path: next };
      this.changed(th);
      moved++;
    }
    return moved;
  }
  // 重新綁定: points a discussion (typically an orphaned one) at another
  // section, anchoring it the way a first question would. The turns stay.
  async rebindParagraph(threadId, ref) {
    await this.ensureLoaded();
    const thread = this.get(threadId);
    if (!thread || thread.anchor.kind !== "paragraph" || this.isBusy(threadId)) return false;
    thread.anchor = await this.requireAnchors().create(ref);
    this.changed(thread);
    return true;
  }
  // 刪除: tombstones the whole thread (kept on disk so a merge with another
  // device's copy can't bring it back). Note deletion itself never calls
  // this — orphaned discussions stay until the user decides (§4.6).
  async deleteThread(threadId) {
    await this.ensureLoaded();
    const thread = this.get(threadId);
    if (!thread) return;
    if (this.isBusy(threadId)) this.stop(threadId);
    thread.deletedAt = this.nowIso();
    this.changed(thread);
  }
  requireAnchors() {
    if (!this.deps.anchors) throw new Error("ThreadService: paragraph anchors are not configured");
    return this.deps.anchors;
  }
  // 釘選到文法提示: appends the answer (minus its 「你問的是」 line) to the
  // entry's grammar note; unpinning removes that same text again if the
  // user hasn't edited it away.
  async setPinned(entry, turnId, pinned) {
    var _a, _b;
    const thread = this.wordThread(entry.id);
    const turn = thread == null ? void 0 : thread.turns.find((x) => x.id === turnId);
    if (!thread || !turn || turn.role !== "assistant" || !!turn.pinnedToGrammar === pinned) return;
    const text = pinText(turn.content);
    if (!text) return;
    entry.grammar = pinned ? addPin((_a = entry.grammar) != null ? _a : "", text) : removePin((_b = entry.grammar) != null ? _b : "", text);
    turn.pinnedToGrammar = pinned;
    turn.updatedAt = this.nowIso();
    this.changed(thread);
    await this.deps.store.touch(entry);
  }
  // 👍 👎 on an answer (冷知識 L7). undefined clears it.
  async setFeedback(threadId, turnId, feedback) {
    await this.ensureLoaded();
    const thread = this.get(threadId);
    const turn = thread == null ? void 0 : thread.turns.find((x) => x.id === turnId && !x.deletedAt);
    if (!thread || !turn || turn.role !== "assistant" || turn.feedback === feedback) return;
    if (feedback) turn.feedback = feedback;
    else delete turn.feedback;
    turn.updatedAt = this.nowIso();
    this.changed(thread);
  }
  nowIso() {
    return this.clock().toISOString();
  }
  changed(thread) {
    var _a;
    thread.updatedAt = this.nowIso();
    thread.rev = ((_a = thread.rev) != null ? _a : 0) + 1;
    this.events.emit("thread:upsert", thread);
    this.scheduleWrite();
  }
  scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }, WRITE_DEBOUNCE_MS3);
  }
  async write() {
    try {
      this.threads = mergeThreads(this.threads, await this.readDisk());
      await this.deps.storage.writeShard(THREADS_SHARD, { threads: this.threads });
    } catch (e) {
      console.error("Vocab Tracker: couldn't save threads", e);
    }
  }
  async flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }
    await this.pendingWrite;
  }
  // Plugin unload: whatever is still streaming is saved as stopped with
  // the text received so far (the aborted request's own error handler
  // would run too late, after the final flush).
  dispose() {
    var _a;
    for (const [threadId, turn] of this.active) {
      turn.content = (_a = this.partial.get(turn.id)) != null ? _a : "";
      turn.status = "aborted";
      const thread = this.get(threadId);
      if (thread) this.changed(thread);
    }
    this.disposed = true;
    this.active.clear();
    this.partial.clear();
  }
};

// src/core/model/usage.ts
var VERB_RE = /(?<![a-z])verb\b|(?<![a-z])v\.(?![a-z])|動詞/i;
function isVerb(partOfSpeech) {
  return !!partOfSpeech && VERB_RE.test(partOfSpeech);
}
function verbFavoriteId(entryId) {
  return `verb:${entryId}`;
}

// src/services/learn/LearnStore.ts
var LEARN_SHARD = "learn";
var WRITE_DEBOUNCE_MS4 = 500;
var LearnStore = class {
  constructor(deps) {
    this.deps = deps;
    this.events = new TypedEmitter();
    this.data = emptyLearnShard();
    this.loading = null;
    this.writeTimer = null;
    this.pendingWrite = Promise.resolve();
    var _a;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
  }
  // Memoized, so callers can await it freely.
  ensureLoaded() {
    if (!this.loading) {
      this.loading = this.readDisk().then((disk) => {
        this.data = mergeLearn(this.data, disk);
      });
    }
    return this.loading;
  }
  get loaded() {
    return this.loading !== null;
  }
  // Unions a synced copy from disk into memory. A no-op until something
  // has opened a learning page — the first load reads the latest file anyway.
  async reload() {
    if (!this.loading) return;
    await this.loading;
    const disk = await this.readDisk();
    this.data = mergeLearn(this.data, disk);
    this.events.emit("learn:reloaded", void 0);
    if (learnFingerprint(this.data) !== learnFingerprint(disk)) this.scheduleWrite();
  }
  async readDisk() {
    try {
      return normalizeLearnShard(await this.deps.storage.readShard(LEARN_SHARD));
    } catch (e) {
      console.error("Vocab Tracker: couldn't read learn data", e);
      return emptyLearnShard();
    }
  }
  // ── Families ──────────────────────────────────────────────────
  families() {
    return this.data.families.filter((f) => !f.deletedAt);
  }
  family(id) {
    return this.data.families.find((f) => f.id === id && !f.deletedAt);
  }
  // Inserts a new family or replaces the stored copy with the same id.
  putFamily(f) {
    this.stamp(f);
    this.upsert(this.data.families, f);
    this.events.emit("family:upsert", f);
    this.scheduleWrite();
    return f;
  }
  // `by: "regroup"` marks a tombstone 重新分群 wrote rather than the user
  // (see pickFamily in learnMerge.ts).
  deleteFamily(id, by) {
    const f = this.family(id);
    if (!f) return;
    f.deletedAt = this.nowIso();
    if (by) f.deletedBy = by;
    this.putFamily(f);
  }
  // ── Trivia favorites ──────────────────────────────────────────
  trivia() {
    return this.data.trivia.filter((t2) => !t2.deletedAt);
  }
  triviaItem(id) {
    return this.data.trivia.find((t2) => t2.id === id && !t2.deletedAt);
  }
  putTrivia(item) {
    this.stamp(item);
    this.upsert(this.data.trivia, item);
    this.events.emit("trivia:upsert", item);
    this.scheduleWrite();
    return item;
  }
  deleteTrivia(id) {
    const item = this.triviaItem(id);
    if (!item) return;
    item.deletedAt = this.nowIso();
    this.putTrivia(item);
  }
  // ── Saved verb usages (動詞用法收藏) ─────────────────────────────
  get verbList() {
    var _a, _b;
    return (_b = (_a = this.data).verbs) != null ? _b : _a.verbs = [];
  }
  verbFavorites() {
    return this.verbList.filter((v) => !v.deletedAt);
  }
  verbFavorite(entryId) {
    const id = verbFavoriteId(entryId);
    return this.verbList.find((v) => v.id === id && !v.deletedAt);
  }
  // Saves the verb (idempotent). Saving again after an unsave revives the
  // same id as a fresh record — a newer updatedAt than the tombstone, so
  // the save wins the merge on every device.
  favoriteVerb(entry) {
    const live = this.verbFavorite(entry.id);
    if (live) return live;
    const id = verbFavoriteId(entry.id);
    const dead = this.verbList.find((v) => v.id === id);
    const rec = { id, entryId: entry.id, word: entry.word, rev: dead == null ? void 0 : dead.rev };
    this.stamp(rec);
    this.upsert(this.verbList, rec);
    this.events.emit("verbFavorite:upsert", rec);
    this.scheduleWrite();
    return rec;
  }
  unfavoriteVerb(entryId) {
    const rec = this.verbFavorite(entryId);
    if (!rec) return;
    rec.deletedAt = this.nowIso();
    this.stamp(rec);
    this.events.emit("verbFavorite:upsert", rec);
    this.scheduleWrite();
  }
  // ── Persistence ───────────────────────────────────────────────
  nowIso() {
    return this.clock().toISOString();
  }
  stamp(rec) {
    var _a, _b;
    const now = this.nowIso();
    rec.createdAt = (_a = rec.createdAt) != null ? _a : now;
    rec.updatedAt = now;
    rec.rev = ((_b = rec.rev) != null ? _b : 0) + 1;
  }
  upsert(list, rec) {
    const i = list.findIndex((x) => x.id === rec.id);
    if (i === -1) list.push(rec);
    else list[i] = rec;
  }
  scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }, WRITE_DEBOUNCE_MS4);
  }
  async write() {
    var _a;
    try {
      const merged = mergeLearn(this.data, await this.readDisk());
      const now = this.clock().getTime();
      this.data = {
        families: dropOldTombstones(merged.families, now),
        trivia: dropOldTombstones(merged.trivia, now),
        verbs: dropOldTombstones((_a = merged.verbs) != null ? _a : [], now)
      };
      await this.deps.storage.writeShard(LEARN_SHARD, this.data);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save learn data", e);
    }
  }
  async flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      this.pendingWrite = this.write();
    }
    await this.pendingWrite;
  }
};

// src/services/learn/structured.ts
function rawOutput(r) {
  if (r.text.trim()) return r.text;
  if (r.json === void 0) return "";
  try {
    return JSON.stringify(r.json, null, 2);
  } catch (e) {
    return String(r.json);
  }
}
async function runStructured(ai, task, input, opts = {}) {
  const prompt = () => {
    try {
      return ai.prepare ? formatAiRequest(ai.prepare(task, input).request) : "";
    } catch (e) {
      return "";
    }
  };
  const debug = (extra) => ({ taskId: task.id, prompt: prompt(), output: "", ...extra });
  let result;
  try {
    result = await ai.run(task, input, opts);
  } catch (e) {
    throw withDebug(e, () => {
      var _a, _b;
      return debug({ output: (_b = (_a = e.extra) == null ? void 0 : _a.partialText) != null ? _b : "" });
    });
  }
  if (!task.parse) throw new Error(`Task ${task.id} has no parser`);
  try {
    return { result, value: task.parse(result) };
  } catch (e) {
    throw withDebug(e, () => debug({ output: rawOutput(result), model: result.model, stop: result.stop }));
  }
}

// src/services/learn/FamilyService.ts
var FAMILY_THREAD_ID = "family";
var MAX_FAMILY_CONTEXT = 300;
var REGROUP_GROWTH = 1.2;
function candidateScope(c) {
  return c.seedEntryIds.length ? "word" : "list";
}
function toWord(e) {
  return { word: e.word, partOfSpeech: e.partOfSpeech, zh: e.definitionZh };
}
var key2 = (w) => w.trim().toLowerCase();
var FamilyService = class {
  constructor(deps) {
    this.deps = deps;
    this.seq = 0;
    var _a, _b;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
    this.newId = (_b = deps.newId) != null ? _b : (() => `${this.clock().getTime()}-f${++this.seq}`);
  }
  ensureLoaded() {
    return this.deps.learn.ensureLoaded();
  }
  families() {
    return this.deps.learn.families();
  }
  // Families a word belongs to (word page 「字族」 section).
  familiesOf(entryId) {
    return this.families().filter((f) => familyMembers(f).some((m) => m.entryId === entryId));
  }
  // The families 重新分群 replaces: AI groupings of the whole list.
  regroupable() {
    return this.families().filter((f) => f.source === "ai" && familyScope(f) === "list");
  }
  // L5: 「有新單字，要重新分群嗎」 once the list has grown 20% since the
  // newest whole-list grouping (a 找字族 on a word page doesn't count:
  // it only looked at one word).
  needsRegroup() {
    var _a;
    const ai = this.regroupable().filter((f) => f.entryCountAtGenerate);
    if (!ai.length) return false;
    const newest2 = ai.reduce((a, b) => {
      var _a2, _b;
      return ((_a2 = b.createdAt) != null ? _a2 : "") > ((_b = a.createdAt) != null ? _b : "") ? b : a;
    });
    const base = (_a = newest2.entryCountAtGenerate) != null ? _a : 0;
    return this.deps.vocab.entries.length >= base * REGROUP_GROWTH && this.deps.vocab.entries.length > base;
  }
  stop() {
    this.deps.ai.cancel(FAMILY_THREAD_ID);
  }
  // Asks the AI for families (around `seedEntryIds` for W3, the whole list
  // for L5). Returns candidates; AI errors propagate (bad_output when the
  // JSON doesn't hold — carrying the prompt and the raw answer).
  async generate(opts = {}) {
    var _a;
    await this.ensureLoaded();
    const entries = this.deps.vocab.entries;
    const seedIds = new Set((_a = opts.seedEntryIds) != null ? _a : []);
    const seeds = entries.filter((e) => seedIds.has(e.id));
    const recent = entries.filter((e) => !seedIds.has(e.id)).sort((a, b) => entryAddedMs2(b) - entryAddedMs2(a)).slice(0, Math.max(0, MAX_FAMILY_CONTEXT - seeds.length));
    const { value: drafts } = await runStructured(
      this.deps.ai,
      familyGenerate,
      {
        known: [...seeds, ...recent].map(toWord),
        seeds: seeds.map(toWord),
        existingTopics: seeds.length ? this.families().map((f) => f.topic) : []
      },
      { threadId: FAMILY_THREAD_ID, signal: opts.signal }
    );
    const index = new WordIndex(entries);
    return drafts.map((d) => this.candidate(d, index, seeds.map((e) => e.id)));
  }
  candidate(d, index, seedEntryIds) {
    return {
      topic: d.topic,
      label: d.label,
      seedEntryIds,
      groups: d.groups.map((g) => ({ label: g.label, members: g.members.map((m) => this.member(m.word, m.zh, index)) }))
    };
  }
  member(word, zh, index) {
    const e = index.find(word);
    return e ? { entryId: e.id, word, zh } : { word, zh };
  }
  // Suggested words across the candidates (「把 3 個字加入單字庫」), once each.
  newWords(candidates) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const c of candidates) {
      for (const m of c.groups.flatMap((g) => g.members)) {
        if (m.entryId || seen.has(key2(m.word))) continue;
        seen.add(key2(m.word));
        out.push(m);
      }
    }
    return out;
  }
  // Stores the confirmed candidates (只存字族 / 存字族並加字). A candidate
  // whose topic already exists is merged into that family instead of
  // duplicating it.
  async save(candidates, opts = {}) {
    var _a;
    await this.ensureLoaded();
    const renewed = /* @__PURE__ */ new Set();
    if (opts.replace) {
      const topics = new Set(candidates.map((c) => key2(c.topic)));
      for (const f of this.regroupable()) {
        if (topics.has(key2(f.topic))) renewed.add(f.id);
        else this.deps.learn.deleteFamily(f.id, "regroup");
      }
    }
    const count = this.deps.vocab.entries.length;
    const families = candidates.map((c) => this.toFamily(c, count, renewed));
    const wanted = new Set(((_a = opts.addWords) != null ? _a : []).map(key2));
    const toAdd = /* @__PURE__ */ new Map();
    for (const f of families) {
      for (const m of familyMembers(f)) {
        if (!m.entryId && wanted.has(key2(m.word)) && !toAdd.has(key2(m.word))) {
          toAdd.set(key2(m.word), { word: m.word, zh: m.zh, familyId: f.id });
        }
      }
    }
    const added = await this.addWords([...toAdd.values()]);
    const index = new WordIndex(this.deps.vocab.entries);
    for (const f of families) {
      this.link(f, index);
      this.deps.learn.putFamily(f);
    }
    return { families, added };
  }
  // L5 「點一下加入」: adds one suggested word of a saved family.
  async addSuggested(familyId, word) {
    await this.ensureLoaded();
    const f = this.deps.learn.family(familyId);
    const m = f && familyMembers(f).find((x) => key2(x.word) === key2(word));
    if (!f || !m) return void 0;
    const index = new WordIndex(this.deps.vocab.entries);
    const existing = index.find(m.word);
    const [entry] = existing ? [existing] : await this.addWords([{ word: m.word, zh: m.zh, familyId: f.id }]);
    this.link(f, new WordIndex(this.deps.vocab.entries));
    this.deps.learn.putFamily(f);
    return entry;
  }
  remove(familyId) {
    this.deps.learn.deleteFamily(familyId);
  }
  toFamily(c, entryCount, renewed = /* @__PURE__ */ new Set()) {
    const existing = this.families().find((f) => key2(f.topic) === key2(c.topic));
    if (existing && renewed.has(existing.id)) {
      renewed.delete(existing.id);
      return {
        ...existing,
        label: c.label,
        scope: candidateScope(c),
        groups: c.groups.map((g) => ({ label: g.label, members: g.members.map((m) => ({ ...m })) })),
        seedEntryIds: c.seedEntryIds,
        entryCountAtGenerate: entryCount
      };
    }
    if (existing) return mergeFamily(existing, c);
    return {
      id: this.newId(),
      topic: c.topic,
      label: c.label,
      source: "ai",
      scope: candidateScope(c),
      groups: c.groups.map((g) => ({ label: g.label, members: g.members.map((m) => ({ ...m })) })),
      seedEntryIds: c.seedEntryIds,
      entryCountAtGenerate: entryCount
    };
  }
  // Points members at entries (newly added words, or words learned since).
  link(f, index) {
    for (const m of familyMembers(f)) {
      const e = m.entryId ? void 0 : index.find(m.word);
      if (e) m.entryId = e.id;
    }
  }
  // Dictionary first, then one batch into the vocab list. A failed lookup
  // still adds the word with the AI's Chinese gloss; the startup enrich
  // pass retries words without a definition.
  async addWords(words) {
    var _a, _b, _c, _d, _e;
    if (!words.length) return [];
    const now = this.clock();
    const entries = [];
    for (const w of words) {
      let d;
      try {
        d = await this.deps.dictionary.fetchDictionary(w.word);
      } catch (e) {
        console.error(`Vocab Tracker: dictionary lookup failed for "${w.word}"`, e);
      }
      const entry = {
        id: this.newId(),
        word: w.word,
        level: "",
        synonyms: (_a = d == null ? void 0 : d.synonyms.join(", ")) != null ? _a : "",
        antonyms: (_b = d == null ? void 0 : d.antonyms.join(", ")) != null ? _b : "",
        example: "",
        definition: (_c = d == null ? void 0 : d.definition) != null ? _c : "",
        definitionZh: (d == null ? void 0 : d.definitionZh) || w.zh,
        phonetic: (_d = d == null ? void 0 : d.phonetic) != null ? _d : "",
        partOfSpeech: (_e = d == null ? void 0 : d.partOfSpeech) != null ? _e : "",
        grammar: "",
        source: null,
        added: nowStamp(now),
        lastReviewed: nowStamp(now),
        reviews: 0
      };
      if (d == null ? void 0 : d.audio) entry.audio = d.audio;
      entry.origin = familyOrigin(w.familyId);
      entries.push(entry);
    }
    await this.deps.vocab.addEntries(entries);
    return entries;
  }
};
function mergeFamily(f, c) {
  var _a;
  const groups = f.groups.map((g) => ({ label: g.label, members: [...g.members] }));
  for (const cg of c.groups) {
    let g = groups.find((x) => key2(x.label) === key2(cg.label));
    if (!g) {
      g = { label: cg.label, members: [] };
      groups.push(g);
    }
    for (const m of cg.members) if (!g.members.some((x) => key2(x.word) === key2(m.word))) g.members.push({ ...m });
  }
  const seeds = [.../* @__PURE__ */ new Set([...(_a = f.seedEntryIds) != null ? _a : [], ...c.seedEntryIds])];
  const scope = familyScope(f) === "word" || candidateScope(c) === "word" ? "word" : "list";
  return { ...f, groups, seedEntryIds: seeds, scope };
}

// src/services/learn/VerbUsageService.ts
function verbThreadId(entryId) {
  return `verb:${entryId}`;
}
var VerbUsageService = class {
  constructor(deps) {
    this.deps = deps;
    this.events = new TypedEmitter();
    this.busy = /* @__PURE__ */ new Set();
    var _a;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
  }
  canGenerate(entry) {
    return isVerb(entry.partOfSpeech);
  }
  // The L6 list: learned verbs, alphabetical.
  verbs() {
    return this.deps.vocab.entries.filter((e) => this.canGenerate(e)).sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }));
  }
  usage(entry) {
    return entry.usage;
  }
  isBusy(entryId) {
    return this.busy.has(entryId);
  }
  stop(entryId) {
    this.deps.ai.cancel(verbThreadId(entryId));
  }
  // Generates (or regenerates) the usage block and saves it on the entry.
  // AI errors propagate (bad_output when the JSON doesn't hold, carrying
  // the prompt and the raw answer); the old
  // block is kept on failure. Refuses non-verbs.
  async generate(entry, opts = {}) {
    var _a, _b, _c, _d;
    if (!this.canGenerate(entry)) throw new Error(`"${entry.word}" is not a verb`);
    this.setBusy(entry.id, true);
    try {
      const { result: r, value: draft } = await runStructured(
        this.deps.ai,
        verbUsage,
        { entry },
        { threadId: verbThreadId(entry.id), signal: opts.signal }
      );
      const now = this.clock().toISOString();
      const createdAt = (_d = (_c = (_a = entry.usage) == null ? void 0 : _a.createdAt) != null ? _c : (_b = entry.usage) == null ? void 0 : _b.generatedAt) != null ? _d : now;
      const block = { ...draft, createdAt, generatedAt: now, model: r.model };
      entry.usage = block;
      await this.deps.vocab.touch(entry);
      this.events.emit("verb:usage", { entryId: entry.id });
      return block;
    } finally {
      this.setBusy(entry.id, false);
    }
  }
  setBusy(entryId, busy) {
    if (busy) this.busy.add(entryId);
    else this.busy.delete(entryId);
    this.events.emit("verb:busy", { entryId, busy });
  }
};

// src/services/learn/TriviaService.ts
var ANCHOR = { kind: "trivia-session" };
function facts(e) {
  return {
    word: e.word,
    phonetic: e.phonetic,
    partOfSpeech: e.partOfSpeech,
    definitionZh: e.definitionZh,
    definition: e.definition,
    example: e.example
  };
}
var TriviaService = class {
  constructor(deps) {
    this.deps = deps;
    this.threadId = TRIVIA_THREAD_ID;
    var _a, _b, _c;
    this.clock = (_a = deps.clock) != null ? _a : (() => /* @__PURE__ */ new Date());
    this.random = (_b = deps.random) != null ? _b : Math.random;
    this.newId = (_c = deps.newId) != null ? _c : (() => `${this.clock().getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  }
  async ensureLoaded() {
    await Promise.all([this.deps.threads.ensureLoaded(), this.deps.learn.ensureLoaded()]);
  }
  thread() {
    return this.deps.threads.get(TRIVIA_THREAD_ID);
  }
  isBusy() {
    return this.deps.threads.isBusy(TRIVIA_THREAD_ID);
  }
  stop() {
    this.deps.threads.stop(TRIVIA_THREAD_ID);
  }
  entry(id) {
    return id ? this.deps.vocab.entries.find((e) => e.id === id && !e.deletedAt) : void 0;
  }
  // The word the conversation is currently about: the newest answer that
  // has a subject still in the vocab list.
  currentSubject() {
    const th = this.thread();
    if (!th) return void 0;
    for (let i = th.turns.length - 1; i >= 0; i--) {
      const t2 = th.turns[i];
      if (t2.deletedAt || t2.role !== "assistant") continue;
      const e = this.entry(subjectOf(th, t2));
      if (e) return e;
    }
    return void 0;
  }
  // The subject for a new round of `next`, per the §7.4 selection rules.
  pick() {
    return pickSubject(this.deps.vocab.entries, recentSubjects(this.thread()), {
      now: this.clock(),
      random: this.random
    });
  }
  // Titles already told, newest first, for the prompt's no-repeat list.
  told() {
    var _a, _b;
    const th = this.thread();
    const out = [];
    for (const r of triviaRounds(th)) {
      if (!r.answer.content.trim()) continue;
      const word = (_b = (_a = this.entry(subjectOf(th, r.answer))) == null ? void 0 : _a.word) != null ? _b : "";
      out.push({ word, title: splitTrivia(r.answer.content).title });
      if (out.length >= MAX_TOLD) break;
    }
    return out;
  }
  input(subject, extra = {}) {
    const entries = this.deps.vocab.entries;
    return {
      subject: subject ? facts(subject) : void 0,
      knownWords: knownWordList(entries),
      knownTotal: entries.length,
      told: this.told(),
      ...extra
    };
  }
  // A quick action. Resolves with the subject word once the answer has
  // finished (or failed — the turn then carries the error); undefined when
  // there are no words to talk about.
  async ask(kind, opts = {}) {
    var _a, _b;
    await this.ensureLoaded();
    if (this.isBusy()) return void 0;
    const subject = (_b = (_a = this.entry(opts.entryId)) != null ? _a : kind === "next" ? void 0 : this.currentSubject()) != null ? _b : this.pick();
    if (!subject) return void 0;
    const task = TRIVIA_TASK_BY_KIND[kind];
    await this.deps.threads.ask({
      threadId: TRIVIA_THREAD_ID,
      anchor: ANCHOR,
      taskId: task.id,
      input: this.input(subject),
      display: t(`ai.task.trivia.${kind}`),
      subjectEntryId: subject.id
    });
    return subject;
  }
  // Free-form follow-up from the composer, about the current subject.
  async followup(question, selection) {
    const q = question.trim();
    if (!q) return;
    await this.ensureLoaded();
    if (this.isBusy()) return;
    const subject = this.currentSubject();
    await this.deps.threads.ask({
      threadId: TRIVIA_THREAD_ID,
      anchor: ANCHOR,
      taskId: triviaFollowup.id,
      input: this.input(subject, { question: q, selection }),
      display: q,
      question: q,
      selection,
      subjectEntryId: subject == null ? void 0 : subject.id
    });
  }
  // 重試: the failed answer and its question are tombstoned, then the same
  // round is asked again — a quick action about the same word, or the same
  // follow-up question.
  async retry(turnId) {
    await this.ensureLoaded();
    const th = this.thread();
    const answer = th == null ? void 0 : th.turns.find((x) => x.id === turnId);
    const entryId = answer ? subjectOf(th, answer) : void 0;
    const q = this.deps.threads.dropFailedRound(th, turnId);
    if (!q) return;
    const kind = Object.keys(TRIVIA_TASK_BY_KIND).find((k) => TRIVIA_TASK_BY_KIND[k].id === q.taskId);
    if (kind) await this.ask(kind, { entryId });
    else if (q.question) await this.followup(q.question, q.selection);
  }
  // ── Favorites (收藏) ─────────────────────────────────────────
  answerTurn(turnId) {
    var _a;
    const t2 = (_a = this.thread()) == null ? void 0 : _a.turns.find((x) => x.id === turnId && !x.deletedAt);
    return t2 && t2.role === "assistant" && t2.status !== "streaming" && t2.content.trim() ? t2 : void 0;
  }
  favoriteOf(turnId) {
    return this.deps.learn.trivia().find((it) => it.fromTurnId === turnId);
  }
  // Saves an answer as a TriviaItem on its subject word. Idempotent per
  // turn. Undefined when the turn can't be saved (still streaming, empty,
  // or no subject word to hang it on).
  favorite(turnId) {
    const existing = this.favoriteOf(turnId);
    if (existing) return existing;
    const turn = this.answerTurn(turnId);
    if (!turn) return void 0;
    const subject = this.entry(subjectOf(this.thread(), turn));
    if (!subject) return void 0;
    const { title, body } = splitTrivia(turn.content);
    const mentions = new WordIndex(this.deps.vocab.entries).mentions(`${title}
${body}`, /* @__PURE__ */ new Set([subject.id]));
    return this.deps.learn.putTrivia({ id: this.newId(), entryId: subject.id, mentions, title, body, fromTurnId: turnId });
  }
  unfavorite(itemId) {
    this.deps.learn.deleteTrivia(itemId);
  }
  // Favorites, newest first; only those hung on `entryId` when given.
  favorites(entryId) {
    return this.deps.learn.trivia().filter((it) => !entryId || it.entryId === entryId).sort((a, b) => {
      var _a, _b;
      return ((_a = b.createdAt) != null ? _a : "").localeCompare((_b = a.createdAt) != null ? _b : "");
    });
  }
  // Favorites about other words that mention `entryId` (反向連結).
  mentioning(entryId) {
    return this.favorites().filter((it) => it.entryId !== entryId && it.mentions.includes(entryId));
  }
};

// src/ui/chat/SelectionTracker.ts
var import_obsidian39 = require("obsidian");
var MAX_SELECTION_CHARS = 1500;
var SelectionTracker = class {
  constructor(app) {
    this.app = app;
    this.events = new TypedEmitter();
    this.current = null;
    this.version = 0;
  }
  get() {
    return this.current;
  }
  // The selection went out with a question, or the user dismissed it.
  clear() {
    if (this.current) this.set(null);
  }
  // Wire to document "selectionchange".
  update() {
    var _a, _b;
    const sel = window.getSelection();
    const node = sel == null ? void 0 : sel.anchorNode;
    if (!sel || !node) return;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    if (!(el == null ? void 0 : el.closest('.workspace-leaf-content[data-type="markdown"]'))) return;
    const view = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view).find((v) => v instanceof import_obsidian39.MarkdownView && v.containerEl.contains(el));
    const raw = (view == null ? void 0 : view.getMode()) === "source" ? view.editor.getSelection() : sel.toString();
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SELECTION_CHARS);
    if (!text) {
      if (this.current) this.set(null);
      return;
    }
    if (((_a = this.current) == null ? void 0 : _a.text) === text) return;
    this.set({ text, path: (_b = view == null ? void 0 : view.file) == null ? void 0 : _b.path, version: ++this.version });
  }
  set(next) {
    this.current = next;
    this.events.emit("change", next);
  }
};

// src/platform/ObsidianWordlists.ts
var import_obsidian40 = require("obsidian");
var EXTENSIONS = /* @__PURE__ */ new Set(["md", "txt", "csv", "tsv"]);
function inFolder(path, folder) {
  return path.startsWith((0, import_obsidian40.normalizePath)(folder) + "/");
}
var ObsidianWordlists = class {
  constructor(app) {
    this.app = app;
  }
  list(folder) {
    return this.app.vault.getFiles().filter((f) => EXTENSIONS.has(f.extension.toLowerCase()) && inFolder(f.path, folder)).filter((f) => !f.basename.startsWith("_") && f.basename.toLowerCase() !== "readme").sort((a, b) => a.path.localeCompare(b.path)).map((f) => ({ path: f.path, basename: f.basename }));
  }
  async read(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian40.TFile ? this.app.vault.cachedRead(file) : null;
  }
};

// src/core/wordlists/WordlistIndex.ts
var NONE = [];
var WordlistIndex = class {
  constructor(lists = []) {
    this.byWord = /* @__PURE__ */ new Map();
    this.info = /* @__PURE__ */ new Map();
    // Lookups repeat a lot (the same "the", "data"… across every paragraph),
    // and inflection fallback tries several candidates, so remember answers.
    this.memo = /* @__PURE__ */ new Map();
    var _a;
    for (const list of lists) {
      const info = (_a = this.info.get(list.tag)) != null ? _a : { tag: list.tag, words: 0, paths: [] };
      if (list.path) info.paths.push(list.path);
      this.info.set(list.tag, info);
      for (const word of list.words) {
        const tags = this.byWord.get(word);
        if (!tags) {
          this.byWord.set(word, [list.tag]);
          info.words++;
        } else if (!tags.includes(list.tag)) {
          tags.push(list.tag);
          info.words++;
        }
      }
    }
    const order = this.tags;
    for (const tags of this.byWord.values()) tags.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  // Every tag, alphabetical — the order chips and settings rows appear in,
  // and the priority when a word belongs to several (first one's colour).
  get tags() {
    return [...this.info.keys()].sort((a, b) => a.localeCompare(b));
  }
  get lists() {
    return this.tags.map((t2) => this.info.get(t2));
  }
  get isEmpty() {
    return this.byWord.size === 0;
  }
  // The list entry a word as it appears in text (any case, possibly
  // inflected) belongs to, or null when it's in no list.
  match(word, inflections = true) {
    const lower = word.toLowerCase();
    const key3 = inflections ? lower : `=${lower}`;
    const memo = this.memo.get(key3);
    if (memo !== void 0) return memo;
    let hit = null;
    const exact = this.byWord.get(lower);
    if (exact) hit = { base: lower, tags: exact };
    else if (inflections) {
      for (const base of lemmaCandidates(lower)) {
        const tags = this.byWord.get(base);
        if (tags) {
          hit = { base, tags };
          break;
        }
      }
    }
    this.memo.set(key3, hit);
    return hit;
  }
  // Just the tags; empty when the word is in no list.
  lookup(word, inflections = true) {
    var _a, _b;
    return (_b = (_a = this.match(word, inflections)) == null ? void 0 : _a.tags) != null ? _b : NONE;
  }
};

// src/core/wordlists/scan.ts
var WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;
function segmentText(text, lookup) {
  const out = [];
  let last2 = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const tags = lookup(m[0]);
    if (tags.length === 0) continue;
    const i = m.index;
    if (i > last2) out.push(text.slice(last2, i));
    out.push({ word: m[0], tags });
    last2 = i + m[0].length;
  }
  if (out.length === 0) return null;
  if (last2 < text.length) out.push(text.slice(last2));
  return out;
}
function proseLines(markdown) {
  var _a;
  const lines4 = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  if (((_a = lines4[0]) == null ? void 0 : _a.trim()) === "---") {
    const close = lines4.findIndex((l4, j) => j > 0 && l4.trim() === "---");
    if (close > 0) {
      for (; i <= close; i++) out.push("");
    }
  }
  let inFence = false;
  let inComment = false;
  for (; i < lines4.length; i++) {
    const line = lines4[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    if (inFence) {
      out.push("");
      continue;
    }
    let s = line;
    if (inComment) {
      const end = s.indexOf("%%");
      if (end < 0) {
        out.push("");
        continue;
      }
      s = s.slice(end + 2);
      inComment = false;
    }
    s = s.replace(/%%.*?%%/g, " ");
    const open = s.indexOf("%%");
    if (open >= 0) {
      s = s.slice(0, open);
      inComment = true;
    }
    s = s.replace(/`[^`]*`/g, " ").replace(/!?\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_m, target, alias) => alias || target).replace(/\]\([^)]*\)/g, "]").replace(/\bhttps?:\/\/\S+/g, " ").replace(/<[^>]+>/g, " ");
    out.push(s);
  }
  return out;
}
var ScanAccumulator = class {
  constructor(match) {
    this.match = match;
    this.seen = /* @__PURE__ */ new Set();
    this.seenByTag = /* @__PURE__ */ new Map();
    this.counts = /* @__PURE__ */ new Map();
    this.hits = /* @__PURE__ */ new Map();
  }
  // `line` is the text's line number in the note, recorded on each word's
  // first occurrence.
  add(text, line = 0) {
    var _a;
    for (const m of text.matchAll(WORD_RE)) {
      this.seen.add(m[0].toLowerCase());
      const hit = this.match(m[0]);
      if (!hit) continue;
      if (!this.hits.has(hit.base)) {
        const start = m.index;
        const sentence = extractSentence(text, start, start + m[0].length, null);
        this.hits.set(hit.base, { word: hit.base, tags: hit.tags, line, sentence });
      }
      for (const tag of hit.tags) {
        let set = this.seenByTag.get(tag);
        if (!set) this.seenByTag.set(tag, set = /* @__PURE__ */ new Set());
        set.add(hit.base);
        this.counts.set(tag, ((_a = this.counts.get(tag)) != null ? _a : 0) + 1);
      }
    }
  }
  result() {
    var _a;
    const byTag = {};
    for (const [tag, set] of this.seenByTag) {
      byTag[tag] = { unique: set.size, count: (_a = this.counts.get(tag)) != null ? _a : 0 };
    }
    return { uniqueWords: this.seen.size, byTag, hits: [...this.hits.values()] };
  }
};

// src/services/wordlists/WordlistService.ts
var SLICE_LINES = 300;
var MAX_CACHED_SCANS = 100;
var WordlistService = class extends TypedEmitter {
  constructor(deps) {
    var _a;
    super();
    this.deps = deps;
    this.index = new WordlistIndex();
    this.generation = 0;
    this.scans = /* @__PURE__ */ new Map();
    this.inflight = /* @__PURE__ */ new Map();
    this.match = (word) => this.index.match(word, this.deps.settings().inflections);
    this.yieldToUi = (_a = deps.yieldToUi) != null ? _a : (() => new Promise((r) => setTimeout(r, 0)));
  }
  async reload() {
    const gen = ++this.generation;
    const { folder } = this.deps.settings();
    const lists = [];
    for (const file of this.deps.source.list(folder)) {
      const content = await this.deps.source.read(file.path);
      if (gen !== this.generation) return;
      if (content == null) continue;
      const parsed = parseWordlist(content);
      if (parsed.words.length === 0) continue;
      lists.push({ tag: parsed.tag || tagFromBasename(file.basename), words: parsed.words, path: file.path });
    }
    this.index = new WordlistIndex(lists);
    this.invalidateScans();
    this.emit("index-changed", this.index);
  }
  // Inflection matching or the index changed, so every cached count is stale.
  invalidateScans() {
    this.scans.clear();
    this.inflight.clear();
  }
  // Tags to underline in reading view: enabled tags only. Null when
  // highlighting is off or there's nothing loaded, so the post-processor
  // can skip walking the DOM at all.
  highlightLookup() {
    const s = this.deps.settings();
    if (!s.highlight || this.index.isEmpty) return null;
    const enabled = new Set(this.index.tags.filter((t2) => tagEnabled(s, t2)));
    if (enabled.size === 0) return null;
    const memo = /* @__PURE__ */ new Map();
    return (word) => {
      const tags = this.index.lookup(word, s.inflections);
      if (tags.length === 0) return tags;
      let hit = memo.get(tags);
      if (!hit) memo.set(tags, hit = tags.filter((t2) => enabled.has(t2)));
      return hit;
    };
  }
  cachedScan(path, mtime) {
    const hit = this.scans.get(path);
    return hit && hit.mtime === mtime ? hit.result : null;
  }
  // Scans a note unless this version was already scanned (or is being
  // scanned right now). `read` is only called when a scan is needed.
  scan(path, mtime, read) {
    const cached = this.cachedScan(path, mtime);
    if (cached) return Promise.resolve(cached);
    const running2 = this.inflight.get(path);
    if (running2 && running2.mtime === mtime) return running2.promise;
    const gen = this.generation;
    const token2 = { mtime, promise: null };
    const run = async () => {
      const lines4 = proseLines(await read());
      const acc = new ScanAccumulator(this.match);
      for (let i = 0; i < lines4.length; i++) {
        if (i > 0 && i % SLICE_LINES === 0) await this.yieldToUi();
        acc.add(lines4[i], i);
      }
      const result = acc.result();
      if (gen === this.generation && this.inflight.get(path) === token2) {
        this.inflight.delete(path);
        this.scans.delete(path);
        this.scans.set(path, { mtime, result });
        if (this.scans.size > MAX_CACHED_SCANS) this.scans.delete(this.scans.keys().next().value);
        this.emit("scanned", { path, result });
      }
      return result;
    };
    token2.promise = run();
    this.inflight.set(path, token2);
    token2.promise.catch(() => {
      if (this.inflight.get(path) === token2) this.inflight.delete(path);
    });
    return token2.promise;
  }
};

// src/ui/reading/examHighlight.ts
var import_obsidian41 = require("obsidian");
var EXAM_WORD_CLS = "vt-exam-word";
var SKIP = [
  "code",
  "pre",
  "a",
  "mark",
  "button",
  "input",
  "textarea",
  "script",
  "style",
  ".math",
  ".tag",
  ".internal-link",
  ".external-link",
  ".frontmatter",
  ".frontmatter-container",
  ".metadata-container",
  "[class*='block-language-']",
  `.${EXAM_WORD_CLS}`
].join(", ");
function highlightExamWords(el, lookup, colorOf) {
  var _a;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      var _a2, _b;
      return ((_a2 = n.parentElement) == null ? void 0 : _a2.closest(SKIP)) || !/[A-Za-z]/.test((_b = n.nodeValue) != null ? _b : "") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    const segments = segmentText((_a = node.nodeValue) != null ? _a : "", lookup);
    if (!segments) continue;
    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      if (typeof seg === "string") {
        frag.appendChild(document.createTextNode(seg));
        continue;
      }
      const span = frag.createSpan({ cls: EXAM_WORD_CLS, text: seg.word });
      span.dataset.vtTags = seg.tags.join(" ");
      span.style.setProperty("--vt-exam-color", colorOf(seg.tags[0]));
      (0, import_obsidian41.setTooltip)(span, seg.tags.map(tagLabel).join(" \xB7 "), { delay: 300 });
    }
    node.replaceWith(frag);
  }
}

// src/services/wordlists/NoteImports.ts
var NoteImports = class {
  constructor(storage) {
    this.storage = storage;
    this.notes = {};
  }
  async load() {
    var _a;
    const disk = await this.storage.readShard("imports");
    this.notes = { ...(_a = disk == null ? void 0 : disk.notes) != null ? _a : {}, ...this.notes };
  }
  has(path) {
    return path in this.notes;
  }
  async mark(path, at) {
    this.notes[path] = at;
    await this.save();
  }
  async forget(path) {
    if (!(path in this.notes)) return;
    delete this.notes[path];
    await this.save();
  }
  async rename(oldPath, newPath) {
    if (!(oldPath in this.notes)) return;
    this.notes[newPath] = this.notes[oldPath];
    delete this.notes[oldPath];
    await this.save();
  }
  save() {
    return this.storage.writeShard("imports", { notes: this.notes });
  }
};

// src/core/wordlists/importPlan.ts
function mergeLevel(level, labels) {
  const parts = level.split(",").map((t2) => t2.trim()).filter(Boolean);
  const have = new Set(parts.map((p) => p.toLowerCase()));
  for (const label of labels) {
    if (!have.has(label.toLowerCase())) {
      parts.push(label);
      have.add(label.toLowerCase());
    }
  }
  return parts.join(", ");
}
function cleanSentence(text) {
  return text.replace(/^\s*(#{1,6}\s+|>\s*)+/, "").replace(/^\s*([-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/, "").replace(/(\*\*|__|==|~~|\*|_)(?=\S)|(?<=\S)(\*\*|__|==|~~|\*|_)/g, "").replace(/\s+/g, " ").trim();
}
function planImport(hits, entries, labelsOf) {
  const byWord = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const key3 = e.word.toLowerCase();
    if (!byWord.has(key3) || byWord.get(key3).deletedAt) byWord.set(key3, e);
  }
  const plan = { create: [], retag: [] };
  for (const hit of hits) {
    const labels = labelsOf(hit.tags);
    if (labels.length === 0) continue;
    const existing = byWord.get(hit.word);
    if (!existing) {
      plan.create.push({ word: hit.word, level: labels.join(", "), line: hit.line, example: cleanSentence(hit.sentence) });
      continue;
    }
    if (existing.deletedAt) continue;
    const level = mergeLevel(existing.level, labels);
    if (level !== existing.level) plan.retag.push({ entry: existing, level });
  }
  return plan;
}

// src/core/store/needsEnrich.ts
function entriesMissingDefinition(entries) {
  return entries.filter((e) => {
    var _a, _b;
    return !e.deletedAt && !((_a = e.definition) == null ? void 0 : _a.trim()) && !((_b = e.definitionZh) == null ? void 0 : _b.trim());
  });
}

// src/platform/ObsidianVault.ts
var import_obsidian42 = require("obsidian");
var Unchanged = class {
  constructor(text) {
    this.text = text;
  }
};
var ObsidianVault = class {
  constructor(app) {
    this.app = app;
    // ── task I ────────────────────────────────────────────────────────────
    // Index of managed notes for findManaged, built from the metadata cache
    // on first use and kept current by the events register() subscribes to.
    // Null = not built yet (or dropped by the first "resolved", to rebuild
    // from the complete cache).
    this.managed = null;
    this.watching = false;
    this.cacheResolved = false;
    this.readyWaiters = [];
    // ready() gives up waiting after this long, so a vault where "resolved"
    // never fires (or fired before register) can't hang its callers.
    this.readyTimeoutMs = 1e4;
  }
  // ── shared ────────────────────────────────────────────────────────────
  async read(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian42.TFile ? this.app.vault.cachedRead(file) : null;
  }
  // ── task G ────────────────────────────────────────────────────────────
  // vault.process(file, fn). Rethrow whatever `fn` throws unchanged:
  // ExportService tells another article's .ai.md apart by the error's
  // class. Skip the write when `fn` returns the text unchanged (no mtime
  // bump, no sync churn). Rejects when the file doesn't exist. Needs
  // minAppVersion ≥ 1.1.0 in manifest.json.
  async process(path, fn) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian42.TFile)) throw new Error(`File not found: ${path}`);
    try {
      return await this.app.vault.process(file, (text) => {
        const next = fn(text);
        if (next === text) throw new Unchanged(text);
        return next;
      });
    } catch (e) {
      if (e instanceof Unchanged) return e.text;
      throw e;
    }
  }
  // Any markdown file whose metadataCache blocks already have this id.
  // metadataCache keys block ids in lower case.
  blockIdTaken(id) {
    const key3 = id.toLowerCase();
    const { metadataCache, vault } = this.app;
    return vault.getMarkdownFiles().some((f) => {
      var _a;
      const blocks = (_a = metadataCache.getFileCache(f)) == null ? void 0 : _a.blocks;
      return !!blocks && (Object.prototype.hasOwnProperty.call(blocks, key3) || Object.prototype.hasOwnProperty.call(blocks, id));
    });
  }
  // Subscribes the managed-note index to the vault and metadata cache.
  // Call once from Plugin.onload (before the layout is ready, so the first
  // "resolved" isn't missed): `vault.register(this)`. The plugin
  // unregisters the events on unload.
  register(component) {
    if (this.watching) return;
    this.watching = true;
    const { vault, metadataCache, workspace } = this.app;
    component.registerEvent(
      metadataCache.on("changed", (file, _data, cache) => {
        var _a;
        return (_a = this.managed) == null ? void 0 : _a.set(file.path, managedRefOf(cache == null ? void 0 : cache.frontmatter));
      })
    );
    component.registerEvent(metadataCache.on("deleted", (file) => {
      var _a;
      return (_a = this.managed) == null ? void 0 : _a.delete(file.path);
    }));
    component.registerEvent(metadataCache.on("resolved", () => this.onResolved()));
    component.registerEvent(vault.on("rename", (file, oldPath) => this.onRenamed(file, oldPath)));
    component.registerEvent(
      vault.on("delete", (file) => {
        var _a, _b;
        if (file instanceof import_obsidian42.TFolder) (_a = this.managed) == null ? void 0 : _a.deleteUnder(file.path);
        else (_b = this.managed) == null ? void 0 : _b.delete(file.path);
      })
    );
    if (workspace.layoutReady) this.markResolved();
  }
  exists(path) {
    return this.app.vault.getAbstractFileByPath((0, import_obsidian42.normalizePath)(path)) !== null;
  }
  // Creates missing parent folders; rejects when the file already exists.
  async create(path, content) {
    var _a;
    const target = (0, import_obsidian42.normalizePath)(path);
    if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`File already exists: ${target}`);
    await this.ensureFolder(parentOf(target));
    const file = await this.app.vault.create(target, content);
    (_a = this.managed) == null ? void 0 : _a.set(file.path, managedRefOf(parseFrontmatter(content)));
  }
  // fileManager.renameFile, so links to the file follow it. Creates the
  // target's missing folders; rejects when the source is missing or the
  // target exists (never overwrites).
  async rename(from, to) {
    var _a;
    const source = (0, import_obsidian42.normalizePath)(from);
    const target = (0, import_obsidian42.normalizePath)(to);
    const file = this.app.vault.getAbstractFileByPath(source);
    if (!file) throw new Error(`File not found: ${source}`);
    if (source === target) return;
    if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`File already exists: ${target}`);
    await this.ensureFolder(parentOf(target));
    await this.app.fileManager.renameFile(file, target);
    (_a = this.managed) == null ? void 0 : _a.move(source, target);
  }
  // Frontmatter `vocab-tracker: <kind>` + `vocab-tracker-id: <id>`, the id
  // compared as a string (also article paths for "ai-note"). Keep an index
  // updated from metadataCache changed / rename / delete rather than
  // scanning every file per call.
  findManaged(kind, id) {
    var _a;
    if (!this.watching) return this.scan().find(kind, id);
    (_a = this.managed) != null ? _a : this.managed = this.scan();
    return this.managed.find(kind, id);
  }
  // Resolves once metadataCache has finished its initial index, so
  // findManaged doesn't miss a moved word page or .ai.md at startup.
  ready() {
    if (this.cacheResolved || cacheLooksResolved(this.app)) {
      this.cacheResolved = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ref) this.app.metadataCache.offref(ref);
        resolve();
      };
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== finish);
        finish();
      }, this.readyTimeoutMs);
      this.readyWaiters.push(finish);
      const ref = this.watching ? null : this.app.metadataCache.on("resolved", () => this.onResolved());
    });
  }
  onResolved() {
    if (this.cacheResolved) return;
    this.managed = null;
    this.markResolved();
  }
  markResolved() {
    this.cacheResolved = true;
    for (const finish of this.readyWaiters.splice(0)) finish();
  }
  onRenamed(file, oldPath) {
    var _a;
    const index = this.managed;
    if (!index) return;
    if (file instanceof import_obsidian42.TFolder) {
      index.moveUnder(oldPath, file.path);
    } else if (index.has(oldPath)) {
      index.move(oldPath, file.path);
    } else if (file instanceof import_obsidian42.TFile) {
      index.set(file.path, managedRefOf((_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter));
    }
  }
  scan() {
    var _a;
    const index = new ManagedIndex();
    const { vault, metadataCache } = this.app;
    for (const file of vault.getMarkdownFiles()) {
      index.set(file.path, managedRefOf((_a = metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter));
    }
    return index;
  }
  // Creates `dir` and its missing parents, one level at a time. A folder
  // that appears meanwhile (another call, sync) is fine; a file in the
  // way is an error.
  async ensureFolder(dir) {
    if (!dir) return;
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof import_obsidian42.TFolder) continue;
      if (existing) throw new Error(`Not a folder: ${path}`);
      try {
        await this.app.vault.createFolder(path);
      } catch (e) {
        if (!(this.app.vault.getAbstractFileByPath(path) instanceof import_obsidian42.TFolder)) throw e;
      }
    }
  }
};
var KIND_KEY = "vocab-tracker";
var ID_KEY = "vocab-tracker-id";
function scalar(v) {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function managedRefOf(frontmatter2) {
  if (!frontmatter2 || typeof frontmatter2 !== "object") return null;
  const fm = frontmatter2;
  const kind = scalar(fm[KIND_KEY]);
  const id = scalar(fm[ID_KEY]);
  return kind && id ? { kind, id } : null;
}
function parseFrontmatter(text) {
  const m = /^\ufeff?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!kv) continue;
    let value = kv[2];
    if (value.startsWith('"')) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "string") value = parsed;
      } catch (e) {
      }
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    out[kv[1]] = value;
  }
  return out;
}
var refKey = (kind, id) => `${kind}
${id}`;
var ManagedIndex = class {
  constructor() {
    this.byPath = /* @__PURE__ */ new Map();
    this.byRef = /* @__PURE__ */ new Map();
  }
  has(path) {
    return this.byPath.has(path);
  }
  set(path, ref) {
    this.delete(path);
    if (!ref) return;
    const key3 = refKey(ref.kind, ref.id);
    this.byPath.set(path, key3);
    let paths = this.byRef.get(key3);
    if (!paths) this.byRef.set(key3, paths = /* @__PURE__ */ new Set());
    paths.add(path);
  }
  delete(path) {
    const key3 = this.byPath.get(path);
    if (key3 === void 0) return;
    this.byPath.delete(path);
    const paths = this.byRef.get(key3);
    paths == null ? void 0 : paths.delete(path);
    if (paths && !paths.size) this.byRef.delete(key3);
  }
  move(from, to) {
    const key3 = this.byPath.get(from);
    if (key3 === void 0) return;
    const [kind, id] = splitKey(key3);
    this.delete(from);
    this.set(to, { kind, id });
  }
  moveUnder(fromDir, toDir) {
    for (const path of [...this.byPath.keys()]) {
      if (path.startsWith(`${fromDir}/`)) this.move(path, toDir + path.slice(fromDir.length));
    }
  }
  deleteUnder(dir) {
    for (const path of [...this.byPath.keys()]) {
      if (path.startsWith(`${dir}/`)) this.delete(path);
    }
  }
  // With several (a sync conflict copy), the same one every time.
  find(kind, id) {
    const paths = this.byRef.get(refKey(kind, id));
    if (!(paths == null ? void 0 : paths.size)) return null;
    return [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))[0];
  }
};
function splitKey(key3) {
  const i = key3.indexOf("\n");
  return [key3.slice(0, i), key3.slice(i + 1)];
}
function parentOf(path) {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}
function cacheLooksResolved(app) {
  return app.metadataCache.resolved === true;
}

// src/services/export/labels.ts
var KEYS = [
  "families",
  "familiesEmpty",
  "usage",
  "usageEmpty",
  "usageRelated",
  "trivia",
  "triviaEmpty",
  "triviaMentionedIn",
  "discussion",
  "discussionEmpty",
  "userNotesHint",
  "paragraphsEmpty",
  "paragraphOrphaned",
  "wordsLearned",
  "wordsEmpty",
  "wordQuestions",
  "favorites",
  "favoritesEmpty",
  "aborted",
  "usageSaved",
  "usageGenerated"
];
function exportLabels() {
  const labels = {};
  for (const key3 of KEYS) labels[key3] = t(`export.${key3}`);
  return labels;
}

// src/services/export/managedBlock.ts
var NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
function checkName(name) {
  if (!NAME_RE.test(name)) throw new Error(`Invalid managed block name: ${JSON.stringify(name)}`);
}
function beginMarker(name) {
  checkName(name);
  return `%% vt:begin ${name} %%`;
}
function endMarker(name) {
  checkName(name);
  return `%% vt:end ${name} %%`;
}
var MARKER_LINE = /^[ \t]*%%[ \t]*vt:(begin|end)[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*%%[ \t]*$/;
function lines2(text) {
  const out = [];
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf("\n", start);
    if (nl < 0) {
      out.push({ start, textEnd: text.length, end: text.length, eol: "" });
      break;
    }
    const cr = nl > start && text[nl - 1] === "\r";
    out.push({ start, textEnd: cr ? nl - 1 : nl, end: nl + 1, eol: cr ? "\r\n" : "\n" });
    start = nl + 1;
  }
  return out;
}
function markerOf(text, line) {
  const m = MARKER_LINE.exec(text.slice(line.start, line.textEnd).replace(/^\uFEFF/, ""));
  return m ? { kind: m[1], name: m[2] } : null;
}
function findManagedBlock(text, name) {
  checkName(name);
  const all = lines2(text);
  let open = null;
  for (const line of all) {
    const marker = markerOf(text, line);
    if (!marker || marker.name !== name) continue;
    if (marker.kind === "begin") {
      open = line;
    } else if (open) {
      return { contentStart: open.end, contentEnd: line.start, eol: open.eol };
    }
  }
  return null;
}
function bodyLines(body) {
  if (body === "") return [];
  return body.replace(/\r\n?/g, "\n").split("\n").map((l4) => MARKER_LINE.test(l4) ? l4.replace("%%", "\\%%") : l4);
}
function detectEol(text) {
  const nl = text.indexOf("\n");
  return nl > 0 && text[nl - 1] === "\r" ? "\r\n" : "\n";
}
function renderSection(section3, eol = "\n") {
  return [beginMarker(section3.name), ...bodyLines(section3.body), endMarker(section3.name)].join(eol);
}
function replaceManagedBlock(text, section3) {
  const range = findManagedBlock(text, section3.name);
  if (range) {
    const body = bodyLines(section3.body);
    const content = body.length ? body.join(range.eol) + range.eol : "";
    if (text.slice(range.contentStart, range.contentEnd) === content) return text;
    return text.slice(0, range.contentStart) + content + text.slice(range.contentEnd);
  }
  return appendSection(text, section3);
}
function appendSection(text, section3) {
  const eol = detectEol(text);
  let sep = "";
  if (text !== "") {
    if (!text.endsWith("\n")) sep = eol + eol;
    else if (!/(\r?\n)[ \t]*\r?\n$/.test(text)) sep = eol;
  }
  return text + sep + renderSection(section3, eol) + eol;
}
function applyManagedBlocks(text, sections) {
  let out = text;
  for (const section3 of sections) out = replaceManagedBlock(out, section3);
  return out;
}
function buildManagedFile(head, sections, tail = "") {
  const parts = [head.replace(/\n+$/, ""), ...sections.map((s) => renderSection(s)), tail.replace(/\n+$/, "")];
  return parts.filter((p) => p !== "").join("\n\n") + "\n";
}

// src/services/export/ports.ts
var DEFAULT_EXPORT_FOLDERS = {
  words: "vocab-list/\u55AE\u5B57",
  threads: "vocab-list/\u8A0E\u8AD6\u4E32",
  triviaFile: "vocab-list/\u51B7\u77E5\u8B58.md"
};

// src/services/export/renderers/common.ts
function roundsOf(turns) {
  const out = [];
  let pending = null;
  for (const turn of turns) {
    if (turn.deletedAt) continue;
    if (turn.role === "user") {
      pending = turn;
      continue;
    }
    if (pending && turn.content.trim() && (turn.status === "done" || turn.status === "aborted")) {
      out.push({ question: pending, answer: turn });
    }
    pending = null;
  }
  return out;
}
function threadRounds(thread) {
  return thread && !thread.deletedAt ? roundsOf(liveTurns(thread)) : [];
}
var FENCE = /^[ \t]*(`{3,}|~{3,})/;
function balanceFences(markdown) {
  let open = null;
  for (const line of markdown.split("\n")) {
    const m = FENCE.exec(line);
    if (!m) continue;
    const fence = m[1];
    if (open === null) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length && line.trim() === fence) open = null;
  }
  return open === null ? markdown : `${markdown.replace(/\n*$/, "")}
${open}`;
}
function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, "\n");
}
function blockquote(text) {
  return normalizeNewlines(text.trim()).split("\n").map((l4) => l4.trim() ? `> ${l4}` : ">").join("\n");
}
function oneLine(text) {
  return normalizeNewlines(text).replace(/\s*\n\s*/g, " ").trim();
}
function inlineCode(text) {
  const s = oneLine(text);
  return s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``;
}
function italic(text) {
  return `*${text}*`;
}
function wordRef(ctx, word, entryId) {
  const target = ctx.pageLink(word, entryId);
  return target ? `[[${target}|${word}]]` : word;
}
function renderRound(round, ctx, heading) {
  var _a;
  const { question, answer } = round;
  const label = question.taskId ? ctx.taskLabel(question.taskId) : void 0;
  const title = [ctx.formatDate(question.at), label].filter(Boolean).join(" \xB7 ");
  const quote = [];
  if ((_a = question.selection) == null ? void 0 : _a.trim()) quote.push(`\u300C${oneLine(question.selection)}\u300D`);
  quote.push(`**Q** ${normalizeNewlines(question.content).trim()}`);
  const parts = [`${heading} ${title}`, blockquote(quote.join("\n")), "", balanceFences(normalizeNewlines(answer.content).trim())];
  if (answer.status === "aborted") parts.push("", italic(ctx.labels.aborted));
  return parts.join("\n");
}
function renderRounds(rounds, ctx, heading) {
  return rounds.map((r) => renderRound(r, ctx, heading)).join("\n\n");
}
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m);
}
var YAML_KEYWORDS = /^(true|false|yes|no|on|off|null|~)$/i;
function yamlValue(v) {
  return /^[a-z][\w-]*$/i.test(v) && !YAML_KEYWORDS.test(v) ? v : JSON.stringify(v);
}
function frontmatter(fields) {
  return ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${yamlValue(v)}`), "---"].join("\n");
}

// src/services/export/frontmatter.ts
var BOM = "\uFEFF";
function bomLength(text) {
  return text.startsWith(BOM) ? BOM.length : 0;
}
function locate(text) {
  const bom = bomLength(text);
  const open = /^---[ \t]*\r?\n/.exec(text.slice(bom));
  if (!open) return null;
  const close = /^(?:---|\.\.\.)[ \t]*$/gm;
  close.lastIndex = bom + open[0].length;
  const m = close.exec(text);
  return m ? { start: bom + open[0].length, end: m.index } : null;
}
var LINE = /^([\w-]+):[ \t]*(.*?)[ \t]*$/;
function unquote2(raw) {
  if (raw.startsWith('"')) {
    try {
      const v = JSON.parse(raw);
      if (typeof v === "string") return v;
    } catch (e) {
    }
    return raw;
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}
function lines3(text) {
  return text.split(/(?<=\n)/).filter((l4) => l4 !== "");
}
function readFrontmatter(text) {
  const at = locate(text);
  if (!at) return null;
  const out = {};
  for (const line of lines3(text.slice(at.start, at.end))) {
    const m = LINE.exec(line.replace(/\r?\n$/, ""));
    if (m) out[m[1]] = unquote2(m[2]);
  }
  return out;
}
function editFrontmatter(text, fields, opts = {}) {
  var _a, _b, _c, _d, _e;
  const at = locate(text);
  if (!at) {
    if (!opts.add || !opts.create) return text;
    const eol2 = (_b = (_a = /\r\n/.exec(text)) == null ? void 0 : _a[0]) != null ? _b : "\n";
    const head = ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${yamlValue(v)}`), "---", ""].join(eol2);
    const bom = bomLength(text);
    return text.slice(0, bom) + head + text.slice(bom);
  }
  const body = lines3(text.slice(at.start, at.end));
  const eol = /\r\n/.test(text.slice(0, at.start)) ? "\r\n" : "\n";
  const done = /* @__PURE__ */ new Set();
  const out = [];
  let insertAt = -1;
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const key3 = (_c = LINE.exec(line.replace(/\r?\n$/, ""))) == null ? void 0 : _c[1];
    if (key3 !== void 0 && key3 in fields && !done.has(key3)) {
      done.add(key3);
      out.push(`${key3}: ${yamlValue(fields[key3])}${(_e = (_d = /\r?\n$/.exec(line)) == null ? void 0 : _d[0]) != null ? _e : eol}`);
      while (i + 1 < body.length && /^([ \t]|- )/.test(body[i + 1])) i++;
    } else {
      out.push(line);
    }
    if (key3 !== void 0 && key3 === opts.after) insertAt = out.length;
  }
  if (opts.add) {
    const added = Object.keys(fields).filter((k) => !done.has(k)).map((k) => `${k}: ${yamlValue(fields[k])}${eol}`);
    out.splice(insertAt < 0 ? out.length : insertAt, 0, ...added);
  }
  return text.slice(0, at.start) + out.join("") + text.slice(at.end);
}

// src/services/export/renderers/aiNote.ts
var AI_NOTE_KIND = "ai-note";
var HEADING_PREVIEW = 40;
function preview(text) {
  const line = oneLine(text);
  return line.length > HEADING_PREVIEW ? `${line.slice(0, HEADING_PREVIEW).trimEnd()}\u2026` : line;
}
function byOrder(a, b) {
  var _a, _b;
  if (a.index !== b.index) {
    if (a.index === null) return 1;
    if (b.index === null) return -1;
    return a.index - b.index;
  }
  return ((_a = a.createdAt) != null ? _a : "").localeCompare((_b = b.createdAt) != null ? _b : "");
}
function renderParagraph(p, article, ctx) {
  const rounds = roundsOf(p.turns);
  if (!rounds.length) return null;
  const heading = p.index === null ? `## ${ctx.labels.paragraphOrphaned}` : `## \xB6${p.index + 1} ${preview(p.text)}`;
  const quote = p.index !== null && p.blockId ? `![[${article}#^${p.blockId}]]` : blockquote(p.text);
  return [heading, "", quote, "", renderRounds(rounds, ctx, "###")].join("\n");
}
function renderParagraphs(input, ctx) {
  const article = linkTarget(input.articlePath);
  const parts = [...input.paragraphs].sort(byOrder).map((p) => renderParagraph(p, article, ctx)).filter((p) => p !== null);
  return parts.length ? parts.join("\n\n") : italic(ctx.labels.paragraphsEmpty);
}
function renderWords(input, ctx) {
  const list = input.words.map((w) => {
    const ref = wordRef(ctx, w.word, w.entryId);
    return w.questions > 0 ? `- ${ref} \xB7 ${fill(ctx.labels.wordQuestions, { n: w.questions })}` : `- ${ref}`;
  });
  return [`## ${ctx.labels.wordsLearned}`, "", list.length ? list.join("\n") : italic(ctx.labels.wordsEmpty)].join("\n");
}
function hasAiNoteContent(input) {
  return input.paragraphs.some((p) => roundsOf(p.turns).length > 0);
}
function renderAiNoteSections(input, ctx) {
  return [
    { name: "paragraphs", body: renderParagraphs(input, ctx) },
    { name: "words", body: renderWords(input, ctx) }
  ];
}
function renderAiNoteFile(input, ctx) {
  const head = frontmatter({
    "vocab-tracker": AI_NOTE_KIND,
    "vocab-tracker-id": input.articlePath,
    source: `[[${linkTarget(input.articlePath)}]]`
  });
  return buildManagedFile(head, renderAiNoteSections(input, ctx), `%% ${ctx.labels.userNotesHint} %%
`);
}
function sourceTarget(source) {
  const m = /^\[\[([^\]|#]*)/.exec(source.trim());
  return (m ? m[1] : source).trim().replace(/\.md$/i, "");
}
function aiNoteOwner(text, articlePath, renamedTo) {
  const fm = readFrontmatter(text);
  if (!fm) return "unclaimed";
  const kind = fm["vocab-tracker"];
  if (kind !== void 0 && kind !== AI_NOTE_KIND) return "other";
  const paths = renamedTo === void 0 ? [articlePath] : [articlePath, renamedTo];
  const id = fm["vocab-tracker-id"];
  if (id) return paths.includes(id) ? "id" : "other";
  if (!fm.source) return "unclaimed";
  const target = sourceTarget(fm.source);
  if (paths.some((p) => linkTarget(p) === target)) return "source";
  if (renamedTo !== void 0 && target === noteBasename(renamedTo)) return "source";
  return "other";
}
function claimAiNote(text, articlePath) {
  var _a;
  const fields = {};
  if (((_a = readFrontmatter(text)) == null ? void 0 : _a["vocab-tracker"]) === void 0) fields["vocab-tracker"] = AI_NOTE_KIND;
  fields["vocab-tracker-id"] = articlePath;
  return editFrontmatter(text, fields, { add: true, after: "vocab-tracker", create: true });
}
function retargetAiNote(text, newPath) {
  return editFrontmatter(claimAiNote(text, newPath), { source: `[[${linkTarget(newPath)}]]` });
}

// src/services/export/renderers/triviaFavorites.ts
function renderItem(item, ctx) {
  const meta = [];
  const subject = ctx.entryWord(item.entryId);
  if (subject) meta.push(wordRef(ctx, subject, item.entryId));
  if (item.createdAt) meta.push(ctx.formatDate(item.createdAt));
  const lines4 = [`### ${oneLine(item.title)}`, "", normalizeNewlines(item.body).trim()];
  if (meta.length) lines4.push("", italic(meta.join(" \xB7 ")));
  return lines4.join("\n");
}
function renderTriviaFavoritesSections(input, ctx) {
  const items = input.items.filter((t2) => !t2.deletedAt).sort((a, b) => {
    var _a, _b;
    return ((_a = b.createdAt) != null ? _a : "").localeCompare((_b = a.createdAt) != null ? _b : "");
  });
  const body = items.length ? items.map((t2) => renderItem(t2, ctx)).join("\n\n") : italic(ctx.labels.favoritesEmpty);
  return [{ name: "trivia-favorites", body: `## ${ctx.labels.favorites}

${body}` }];
}
function renderTriviaFavoritesFile(input, ctx) {
  return buildManagedFile("```vocab-trivia\n```", renderTriviaFavoritesSections(input, ctx));
}

// src/services/export/renderers/wordPage.ts
var WORD_PAGE_KIND = "word";
function familiesOf(families, entry) {
  const word = entry.word.toLowerCase();
  return families.filter(
    (f) => !f.deletedAt && f.groups.some((g) => g.members.some((m) => m.entryId === entry.id || !m.entryId && m.word.toLowerCase() === word))
  );
}
function liveTrivia(items) {
  return items.filter((t2) => !t2.deletedAt).sort((a, b) => {
    var _a, _b;
    return ((_a = b.createdAt) != null ? _a : "").localeCompare((_b = a.createdAt) != null ? _b : "");
  });
}
function triviaAbout(items, entryId) {
  return liveTrivia(items).filter((t2) => t2.entryId === entryId);
}
function mentionsEntry(item, entry) {
  const word = entry.word.toLowerCase();
  return item.entryId !== entry.id && item.mentions.some((m) => m === entry.id || m.toLowerCase() === word);
}
function triviaMentioning(items, entry) {
  return liveTrivia(items).filter((t2) => mentionsEntry(t2, entry));
}
function verbFavoriteOf(input) {
  var _a;
  return (_a = input.verbFavorites) == null ? void 0 : _a.find((v) => v.entryId === input.entry.id && !v.deletedAt);
}
function hasWordPageContent(input) {
  return threadRounds(input.thread).length > 0 || triviaAbout(input.trivia, input.entry.id).length > 0 || !!verbFavoriteOf(input);
}
function section2(name, heading, body) {
  return { name, body: `## ${heading}

${body}` };
}
function renderFamilies2(input, ctx) {
  const families = familiesOf(input.families, input.entry);
  if (!families.length) return italic(ctx.labels.familiesEmpty);
  const self = input.entry.word.toLowerCase();
  return families.map((f) => {
    const heading = `### ${[...new Set([f.topic, f.label].map(oneLine).filter(Boolean))].join(" \xB7 ")}`;
    const groups = f.groups.filter((g) => g.members.length).map((g) => {
      const members = g.members.map((m) => {
        const isSelf = m.entryId === input.entry.id || m.word.toLowerCase() === self;
        const word = isSelf ? `**${m.word}**` : wordRef(ctx, m.word, m.entryId);
        return [word, isSelf ? "" : oneLine(m.zh)].filter(Boolean).join(" ");
      }).join(" \xB7 ");
      return g.label.trim() ? `- **${oneLine(g.label)}**\uFF1A${members}` : `- ${members}`;
    });
    return [heading, "", ...groups].join("\n");
  }).join("\n\n");
}
function usageMeta2(usage, saved, ctx) {
  const parts = [];
  if (saved == null ? void 0 : saved.createdAt) parts.push(fill(ctx.labels.usageSaved, { date: ctx.formatDate(saved.createdAt) }));
  if (usage.generatedAt) parts.push(fill(ctx.labels.usageGenerated, { date: ctx.formatDate(usage.generatedAt) }));
  return parts.length ? italic(parts.join(" \xB7 ")) : null;
}
function renderUsage(input, ctx) {
  const usage = input.usage;
  if (!usage || !usage.patterns.length && !usage.related.length) return italic(ctx.labels.usageEmpty);
  const lines4 = usage.patterns.map((p) => {
    const item = [`- ${inlineCode(p.pattern)}`, oneLine(p.meaningZh)].filter(Boolean).join(" ");
    return p.example.trim() ? `${item}
  - ${italic(oneLine(p.example))}` : item;
  });
  if (usage.related.length) {
    if (lines4.length) lines4.push("");
    const related = usage.related.map((r) => r.zh.trim() ? `${oneLine(r.phrase)}\uFF08${oneLine(r.zh)}\uFF09` : oneLine(r.phrase));
    lines4.push(`**${ctx.labels.usageRelated}**\uFF1A${related.join(" \xB7 ")}`);
  }
  const meta = usageMeta2(usage, verbFavoriteOf(input), ctx);
  if (meta) lines4.push("", meta);
  return lines4.join("\n");
}
function renderTrivia2(input, ctx) {
  const own = triviaAbout(input.trivia, input.entry.id);
  const mentioned = triviaMentioning(input.trivia, input.entry);
  const parts = [];
  if (!own.length) parts.push(italic(ctx.labels.triviaEmpty));
  for (const item of own) {
    const lines4 = [`### ${oneLine(item.title)}`, "", normalizeNewlines(item.body).trim()];
    if (item.createdAt) lines4.push("", italic(ctx.formatDate(item.createdAt)));
    parts.push(lines4.join("\n"));
  }
  if (mentioned.length) {
    const list = mentioned.map((t2) => {
      const subject = ctx.entryWord(t2.entryId);
      return subject ? `- ${oneLine(t2.title)}\uFF08${wordRef(ctx, subject, t2.entryId)}\uFF09` : `- ${oneLine(t2.title)}`;
    });
    parts.push([`**${ctx.labels.triviaMentionedIn}**`, "", ...list].join("\n"));
  }
  return parts.join("\n\n");
}
function renderDiscussion(input, ctx) {
  const rounds = threadRounds(input.thread);
  return rounds.length ? renderRounds(rounds, ctx, "###") : italic(ctx.labels.discussionEmpty);
}
function renderWordPageSections(input, ctx) {
  return [
    section2("families", ctx.labels.families, renderFamilies2(input, ctx)),
    section2("usage", ctx.labels.usage, renderUsage(input, ctx)),
    section2("trivia", ctx.labels.trivia, renderTrivia2(input, ctx)),
    section2("discussion", ctx.labels.discussion, renderDiscussion(input, ctx))
  ];
}
function renderWordPageFile(input, ctx) {
  const head = [
    frontmatter({ "vocab-tracker": WORD_PAGE_KIND, "vocab-tracker-id": input.entry.id }),
    "```vocab-word",
    "```"
  ].join("\n");
  return buildManagedFile(head, renderWordPageSections(input, ctx), `%% ${ctx.labels.userNotesHint} %%
`);
}

// src/services/export/ExportService.ts
var EXPORT_DEBOUNCE_MS = 1e3;
var CREATE_RANK = { never: 0, ifContent: 1, always: 2 };
var AI_NOTE_EXT = ".ai.md";
var MAX_NOTE_NAMES = 20;
var FOLDER_LABEL_BYTES = 60;
var NotThisArticle = class extends Error {
};
function shortDate4(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad3 = (n) => String(n).padStart(2, "0");
  return `${pad3(d.getMonth() + 1)}/${pad3(d.getDate())}`;
}
function jobKey(job) {
  switch (job.kind) {
    case "word":
      return `word:${job.entryId}`;
    case "note":
      return `note:${job.articlePath}`;
    case "trivia":
      return "trivia";
  }
}
function mergeJobs(a, b) {
  if (a.kind === "word" && b.kind === "word" || a.kind === "note" && b.kind === "note") {
    return CREATE_RANK[a.create] >= CREATE_RANK[b.create] ? a : { ...a, create: b.create };
  }
  return a;
}
var ExportService = class {
  constructor(deps) {
    this.deps = deps;
    this.timers = /* @__PURE__ */ new Map();
    // File path → the latest write queued for it (each waits for the last).
    // An article's note queues under its first name (noteQueue).
    this.queues = /* @__PURE__ */ new Map();
    // Article path → its note, as last found or created.
    this.notePaths = /* @__PURE__ */ new Map();
    // Family id → its learned members as last announced (familyChanged).
    this.familyMemberIds = /* @__PURE__ */ new Map();
    this.subscriptions = [];
    this.disposed = false;
    var _a;
    this.debounceMs = (_a = deps.debounceMs) != null ? _a : EXPORT_DEBOUNCE_MS;
  }
  // ── Paths ────────────────────────────────────────────────────────────
  folders() {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.deps).folders) == null ? void 0 : _b.call(_a)) != null ? _c : DEFAULT_EXPORT_FOLDERS;
  }
  // Where a word's page goes when it doesn't exist yet.
  defaultWordPagePath(word) {
    return joinPath(this.folders().words, `${wordSlug(word)}.md`);
  }
  // The word's page: found by its frontmatter id first (survives the user
  // renaming or moving it), else the default path.
  wordPagePath(entryId, word) {
    var _a;
    return (_a = this.deps.vault.findManaged(WORD_PAGE_KIND, entryId)) != null ? _a : this.defaultWordPagePath(word);
  }
  // The names an article's note can have, in the order they're tried:
  // "Notes", "Notes (b)", "Notes (b) 2"… for "a/b/Notes.md" ("Notes 2"…
  // for an article at the vault root). The name is shortened, never the
  // suffix, so long names still differ.
  aiNoteNames(articlePath) {
    const folder = this.folders().threads;
    const budget = MAX_NAME_BYTES - utf8Bytes2(AI_NOTE_EXT);
    const base = noteBasename(articlePath);
    const name = (suffix) => joinPath(folder, `${slugify(base, "untitled", budget - utf8Bytes2(suffix))}${suffix}${AI_NOTE_EXT}`);
    const dir = articlePath.slice(0, Math.max(0, articlePath.lastIndexOf("/")));
    const label = slugify(dir.slice(dir.lastIndexOf("/") + 1), "", FOLDER_LABEL_BYTES);
    const tag = label ? ` (${label})` : "";
    const names = [name("")];
    if (tag) names.push(name(tag));
    for (let n = 2; names.length < MAX_NOTE_NAMES; n++) names.push(name(`${tag} ${n}`));
    return names;
  }
  // The article's note, for opening it: a file that exists and belongs to
  // this article, or null when it has none. Waits for writes to it that
  // are in progress. Never creates a note; an older note without an id,
  // found by its name, gets its id (claimAiNote) as on the next export.
  async aiNotePath(articlePath) {
    const { vault } = this.deps;
    const managed = vault.findManaged(AI_NOTE_KIND, articlePath);
    if (managed) return managed;
    const known = this.notePaths.get(articlePath);
    if (known && vault.exists(known)) return known;
    let path = null;
    await this.enqueue(this.noteQueue(articlePath), async () => {
      path = await this.resolveNote(articlePath, (text, owner) => owner === "id" ? text : claimAiNote(text, articlePath), null);
    });
    return path;
  }
  // Writes for one article's note wait in the queue of its first name, so
  // same-name articles (which compete for it) also take turns.
  noteQueue(articlePath) {
    return this.aiNoteNames(articlePath)[0];
  }
  // ── Announcing changes ───────────────────────────────────────────────
  // A word's page content changed (its thread, families, usage, trivia).
  // `create: "ifContent"` lets this change create the page when it now has
  // a discussion or saved trivia; the default only updates an existing page.
  wordChanged(entryId, create = "never") {
    this.schedule({ kind: "word", entryId, create });
  }
  articleChanged(articlePath, create = "ifContent") {
    this.schedule({ kind: "note", articlePath, create });
  }
  triviaChanged() {
    this.schedule({ kind: "trivia" });
  }
  threadChanged(thread) {
    var _a, _b;
    const anchor = thread.anchor;
    if (anchor.kind === "paragraph") {
      this.articleChanged(anchor.path);
    } else if (anchor.kind === "word") {
      this.wordChanged(anchor.entryId, "ifContent");
      const source = (_b = (_a = this.deps.data.entry(anchor.entryId)) == null ? void 0 : _a.source) == null ? void 0 : _b.path;
      if (source) this.articleChanged(source, "never");
    }
  }
  // Every word in the family (learned members) shows it on its page — and
  // so did the words it had last time: a family 重新分群 renewed under its
  // id may have dropped some, and their pages must lose it.
  familyChanged(family) {
    const now = /* @__PURE__ */ new Set();
    for (const group of family.groups) {
      for (const m of group.members) if (m.entryId) now.add(m.entryId);
    }
    const before = this.familyMemberIds.get(family.id);
    for (const id of /* @__PURE__ */ new Set([...before != null ? before : [], ...now])) this.wordChanged(id);
    if (family.deletedAt) this.familyMemberIds.delete(family.id);
    else this.familyMemberIds.set(family.id, now);
  }
  // A trivia item was saved, edited or unsaved.
  triviaItemChanged(item) {
    this.triviaChanged();
    this.wordChanged(item.entryId, "ifContent");
    for (const entry of this.deps.data.entries()) {
      if (mentionsEntry(item, entry)) this.wordChanged(entry.id);
    }
  }
  usageChanged(entryId) {
    this.wordChanged(entryId);
  }
  // A verb's usage was saved (「寫入單字頁」) or unsaved: saving creates
  // the word page when it has none yet.
  verbFavoriteChanged(fav) {
    this.wordChanged(fav.entryId, fav.deletedAt ? "never" : "ifContent");
  }
  // ── Event wiring ─────────────────────────────────────────────────────
  watchThreads(source) {
    this.track(source.on("thread:upsert", (thread) => this.threadChanged(thread)));
  }
  // LearnStore: families, saved trivia and saved verb usages (deletes arrive as upserts
  // carrying deletedAt). A sync merge ("learn:reloaded") isn't followed:
  // the device that made the change already exported it, and the files
  // sync on their own.
  watchLearn(source) {
    this.track(source.on("family:upsert", (family) => this.familyChanged(family)));
    this.track(source.on("trivia:upsert", (item) => this.triviaItemChanged(item)));
    this.track(source.on("verbFavorite:upsert", (fav) => this.verbFavoriteChanged(fav)));
  }
  // VerbUsageService: a usage block was (re)generated.
  watchUsage(source) {
    this.track(source.on("verb:usage", ({ entryId }) => this.usageChanged(entryId)));
  }
  // Keeps an unsubscribe function to call on dispose().
  track(unsubscribe) {
    if (this.disposed) unsubscribe();
    else this.subscriptions.push(unsubscribe);
  }
  // ── Immediate actions ────────────────────────────────────────────────
  // The 「單字頁」 button: creates the page now if needed (no debounce) and
  // returns its path, or null when the entry doesn't exist.
  async openWordPage(entryId) {
    const key3 = jobKey({ kind: "word", entryId, create: "always" });
    const pending = this.timers.get(key3);
    if (pending) {
      clearTimeout(pending.timer);
      this.timers.delete(key3);
    }
    return this.run({ kind: "word", entryId, create: "always" });
  }
  // An article was renamed or moved (規劃書 06 §4.6): its .ai.md's id and
  // source follow, and so does its name unless the user renamed or moved
  // the note themselves. The paragraph anchors are updated by their owner
  // first. An export still pending for the old path moves to the new one
  // with its create mode, so a note due to be created still is.
  async renameArticle(oldPath, newPath) {
    const oldKey = jobKey({ kind: "note", articlePath: oldPath, create: "never" });
    const pending = this.timers.get(oldKey);
    let create = "never";
    if (pending) {
      clearTimeout(pending.timer);
      this.timers.delete(oldKey);
      if (pending.job.kind === "note") create = pending.job.create;
    }
    if (oldPath !== newPath) await this.enqueue(this.noteQueue(oldPath), () => this.moveNote(oldPath, newPath));
    this.articleChanged(newPath, create);
  }
  // Runs every pending export now and waits for all writes to land.
  async flush() {
    for (const [key3, { timer }] of [...this.timers]) {
      clearTimeout(timer);
      this.fire(key3);
    }
    await Promise.all([...this.queues.values()]);
  }
  // Unsubscribes and drops pending (not yet started) exports. Call flush()
  // first to write them instead.
  dispose() {
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
  // ── Scheduling ───────────────────────────────────────────────────────
  schedule(job) {
    if (this.disposed) return;
    if (this.deps.enabled && !this.deps.enabled(job.kind)) return;
    const key3 = jobKey(job);
    const pending = this.timers.get(key3);
    if (pending) clearTimeout(pending.timer);
    const merged = pending ? mergeJobs(pending.job, job) : job;
    this.timers.set(key3, { timer: setTimeout(() => this.fire(key3), this.debounceMs), job: merged });
  }
  fire(key3) {
    const pending = this.timers.get(key3);
    if (!pending) return;
    this.timers.delete(key3);
    void this.run(pending.job);
  }
  enqueue(path, task) {
    var _a;
    const prev = (_a = this.queues.get(path)) != null ? _a : Promise.resolve();
    const next = prev.then(task).catch((e) => console.error(`Vocab Tracker: couldn't export ${path}`, e));
    this.queues.set(path, next);
    void next.then(() => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    });
    return next;
  }
  // Resolves to the file's path once its write has finished (or failed).
  async run(job) {
    switch (job.kind) {
      case "word": {
        const entry = this.deps.data.entry(job.entryId);
        if (!entry) return null;
        const path = this.wordPagePath(entry.id, entry.word);
        await this.enqueue(path, () => this.writeWord(path, job.entryId, job.create));
        return path;
      }
      case "note": {
        let path = null;
        await this.enqueue(this.noteQueue(job.articlePath), async () => {
          path = await this.writeNote(job.articlePath, job.create);
        });
        return path;
      }
      case "trivia": {
        const path = this.folders().triviaFile;
        await this.enqueue(path, () => this.writeTrivia(path));
        return path;
      }
    }
  }
  // ── Writing ──────────────────────────────────────────────────────────
  // Updates the managed sections of an existing file, or creates the file
  // when allowed. If the file appears between the check and the create
  // (another device's sync, the user), falls back to updating it.
  async write(path, sections, create) {
    const { vault } = this.deps;
    if (!vault.exists(path)) {
      if (!create) return;
      try {
        await vault.create(path, create());
        return;
      } catch (e) {
        if (!vault.exists(path)) throw e;
      }
    }
    await vault.process(path, (text) => applyManagedBlocks(text, sections));
  }
  async writeWord(path, entryId, create) {
    var _a, _b, _c, _d;
    await ((_b = (_a = this.deps.data).ready) == null ? void 0 : _b.call(_a));
    const { data } = this.deps;
    const entry = data.entry(entryId);
    if (!entry) return;
    const input = {
      entry,
      families: data.families(),
      usage: data.usage(entryId),
      verbFavorites: (_d = (_c = data.verbFavorites) == null ? void 0 : _c.call(data)) != null ? _d : [],
      trivia: data.trivia(),
      thread: data.wordThread(entryId)
    };
    const ctx = this.context();
    const allowed = create === "always" || create === "ifContent" && hasWordPageContent(input);
    await this.write(path, renderWordPageSections(input, ctx), allowed ? () => renderWordPageFile(input, ctx) : null);
  }
  // Finds the article's note — where it was last seen, by its frontmatter
  // id, then under each of its names in turn — and, once process() has
  // confirmed it really is this article's note, runs `update` on it. The
  // first free name is where a new note goes, if `create` is given.
  // Resolves to the note's path, or null when there's none.
  async resolveNote(articlePath, update, create, renamedTo) {
    const { vault } = this.deps;
    const others = /* @__PURE__ */ new Set();
    const tryUpdate = async (path) => {
      try {
        await vault.process(path, (text) => {
          const owner = aiNoteOwner(text, articlePath, renamedTo);
          if (owner === "other") throw new NotThisArticle();
          return update(text, owner);
        });
      } catch (e) {
        if (!(e instanceof NotThisArticle)) throw e;
        others.add(path);
        return false;
      }
      this.notePaths.set(articlePath, path);
      return true;
    };
    const names = this.aiNoteNames(articlePath);
    const known = [this.notePaths.get(articlePath), vault.findManaged(AI_NOTE_KIND, articlePath)];
    for (const path of [...known, ...names]) {
      if (path && !others.has(path) && vault.exists(path) && await tryUpdate(path)) return path;
    }
    if (!create) return null;
    for (const path of names) {
      if (others.has(path)) continue;
      if (!vault.exists(path)) {
        try {
          await vault.create(path, create());
          this.notePaths.set(articlePath, path);
          return path;
        } catch (e) {
          if (!vault.exists(path)) throw e;
        }
      }
      if (await tryUpdate(path)) return path;
    }
    return null;
  }
  async moveNote(oldPath, newPath) {
    const found = await this.resolveNote(oldPath, (text) => retargetAiNote(text, newPath), null, newPath);
    this.notePaths.delete(oldPath);
    if (!found) return;
    this.notePaths.set(newPath, found);
    if (!this.aiNoteNames(oldPath).includes(found)) return;
    const { vault } = this.deps;
    for (const to of this.aiNoteNames(newPath)) {
      if (to === found) return;
      if (vault.exists(to)) continue;
      await vault.rename(found, to);
      this.notePaths.set(newPath, to);
      return;
    }
  }
  async writeNote(articlePath, create) {
    var _a, _b;
    await ((_b = (_a = this.deps.data).ready) == null ? void 0 : _b.call(_a));
    const { data } = this.deps;
    const paragraphs = (await data.paragraphThreads(articlePath)).flatMap(({ thread, index }) => {
      const anchor = thread.anchor;
      if (thread.deletedAt || anchor.kind !== "paragraph") return [];
      return [{ index, text: anchor.snapshot, blockId: anchor.blockId, turns: thread.turns, createdAt: thread.createdAt }];
    });
    const words = data.entries().filter((e) => {
      var _a2;
      return ((_a2 = e.source) == null ? void 0 : _a2.path) === articlePath;
    }).sort((a, b) => {
      var _a2, _b2, _c, _d;
      return ((_b2 = (_a2 = a.source) == null ? void 0 : _a2.line) != null ? _b2 : 0) - ((_d = (_c = b.source) == null ? void 0 : _c.line) != null ? _d : 0) || a.word.localeCompare(b.word);
    }).map((e) => ({
      word: e.word,
      entryId: e.id,
      // Rounds shown on the word page (failed / streaming ones excluded).
      questions: threadRounds(data.wordThread(e.id)).length
    }));
    const input = { articlePath, paragraphs, words };
    const ctx = this.context();
    const sections = renderAiNoteSections(input, ctx);
    const allowed = create === "always" || create === "ifContent" && hasAiNoteContent(input);
    return this.resolveNote(
      articlePath,
      (text, owner) => {
        const updated = applyManagedBlocks(text, sections);
        return owner === "id" ? updated : claimAiNote(updated, articlePath);
      },
      allowed ? () => renderAiNoteFile(input, ctx) : null
    );
  }
  async writeTrivia(path) {
    var _a, _b;
    await ((_b = (_a = this.deps.data).ready) == null ? void 0 : _b.call(_a));
    const input = { items: this.deps.data.trivia() };
    const ctx = this.context();
    const hasItems = input.items.some((t2) => !t2.deletedAt);
    await this.write(path, renderTriviaFavoritesSections(input, ctx), hasItems ? () => renderTriviaFavoritesFile(input, ctx) : null);
  }
  context() {
    var _a, _b, _c, _d, _e;
    const { data, vault } = this.deps;
    return {
      labels: (_c = (_b = (_a = this.deps).labels) == null ? void 0 : _b.call(_a)) != null ? _c : exportLabels(),
      formatDate: (_d = this.deps.formatDate) != null ? _d : shortDate4,
      taskLabel: (_e = this.deps.taskLabel) != null ? _e : (() => void 0),
      entryWord: (id) => {
        var _a2;
        return (_a2 = data.entry(id)) == null ? void 0 : _a2.word;
      },
      pageLink: (word, entryId) => {
        const found = entryId ? vault.findManaged(WORD_PAGE_KIND, entryId) : null;
        if (found) return linkTarget(found);
        const fallback = this.defaultWordPagePath(word);
        return vault.exists(fallback) ? linkTarget(fallback) : null;
      }
    };
  }
};

// src/services/export/exportData.ts
function paragraphIndexOf(content, anchor) {
  if (content === null) return null;
  const found = resolveIn(content, anchor);
  if (found.status !== "found") return null;
  const n = paragraphNumber(content, found.section.lineStart);
  return n === null ? null : n - 1;
}
function createExportData(src) {
  const entry = (id) => src.entries().find((e) => e.id === id && !e.deletedAt);
  return {
    async ready() {
      await Promise.all([src.threads.ensureLoaded(), src.learn.ensureLoaded()]);
    },
    entry,
    entries: () => src.entries().filter((e) => !e.deletedAt),
    wordThread: (entryId) => src.threads.wordThread(entryId),
    async paragraphThreads(path) {
      const threads = src.threads.paragraphThreads(path).filter((th) => !th.deletedAt && th.anchor.kind === "paragraph");
      if (!threads.length) return [];
      let content;
      try {
        content = await src.notes.read(path);
      } catch (e) {
        content = null;
      }
      return threads.map((thread) => ({ thread, index: paragraphIndexOf(content, thread.anchor) }));
    },
    families: () => src.learn.families().filter((f) => !f.deletedAt),
    usage: (entryId) => {
      var _a;
      return (_a = entry(entryId)) == null ? void 0 : _a.usage;
    },
    trivia: () => src.learn.trivia().filter((t2) => !t2.deletedAt),
    verbFavorites: () => {
      var _a, _b, _c;
      return ((_c = (_b = (_a = src.learn).verbFavorites) == null ? void 0 : _b.call(_a)) != null ? _c : []).filter((v) => !v.deletedAt);
    }
  };
}

// src/services/files/entryFiles.ts
var ENTRY_FILE_KIND = "entry";
var ENTRY_FILES = [
  { id: "flashcards", name: "\u55AE\u5B57\u5361", block: "vocab-flashcards" },
  { id: "families", name: "\u5B57\u65CF\u6A39", block: "vocab-families" },
  { id: "verbs", name: "\u52D5\u8A5E\u7528\u6CD5", block: "vocab-verbs" },
  // The saved list is the exported section under the block, so the block
  // itself doesn't list favorites a second time.
  { id: "trivia", name: "\u51B7\u77E5\u8B58", block: "vocab-trivia", params: "favorites: off" }
];
var ENTRY_FILE_IDS = ENTRY_FILES.map((d) => d.id);
function entryFileDef(id) {
  const def = ENTRY_FILES.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown entry file: ${id}`);
  return def;
}
function entryFilePath(folder, id) {
  return joinPath(folder, `${entryFileDef(id).name}.md`);
}
function emptyContext() {
  return {
    labels: exportLabels(),
    formatDate: (iso) => iso.slice(0, 10),
    taskLabel: () => void 0,
    entryWord: () => void 0,
    pageLink: () => null
  };
}
function renderEntryFile(id) {
  const def = entryFileDef(id);
  const head = [
    frontmatter({ "vocab-tracker": ENTRY_FILE_KIND, "vocab-tracker-id": def.id }),
    "```" + def.block,
    ...def.params ? [def.params] : [],
    "```"
  ].join("\n");
  const sections = id === "trivia" ? renderTriviaFavoritesSections({ items: [] }, emptyContext()) : [];
  return buildManagedFile(head, sections);
}
var LEGACY_HEADING_SLACK = 3;
function legacyTitleHeading(basename2, headings, frontmatterEndLine) {
  const h = headings == null ? void 0 : headings[0];
  if (!h || h.level !== 1 || h.heading.trim() !== basename2.trim()) return false;
  const first = frontmatterEndLine === void 0 ? 0 : frontmatterEndLine + 1;
  return h.position.start.line >= first && h.position.start.line < first + LEGACY_HEADING_SLACK;
}

// src/services/files/EntryFilesService.ts
var LEGACY_FOLDER = "vocab-list";
var EntryFilesService = class {
  constructor(deps) {
    this.deps = deps;
    // Entry file id → the ensure() in progress, so two quick calls create once.
    this.pending = /* @__PURE__ */ new Map();
  }
  // ── Paths ────────────────────────────────────────────────────────────
  settings() {
    var _a, _b;
    return resolveFilesSettings((_b = (_a = this.deps).settings) == null ? void 0 : _b.call(_a));
  }
  paths() {
    return filesPaths(this.settings());
  }
  // The folders ExportService writes to. 冷知識.md is wherever the trivia
  // entry file is now, so the saved list lands in the file the user kept.
  exportFolders() {
    const p = this.paths();
    return { words: p.words, threads: p.threads, triviaFile: this.entryFilePath("trivia") };
  }
  // The entry file as it is now: found by id, else where a new one goes.
  entryFilePath(id) {
    var _a;
    return (_a = this.deps.vault.findManaged(ENTRY_FILE_KIND, id)) != null ? _a : entryFilePath(this.paths().folder, id);
  }
  isArticle(path) {
    if (this.deps.isArticle) return this.deps.isArticle(path);
    return /\.md$/i.test(path) && !/\.ai\.md$/i.test(path) && !inFolderPath(path, this.paths().folder);
  }
  // ── Entry files ──────────────────────────────────────────────────────
  // The entry file's path, creating the file if there is none. Never
  // overwrites: a file at the path (with or without our id) is used as is.
  ensure(id) {
    const running2 = this.pending.get(id);
    if (running2) return running2;
    const job = this.doEnsure(id).finally(() => this.pending.delete(id));
    this.pending.set(id, job);
    return job;
  }
  async doEnsure(id) {
    var _a, _b, _c;
    const { vault } = this.deps;
    await ((_a = vault.ready) == null ? void 0 : _a.call(vault));
    const found = vault.findManaged(ENTRY_FILE_KIND, id);
    if (found) return this.seeded(id, found);
    const path = entryFilePath(this.paths().folder, id);
    if (vault.exists(path)) return this.seeded(id, path);
    const legacy = entryFilePath(LEGACY_FOLDER, id);
    if (legacy !== path && vault.exists(legacy)) {
      await vault.rename(legacy, path);
      return this.seeded(id, path);
    }
    try {
      await vault.create(path, renderEntryFile(id));
    } catch (e) {
      if (!vault.exists(path)) throw e;
      return this.seeded(id, path);
    }
    if (id === "trivia") (_c = (_b = this.deps.export) == null ? void 0 : _b.triviaChanged) == null ? void 0 : _c.call(_b);
    return this.seeded(id, path);
  }
  async seeded(id, path) {
    var _a;
    try {
      await ((_a = this.deps.seeds) == null ? void 0 : _a.markSeeded([id]));
    } catch (e) {
      console.error("Vocab Tracker: couldn't record the entry file", e);
    }
    return path;
  }
  // Startup: creates the entry files that were never created before.
  // Resolves to the paths created (or adopted) this time.
  async ensureAll() {
    var _a, _b;
    const done = (_b = await ((_a = this.deps.seeds) == null ? void 0 : _a.seeded())) != null ? _b : /* @__PURE__ */ new Set();
    const out = [];
    for (const def of ENTRY_FILES) {
      if (done.has(def.id)) continue;
      try {
        out.push(await this.ensure(def.id));
      } catch (e) {
        console.error(`Vocab Tracker: couldn't create ${entryFileDef(def.id).name}.md`, e);
      }
    }
    return out;
  }
  // ── Word pages ───────────────────────────────────────────────────────
  // The 「單字頁」 button: the word's page, created now if needed.
  async openWordPage(entryId) {
    var _a, _b;
    const exp = this.deps.export;
    if (!exp) return null;
    await ((_b = (_a = this.deps.vault).ready) == null ? void 0 : _b.call(_a));
    return exp.openWordPage(entryId);
  }
  // ── Renames and deletes (§4.6) ───────────────────────────────────────
  // Call from the vault's "rename" event. A folder rename moves the
  // paragraph anchors of every note under it; each note's .ai.md follows
  // on that note's own rename event (Obsidian fires one per file).
  async handleRename(oldPath, newPath, isFolder = false) {
    var _a, _b, _c;
    if (oldPath === newPath) return;
    if (isFolder) {
      await ((_a = this.deps.paragraphs) == null ? void 0 : _a.renameParagraphPath(oldPath, newPath));
      return;
    }
    if (!this.isArticle(oldPath)) return;
    await ((_b = this.deps.paragraphs) == null ? void 0 : _b.renameParagraphPath(oldPath, newPath));
    await ((_c = this.deps.export) == null ? void 0 : _c.renameArticle(oldPath, newPath));
  }
  // Call from the vault's "delete" event. Discussions are kept: the
  // article's .ai.md is re-rendered so its paragraphs show as orphaned,
  // and the sidebar offers 重新綁定 / 刪除 (§4.6). Nothing is deleted.
  handleDelete(path, isFolder = false) {
    var _a;
    if (isFolder || !this.isArticle(path)) return;
    (_a = this.deps.export) == null ? void 0 : _a.articleChanged(path, "never");
  }
};

// src/services/files/SeedRecord.ts
var FILES_SHARD = "files";
var SeedRecord = class {
  constructor(storage, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
    this.storage = storage;
    this.now = now;
    this.record = {};
  }
  async load() {
    let disk = null;
    try {
      disk = await this.storage.readShard(FILES_SHARD);
    } catch (e) {
      console.error("Vocab Tracker: couldn't read the files record", e);
    }
    const seeded = disk && typeof disk.seeded === "object" && disk.seeded ? disk.seeded : {};
    this.record = { ...seeded, ...this.record };
  }
  async seeded() {
    await this.load();
    return new Set(Object.keys(this.record));
  }
  async markSeeded(ids) {
    var _a, _b;
    const fresh = ids.filter((id) => !(id in this.record));
    if (!fresh.length) return;
    await this.load();
    const at = this.now();
    for (const id of fresh) (_b = (_a = this.record)[id]) != null ? _b : _a[id] = at;
    await this.storage.writeShard(FILES_SHARD, { seeded: this.record });
  }
};

// src/ui/blocks/wordReview.ts
var import_obsidian43 = require("obsidian");
var WordReviewModal = class extends import_obsidian43.Modal {
  constructor(host, entry) {
    super(host.app);
    this.host = host;
    this.entry = entry;
    this.block = null;
  }
  onOpen() {
    this.modalEl.addClass("vt-word-review-modal");
    this.titleEl.setText(t("wordPage.review"));
    const mode = singleReviewMode(this.entry, rememberedMode(this.host.app));
    this.block = new FlashcardsBlock(
      this.contentEl.createDiv(),
      this.host,
      { mode, id: this.entry.id },
      { onClose: () => this.close(), autoFocus: true }
    );
    this.block.load();
  }
  onClose() {
    var _a;
    (_a = this.block) == null ? void 0 : _a.unload();
    this.block = null;
    this.contentEl.empty();
  }
};
function openWordReview(host, entry) {
  new WordReviewModal(host, entry).open();
}

// src/ui/reading/WordPageDecorator.ts
var import_obsidian44 = require("obsidian");
function l3(key3, vars) {
  return t(`wordPage.${key3}`, vars);
}
var SECTIONS = ["families", "usage", "trivia", "discussion"];
function wordPageEntryId(frontmatter2) {
  if (!frontmatter2 || frontmatter2["vocab-tracker"] !== "word") return null;
  const id = frontmatter2["vocab-tracker-id"];
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}
var BEGIN = /^[ \t]*%%[ \t]*vt:begin[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*%%[ \t]*$/;
function sectionAtHeading(text, line) {
  const lines4 = text.split(/\r?\n/);
  for (let i = line - 1; i >= 0; i--) {
    if (lines4[i].trim() === "") continue;
    const m = BEGIN.exec(lines4[i]);
    const name = m == null ? void 0 : m[1];
    return name && SECTIONS.includes(name) ? name : null;
  }
  return null;
}
function sectionByTitle(title) {
  var _a;
  const labels = exportLabels();
  const text = title.trim();
  return (_a = SECTIONS.find((s) => labels[s] === text)) != null ? _a : null;
}
var running = /* @__PURE__ */ new Set();
function createWordPageDecorator(deps) {
  return (el, ctx) => {
    var _a, _b;
    const fm = (_a = ctx.frontmatter) != null ? _a : deps.frontmatterOf(ctx.sourcePath);
    const entryId = wordPageEntryId(fm);
    if (!entryId) return;
    const headings = [...el.matches("h2") ? [el] : [], ...Array.from(el.querySelectorAll("h2"))];
    if (!headings.length) return;
    const info = ctx.getSectionInfo(el);
    for (const h of headings) {
      if (h.querySelector(".vt-wp-actions")) continue;
      const section3 = info ? sectionAtHeading(info.text, info.lineStart) : sectionByTitle((_b = h.textContent) != null ? _b : "");
      if (!section3) continue;
      const entry = deps.entry(entryId);
      if (!entry) continue;
      decorate(h, section3, entry, deps);
    }
  };
}
function actionFor(section3, entry, deps) {
  switch (section3) {
    case "families":
      return {
        icon: "git-fork",
        label: l3("findFamilies"),
        run: async () => {
          const candidates = await deps.families.generate({ seedEntryIds: [entry.id] });
          if (!candidates.length) return deps.notify(l3("familiesNone"));
          const { families } = await deps.families.save(candidates);
          deps.notify(l3("familiesSaved", { n: families.length }));
        }
      };
    case "usage":
      if (!deps.verbs.canGenerate(entry)) return null;
      return {
        icon: "sparkles",
        label: entry.usage ? l3("regenerateUsage") : l3("generateUsage"),
        run: async () => {
          await deps.verbs.generate(entry);
          deps.notify(l3("usageSaved"));
        }
      };
    case "trivia":
      return {
        icon: "lightbulb",
        label: l3("trivia"),
        run: async () => {
          await deps.openTrivia();
          await deps.trivia.ask("next", { entryId: entry.id });
        }
      };
    case "discussion":
      return { icon: "panel-right", label: l3("openSidebar"), run: () => deps.openInSidebar(entry, "ai") };
  }
}
function decorate(h, section3, entry, deps) {
  const action = actionFor(section3, entry, deps);
  if (!action) return;
  h.addClass("vt-wp-heading");
  const box = h.createSpan({ cls: ["vt", "vt-wp-actions"] });
  const btn = box.createEl("button", { cls: "vt-wp-btn" });
  (0, import_obsidian44.setIcon)(btn.createSpan({ cls: "vt-wp-btn-icon" }), action.icon);
  btn.createSpan({ text: action.label });
  const key3 = `${entry.id}:${section3}`;
  const setBusy = (busy) => {
    btn.toggleClass("is-busy", busy);
    btn.disabled = busy;
  };
  setBusy(running.has(key3));
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (running.has(key3)) return;
    running.add(key3);
    setBusy(true);
    void Promise.resolve().then(action.run).catch((err) => {
      const message = isAiError(err) ? aiErrorText(err) : err instanceof Error ? err.message : String(err);
      const debug = aiDebugOf(err);
      if (debug) console.error(`Vocab Tracker: unreadable AI answer

${debugReportText(debug)}`);
      deps.notify(l3("failed", { error: message }));
    }).finally(() => {
      running.delete(key3);
      if (btn.isConnected) setBusy(false);
    });
  });
}

// src/ui/reading/PluginNoteChrome.ts
var import_obsidian45 = require("obsidian");

// src/ui/reading/pluginNote.ts
var KINDS = ["word", "entry", "ai-note"];
function pluginNoteKind(frontmatter2) {
  const kind = frontmatter2 == null ? void 0 : frontmatter2["vocab-tracker"];
  const id = frontmatter2 == null ? void 0 : frontmatter2["vocab-tracker-id"];
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (!(typeof id === "string" && id.trim()) && !(typeof id === "number" && Number.isFinite(id))) return null;
  return kind;
}
function chromeState(cache, basename2) {
  var _a, _b;
  const kind = pluginNoteKind(cache == null ? void 0 : cache.frontmatter);
  if (!kind || !cache) return { pluginNote: false, hideInlineTitle: false, collapseKey: null };
  const id = String((_a = cache.frontmatter) == null ? void 0 : _a["vocab-tracker-id"]).trim();
  return {
    pluginNote: true,
    hideInlineTitle: kind === "entry" && legacyTitleHeading(basename2, cache.headings, (_b = cache.frontmatterPosition) == null ? void 0 : _b.end.line),
    collapseKey: `${kind}:${id}`
  };
}
var MAX_KEYS = 500;
var CollapseMemory = class {
  constructor(saved) {
    this.keys = Array.isArray(saved) ? saved.filter((k) => typeof k === "string").slice(-MAX_KEYS) : [];
  }
  has(key3) {
    return this.keys.includes(key3);
  }
  // Returns the list to save.
  add(key3) {
    if (!this.has(key3)) {
      this.keys.push(key3);
      if (this.keys.length > MAX_KEYS) this.keys.splice(0, this.keys.length - MAX_KEYS);
    }
    return [...this.keys];
  }
};

// src/ui/reading/PluginNoteChrome.ts
var PLUGIN_NOTE_CLASS = "vt-plugin-note";
var HIDE_TITLE_CLASS = "vt-hide-inline-title";
var STORAGE_KEY = "vt-folded-properties";
var SETTLE_MS = 80;
var PluginNoteChrome = class {
  constructor(app) {
    this.app = app;
    this.timer = null;
    this.disposed = false;
    let saved = null;
    try {
      saved = app.loadLocalStorage(STORAGE_KEY);
    } catch (e) {
    }
    this.memory = new CollapseMemory(saved);
  }
  // Wires the workspace events to `owner` (the plugin); undone on unload.
  attach(owner) {
    const { workspace, metadataCache } = this.app;
    const later2 = () => this.schedule();
    owner.registerEvent(workspace.on("file-open", later2));
    owner.registerEvent(workspace.on("layout-change", later2));
    owner.registerEvent(workspace.on("active-leaf-change", later2));
    owner.registerEvent(metadataCache.on("changed", later2));
    workspace.onLayoutReady(later2);
    owner.register(() => this.dispose());
  }
  schedule() {
    if (this.disposed) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, SETTLE_MS);
  }
  refresh() {
    var _a;
    if (this.disposed) return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian45.MarkdownView)) continue;
      const file = view.file;
      const cache = file ? this.app.metadataCache.getFileCache(file) : null;
      const state = chromeState(cache, (_a = file == null ? void 0 : file.basename) != null ? _a : "");
      const el = view.containerEl;
      el.toggleClass(PLUGIN_NOTE_CLASS, state.pluginNote);
      el.toggleClass(HIDE_TITLE_CLASS, state.hideInlineTitle);
      if (state.collapseKey) this.foldOnce(el, state.collapseKey);
    }
  }
  // Clicks 「屬性」's heading once per note — Obsidian's own fold, so the
  // learner unfolds it the usual way and Obsidian keeps that per note.
  foldOnce(viewEl, key3) {
    var _a;
    if (this.memory.has(key3)) return;
    const box = viewEl.querySelector(".metadata-container");
    if (!box || !box.isShown()) return;
    if (!box.hasClass("is-collapsed")) {
      (_a = box.querySelector(".metadata-properties-heading")) == null ? void 0 : _a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));
    }
    const keys = this.memory.add(key3);
    try {
      this.app.saveLocalStorage(STORAGE_KEY, keys);
    } catch (e) {
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      leaf.view.containerEl.removeClass(PLUGIN_NOTE_CLASS, HIDE_TITLE_CLASS);
    }
  }
};

// src/ui/reading/ParagraphBadges.ts
var import_obsidian46 = require("obsidian");
var BADGE_CLS = "vt-pbadge";
var BADGE_HOST_CLS = "vt-pbadge-host";
var ANCHORABLE_TAGS = /* @__PURE__ */ new Set(["P", "UL", "OL", "BLOCKQUOTE"]);
function isAnchorableTag(tagName) {
  return !!tagName && ANCHORABLE_TAGS.has(tagName.toUpperCase());
}
var SectionLines = class {
  constructor() {
    this.text = null;
    this.lines = [];
  }
  slice(info) {
    if (info.text !== this.text) {
      this.text = info.text;
      this.lines = info.text.replace(/\r\n?/g, "\n").split("\n");
    }
    return this.lines.slice(info.lineStart, info.lineEnd + 1).join("\n");
  }
};
function badgeState(count, showGhost) {
  return count > 0 ? { kind: "count", count } : { kind: "ghost", quiet: !showGhost };
}
var ParagraphBadges = class {
  constructor(deps) {
    this.deps = deps;
    this.live = /* @__PURE__ */ new Map();
    this.lines = new SectionLines();
    // registerMarkdownPostProcessor(badges.process)
    this.process = (el, ctx) => {
      const first = el.firstElementChild;
      if (!isAnchorableTag(first == null ? void 0 : first.tagName)) return;
      const info = ctx.getSectionInfo(el);
      if (!info) return;
      const text = this.lines.slice(info);
      const handles = this.handlesFor(ctx.sourcePath, el, first, info.lineStart, info.lineEnd, text);
      for (const handle of handles) {
        this.draw(handle);
        this.track(handle);
      }
      const child = new import_obsidian46.MarkdownRenderChild(el);
      child.register(() => handles.forEach((h) => this.untrack(h)));
      ctx.addChild(child);
    };
  }
  // Keeps live badges in sync with the index. Returns the unsubscribe.
  attach() {
    return this.deps.index.events.on("paragraph-index:change", ({ paths }) => this.refresh(paths));
  }
  // Re-draws the live badges of these notes (all notes when omitted), e.g.
  // after the AI on/off switch changes whether ghosts show.
  refresh(paths) {
    var _a;
    const targets = paths != null ? paths : [...this.live.keys()];
    for (const path of targets) {
      for (const h of (_a = this.live.get(path)) != null ? _a : []) this.draw(h);
    }
  }
  // One handle per top-level `<li>` when this list was split (see class
  // comment); otherwise the usual single handle for the whole section
  // element. Falls back to the whole list if the DOM's `<li>` count
  // doesn't match the split — e.g. a task-list item rendered with extra
  // wrapper elements — rather than guessing at a mismatched mapping.
  handlesFor(path, el, first, lineStart, lineEnd, text) {
    var _a, _b;
    const whole = () => [{ ref: { path, lineStart, lineEnd, text }, host: el, badge: null }];
    const tag = (_a = first == null ? void 0 : first.tagName) == null ? void 0 : _a.toUpperCase();
    if (tag !== "UL" && tag !== "OL") return whole();
    const lines4 = text.split("\n");
    if (!shouldSplitList(lines4)) return whole();
    const items = splitListItems(lines4, lineStart);
    const lis = Array.from((_b = first == null ? void 0 : first.children) != null ? _b : []).filter((c) => {
      var _a2;
      return ((_a2 = c.tagName) == null ? void 0 : _a2.toUpperCase()) === "LI";
    });
    if (lis.length !== items.length) return whole();
    return items.map((item, i) => ({
      ref: { path, lineStart: item.lineStart, lineEnd: item.lineEnd, text: item.text },
      host: lis[i],
      badge: null
    }));
  }
  track(h) {
    let set = this.live.get(h.ref.path);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.live.set(h.ref.path, set);
    }
    set.add(h);
  }
  untrack(h) {
    const set = this.live.get(h.ref.path);
    if (!set) return;
    set.delete(h);
    if (!set.size) this.live.delete(h.ref.path);
  }
  draw(h) {
    const state = badgeState(this.deps.index.count(h.ref.path, h.ref.text), this.deps.showGhost());
    let badge = h.badge;
    if (!badge) {
      h.host.addClass(BADGE_HOST_CLS);
      badge = h.badge = h.host.createSpan({ cls: BADGE_CLS });
      badge.setAttr("role", "button");
      badge.setAttr("tabindex", "0");
      const open = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deps.onOpen(h.ref);
      };
      badge.addEventListener("click", open);
      badge.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
      (0, import_obsidian46.setIcon)(badge.createSpan({ cls: "vt-pbadge-icon" }), "sparkles");
      badge.createSpan({ cls: "vt-pbadge-count" });
    }
    const countEl = badge.querySelector(".vt-pbadge-count");
    badge.toggleClass("has-count", state.kind === "count");
    badge.toggleClass("is-ghost", state.kind === "ghost");
    badge.toggleClass("is-quiet", state.kind === "ghost" && state.quiet);
    countEl == null ? void 0 : countEl.setText(state.kind === "count" ? String(state.count) : "");
    const label = state.kind === "count" ? t("paragraph.badge.count", { n: state.count }) : t("paragraph.badge.open");
    badge.setAttr("aria-label", label);
  }
};

// src/ui/mobile/tapAction.ts
function tapActionFor(ui, form) {
  const prefs = resolveUiPrefs(ui);
  return isMobileForm(form) ? prefs.tapActionMobile : prefs.tapAction;
}
function planTap(action, tracked) {
  switch (action) {
    case "save":
      return tracked ? "show" : "save";
    case "open":
      return "show";
    default:
      return "menu";
  }
}

// src/ui/mobile/WordSheet.ts
var import_obsidian49 = require("obsidian");

// src/ui/mobile/actionNotice.ts
var import_obsidian47 = require("obsidian");
function actionNotice(text, actions, durationMs = 5e3) {
  const frag = createFragment((f) => {
    const wrap = f.createDiv({ cls: "vt-action-notice" });
    wrap.createSpan({ cls: "vt-action-notice-text", text });
    const bar = wrap.createDiv({ cls: "vt-action-notice-actions" });
    for (const a of actions) {
      const btn = bar.createEl("button", { cls: "vt-action-notice-btn", text: a.label });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        notice.hide();
        a.run();
      });
    }
  });
  const notice = new import_obsidian47.Notice(frag, durationMs);
  return notice;
}

// src/ui/mobile/BottomSheet.ts
var import_obsidian48 = require("obsidian");

// src/ui/mobile/sheetGeometry.ts
var TAP_SLOP_PX = 6;
var DISMISS_FRACTION = 0.3;
var FLICK_PX_PER_MS = 0.6;
var EXPAND_PX = 48;
function dragOffset(dy) {
  return dy >= 0 ? dy : dy / 4;
}
function dragOutcome(dy, height, velocity, expanded) {
  if (Math.abs(dy) < TAP_SLOP_PX) return "tap";
  if (dy > 0) {
    const far = height > 0 && dy > height * DISMISS_FRACTION;
    if (far || velocity > FLICK_PX_PER_MS) {
      if (expanded && !(height > 0 && dy > height * 2 * DISMISS_FRACTION)) return "collapse";
      return "close";
    }
    return "stay";
  }
  if (!expanded && (-dy > EXPAND_PX || -velocity > FLICK_PX_PER_MS)) return "expand";
  return "stay";
}
function keyboardInset(innerHeight, vv) {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

// src/ui/mobile/BottomSheet.ts
var CLOSE_MS = 240;
var SHEET_OPEN_CLS = "is-open";
var SHEET_EXPANDED_CLS = "is-expanded";
var SHEET_DRAGGING_CLS = "is-dragging";
var BottomSheet = class {
  constructor(opts) {
    this.opts = opts;
    this.shown = false;
    this.expanded = false;
    this.detachTimer = null;
    this.drag = null;
    this.onKey = (e) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.preventDefault();
        this.close();
      }
    };
    // Keyboard up/down (and the page scrolling under it): lift the panel
    // above the keyboard, then keep the focused input visible.
    this.onViewport = () => {
      var _a, _b;
      const vv = this.win.visualViewport;
      const inset = keyboardInset(this.win.innerHeight, vv);
      this.layer.style.setProperty("--vt-sheet-kb", `${inset}px`);
      if (vv) this.layer.style.setProperty("--vt-sheet-vh", `${Math.round(vv.height)}px`);
      this.layer.toggleClass("has-keyboard", inset > 0);
      const active2 = (_a = this.panel.ownerDocument) == null ? void 0 : _a.activeElement;
      if (inset > 0 && active2 && this.panel.contains(active2)) (_b = active2.scrollIntoView) == null ? void 0 : _b.call(active2, { block: "nearest" });
    };
    // ── Dragging the handle ────────────────────────────────────────────
    this.onPointerDown = (e) => {
      var _a, _b, _c;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target;
      if ((_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, ".vt-sheet-close")) return;
      this.drag = { pointerId: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
      (_c = (_b = this.grab).setPointerCapture) == null ? void 0 : _c.call(_b, e.pointerId);
      this.layer.addClass(SHEET_DRAGGING_CLS);
    };
    this.onPointerMove = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      d.dy = e.clientY - d.y;
      this.layer.style.setProperty("--vt-sheet-drag", `${Math.round(dragOffset(d.dy))}px`);
    };
    this.onPointerUp = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.y;
      const ms5 = Math.max(1, e.timeStamp - d.t);
      this.endDrag();
      switch (dragOutcome(dy, this.panel.offsetHeight, dy / ms5, this.expanded)) {
        case "tap":
          this.setExpanded(!this.expanded);
          break;
        case "close":
          this.close();
          break;
        case "expand":
          this.setExpanded(true);
          break;
        case "collapse":
          this.setExpanded(false);
          break;
        case "stay":
          break;
      }
    };
    this.onPointerCancel = () => this.endDrag();
    var _a, _b;
    this.host = (_a = opts.host) != null ? _a : document.body;
    this.win = (_b = opts.win) != null ? _b : window;
    const layer = this.layer = createDiv({ cls: "vt-sheet-layer" });
    const backdrop = layer.createDiv({ cls: "vt-sheet-backdrop" });
    backdrop.addEventListener("click", () => this.close());
    const panel = this.panel = layer.createDiv({ cls: "vt-sheet" });
    panel.setAttr("role", "dialog");
    panel.setAttr("aria-modal", "true");
    panel.setAttr("aria-label", opts.label);
    const grab = this.grab = panel.createDiv({ cls: "vt-sheet-grabzone" });
    grab.createDiv({ cls: "vt-sheet-grab" });
    const close = grab.createEl("button", { cls: "vt-sheet-close clickable-icon" });
    close.setAttr("aria-label", opts.closeLabel);
    (0, import_obsidian48.setIcon)(close, "x");
    close.addEventListener("click", () => this.close());
    grab.addEventListener("pointerdown", this.onPointerDown);
    grab.addEventListener("pointermove", this.onPointerMove);
    grab.addEventListener("pointerup", this.onPointerUp);
    grab.addEventListener("pointercancel", this.onPointerCancel);
    this.content = panel.createDiv({ cls: "vt-sheet-content" });
    panel.addEventListener("focusin", (e) => {
      if (isTextInput(e.target)) this.setExpanded(true);
    });
  }
  get isOpen() {
    return this.shown;
  }
  get isExpanded() {
    return this.expanded;
  }
  setLabel(label) {
    this.panel.setAttr("aria-label", label);
  }
  open() {
    if (this.shown) return;
    this.shown = true;
    if (this.detachTimer !== null) {
      this.win.clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
    if (this.layer.parentElement !== this.host) this.host.appendChild(this.layer);
    this.win.addEventListener("keydown", this.onKey);
    const vv = this.win.visualViewport;
    vv == null ? void 0 : vv.addEventListener("resize", this.onViewport);
    vv == null ? void 0 : vv.addEventListener("scroll", this.onViewport);
    this.onViewport();
    this.win.requestAnimationFrame(() => {
      if (this.shown) this.layer.addClass(SHEET_OPEN_CLS);
    });
  }
  close() {
    var _a, _b;
    if (!this.shown) return;
    this.shown = false;
    this.endDrag();
    this.layer.removeClass(SHEET_OPEN_CLS);
    this.setExpanded(false);
    this.unlisten();
    this.detachTimer = this.win.setTimeout(() => {
      this.detachTimer = null;
      if (!this.shown) this.layer.detach();
    }, CLOSE_MS);
    (_b = (_a = this.opts).onClosed) == null ? void 0 : _b.call(_a);
  }
  // Plugin unload: gone at once, no animation, no onClosed.
  destroy() {
    this.shown = false;
    this.unlisten();
    if (this.detachTimer !== null) this.win.clearTimeout(this.detachTimer);
    this.detachTimer = null;
    this.layer.detach();
  }
  setExpanded(on) {
    this.expanded = on;
    this.layer.toggleClass(SHEET_EXPANDED_CLS, on);
  }
  unlisten() {
    this.win.removeEventListener("keydown", this.onKey);
    const vv = this.win.visualViewport;
    vv == null ? void 0 : vv.removeEventListener("resize", this.onViewport);
    vv == null ? void 0 : vv.removeEventListener("scroll", this.onViewport);
  }
  endDrag() {
    var _a, _b;
    if (this.drag) (_b = (_a = this.grab).releasePointerCapture) == null ? void 0 : _b.call(_a, this.drag.pointerId);
    this.drag = null;
    this.layer.removeClass(SHEET_DRAGGING_CLS);
    this.layer.style.removeProperty("--vt-sheet-drag");
  }
};
function isTextInput(target) {
  var _a;
  const el = target;
  const tag = (_a = el == null ? void 0 : el.tagName) == null ? void 0 : _a.toUpperCase();
  return tag === "TEXTAREA" || tag === "INPUT" || !!(el == null ? void 0 : el.isContentEditable);
}

// src/ui/mobile/WordSheet.ts
var WordSheet = class extends import_obsidian49.Component {
  constructor(plugin, opts = {}) {
    super();
    this.plugin = plugin;
    this.opts = opts;
    this.wordUi = new WordUi(this);
    this.sheet = null;
    this.view = null;
    this.expand = "half";
    this.redrawQueued = false;
    this.rebindThreadId = null;
    this.rebindNotice = null;
  }
  onload() {
    this.register(this.plugin.store.events.on("data:changed", () => this.onDataChanged()));
    this.registerEvent(this.plugin.app.workspace.on("file-open", () => this.close()));
    this.register(() => {
      var _a;
      this.cancelRebind();
      (_a = this.sheet) == null ? void 0 : _a.destroy();
      this.sheet = null;
    });
  }
  get isOpen() {
    var _a;
    return !!((_a = this.sheet) == null ? void 0 : _a.isOpen);
  }
  get rebinding() {
    return this.rebindThreadId !== null;
  }
  // What's showing, for tests and main.ts.
  get current() {
    return this.isOpen ? this.view : null;
  }
  // ── SheetTarget ──────────────────────────────────────────────────────
  showWord(word, opts = {}) {
    var _a;
    const entry = this.findEntry(word);
    if (entry && opts.tab) this.wordUi.tabs.set(entry.id, opts.tab);
    const same = ((_a = this.view) == null ? void 0 : _a.kind) === "word" && this.view.word.toLowerCase() === word.toLowerCase();
    if (!same) this.expand = "half";
    this.view = { kind: "word", word, entryId: entry == null ? void 0 : entry.id, ctx: opts.ctx };
    this.show();
  }
  openWord(entryId, tab) {
    const entry = this.plugin.store.entries.find((e) => e.id === entryId);
    if (entry) this.showWord(entry.word, { tab });
  }
  async openParagraph(ref) {
    if (this.rebindThreadId) return this.finishRebind(ref);
    const { threads } = this.plugin;
    await threads.ensureLoaded();
    const thread = threads.paragraphThread(ref.path, ref.text);
    this.view = {
      kind: "paragraph",
      route: thread ? { name: "paragraph", threadId: thread.id } : { name: "paragraph-draft", section: ref }
    };
    this.show();
  }
  close() {
    var _a;
    (_a = this.sheet) == null ? void 0 : _a.close();
  }
  // ── Drawing ──────────────────────────────────────────────────────────
  ensureSheet() {
    if (!this.sheet) {
      this.sheet = new BottomSheet({
        label: t("mobile.sheet.label.paragraph"),
        closeLabel: t("mobile.sheet.close"),
        host: this.opts.host,
        win: this.opts.win,
        // Unload the card's ChatPanel etc. (their subscriptions) now; the
        // DOM stays for the slide-out and goes when the layer detaches.
        onClosed: () => {
          this.wordUi.beginRender();
          this.view = null;
        }
      });
    }
    return this.sheet;
  }
  show() {
    this.ensureSheet().open();
    this.draw();
  }
  draw() {
    const sheet = this.sheet;
    const view = this.view;
    if (!(sheet == null ? void 0 : sheet.isOpen) || !view) return;
    this.wordUi.beginRender();
    sheet.content.empty();
    sheet.content.toggleClass("is-word", view.kind === "word");
    sheet.content.toggleClass("is-paragraph", view.kind === "paragraph");
    if (view.kind === "word") this.drawWord(sheet, view);
    else this.drawParagraph(sheet, view.route);
  }
  findEntry(word) {
    const lower = word.toLowerCase();
    return this.plugin.store.entries.find((e) => e.word.toLowerCase() === lower);
  }
  drawWord(sheet, view) {
    var _a;
    const entry = view.entryId && this.plugin.store.entries.find((e) => e.id === view.entryId) || this.findEntry(view.word);
    sheet.setLabel(t("mobile.sheet.label.word", { word: (_a = entry == null ? void 0 : entry.word) != null ? _a : view.word }));
    if (!entry) {
      view.entryId = void 0;
      this.drawAddPrompt(sheet.content, view);
      return;
    }
    view.entryId = entry.id;
    renderVocabRow(
      this.plugin,
      sheet.content,
      entry,
      this.expand,
      (s) => this.expand = s === "collapsed" ? "half" : s,
      () => this.draw(),
      {
        ui: this.wordUi,
        variant: "sheet",
        openWordPage: (e) => {
          this.close();
          void this.plugin.openWordPage(e.id);
        },
        onDeleted: () => this.close(),
        onJump: () => this.close()
      }
    );
  }
  drawAddPrompt(el, view) {
    const box = el.createDiv({ cls: "vt-sheet-add" });
    box.createDiv({ cls: "vt-sheet-add-word", text: view.word });
    box.createDiv({ cls: "vt-sheet-add-hint", text: t("mobile.sheet.notTracked") });
    const btn = box.createEl("button", { cls: "mod-cta vt-sheet-add-btn", text: t("sidebar.addPrompt.cta") });
    btn.addEventListener("click", () => {
      var _a;
      btn.disabled = true;
      void this.plugin.addWordToVocab(view.word, (_a = view.ctx) != null ? _a : {}, { reveal: false }).then(() => this.draw()).catch((e) => {
        console.error("Vocab Tracker: couldn't add the word", e);
        btn.disabled = false;
      });
    });
  }
  drawParagraph(sheet, route) {
    sheet.setLabel(t("mobile.sheet.label.paragraph"));
    this.wordUi.component.addChild(new ParagraphThreadPane(sheet.content, route, this.plugin, this.wordUi.chat, this.paneNav()));
  }
  paneNav() {
    return {
      back: () => this.close(),
      threadStarted: (section3, threadId) => {
        const view = this.view;
        if ((view == null ? void 0 : view.kind) !== "paragraph" || view.route.name !== "paragraph-draft") return;
        const s = view.route.section;
        if (s.path !== section3.path || s.lineStart !== section3.lineStart) return;
        const draftKey = routeKey(view.route);
        view.route = { name: "paragraph", threadId };
        const chat = this.wordUi.chat;
        if (chat.focused === draftKey) chat.focused = threadId;
        this.draw();
      },
      rebind: (id) => this.startRebind(id),
      jumped: () => this.close(),
      removed: (id) => {
        const view = this.view;
        if ((view == null ? void 0 : view.kind) === "paragraph" && view.route.name === "paragraph" && view.route.threadId === id) this.close();
      }
    };
  }
  onDataChanged() {
    var _a;
    if (this.redrawQueued || !this.isOpen || ((_a = this.view) == null ? void 0 : _a.kind) !== "word") return;
    this.redrawQueued = true;
    window.setTimeout(() => {
      var _a2, _b, _c;
      this.redrawQueued = false;
      const view = this.view;
      if (!this.isOpen || (view == null ? void 0 : view.kind) !== "word") return;
      if (view.entryId && this.wordUi.tabs.get(view.entryId) === "ai") return;
      const active2 = (_b = (_a2 = this.sheet) == null ? void 0 : _a2.panel.ownerDocument) == null ? void 0 : _b.activeElement;
      if (active2 && ((_c = this.sheet) == null ? void 0 : _c.panel.contains(active2))) return;
      this.draw();
    }, 0);
  }
  // ── Moving a discussion to another paragraph (from the sheet) ─────────
  startRebind(threadId) {
    this.close();
    this.cancelRebind();
    this.rebindThreadId = threadId;
    document.body.addClass(REBINDING_BODY_CLS);
    this.rebindNotice = actionNotice(t("mobile.rebind.pick"), [{ label: t("paragraph.rebind.cancel"), run: () => this.cancelRebind() }], 0);
  }
  cancelRebind() {
    var _a;
    if (this.rebindThreadId === null && !this.rebindNotice) return;
    this.rebindThreadId = null;
    document.body.removeClass(REBINDING_BODY_CLS);
    (_a = this.rebindNotice) == null ? void 0 : _a.hide();
    this.rebindNotice = null;
  }
  async finishRebind(ref) {
    const threadId = this.rebindThreadId;
    this.cancelRebind();
    try {
      if (!await this.plugin.threads.rebindParagraph(threadId, ref)) return;
      new import_obsidian49.Notice(t("paragraph.rebind.done"));
      this.view = { kind: "paragraph", route: { name: "paragraph", threadId } };
      this.show();
    } catch (e) {
      console.error("Vocab Tracker: rebind failed", e);
      new import_obsidian49.Notice(t("paragraph.rebind.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
};

// src/ui/mobile/WordSurfaces.ts
var WordSurfaces = class {
  constructor(deps) {
    this.deps = deps;
  }
  get useSheet() {
    return wordSurface(this.deps.form()) === "sheet";
  }
  // A tapped word: its card, or the 「加入單字庫」 prompt when it isn't saved.
  async revealWord(word, ctx) {
    if (this.useSheet) return this.deps.sheet.showWord(word, { ctx });
    (await this.deps.revealSidebar()).setWord(word);
  }
  // A saved word's card on a given tab (the word page's 「在側欄開啟」).
  async openWordCard(entryId, tab) {
    if (this.useSheet) return this.deps.sheet.openWord(entryId, tab);
    (await this.deps.revealSidebar()).openWord(entryId, tab);
  }
  // A reading-view ✦. A rebind waits for this tap wherever it started:
  // the sidebar can still be opened by hand on iPhone (its own banner).
  async openParagraph(ref) {
    const open = this.deps.existingSidebar();
    if (open == null ? void 0 : open.rebindThreadId) return open.openParagraph(ref);
    if (this.deps.sheet.rebinding || this.useSheet) return this.deps.sheet.openParagraph(ref);
    await (await this.deps.revealSidebar()).openParagraph(ref);
  }
};

// src/ui/mobile/quickSave.ts
async function quickSave(word, deps) {
  const entry = await deps.add();
  if (!entry) return null;
  let undone = false;
  deps.notify(t("mobile.save.added", { word: entry.word }), [
    {
      label: t("mobile.save.undo"),
      run: () => {
        if (undone) return;
        undone = true;
        void deps.remove(entry).then(
          () => deps.notify(t("mobile.save.undone", { word })),
          (e) => console.error("Vocab Tracker: undo failed", e)
        );
      }
    }
  ]);
  return entry;
}

// src/ui/mobile/livePreviewHint.ts
function isLivePreviewText(target) {
  if (!target.closest(".markdown-source-view.is-live-preview .cm-content")) return false;
  return !target.closest(".markdown-rendered, .cm-embed-block, .cm-widgetBuffer, a, button, input, textarea");
}
var LivePreviewHint = class {
  constructor(deps) {
    this.deps = deps;
    this.shownThisSession = false;
  }
  // `hasWord` is only asked once everything cheaper said yes (it reads the
  // caret position under the finger).
  maybeShow(target, hasWord) {
    if (this.shownThisSession || !isMobileForm(this.deps.form()) || !this.deps.enabled()) return false;
    if (!isLivePreviewText(target) || !hasWord()) return false;
    this.shownThisSession = true;
    this.deps.notify(t("mobile.livePreview.text"), [
      { label: t("mobile.livePreview.switch"), run: () => this.deps.switchToReading() },
      { label: t("mobile.livePreview.never"), run: () => this.deps.disable() }
    ]);
    return true;
  }
};

// src/services/learn/linkage.ts
function familiesContaining(families, entryId) {
  return families.filter((f) => familyMembers(f).some((m) => m.entryId === entryId));
}
function triviaMentioning2(trivia, entryId) {
  return trivia.filter((t2) => t2.entryId !== entryId && t2.mentions.includes(entryId));
}
function deletionImpact(entryId, data) {
  return {
    families: familiesContaining(data.families, entryId).length,
    triviaMentions: triviaMentioning2(data.trivia, entryId).length,
    verbFavorite: data.hasVerbFavorite,
    wordPageExists: data.wordPageExists,
    threadCount: data.threadCount
  };
}
function clearFamilyMemberEntry(family, entryId) {
  let changed = false;
  const groups = family.groups.map((g) => {
    if (!g.members.some((m) => m.entryId === entryId)) return g;
    changed = true;
    return {
      ...g,
      members: g.members.map((m) => m.entryId !== entryId ? m : { word: m.word, zh: m.zh })
    };
  });
  return changed ? { ...family, groups } : family;
}
function clearTriviaMention(item, entryId) {
  if (!item.mentions.includes(entryId)) return item;
  return { ...item, mentions: item.mentions.filter((m) => m !== entryId) };
}
function syncFamilyMemberText(family, entry) {
  const stale = (m) => m.entryId === entry.id && (m.word !== entry.word || m.zh !== entry.definitionZh);
  let changed = false;
  const groups = family.groups.map((g) => {
    if (!g.members.some(stale)) return g;
    changed = true;
    return {
      ...g,
      members: g.members.map((m) => stale(m) ? { ...m, word: entry.word, zh: entry.definitionZh } : m)
    };
  });
  return changed ? { ...family, groups } : family;
}
function addMentionForNewEntry(item, entry, index) {
  if (item.entryId === entry.id || item.mentions.includes(entry.id)) return item;
  const found = index.mentions(`${item.title}
${item.body}`, /* @__PURE__ */ new Set([item.entryId])).includes(entry.id);
  return found ? { ...item, mentions: [...item.mentions, entry.id] } : item;
}

// src/services/learn/EntryLinkageService.ts
var EntryLinkageService = class {
  constructor(deps) {
    this.deps = deps;
    // entryId → {word, definitionZh} last seen, so sync() can tell a rename
    // from any other edit (the data:changed event itself carries no diff).
    this.last = /* @__PURE__ */ new Map();
  }
  // Seeds the baseline from the vocab list as it is right now — call once
  // at startup so every already-learned word isn't treated as "just
  // added" the first time sync() runs.
  init() {
    this.last.clear();
    for (const e of this.deps.vocab.entries) this.last.set(e.id, snapshot(e));
  }
  // Call after every data:changed. Cheap for the common case (nothing
  // renamed): one Map.get and two string compares per live entry; the
  // heavier family/trivia scans only run for an entry that actually
  // changed or just appeared.
  async sync() {
    await this.deps.learn.ensureLoaded();
    const entries = this.deps.vocab.entries;
    const live = new Set(entries.map((e) => e.id));
    for (const id of [...this.last.keys()]) if (!live.has(id)) this.last.delete(id);
    for (const e of entries) {
      const before = this.last.get(e.id);
      const now = snapshot(e);
      this.last.set(e.id, now);
      if (!before) this.onNewEntry(e);
      else if (before.word !== now.word || before.definitionZh !== now.definitionZh) this.onRenamed(e);
    }
  }
  // The confirm dialog's counts, before anything is touched.
  impact(entryId, word) {
    var _a, _b, _c, _d, _e, _f;
    return deletionImpact(entryId, {
      families: this.deps.learn.families(),
      trivia: this.deps.learn.trivia(),
      hasVerbFavorite: !!this.deps.learn.verbFavorite(entryId),
      wordPageExists: (_c = (_b = (_a = this.deps).wordPageExists) == null ? void 0 : _b.call(_a, entryId, word)) != null ? _c : false,
      threadCount: (_f = (_e = (_d = this.deps).threadCount) == null ? void 0 : _e.call(_d, entryId)) != null ? _f : 0
    });
  }
  // Called once the learner has confirmed the delete. The entry itself is
  // soft-deleted by VocabStore separately (main.ts's deleteEntry); this
  // only unlinks it from the learning data.
  unlink(entryId) {
    for (const f of this.deps.learn.families()) {
      const updated = clearFamilyMemberEntry(f, entryId);
      if (updated !== f) this.deps.learn.putFamily(updated);
    }
    for (const item of this.deps.learn.trivia()) {
      const updated = clearTriviaMention(item, entryId);
      if (updated !== item) this.deps.learn.putTrivia(updated);
    }
    if (this.deps.learn.verbFavorite(entryId)) this.deps.learn.unfavoriteVerb(entryId);
    this.last.delete(entryId);
  }
  onRenamed(entry) {
    for (const f of this.deps.learn.families()) {
      const updated = syncFamilyMemberText(f, entry);
      if (updated !== f) this.deps.learn.putFamily(updated);
    }
  }
  onNewEntry(entry) {
    const index = new WordIndex(this.deps.vocab.entries);
    for (const item of this.deps.learn.trivia()) {
      const updated = addMentionForNewEntry(item, entry, index);
      if (updated !== item) this.deps.learn.putTrivia(updated);
    }
  }
};
function snapshot(e) {
  return { word: e.word, definitionZh: e.definitionZh };
}

// src/ui/word/DeleteEntryModal.ts
var import_obsidian50 = require("obsidian");

// src/ui/word/deleteEntryImpact.ts
function deletionImpactLines(impact) {
  const lines4 = [];
  if (impact.families > 0) lines4.push(t("deleteEntry.impact.families", { n: impact.families }));
  if (impact.triviaMentions > 0) lines4.push(t("deleteEntry.impact.trivia", { n: impact.triviaMentions }));
  if (impact.verbFavorite) lines4.push(t("deleteEntry.impact.verbFavorite"));
  if (impact.wordPageExists) lines4.push(t("deleteEntry.impact.wordPage"));
  if (impact.threadCount > 0) lines4.push(t("deleteEntry.impact.threads", { n: impact.threadCount }));
  return lines4;
}

// src/ui/word/DeleteEntryModal.ts
var DeleteEntryModal = class extends import_obsidian50.Modal {
  constructor(app, word, impact, onResult) {
    super(app);
    this.word = word;
    this.impact = impact;
    this.onResult = onResult;
    this.trashWordPage = false;
    this.confirmed = false;
  }
  onOpen() {
    this.titleEl.setText(t("deleteEntry.title", { word: this.word }));
    this.contentEl.addClass("vt-delete-entry");
    this.render();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.confirmed) this.onResult(null);
  }
  render() {
    const el = this.contentEl;
    el.empty();
    const lines4 = deletionImpactLines(this.impact);
    if (lines4.length) {
      const ul = el.createEl("ul", { cls: "vt-delete-entry-impact" });
      for (const line of lines4) ul.createEl("li", { text: line });
    } else {
      el.createEl("p", { text: t("deleteEntry.noLinks"), cls: "vt-settings-muted" });
    }
    if (this.impact.wordPageExists) {
      new import_obsidian50.Setting(el).setName(t("deleteEntry.trashWordPage")).addToggle(
        (toggle) => toggle.setValue(this.trashWordPage).onChange((v) => this.trashWordPage = v)
      );
    }
    new import_obsidian50.Setting(el).addButton((b) => b.setButtonText(t("deleteEntry.cancel")).onClick(() => this.close())).addButton(
      (b) => b.setButtonText(t("deleteEntry.confirm")).setWarning().onClick(() => {
        this.confirmed = true;
        this.onResult({ trashWordPage: this.trashWordPage });
        this.close();
      })
    );
  }
};

// main.ts
var VOCAB_FOLDER = "vocab-list";
var VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
var VOCAB_FILE_LEGACY = "vocab-list.md";
var ENRICH_GAP_MS = 400;
var RESUME_ENRICH_DELAY_MS = 5e3;
var VocabTrackerPlugin = class extends import_obsidian51.Plugin {
  constructor() {
    super(...arguments);
    this.vocabData = { entries: [] };
    this.importing = /* @__PURE__ */ new Set();
    this.enrichQueue = [];
    this.enriching = false;
    this.unloaded = false;
  }
  async onload() {
    this.storage = new ObsidianStorage(this);
    this.vocabData = cleanupTombstones(await loadMigrated(this.storage));
    this.store = new VocabStore(this.vocabData, (data) => this.storage.writeShard("data", data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
    this.applyLocale();
    this.speaker = sharedSpeaker();
    this.speaker.warmUp();
    configurePronouncer({
      source: () => resolveUiPrefs(this.store.settings.ui).pronounceSource,
      // Failed recording URLs, remembered on this device for 7 days.
      deviceState: new ObsidianDeviceState(this.app)
    });
    const { ai, keys } = createAiService(this.store, createAiPorts(this.app, this.storage));
    this.ai = ai;
    this.wordlists = new WordlistService({
      source: new ObsidianWordlists(this.app),
      settings: () => this.wordlistSettings()
    });
    this.noteImports = new NoteImports(this.storage);
    await this.noteImports.load();
    this.backups = new BackupService({
      storage: this.storage,
      host: {
        flush: async () => {
          await Promise.all([this.store.flush(), this.srs.flush(), this.threads.flush(), this.learn.flush()]);
        },
        reload: async () => {
          await Promise.all([this.threads.reload(), this.learn.reload(), this.srs.reloadLogs(), this.noteImports.load()]);
        },
        applyData: (data) => {
          this.vocabData = data;
          this.store.replace(data);
        },
        restored: (changes) => this.afterRestore(changes)
      }
    });
    const settingsCtx = {
      app: this.app,
      store: this.store,
      ai,
      keys,
      wordlists: this.wordlists,
      backups: this.backups,
      applyLocale: () => this.applyLocale(),
      onWordlistsChanged: (change) => void this.onWordlistsChanged(change),
      onAiEnabledChanged: () => {
        var _a;
        return (_a = this.paragraphBadges) == null ? void 0 : _a.refresh();
      }
    };
    this.addSettingTab(new VocabSettingsTab(this.app, this, settingsCtx, SETTINGS_SECTIONS2));
    this.srs = new SrsService({ store: this.store, storage: this.storage });
    this.notes = new ObsidianNotes(this.app);
    this.vault = new ObsidianVault(this.app);
    this.vault.register(this);
    this.anchors = new ParagraphAnchorService({
      vault: this.vault,
      mode: () => resolveAnchorSettings(this.store.settings).mode
    });
    this.threads = new ThreadService({ storage: this.storage, store: this.store, ai, notes: this.notes, anchors: this.anchors });
    this.learn = new LearnStore({ storage: this.storage });
    this.families = new FamilyService({ ai, vocab: this.store, learn: this.learn, dictionary: this.dictionary });
    this.verbs = new VerbUsageService({ ai, vocab: this.store });
    this.trivia = new TriviaService({ threads: this.threads, vocab: this.store, learn: this.learn });
    this.selection = new SelectionTracker(this.app);
    this.registerDomEvent(document, "selectionchange", () => this.selection.update());
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      void this.threads.reload();
      void this.learn.reload();
      void this.srs.reloadLogs();
    });
    this.exporter = new ExportService({
      vault: this.vault,
      data: createExportData({
        entries: () => this.store.entries,
        threads: this.threads,
        learn: this.learn,
        notes: this.notes
      }),
      folders: () => this.files.exportFolders(),
      taskLabel: (taskId) => {
        var _a;
        const label = (_a = ai.tasks.get(taskId)) == null ? void 0 : _a.label;
        return label ? t(label) : void 0;
      }
    });
    this.exporter.watchThreads(this.threads.events);
    this.exporter.watchLearn(this.learn.events);
    this.exporter.watchUsage(this.verbs.events);
    this.files = new EntryFilesService({
      vault: this.vault,
      settings: () => this.store.settings.files,
      seeds: new SeedRecord(this.storage),
      export: this.exporter,
      paragraphs: this.threads,
      isArticle: (p) => /\.md$/i.test(p) && !/\.ai\.md$/i.test(p) && this.isImportable(p)
    });
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => void this.files.handleRename(oldPath, file.path, file instanceof import_obsidian51.TFolder))
    );
    this.registerEvent(this.app.vault.on("delete", (file) => this.files.handleDelete(file.path, file instanceof import_obsidian51.TFolder)));
    this.linkage = new EntryLinkageService({
      learn: this.learn,
      vocab: this.store,
      wordPageExists: (id, word) => this.vault.exists(this.exporter.wordPagePath(id, word)),
      threadCount: (id) => this.threads.wordQuestionCount(id)
    });
    this.linkage.init();
    this.register(this.store.events.on("data:changed", () => void this.linkage.sync()));
    this.registerMarkdownPostProcessor(
      createWordPageDecorator({
        entry: (id) => this.store.entries.find((e) => e.id === id),
        frontmatterOf: (p) => this.frontmatterOf(p),
        families: this.families,
        verbs: this.verbs,
        trivia: this.trivia,
        // A new tab, so the word page stays open behind it.
        openTrivia: () => this.openEntryFile("trivia", "tab"),
        // The bottom sheet on iPhone.
        openInSidebar: (entry) => this.surfaces.openWordCard(entry.id, "ai"),
        notify: (m) => new import_obsidian51.Notice(m)
      })
    );
    new PluginNoteChrome(this.app).attach(this);
    this.registerView(
      VOCAB_VIEW_TYPE,
      (leaf) => new VocabSidebarView(leaf, this)
    );
    this.sheet = this.addChild(new WordSheet(this));
    this.surfaces = new WordSurfaces({
      form: currentFormFactor,
      sheet: this.sheet,
      revealSidebar: async () => (await this.activateSidebar()).view,
      existingSidebar: () => this.sidebarView()
    });
    this.livePreviewHint = new LivePreviewHint({
      form: currentFormFactor,
      enabled: () => resolveUiPrefs(this.store.settings.ui).livePreviewHint,
      notify: (text, actions) => actionNotice(text, actions, 8e3),
      switchToReading: () => void this.switchToReadingView(),
      disable: () => void this.store.updateSettings((s) => {
        s.ui.livePreviewHint = false;
      })
    });
    this.paragraphIndex = new ParagraphIndex();
    this.register(this.paragraphIndex.attach(this.threads));
    this.paragraphBadges = new ParagraphBadges({
      index: this.paragraphIndex,
      onOpen: (ref) => void this.openParagraph(ref),
      showGhost: () => this.store.settings.ai.enabled
    });
    this.register(this.paragraphBadges.attach());
    this.registerMarkdownPostProcessor(this.paragraphBadges.process);
    this.registerMarkdownPostProcessor(this.processMarks.bind(this));
    this.registerMarkdownPostProcessor((el) => {
      const lookup = this.wordlists.highlightLookup();
      if (!lookup) return;
      const s = this.wordlistSettings();
      highlightExamWords(el, lookup, (tag) => tagColor(s, tag));
    });
    this.registerDomEvent(document, "click", this.handleReadingClick.bind(this));
    registerBlocks(this);
    this.addCommand({
      id: "open-flashcards",
      name: t("command.openFlashcards"),
      callback: () => this.openFlashcards()
    });
    this.addCommand({
      id: "open-families",
      name: t("command.openFamilies"),
      callback: () => this.openEntryFile("families")
    });
    this.addCommand({
      id: "open-verbs",
      name: t("command.openVerbs"),
      callback: () => this.openEntryFile("verbs")
    });
    this.addCommand({
      id: "open-trivia",
      name: t("command.openTrivia"),
      callback: () => this.openEntryFile("trivia")
    });
    this.addCommand({
      id: "toggle-exam-highlight",
      name: t("command.toggleExamHighlight"),
      callback: () => this.updateWordlistSettings({ highlight: !this.wordlistSettings().highlight })
    });
    this.addCommand({
      id: "import-exam-words",
      name: t("command.importExamWords"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || this.wordlists.index.isEmpty) return false;
        if (!checking) void this.importExamWords(file, { force: true });
        return true;
      }
    });
    this.addCommand({
      id: "reload-wordlists",
      name: t("command.reloadWordlists"),
      callback: () => this.wordlists.reload()
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
      this.app.workspace.on("file-open", (file) => {
        this.refreshSidebar();
        if (file) void this.scanNote(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof import_obsidian51.TFile)) return;
        const changed = updateSourcePaths(this.vocabData.entries, oldPath, file.path);
        if (changed.length) await this.store.touchMany(changed);
        await this.noteImports.rename(oldPath, file.path);
      })
    );
    this.app.workspace.onLayoutReady(() => {
      void this.ensureVocabFile();
      void this.files.ensureAll();
      this.registerWordlistEvents();
      void this.wordlists.reload();
      const timer = window.setTimeout(
        () => this.enqueueEnrich(entriesMissingDefinition(this.store.entries)),
        RESUME_ENRICH_DELAY_MS
      );
      this.register(() => window.clearTimeout(timer));
    });
  }
  // So a debounced write (VocabStore's 500ms coalescing) isn't lost if
  // Obsidian closes right after an edit, before the timer fires.
  async onunload() {
    var _a, _b, _c, _d, _e, _f;
    disposePronouncer();
    this.unloaded = true;
    (_a = this.threads) == null ? void 0 : _a.dispose();
    (_b = this.ai) == null ? void 0 : _b.dispose();
    await Promise.all([this.store.flush(), this.srs.flush(), (_c = this.threads) == null ? void 0 : _c.flush(), (_d = this.learn) == null ? void 0 : _d.flush()]);
    await ((_e = this.exporter) == null ? void 0 : _e.flush());
    (_f = this.exporter) == null ? void 0 : _f.dispose();
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
    void this.srs.reloadLogs();
    void this.threads.reload();
    void this.learn.reload();
    void this.noteImports.load();
    const disk = await this.storage.readShard("data");
    if (!disk) return;
    const wordlistsBefore = JSON.stringify(this.wordlistSettings());
    const aiBefore = this.store.settings.ai.enabled;
    const merged = merge(this.vocabData, disk);
    this.vocabData = merged;
    this.store.replace(merged);
    if (JSON.stringify(merged) !== JSON.stringify(disk)) {
      await this.storage.writeShard("data", merged);
    }
    (_a = this.sidebarView()) == null ? void 0 : _a.render();
    if (JSON.stringify(this.wordlistSettings()) !== wordlistsBefore) void this.onWordlistsChanged("reload");
    if (this.store.settings.ai.enabled !== aiBefore) this.paragraphBadges.refresh();
  }
  // After 從備份還原: the store and the shard services already hold the
  // restored data (their events redrew the sidebar lists, chat panels and
  // vocab-* blocks); this redraws what isn't subscribed and re-exports the
  // notes of every record the restore changed.
  afterRestore(changes) {
    var _a;
    this.renderSidebar();
    this.refreshExamStrip();
    this.rerenderReadingViews();
    (_a = this.paragraphBadges) == null ? void 0 : _a.refresh();
    for (const id of changes.entryIds) this.exporter.wordChanged(id);
    for (const thread of changes.threads) this.exporter.threadChanged(thread);
    for (const family of changes.families) this.exporter.familyChanged(family);
    for (const item of changes.trivia) this.exporter.triviaItemChanged(item);
  }
  // ── Exam word lists ────────────────────────────────────────────
  wordlistSettings() {
    return resolveWordlistSettings(this.store.settings.wordlists);
  }
  async updateWordlistSettings(patch) {
    await this.store.updateSettings((s) => s.wordlists = { ...this.wordlistSettings(), ...patch });
    await this.onWordlistsChanged("display");
  }
  // Sidebar chip: turn one list's underlines on/off. If underlining is off
  // altogether, a click means "show me this one", so it turns that on too.
  async toggleExamTag(tag) {
    const s = this.wordlistSettings();
    const on = s.highlight && tagEnabled(s, tag);
    await this.updateWordlistSettings({
      highlight: s.highlight || !on,
      tags: { ...s.tags, [tag]: { ...s.tags[tag], enabled: !on } }
    });
  }
  async onWordlistsChanged(change) {
    if (change === "reload") return this.wordlists.reload();
    if (change === "scan") this.wordlists.invalidateScans();
    this.rerenderReadingViews();
    this.refreshExamStrip();
  }
  // Scans a note in the background, then auto-imports its exam words if
  // this note hasn't been imported before.
  async scanNote(file) {
    if (file.extension !== "md" || this.wordlists.index.isEmpty) return;
    try {
      const result = await this.wordlists.scan(file.path, file.stat.mtime, () => this.app.vault.cachedRead(file));
      if (this.wordlistSettings().autoImport && !this.noteImports.has(file.path)) {
        await this.importExamWords(file, { result });
      }
    } catch (e) {
      console.error("Vocab Tracker: exam word scan failed", e);
    }
  }
  // Notes whose words shouldn't become vocab entries: the lists themselves
  // and the plugin's own folders (vocab-list, and the entry-file folder
  // with the word pages and .ai.md notes if it was moved elsewhere).
  isImportable(path) {
    var _a;
    const filesFolder = (_a = this.files) == null ? void 0 : _a.paths().folder;
    return !inFolder(path, this.wordlistSettings().folder) && !inFolder(path, VOCAB_FOLDER) && !(filesFolder && inFolder(path, filesFolder));
  }
  // Exam labels for a word's list tags — enabled lists only ("TOEFL, IELTS").
  examLabels(tags) {
    const s = this.wordlistSettings();
    return tags.filter((tag) => tagEnabled(s, tag)).map(tagLabel);
  }
  // Adds every exam-list word in the note to the vocab list (level = its
  // exams), and adds the exam labels to words already tracked. Each note
  // is imported once; `force` (the command) re-runs it, but words the user
  // deleted still stay deleted.
  async importExamWords(file, opts = {}) {
    var _a;
    if (!this.isImportable(file.path) || this.importing.has(file.path)) return;
    if (!opts.force && this.noteImports.has(file.path)) return;
    this.importing.add(file.path);
    try {
      const result = (_a = opts.result) != null ? _a : await this.wordlists.scan(file.path, file.stat.mtime, () => this.app.vault.cachedRead(file));
      const plan = planImport(result.hits, this.store.allEntries, (tags) => this.examLabels(tags));
      const base = Date.now();
      const created = plan.create.map(
        (w, i) => this.newEntry(`${base}-${i}`, w.word, {
          level: w.level,
          example: w.example,
          source: { path: file.path, line: w.line },
          origin: "wordlist"
        })
      );
      if (created.length) await this.store.addEntries(created);
      for (const r of plan.retag) r.entry.level = r.level;
      if (plan.retag.length) await this.store.touchMany(plan.retag.map((r) => r.entry));
      await this.noteImports.mark(file.path, nowIso());
      if (created.length || plan.retag.length) {
        new import_obsidian51.Notice(
          t("exam.import.done", { note: file.basename, added: created.length, tagged: plan.retag.length })
        );
        this.renderSidebar();
      }
      this.enqueueEnrich(created);
    } finally {
      this.importing.delete(file.path);
    }
  }
  // Fills in dictionary data one word at a time: auto-imported words, and
  // at startup every word still missing a definition.
  enqueueEnrich(entries) {
    const queued = new Set(this.enrichQueue.map((e) => e.id));
    this.enrichQueue.push(...entries.filter((e) => !queued.has(e.id)));
    if (!this.enriching) void this.drainEnrichQueue();
  }
  async drainEnrichQueue() {
    this.enriching = true;
    let done = 0;
    while (this.enrichQueue.length && !this.unloaded) {
      const entry = this.enrichQueue.shift();
      if (entriesMissingDefinition([entry]).length === 0) continue;
      await this.enrichEntry(entry, { quiet: true });
      if (++done % 20 === 0) this.renderSidebar();
      await new Promise((r) => setTimeout(r, ENRICH_GAP_MS));
    }
    this.enriching = false;
    if (done) this.renderSidebar();
  }
  renderSidebar() {
    var _a;
    (_a = this.sidebarView()) == null ? void 0 : _a.render();
  }
  registerWordlistEvents() {
    const reload = (0, import_obsidian51.debounce)(() => void this.wordlists.reload(), 800, true);
    const inLists = (path) => inFolder(path, this.wordlistSettings().folder);
    const onChange = (file, oldPath) => {
      if (inLists(file.path) || oldPath && inLists(oldPath)) reload();
    };
    this.registerEvent(this.app.vault.on("create", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => onChange(f, oldPath)));
    const rescanActive = (0, import_obsidian51.debounce)(() => this.refreshExamStrip(), 1500, true);
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        var _a;
        if (inLists(f.path)) reload();
        else if (f.path === ((_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path)) rescanActive();
      })
    );
    this.wordlists.on("index-changed", () => {
      this.rerenderReadingViews();
      this.refreshExamStrip();
      const active2 = this.app.workspace.getActiveFile();
      if (active2) void this.scanNote(active2);
    });
    this.wordlists.on("scanned", ({ path }) => {
      var _a;
      if (path === ((_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path)) this.refreshExamStrip();
    });
  }
  // Re-runs post-processors so underlines follow the current lists/settings.
  rerenderReadingViews() {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof import_obsidian51.MarkdownView) (_a = view.previewMode) == null ? void 0 : _a.rerender(true);
    }
  }
  refreshExamStrip() {
    var _a;
    (_a = this.sidebarView()) == null ? void 0 : _a.refreshExamStrip();
  }
  // The sidebar view if it's open and loaded — never opens it. A tab not
  // shown since startup is a DeferredView (Obsidian 1.7.2+) and gives null.
  sidebarView() {
    var _a;
    const view = (_a = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0]) == null ? void 0 : _a.view;
    return view instanceof VocabSidebarView ? view : null;
  }
  async activateSidebar() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf("split");
      await leaf.setViewState({ type: VOCAB_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf;
  }
  // A reading-view ✦ was clicked: that paragraph's discussion in the
  // sidebar (the bottom sheet on iPhone).
  async openParagraph(ref) {
    await this.surfaces.openParagraph(ref);
  }
  // Live Preview hint's 「切換到閱讀模式」.
  async switchToReadingView() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian51.MarkdownView);
    if (!view) return;
    await view.setState({ ...view.getState(), mode: "preview" }, { history: false });
  }
  async openVocabFile() {
    await this.ensureVocabFile();
    const file = this.app.vault.getAbstractFileByPath(VOCAB_FILE);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
  openFlashcards() {
    return this.openEntryFile("flashcards");
  }
  // Opens an entry file (單字卡 / 字族樹 / 動詞用法 / 冷知識), creating it if
  // it's missing — never overwriting one that's there.
  async openEntryFile(id, where = "current") {
    try {
      await this.openNote(await this.files.ensure(id), where);
    } catch (e) {
      console.error(`Vocab Tracker: couldn't open the ${id} entry file`, e);
      new import_obsidian51.Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  // The 「單字頁」 button: the word's page, created now if it has none.
  async openWordPage(entryId) {
    try {
      const path = await this.files.openWordPage(entryId);
      if (path) await this.openNote(path);
    } catch (e) {
      console.error("Vocab Tracker: couldn't open the word page", e);
      new import_obsidian51.Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  // "tab": a new tab, or the tab already showing the note.
  async openNote(path, where = "current") {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian51.TFile)) return;
    const { workspace } = this.app;
    if (where === "tab") {
      const open = workspace.getLeavesOfType("markdown").find((leaf) => {
        var _a;
        return leaf.view instanceof import_obsidian51.MarkdownView && ((_a = leaf.view.file) == null ? void 0 : _a.path) === path;
      });
      if (open) {
        workspace.setActiveLeaf(open, { focus: true });
        return;
      }
    }
    await workspace.getLeaf(where === "tab" ? "tab" : false).openFile(file);
  }
  // ── vocab-word block host (WordHeaderHost) ──────────────────────
  frontmatterOf(path) {
    var _a;
    return (_a = this.app.metadataCache.getCache(path)) == null ? void 0 : _a.frontmatter;
  }
  readNote(path) {
    return this.notes.read(path);
  }
  // 「複習這個字」: a one-word review in a modal — the 單字卡 card and
  // rating on just this word, due or not.
  reviewWord(entry) {
    openWordReview(this, entry);
  }
  // 字族樹 / 動詞用法 / 冷知識 chips of learned words: the word's card on
  // its data tab — the bottom sheet on iPhone, the sidebar elsewhere.
  async openWordCard(entry) {
    await this.surfaces.openWordCard(entry.id, "data");
  }
  async ensureVocabFile() {
    if (this.app.vault.getAbstractFileByPath(VOCAB_FILE)) return;
    if (!this.app.vault.getAbstractFileByPath(VOCAB_FOLDER)) {
      await this.app.vault.createFolder(VOCAB_FOLDER);
    }
    const legacy = this.app.vault.getAbstractFileByPath(VOCAB_FILE_LEGACY);
    if (legacy instanceof import_obsidian51.TFile) {
      await this.app.fileManager.renameFile(legacy, VOCAB_FILE);
      return;
    }
    await this.app.vault.create(
      VOCAB_FILE,
      "# Vocabulary List\n\n> Click a row to expand its details. Edit fields inline and they save automatically.\n\n```vocab-dashboard\n```\n"
    );
  }
  // ── Click any English word in reading mode ─────────────────────
  // What a tap does is the tap-action setting (規劃書 01 §3.2) — desktop
  // and mobile set separately: a menu, save at once, or open the card.
  handleReadingClick(evt) {
    var _a;
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;
    const preview2 = target.closest(".markdown-preview-view, .markdown-rendered");
    if (!preview2) {
      this.livePreviewHint.maybeShow(target, () => !!this.getWordContext(evt.clientX, evt.clientY).word);
      return;
    }
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
    switch (planTap(tapActionFor(this.store.settings.ui, currentFormFactor()), exists)) {
      case "save":
        void this.quickSaveWord(word, ctx);
        return;
      case "show":
        void this.surfaces.revealWord(word, ctx);
        return;
      case "menu":
        if (exists && wordSurface(currentFormFactor()) !== "sheet") (_a = this.sidebarView()) == null ? void 0 : _a.locateWord(word);
        this.showWordMenu(evt, word, ctx, exists);
    }
  }
  showWordMenu(evt, word, ctx, exists) {
    const menu = new import_obsidian51.Menu();
    menu.addItem((item) => {
      item.setTitle(t(exists ? "mobile.menu.open" : "mobile.menu.add", { word }));
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        if (added) new import_obsidian51.Notice(t("mobile.menu.added", { word }));
      });
    });
    menu.showAtMouseEvent(evt);
  }
  // Tap action "save": no sidebar, no sheet — a Notice with 復原.
  async quickSaveWord(word, ctx) {
    var _a;
    try {
      await quickSave(word, {
        add: async () => {
          var _a2;
          const added = await this.addWordToVocab(word, ctx, { reveal: false });
          if (!added) return null;
          return (_a2 = this.store.entries.find((e) => e.word.toLowerCase() === word.toLowerCase())) != null ? _a2 : null;
        },
        remove: async (entry) => {
          await this.deleteEntry(entry);
          this.renderSidebar();
        },
        notify: (text, actions) => (actions == null ? void 0 : actions.length) ? actionNotice(text, actions) : new import_obsidian51.Notice(text)
      });
      this.renderSidebar();
      (_a = this.sidebarView()) == null ? void 0 : _a.locateWord(word);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save the word", e);
      new import_obsidian51.Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  getWordContext(x, y) {
    var _a;
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
    const examSpan = (_a = node.parentElement) == null ? void 0 : _a.closest(`.${EXAM_WORD_CLS}`);
    const block = examSpan == null ? void 0 : examSpan.closest("p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6");
    if (examSpan && block) {
      const range = document.createRange();
      range.setStart(block, 0);
      range.setEnd(node, start);
      const before = range.toString().length;
      const blockText = block.textContent || "";
      return { word, sentence: extractSentence(blockText, before, before + (end - start), null) };
    }
    const sentence = extractSentence(text, start, end, node);
    return { word, sentence };
  }
  // `reveal` (default): show the word afterwards — sidebar, or the bottom
  // sheet on iPhone. Quick save and the sheet's own 「加入」 pass false.
  async addWordToVocab(word, ctx = {}, opts = {}) {
    var _a, _b;
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
    const labels = this.examLabels((_b = (_a = this.wordlists.match(word)) == null ? void 0 : _a.tags) != null ? _b : []);
    if (!existing) {
      const entry = this.newEntry(String(Date.now()), word, {
        level: labels.join(", "),
        example: ctx.sentence || "",
        source
      });
      await this.store.addEntry(entry);
      this.enrichEntry(entry);
    } else {
      const before = JSON.stringify([existing.source, existing.example, existing.level]);
      if (!existing.source && source) existing.source = source;
      if (!existing.example && ctx.sentence) existing.example = ctx.sentence;
      existing.level = mergeLevel(existing.level, labels);
      if (JSON.stringify([existing.source, existing.example, existing.level]) !== before) await this.store.touch(existing);
    }
    if (opts.reveal !== false) await this.surfaces.revealWord(word, ctx);
    return existing == null;
  }
  newEntry(id, word, fields) {
    return {
      id,
      word,
      level: "",
      synonyms: "",
      antonyms: "",
      example: "",
      definition: "",
      definitionZh: "",
      phonetic: "",
      partOfSpeech: "",
      grammar: "",
      source: null,
      added: nowStamp(),
      lastReviewed: nowStamp(),
      reviews: 0,
      ...fields
    };
  }
  async jumpToSource(entry) {
    if (!entry.source || !entry.source.path) return;
    const file = this.app.vault.getAbstractFileByPath(entry.source.path);
    if (!file) {
      new import_obsidian51.Notice("Source note not found: " + entry.source.path);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: entry.source.line } });
  }
  // ── Auto-fetch dictionary data (Wiktionary, falls back to Datamuse) ──
  // `quiet` (background queue): no notice on failure, no sidebar render.
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
      if (opts.quiet) return;
      this.renderSidebar();
      if (opts.verbose) new import_obsidian51.Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      if (opts.quiet) return;
      new import_obsidian51.Notice(`Vocab Tracker: couldn't fetch "${entry.word}" \u2014 ${(e == null ? void 0 : e.message) || e}`);
    }
  }
  refreshSidebar() {
    var _a;
    const view = this.sidebarView();
    if (!view) return;
    const path = ((_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) || "";
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
  // Every delete entry point (WordRow.ts's remove()) calls this instead of
  // deleteEntry directly: shows what the word is linked to (families,
  // saved trivia, verb favorite, word page, discussion), and only deletes
  // — then unlinks those — once the learner confirms. Resolves to whether
  // it was actually deleted, so the caller knows whether to refresh.
  async confirmDeleteEntry(entry) {
    await Promise.all([this.learn.ensureLoaded(), this.threads.ensureLoaded()]);
    const impact = this.linkage.impact(entry.id, entry.word);
    return new Promise((resolve) => {
      new DeleteEntryModal(this.app, entry.word, impact, (result) => {
        if (!result) {
          resolve(false);
          return;
        }
        void this.deleteEntryConfirmed(entry, result).then(() => resolve(true));
      }).open();
    });
  }
  async deleteEntryConfirmed(entry, result) {
    await this.deleteEntry(entry);
    this.linkage.unlink(entry.id);
    if (result.trashWordPage) {
      const path = this.exporter.wordPagePath(entry.id, entry.word);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file) await this.app.fileManager.trashFile(file);
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
      mark.addClass("vt-tracked-mark");
      mark.setAttr("aria-label", t("mobile.mark.label", { word }));
      mark.addEventListener("click", () => void this.surfaces.revealWord(word));
    });
  }
};
/*! Bundled license information:

ts-fsrs/dist/index.mjs:
ts-fsrs/dist/index.mjs:
ts-fsrs/dist/index.mjs:
  (* istanbul ignore next -- @preserve *)
*/

import {
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
import { ObsidianStorage } from "./src/platform/ObsidianStorage";
import { DictionaryService } from "./src/services/dictionary/DictionaryService";
import { VocabStore } from "./src/core/store/VocabStore";
import { loadMigrated } from "./src/core/migrations/loadMigrated";
import { cleanupTombstones } from "./src/core/store/cleanupTombstones";
import { merge } from "./src/core/store/merge";
import { updateSourcePaths } from "./src/core/store/updateSourcePaths";
import { nowStamp } from "./src/core/nowStamp";
import { VocabSidebarView, VOCAB_VIEW_TYPE } from "./src/ui/sidebar/VocabSidebarView";
import { renderDashboard } from "./src/ui/blocks/dashboard";
import { resolveLocale, setLocale } from "./src/core/i18n";
import { obsidianLanguage } from "./src/platform/obsidianLanguage";
import { createAiPorts } from "./src/platform/aiPorts";
import { createAiService } from "./src/services/ai/createAiService";
import type { AiService } from "./src/services/ai/AiService";
import { VocabSettingsTab } from "./src/ui/settings/SettingsTab";
import { SETTINGS_SECTIONS } from "./src/ui/settings/sections";

// ─── Constants ────────────────────────────────────────────────────────────────

// Lives inside its own folder so related notes (per-exam lists, planning
// docs, etc.) can sit alongside it instead of cluttering the vault root.
const VOCAB_FOLDER = "vocab-list";
const VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
const VOCAB_FILE_LEGACY = "vocab-list.md";

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default class VocabTrackerPlugin extends Plugin {
  vocabData: VocabData = { entries: [] };
  store!: VocabStore;
  dictionary!: DictionaryService;
  storage!: ObsidianStorage;
  ai!: AiService;

  async onload() {
    this.storage = new ObsidianStorage(this);
    this.vocabData = cleanupTombstones(await loadMigrated(this.storage));

    this.store = new VocabStore(this.vocabData, (data) => this.storage.writeShard("data", data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
    this.applyLocale();

    // AI (M3): service + settings tab. AI stays off until enabled in settings.
    const { ai, keys } = createAiService(this.store, createAiPorts(this.app, this.storage));
    this.ai = ai;
    const settingsCtx = { app: this.app, store: this.store, ai, keys, applyLocale: () => this.applyLocale() };
    this.addSettingTab(new VocabSettingsTab(this.app, this, settingsCtx, SETTINGS_SECTIONS));

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
      (source, el, ctx) => renderDashboard(this, source, el, ctx)
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

    // Keep tracked entries pointed at their source note when it's moved/renamed
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const changed = updateSourcePaths(this.vocabData.entries, oldPath, file.path);
        for (const entry of changed) await this.store.touch(entry);
      })
    );

    this.app.workspace.onLayoutReady(() => this.ensureVocabFile());
  }

  // So a debounced write (VocabStore's 500ms coalescing) isn't lost if
  // Obsidian closes right after an edit, before the timer fires.
  async onunload() {
    this.ai?.dispose();
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
    const disk = await this.storage.readShard<VocabData>("data");
    if (!disk) return;

    const merged = merge(this.vocabData, disk);
    this.vocabData = merged;
    this.store.replace(merged);

    if (JSON.stringify(merged) !== JSON.stringify(disk)) {
      await this.storage.writeShard("data", merged);
    }

    // Not refreshSidebar(): that gates on the active file path to skip
    // redundant renders, but data actually changed here regardless of path.
    const leaf = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    (leaf?.view as VocabSidebarView | undefined)?.render();
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

    const exists = this.store.entries.some(
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
    const existing = this.store.entries.find(
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
      await this.store.addEntry(entry);
      this.enrichEntry(entry);
    } else {
      if (!existing.source && source) existing.source = source;
      if (!existing.example && ctx.sentence) existing.example = ctx.sentence;
      await this.store.touch(existing);
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
      await this.store.touch(entry);

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
    await this.store.deleteEntry(entry.id);
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
}

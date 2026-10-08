import {
  debounce,
  MarkdownPostProcessorContext,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
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
import { GalaxyView, GALAXY_VIEW_TYPE } from "./src/ui/galaxy/GalaxyView";
import { installGalaxyOpen } from "./src/ui/galaxy/galaxyOpen";
import { registerBlocks } from "./src/ui/blocks/registry";
import { SrsService } from "./src/services/srs/SrsService";
import { resolveLocale, setLocale, t } from "./src/core/i18n";
import { createWordLocator, type WordLocator } from "./src/ui/reading/locateWord";
import { createReturnNav, type ReturnNav } from "./src/ui/reading/returnNav";
import { obsidianLanguage } from "./src/platform/obsidianLanguage";
import { createAiPorts } from "./src/platform/aiPorts";
import { createAiService } from "./src/services/ai/createAiService";
import type { AiService } from "./src/services/ai/AiService";
import { VocabSettingsTab } from "./src/ui/settings/SettingsTab";
import { SETTINGS_SECTIONS } from "./src/ui/settings/sections";
import { ObsidianNotes } from "./src/platform/ObsidianNotes";
import { ThreadService } from "./src/services/threads/ThreadService";
import { LearnStore } from "./src/services/learn/LearnStore";
import { createDnaFocus } from "./src/ui/dna/dnaModel";
import { PageContextHub } from "./src/ui/page/pageContext";
import { EmojiService } from "./src/services/learn/EmojiService";
import { FamilyService } from "./src/services/learn/FamilyService";
import { VerbUsageService } from "./src/services/learn/VerbUsageService";
import { TriviaService } from "./src/services/learn/TriviaService";
import { MorphemeService } from "./src/services/learn/MorphemeService";
import { SelectionTracker } from "./src/ui/chat/SelectionTracker";
import { ObsidianWordlists, inFolder } from "./src/platform/ObsidianWordlists";
import { WordlistService } from "./src/services/wordlists/WordlistService";
import { resolveWordlistSettings, tagColor, tagEnabled, type WordlistSettings } from "./src/core/model/wordlists";
import { EXAM_WORD_CLS, highlightExamWords } from "./src/ui/reading/examHighlight";
import { NoteImports } from "./src/services/wordlists/NoteImports";
import { EntryWordIndex } from "./src/services/wordlists/EntryWordIndex";
import { mergeLevel, planImport } from "./src/core/wordlists/importPlan";
import { AutoLike } from "./src/services/like/AutoLike";
import { likeBackfillDecider } from "./src/services/like/backfill";
import { tagLabel } from "./src/core/wordlists/parse";
import type { ScanResult } from "./src/core/wordlists/scan";
import { nowIso } from "./src/core/nowIso";
import { entriesMissingDefinition } from "./src/core/store/needsEnrich";
import { ObsidianVault } from "./src/platform/ObsidianVault";
import { ExportService } from "./src/services/export/ExportService";
import { createExportData } from "./src/services/export/exportData";
import { EntryFilesService } from "./src/services/files/EntryFilesService";
import { SeedRecord } from "./src/services/files/SeedRecord";
import type { EntryFileId } from "./src/services/files/entryFiles";
import type { WordHeaderHost } from "./src/ui/blocks/wordHeader";
import type { WordLinkHost } from "./src/ui/blocks/learnUi";
import { openWordReview } from "./src/ui/blocks/wordReview";
import { createWordPageDecorator } from "./src/ui/reading/WordPageDecorator";
import { PluginNoteChrome } from "./src/ui/reading/PluginNoteChrome";
import { installOpenInPreview } from "./src/ui/reading/openInPreview";
import { ParagraphAnchorService, type SectionRef } from "./src/services/anchors/ParagraphAnchorService";
import { ParagraphIndex } from "./src/services/anchors/ParagraphIndex";
import { ParagraphBadges } from "./src/ui/reading/ParagraphBadges";
import { resolveAnchorSettings } from "./src/ui/sidebar/anchorSettings";
import { resolveUiPrefs } from "./src/core/model/settings";
import { currentFormFactor } from "./src/ui/mobile/platform";
import { wordSurface } from "./src/ui/mobile/formFactor";
import { planTap, tapActionFor } from "./src/ui/mobile/tapAction";
import { WordSheet } from "./src/ui/mobile/WordSheet";
import { WordSurfaces } from "./src/ui/mobile/WordSurfaces";
import { quickSave } from "./src/ui/mobile/quickSave";
import { actionNotice } from "./src/ui/mobile/actionNotice";
import { LivePreviewHint } from "./src/ui/mobile/livePreviewHint";
import { sharedSpeaker, type Speaker } from "./src/ui/mobile/speech";
import { configurePronouncer, disposePronouncer } from "./src/ui/kit/pronounce";
import { flushUndoables } from "./src/ui/kit/undoable";
import { ObsidianDeviceState } from "./src/platform/ObsidianDevice";
import { BackupService } from "./src/services/backup/BackupService";
import type { RestoreChanges } from "./src/core/ports";
import { EntryLinkageService } from "./src/services/learn/EntryLinkageService";
import { DeleteEntryModal, type DeleteEntryResult } from "./src/ui/word/DeleteEntryModal";

// ─── Constants ────────────────────────────────────────────────────────────────

// Lives inside its own folder so related notes (per-exam lists, planning
// docs, etc.) can sit alongside it instead of cluttering the vault root.
const VOCAB_FOLDER = "vocab-list";
const VOCAB_FILE = `${VOCAB_FOLDER}/vocab-list.md`;
const VOCAB_FILE_LEGACY = "vocab-list.md";

// Gap between background dictionary lookups for auto-imported words, so a
// note with a hundred exam words doesn't fire a hundred requests at once.
const ENRICH_GAP_MS = 400;
// Wait after startup before retrying words with no definition, so the
// fetches don't compete with Obsidian loading the workspace.
const RESUME_ENRICH_DELAY_MS = 5000;
// Word DNA (規劃書 09 §2 決定 5, A8): give the workspace a moment to settle
// before the background auto-拆字 batch starts spending its daily budget.
const DNA_AUTO_START_DELAY_MS = 10_000;
// Device-local (not synced) — how many of today's auto-拆字 batches have
// run so far, so a device doesn't blow through the daily cap across
// restarts. Plain window.localStorage (not ObsidianDeviceState): the count
// resetting on a device swap is harmless.
const DNA_BUDGET_KEY = "vt:dna-budget";

function loadDnaBudget(): { day: string; used: number } {
  try {
    const raw = window.localStorage.getItem(DNA_BUDGET_KEY);
    if (!raw) return { day: "", used: 0 };
    const v = JSON.parse(raw) as { day?: unknown; used?: unknown };
    return { day: typeof v.day === "string" ? v.day : "", used: typeof v.used === "number" ? v.used : 0 };
  } catch {
    return { day: "", used: 0 };
  }
}

function saveDnaBudget(v: { day: string; used: number }): void {
  try {
    window.localStorage.setItem(DNA_BUDGET_KEY, JSON.stringify(v));
  } catch {
    // storage unavailable (private mode etc.) — today's count just isn't remembered
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

// The plugin is the host of every vocab-* block (src/ui/blocks/registry.ts):
// vocab-word's WordHeaderHost, the M7 blocks' WordLinkHost.
export default class VocabTrackerPlugin extends Plugin implements WordHeaderHost, WordLinkHost {
  vocabData: VocabData = { entries: [] };
  store!: VocabStore;
  dictionary!: DictionaryService;
  storage!: ObsidianStorage;
  srs!: SrsService;
  ai!: AiService;
  notes!: ObsidianNotes;
  threads!: ThreadService;
  learn!: LearnStore;
  families!: FamilyService;
  emoji!: EmojiService;
  // A morpheme picked on a word page, for the vocab-dna block (09 §7.1).
  readonly dnaFocus = createDnaFocus();
  // 字族樹／Word DNA 頁面 ↔ 側欄「本篇」（規劃書 10 §2.1）.
  readonly pageContext = new PageContextHub();
  verbs!: VerbUsageService;
  trivia!: TriviaService;
  morphemes!: MorphemeService;
  selection!: SelectionTracker;
  wordlists!: WordlistService;
  noteImports!: NoteImports;
  examWordIndex!: EntryWordIndex;
  autoLike!: AutoLike;
  locator!: WordLocator;
  returnNav!: ReturnNav;
  vault!: ObsidianVault;
  exporter!: ExportService;
  files!: EntryFilesService;
  // Keeps families / saved trivia / saved verb usages in step with a word
  // deleted, renamed or just learned (規劃書 06 §4.1, W6).
  linkage!: EntryLinkageService;
  anchors!: ParagraphAnchorService;
  paragraphIndex!: ParagraphIndex;
  paragraphBadges!: ParagraphBadges;
  // M8 (規劃書 06 §9.7, 01): the iPhone bottom sheet, and the switch that
  // sends word cards / paragraph discussions there or to the sidebar.
  sheet!: WordSheet;
  surfaces!: WordSurfaces;
  speaker!: Speaker;
  // 備份與還原 (settings). Restores go through the services below, which
  // reload what it wrote (src/services/backup/restorePlan.ts).
  backups!: BackupService;
  private livePreviewHint!: LivePreviewHint;
  private importing = new Set<string>();
  private enrichQueue: VocabEntry[] = [];
  private enriching = false;
  private unloaded = false;

  async onload() {
    this.storage = new ObsidianStorage(this);
    this.vocabData = cleanupTombstones(await loadMigrated(this.storage));

    this.store = new VocabStore(this.vocabData, (data) => this.storage.writeShard("data", data));
    this.dictionary = new DictionaryService(new ObsidianHttp());
    this.applyLocale();
    // iOS: the first speechSynthesis call can be silent unless the voice
    // list was asked for once beforehand. The same Speaker is the
    // Pronouncer's system voice (ui/kit/pronounce.ts).
    this.speaker = sharedSpeaker();
    this.speaker.warmUp();
    // 🔊 (1005 回饋第 12 項): before anything can pronounce a word — the
    // shared Pronouncer is built on first use with this config.
    configurePronouncer({
      source: () => resolveUiPrefs(this.store.settings.ui).pronounceSource,
      // Failed recording URLs, remembered on this device for 7 days.
      deviceState: new ObsidianDeviceState(this.app),
    });

    // AI (M3): service + settings tab. AI stays off until enabled in settings.
    const { ai, keys } = createAiService(this.store, createAiPorts(this.app, this.storage));
    this.ai = ai;
    // Exam word lists: loaded from a vault folder once the layout is ready
    // (see registerWordlistEvents), then every opened note is scanned in
    // the background and list words are underlined in reading view.
    this.wordlists = new WordlistService({
      source: new ObsidianWordlists(this.app),
      settings: () => this.wordlistSettings(),
    });
    this.noteImports = new NoteImports(this.storage);
    await this.noteImports.load();
    this.examWordIndex = new EntryWordIndex(this.store);

    // The host callbacks only run on a backup / restore, once onload has
    // built every service they touch.
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
        restored: (changes) => this.afterRestore(changes),
      },
    });

    const settingsCtx = {
      app: this.app,
      store: this.store,
      ai,
      keys,
      wordlists: this.wordlists,
      backups: this.backups,
      applyLocale: () => this.applyLocale(),
      onWordlistsChanged: (change: "display" | "scan" | "reload") => void this.onWordlistsChanged(change),
      onAiEnabledChanged: () => this.paragraphBadges?.refresh(),
    };
    this.addSettingTab(new VocabSettingsTab(this.app, this, settingsCtx, SETTINGS_SECTIONS));
    this.srs = new SrsService({ store: this.store, storage: this.storage });

    // M4: word discussions. The selection tracker remembers the last text
    // highlighted in a note so the AI tab can attach it to the next question.
    this.notes = new ObsidianNotes(this.app);
    // One ObsidianVault for the paragraph anchors (M5) and the plugin's
    // notes (M6, below); register() must run before the layout is ready so
    // the metadata cache's first "resolved" isn't missed.
    this.vault = new ObsidianVault(this.app);
    this.vault.register(this);
    // M5: paragraph discussions. Anchors are block ids (or text hashes in
    // hash mode); the mode is read from the settings on every new anchor.
    this.anchors = new ParagraphAnchorService({
      vault: this.vault,
      mode: () => resolveAnchorSettings(this.store.settings).mode,
    });
    this.threads = new ThreadService({ storage: this.storage, store: this.store, ai, notes: this.notes, anchors: this.anchors });

    // M7: word families, verb usage and trivia. learn.json loads lazily,
    // the first time one of them is used.
    this.learn = new LearnStore({ storage: this.storage });
    this.families = new FamilyService({ ai, vocab: this.store, learn: this.learn, dictionary: this.dictionary });
    this.emoji = new EmojiService({ ai, vocab: this.store, learn: this.learn, aiReady: () => this.ai.status() === "ready" });
    // Word DNA (規劃書 09 §7, A8/A9): splits liked words into morphemes in
    // the background and backs the vocab-dna block's chat.
    this.morphemes = new MorphemeService({
      ai,
      vocab: this.store,
      learn: this.learn,
      dictionary: this.dictionary,
      threads: this.threads,
      dailyBatches: () => this.store.settings.ai.dnaDailyBatches ?? 10,
      budget: { load: loadDnaBudget, save: saveDnaBudget },
      aiReady: () => this.ai.status() === "ready",
    });
    this.verbs = new VerbUsageService({ ai, vocab: this.store, learn: this.learn });
    this.trivia = new TriviaService({
      threads: this.threads,
      vocab: this.store,
      learn: this.learn,
      // A4（1006 #15）：單字頁「來一則」／冷知識頁指定一個字，問到答案後
      // 自動 like 這個字。autoLike 比 trivia 晚建立，用 closure 延後讀取。
      onAsked: (id) => void this.autoLike?.likeEntry(id),
    });

    // Wave 7 Y — 自動 like (1006 #15)：單字討論、找字族、產生用法、複習、
    // 冷知識指定字 都算「真的用到」，補 like 回去。見 AutoLike 開頭註解。
    this.autoLike = new AutoLike({
      store: this.store,
      threads: this.threads,
      family: this.families,
      verbs: this.verbs,
      srs: this.srs,
    });
    // 必須在任何 UI 有機會呼叫 ask()/setPinned() 之前 await，見 AutoLike.init() 註解。
    await this.threads.ensureLoaded();
    // Wave 7 Y — 一次性回填 (1006 #23)：舊資料的 liked 欄位全是 undefined，
    // 用既有訊號（討論串、複習、用法…）決定哪些字算已經 like 過。
    const likeMigrated = await this.store.backfillLiked(likeBackfillDecider({ threads: this.threads }));
    if (likeMigrated) console.log(`Vocab Tracker: backfilled liked for ${likeMigrated} entries`);
    await this.autoLike.init();

    // 第八波 R2 — 側欄點單字 → 捲到筆記裡的位置；單字頁返回時還原 (1006-2 #7-9 #15-16)。
    this.locator = createWordLocator(this.app, {
      inflections: () => resolveWordlistSettings(this.store.settings.wordlists).inflections,
    });
    this.returnNav = createReturnNav(this.app, this.locator);

    this.selection = new SelectionTracker(this.app);
    this.registerDomEvent(document, "selectionchange", () => this.selection.update());
    // §4.3: back in the foreground (iOS resumes the app instead of
    // restarting it), pick up threads / learn / reviews another device
    // synced meanwhile — that sync doesn't fire onExternalSettingsChange
    // unless data.json changed too. Each reload writes the union back if
    // this device has something the synced copy lacks.
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      void this.threads.reload();
      void this.learn.reload();
      void this.srs.reloadLogs();
    });

    // M6: the plugin's notes. ExportService keeps 單字/<word>.md,
    // 討論串/<文章>.ai.md and 冷知識.md's saved list in step with the data;
    // EntryFilesService owns the entry files (單字卡.md…) and follows
    // article renames/deletes (規劃書 06 §4.6, §8). Both use this.vault.
    this.exporter = new ExportService({
      vault: this.vault,
      data: createExportData({
        entries: () => this.store.entries,
        threads: this.threads,
        learn: this.learn,
        notes: this.notes,
      }),
      folders: () => this.files.exportFolders(),
      taskLabel: (taskId) => {
        const label = ai.tasks.get(taskId)?.label;
        return label ? t(label) : undefined;
      },
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
      isArticle: (p) => /\.md$/i.test(p) && !/\.ai\.md$/i.test(p) && this.isImportable(p),
    });
    // handleRename moves the paragraph anchors itself (folders too), then
    // the article's .ai.md; the source-path handler below stays as is.
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => void this.files.handleRename(oldPath, file.path, file instanceof TFolder))
    );
    this.registerEvent(this.app.vault.on("delete", (file) => this.files.handleDelete(file.path, file instanceof TFolder)));

    // Keeps families / saved trivia / saved verb usages in step with a
    // word deleted, renamed or just learned (規劃書 06 §4.1, W6).
    // init() seeds the baseline before the listener below runs, so every
    // word already in the list isn't treated as "just added".
    this.linkage = new EntryLinkageService({
      learn: this.learn,
      vocab: this.store,
      wordPageExists: (id, word) => this.vault.exists(this.exporter.wordPagePath(id, word)),
      threadCount: (id) => this.threads.wordQuestionCount(id),
      morphemes: { queue: (ids) => this.morphemes.queue(ids) },
    });
    this.linkage.init();
    this.register(this.store.events.on("data:changed", () => void this.linkage.sync()));

    // Word pages: buttons next to the managed section headings (the
    // vocab-word header block itself is in registerBlocks below).
    this.registerMarkdownPostProcessor(
      createWordPageDecorator({
        app: this.app,
        entry: (id) => this.store.entries.find((e) => e.id === id),
        frontmatterOf: (p) => this.frontmatterOf(p),
        families: this.families,
        verbs: this.verbs,
        trivia: this.trivia,
        // The bottom sheet on iPhone.
        openInSidebar: (entry) => this.surfaces.openWordCard(entry.id, "ai"),
        notify: (m) => new Notice(m),
      })
    );
    // The plugin's own notes: 「屬性」 folded / small, no doubled title.
    new PluginNoteChrome(this.app).attach(this);

    // Sidebar
    this.registerView(
      VOCAB_VIEW_TYPE,
      (leaf) => new VocabSidebarView(leaf, this)
    );
    // Full-screen Word Galaxy (09 §6.1), opened by a galaxy block's 展開.
    this.registerView(GALAXY_VIEW_TYPE, (leaf) => new GalaxyView(leaf, this));
    // 字族樹.md opens as the full-screen galaxy in the same tab (1007-2 #6).
    installGalaxyOpen(this);

    // iPhone: word cards and paragraph discussions open in a bottom sheet
    // instead (WordSurfaces decides per call; iPad/desktop keep the sidebar).
    this.sheet = this.addChild(new WordSheet(this));
    this.surfaces = new WordSurfaces({
      form: currentFormFactor,
      sheet: this.sheet,
      revealSidebar: async () => (await this.activateSidebar()).view as VocabSidebarView,
      existingSidebar: () => this.sidebarView(),
    });
    this.livePreviewHint = new LivePreviewHint({
      form: currentFormFactor,
      enabled: () => resolveUiPrefs(this.store.settings.ui).livePreviewHint,
      notify: (text, actions) => actionNotice(text, actions, 8000),
      switchToReading: () => void this.switchToReadingView(),
      disable: () =>
        void this.store.updateSettings((s) => {
          s.ui.livePreviewHint = false;
        }),
    });

    // M5: the ✦ next to paragraphs in reading view (hover to ask; ✦ n once
    // a paragraph has a discussion). The index follows the threads.
    this.paragraphIndex = new ParagraphIndex();
    this.register(this.paragraphIndex.attach(this.threads));
    this.paragraphBadges = new ParagraphBadges({
      index: this.paragraphIndex,
      onOpen: (ref) => void this.openParagraph(ref),
      showGhost: () => this.store.settings.ai.enabled,
    });
    this.register(this.paragraphBadges.attach());
    this.registerMarkdownPostProcessor(this.paragraphBadges.process);

    // Click handler for ==highlights== in reading mode
    this.registerMarkdownPostProcessor(this.processMarks.bind(this));

    // Underline exam-list words in reading mode (view-only)
    this.registerMarkdownPostProcessor((el) => {
      const lookup = this.wordlists.highlightLookup();
      if (!lookup) return;
      const s = this.wordlistSettings();
      highlightExamWords(el, lookup, (tag) => tagColor(s, tag));
    });

    // Click any plain English word in reading mode
    this.registerDomEvent(document, "click", this.handleReadingClick.bind(this));

    // vocab-* code blocks (dashboard, flashcards, word header…; §9.6)
    registerBlocks(this);
    this.addCommand({
      id: "open-flashcards",
      name: t("command.openFlashcards"),
      callback: () => this.openFlashcards(),
    });
    this.addCommand({
      id: "open-families",
      name: t("command.openFamilies"),
      callback: () => this.openEntryFile("families"),
    });
    this.addCommand({
      id: "open-verbs",
      name: t("command.openVerbs"),
      callback: () => this.openEntryFile("verbs"),
    });
    this.addCommand({
      id: "open-trivia",
      name: t("command.openTrivia"),
      callback: () => this.openEntryFile("trivia"),
    });
    this.addCommand({
      id: "open-dna",
      name: t("command.openDna"),
      callback: () => this.openEntryFile("dna"),
    });

    // Command palette
    this.addCommand({
      id: "toggle-exam-highlight",
      name: t("command.toggleExamHighlight"),
      callback: () => this.updateWordlistSettings({ highlight: !this.wordlistSettings().highlight }),
    });
    this.addCommand({
      id: "import-exam-words",
      name: t("command.importExamWords"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md" || this.wordlists.index.isEmpty) return false;
        if (!checking) void this.importExamWords(file);
        return true;
      },
    });
    this.addCommand({
      id: "reload-wordlists",
      name: t("command.reloadWordlists"),
      callback: () => this.wordlists.reload(),
    });

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

    // Ribbon entry to the word list: the sidebar on iPad/desktop, the
    // vocab-dashboard note on iPhone — the right sidebar there is a
    // full-screen drawer over the article (規劃書 01 §2, §3.1).
    this.addRibbonIcon("book-open", t("ribbon.openWordList"), () => {
      void (currentFormFactor() === "phone" ? this.openVocabFile() : this.activateSidebar());
    });

    // Notes in the vocab folder open in reading mode (1007-2 #3).
    installOpenInPreview(this, () => this.files.paths().folder);

    // Keep the sidebar scoped to whatever note is in front
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshSidebar())
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.refreshSidebar();
        // First time a note is opened (or since it last changed): count its
        // exam words in the background so the sidebar has them ready.
        if (file) void this.scanNote(file);
      })
    );

    // Keep tracked entries pointed at their source note when it's moved/renamed
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const changed = updateSourcePaths(this.vocabData.entries, oldPath, file.path);
        if (changed.length) await this.store.touchMany(changed);
        await this.noteImports.rename(oldPath, file.path);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      // iPhone's right-swipe sidebar (規劃書 01 §2): quietly hang our tab
      // off it, next to Obsidian's own Links/Outline — never revealed, so
      // it doesn't jump in front of the article the way activateSidebar()
      // would. iPad/desktop already get a leaf the normal way (tapping a
      // tracked word routes through WordSurfaces → activateSidebar()).
      if (currentFormFactor() === "phone" && resolveUiPrefs(this.store.settings.ui).sidebarOnPhone) {
        void this.ensureSidebarLeaf();
      }
      void this.ensureVocabFile();
      // Entry files never created before (one the user deleted stays deleted).
      void this.files.ensureAll();
      this.registerWordlistEvents();
      void this.wordlists.reload();
      // Words whose dictionary fetch never finished (closed mid-queue,
      // offline…) get another try every startup.
      const timer = window.setTimeout(
        () => this.enqueueEnrich(entriesMissingDefinition(this.store.entries)),
        RESUME_ENRICH_DELAY_MS
      );
      this.register(() => window.clearTimeout(timer));
      // Word DNA (A8): background auto-拆字 for liked words, after the
      // workspace has had a moment to settle.
      const dnaTimer = window.setTimeout(() => this.morphemes.startAuto(), DNA_AUTO_START_DELAY_MS);
      this.register(() => window.clearTimeout(dnaTimer));
    });
  }

  // So a debounced write (VocabStore's 500ms coalescing) isn't lost if
  // Obsidian closes right after an edit, before the timer fires.
  async onunload() {
    // Stop any 🔊 playback and release cached recordings.
    disposePronouncer();
    this.unloaded = true;
    // Any pending undoable delete (row.ts's 10 秒復原窗) sends now, before
    // the services it would write to go away.
    flushUndoables();
    this.autoLike?.dispose();
    this.examWordIndex?.dispose();
    this.returnNav?.dispose();
    // Threads first: it saves in-flight answers as stopped with their text
    // so far, before ai.dispose() aborts the requests.
    this.threads?.dispose();
    this.ai?.dispose();
    await Promise.all([this.store.flush(), this.srs.flush(), this.threads?.flush(), this.learn?.flush()]);
    // Last: the steps above can still announce changes (stopped answers).
    await this.exporter?.flush();
    this.exporter?.dispose();
  }

  // Interface language: the user's setting, or Obsidian's language on "auto".
  applyLocale() {
    setLocale(resolveLocale(this.store.settings.ui.locale, obsidianLanguage()));
  }

  // Fires when the data.json on disk changed from outside this session —
  // sync (iCloud/Obsidian Sync/Git) pulling in another device's edits.
  // Merge instead of overwriting so neither side's changes get clobbered.
  async onExternalSettingsChange() {
    // reviews.json syncs alongside data.json but isn't what fires this
    // event; refresh it here too so the new-card cap sees the other
    // device's reviews without waiting for our next write.
    void this.srs.reloadLogs();
    void this.threads.reload();
    void this.learn.reload();
    void this.noteImports.load();

    const disk = await this.storage.readShard<VocabData>("data");
    if (!disk) return;
    const wordlistsBefore = JSON.stringify(this.wordlistSettings());
    const aiBefore = this.store.settings.ai.enabled;

    const merged = merge(this.vocabData, disk);
    this.vocabData = merged;
    this.store.replace(merged);

    if (JSON.stringify(merged) !== JSON.stringify(disk)) {
      await this.storage.writeShard("data", merged);
    }

    // Not refreshSidebar(): that gates on the active file path to skip
    // redundant renders, but data actually changed here regardless of path.
    this.sidebarView()?.render();
    // Another device changed list colours / toggles / folder.
    if (JSON.stringify(this.wordlistSettings()) !== wordlistsBefore) void this.onWordlistsChanged("reload");
    // Another device switched AI on/off: the ✦ hover badges follow.
    if (this.store.settings.ai.enabled !== aiBefore) this.paragraphBadges.refresh();
  }

  // After 從備份還原: the store and the shard services already hold the
  // restored data (their events redrew the sidebar lists, chat panels and
  // vocab-* blocks); this redraws what isn't subscribed and re-exports the
  // notes of every record the restore changed.
  private afterRestore(changes: RestoreChanges) {
    this.renderSidebar();
    this.refreshExamStrip();
    this.rerenderReadingViews();
    this.paragraphBadges?.refresh();
    for (const id of changes.entryIds) this.exporter.wordChanged(id);
    for (const thread of changes.threads) this.exporter.threadChanged(thread);
    for (const family of changes.families) this.exporter.familyChanged(family);
    for (const item of changes.trivia) this.exporter.triviaItemChanged(item);
  }

  // ── Exam word lists ────────────────────────────────────────────

  wordlistSettings(): WordlistSettings {
    return resolveWordlistSettings(this.store.settings.wordlists);
  }

  async updateWordlistSettings(patch: Partial<WordlistSettings>) {
    await this.store.updateSettings((s) => (s.wordlists = { ...this.wordlistSettings(), ...patch }));
    await this.onWordlistsChanged("display");
  }

  // Sidebar chip: turn one list's underlines on/off. If underlining is off
  // altogether, a click means "show me this one", so it turns that on too.
  async toggleExamTag(tag: string) {
    const s = this.wordlistSettings();
    const on = s.highlight && tagEnabled(s, tag);
    await this.updateWordlistSettings({
      highlight: s.highlight || !on,
      tags: { ...s.tags, [tag]: { ...s.tags[tag], enabled: !on } },
    });
  }

  async onWordlistsChanged(change: "display" | "scan" | "reload") {
    // reload() emits "index-changed", which re-renders everything below.
    if (change === "reload") return this.wordlists.reload();
    if (change === "scan") this.wordlists.invalidateScans();
    this.rerenderReadingViews();
    this.refreshExamStrip();
  }

  // Scans a note in the background, then auto-imports its exam words.
  async scanNote(file: TFile) {
    if (file.extension !== "md" || this.wordlists.index.isEmpty) return;
    try {
      const result = await this.wordlists.scan(file.path, file.stat.mtime, () => this.app.vault.cachedRead(file));
      // Wave 7 Y (1006 #25): every scan — not just the first one — checks
      // for exam words the note has but the vocab list lost (deleted, or
      // never imported).
      if (this.wordlistSettings().autoImport) {
        await this.importExamWords(file, { result });
      }
    } catch (e) {
      console.error("Vocab Tracker: exam word scan failed", e);
    }
  }

  // Notes whose words shouldn't become vocab entries: the lists themselves
  // and the plugin's own folders (vocab-list, and the entry-file folder
  // with the word pages and .ai.md notes if it was moved elsewhere).
  private isImportable(path: string): boolean {
    const filesFolder = this.files?.paths().folder;
    return (
      !inFolder(path, this.wordlistSettings().folder) &&
      !inFolder(path, VOCAB_FOLDER) &&
      !(filesFolder && inFolder(path, filesFolder))
    );
  }

  // Exam labels for a word's list tags — enabled lists only ("TOEFL, IELTS").
  examLabels(tags: readonly string[]): string[] {
    const s = this.wordlistSettings();
    return tags.filter((tag) => tagEnabled(s, tag)).map(tagLabel);
  }

  // Adds every exam-list word in the note to the vocab list (level = its
  // exams, liked:false — 1006 #25), and adds the exam labels to words
  // already tracked. Runs on every scan now, so a word the user deleted
  // and the note still has gets re-added (under a new id, unliked) once
  // the 10 秒 undo window has passed — see EntryWordIndex / planImport.
  async importExamWords(file: TFile, opts: { result?: ScanResult } = {}) {
    if (!this.isImportable(file.path) || this.importing.has(file.path)) return;
    this.importing.add(file.path);
    try {
      const result =
        opts.result ??
        (await this.wordlists.scan(file.path, file.stat.mtime, () => this.app.vault.cachedRead(file)));
      const plan = planImport(result.hits, this.examWordIndex, (tags) => this.examLabels(tags), { now: Date.now() });

      const base = Date.now();
      const created = plan.create.map((w, i) =>
        this.newEntry(`${base}-${i}`, w.word, {
          level: w.level,
          example: w.example,
          source: { path: file.path, line: w.line },
          origin: "wordlist",
          liked: false,
        })
      );
      if (created.length) await this.store.addEntries(created);
      for (const r of plan.retag) r.entry.level = r.level;
      if (plan.retag.length) await this.store.touchMany(plan.retag.map((r) => r.entry));
      // 不再是 gate，只留做「最後匯入時間」紀錄。
      await this.noteImports.mark(file.path, nowIso());

      if (created.length || plan.retag.length) {
        new Notice(
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
  enqueueEnrich(entries: VocabEntry[]) {
    const queued = new Set(this.enrichQueue.map((e) => e.id));
    this.enrichQueue.push(...entries.filter((e) => !queued.has(e.id)));
    if (!this.enriching) void this.drainEnrichQueue();
  }

  private async drainEnrichQueue() {
    this.enriching = true;
    let done = 0;
    while (this.enrichQueue.length && !this.unloaded) {
      const entry = this.enrichQueue.shift()!;
      // Deleted, or filled in some other way while it waited.
      if (entriesMissingDefinition([entry]).length === 0) continue;
      await this.enrichEntry(entry, { quiet: true });
      // Re-render now and then rather than per word — a full sidebar
      // render resets anything half-typed in it.
      if (++done % 20 === 0) this.renderSidebar();
      await new Promise((r) => setTimeout(r, ENRICH_GAP_MS));
    }
    this.enriching = false;
    if (done) this.renderSidebar();
  }

  renderSidebar() {
    this.sidebarView()?.render();
  }

  registerWordlistEvents() {
    // Re-read the lists when a file inside the list folder changes. Editing
    // a list fires modify on every keystroke-save, hence the debounce.
    const reload = debounce(() => void this.wordlists.reload(), 800, true);
    const inLists = (path: string) => inFolder(path, this.wordlistSettings().folder);
    const onChange = (file: TAbstractFile, oldPath?: string) => {
      if (inLists(file.path) || (oldPath && inLists(oldPath))) reload();
    };
    this.registerEvent(this.app.vault.on("create", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => onChange(f, oldPath)));

    // The open note was edited: refresh its counts once typing settles.
    const rescanActive = debounce(() => this.refreshExamStrip(), 1500, true);
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (inLists(f.path)) reload();
        else if (f.path === this.app.workspace.getActiveFile()?.path) rescanActive();
      })
    );

    this.wordlists.on("index-changed", () => {
      this.rerenderReadingViews();
      this.refreshExamStrip();
      // The note open at startup was opened before the lists loaded.
      const active = this.app.workspace.getActiveFile();
      if (active) void this.scanNote(active);
    });
    this.wordlists.on("scanned", ({ path }) => {
      if (path === this.app.workspace.getActiveFile()?.path) this.refreshExamStrip();
    });
  }

  // Re-runs post-processors so underlines follow the current lists/settings.
  rerenderReadingViews() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView) view.previewMode?.rerender(true);
    }
  }

  refreshExamStrip() {
    this.sidebarView()?.refreshExamStrip();
  }

  // The sidebar view if it's open and loaded — never opens it. A tab not
  // shown since startup is a DeferredView (Obsidian 1.7.2+) and gives null.
  sidebarView(): VocabSidebarView | null {
    const view = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0]?.view;
    return view instanceof VocabSidebarView ? view : null;
  }

  // Finds or creates the sidebar leaf, without revealing it — iPhone's
  // sidebarOnPhone setting uses this to hang a "單字" tab off the native
  // right-swipe sidebar quietly at startup (規劃書 01 §2: revealing it on
  // iPhone would cover the article).
  async ensureSidebarLeaf(): Promise<WorkspaceLeaf> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VOCAB_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("split");
      await leaf.setViewState({ type: VOCAB_VIEW_TYPE, active: true });
    }
    return leaf;
  }

  async activateSidebar(): Promise<WorkspaceLeaf> {
    const leaf = await this.ensureSidebarLeaf();
    // Obsidian 1.7.2+: a sidebar tab not shown since startup is a DeferredView
    // until revealed — without the await, leaf.view has no setWord/openWord.
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  // A reading-view ✦ was clicked: that paragraph's discussion in the
  // sidebar (the bottom sheet on iPhone).
  async openParagraph(ref: SectionRef) {
    await this.surfaces.openParagraph(ref);
  }

  // Live Preview hint's 「切換到閱讀模式」.
  async switchToReadingView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    await view.setState({ ...view.getState(), mode: "preview" }, { history: false });
  }

  async openVocabFile() {
    await this.ensureVocabFile();
    const file = this.app.vault.getAbstractFileByPath(VOCAB_FILE) as TFile;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  openFlashcards() {
    return this.openEntryFile("flashcards");
  }

  // Opens an entry file (單字卡 / 字族樹 / 動詞用法 / 冷知識), creating it if
  // it's missing — never overwriting one that's there.
  // WordHeaderHost (09 §7.1): a strand part on a word page → Word DNA.md
  // with that morpheme selected (an already-open copy is reused).
  openMorpheme(morphemeId: string) {
    this.dnaFocus.focus(morphemeId);
    void this.openEntryFile("dna", "tab");
  }

  async openEntryFile(id: EntryFileId, where: "current" | "tab" = "current") {
    try {
      await this.openNote(await this.files.ensure(id), where);
    } catch (e) {
      console.error(`Vocab Tracker: couldn't open the ${id} entry file`, e);
      new Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  // The 「單字頁」 button: the word's page, created now if it has none.
  async openWordPage(entryId: string) {
    try {
      const entry = this.store.entries.find((e) => e.id === entryId);
      if (entry) this.returnNav.remember(entry);
      const path = await this.files.openWordPage(entryId);
      if (path) await this.openNote(path);
    } catch (e) {
      console.error("Vocab Tracker: couldn't open the word page", e);
      new Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  // "tab": a new tab, or the tab already showing the note.
  async openNote(path: string, where: "current" | "tab" = "current") {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const { workspace } = this.app;
    if (where === "tab") {
      const open = workspace
        .getLeavesOfType("markdown")
        .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === path);
      if (open) {
        workspace.setActiveLeaf(open, { focus: true });
        return;
      }
    }
    await workspace.getLeaf(where === "tab" ? "tab" : false).openFile(file);
  }

  // ── vocab-word block host (WordHeaderHost) ──────────────────────

  frontmatterOf(path: string): Record<string, unknown> | undefined {
    return this.app.metadataCache.getCache(path)?.frontmatter;
  }

  readNote(path: string): Promise<string | null> {
    return this.notes.read(path);
  }

  // 「複習這個字」: a one-word review in a modal — the 單字卡 card and
  // rating on just this word, due or not.
  reviewWord(entry: VocabEntry) {
    openWordReview(this, entry);
  }

  // 字族樹 / 動詞用法 / 冷知識 chips of learned words: the word's card on
  // its data tab — the bottom sheet on iPhone, the sidebar elsewhere.
  async openWordCard(entry: VocabEntry) {
    await this.surfaces.openWordCard(entry.id, "data");
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

  // What a tap does is the tap-action setting (規劃書 01 §3.2) — desktop
  // and mobile set separately: a menu, save at once, or open the card.
  handleReadingClick(evt: MouseEvent) {
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return;

    const preview = target.closest(".markdown-preview-view, .markdown-rendered");
    if (!preview) {
      // Mobile opens notes in Live Preview, where tapping does nothing:
      // say so, once per session.
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
        // 1005 回饋 3: an open sidebar follows a tracked word (a menu tap never opens it).
        if (exists && wordSurface(currentFormFactor()) !== "sheet") this.sidebarView()?.locateWord(word);
        this.showWordMenu(evt, word, ctx, exists);
    }
  }

  showWordMenu(evt: MouseEvent, word: string, ctx: WordContext, exists: boolean) {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t(exists ? "mobile.menu.open" : "mobile.menu.add", { word }));
      item.setIcon(exists ? "book-open" : "plus");
      item.onClick(async () => {
        const added = await this.addWordToVocab(word, ctx);
        if (added) new Notice(t("mobile.menu.added", { word }));
      });
    });
    menu.showAtMouseEvent(evt);
  }

  // Tap action "save": no sidebar, no sheet — a Notice with 復原.
  async quickSaveWord(word: string, ctx: WordContext) {
    try {
      await quickSave(word, {
        add: async () => {
          const added = await this.addWordToVocab(word, ctx, { reveal: false });
          if (!added) return null;
          return this.store.entries.find((e) => e.word.toLowerCase() === word.toLowerCase()) ?? null;
        },
        remove: async (entry) => {
          await this.deleteEntry(entry);
          this.renderSidebar();
        },
        notify: (text, actions) => (actions?.length ? actionNotice(text, actions) : new Notice(text)),
      });
      this.renderSidebar();
      this.sidebarView()?.locateWord(word);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save the word", e);
      new Notice(t("wordPage.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
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

    // An underlined exam word is its own text node (a span), so the
    // sentence has to come from the enclosing block's full text.
    const examSpan = node.parentElement?.closest(`.${EXAM_WORD_CLS}`);
    const block = examSpan?.closest("p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6");
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
  async addWordToVocab(word: string, ctx: Partial<WordContext> = {}, opts: { reveal?: boolean } = {}): Promise<boolean> {
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

    const labels = this.examLabels(this.wordlists.match(word)?.tags ?? []);

    if (!existing) {
      const entry = this.newEntry(String(Date.now()), word, {
        level: labels.join(", "),
        example: ctx.sentence || "",
        source,
        liked: true, // 1006-2 #1：手動加字＝自動 like
      });
      await this.store.addEntry(entry);
      this.enrichEntry(entry);
    } else {
      const before = JSON.stringify([existing.source, existing.example, existing.level]);
      if (!existing.source && source) existing.source = source;
      if (!existing.example && ctx.sentence) existing.example = ctx.sentence;
      existing.level = mergeLevel(existing.level, labels);
      // Only a real change counts: the sidebar orders words by updatedAt (1005 回饋 1).
      if (JSON.stringify([existing.source, existing.example, existing.level]) !== before) await this.store.touch(existing);
      if (!existing.liked) await this.store.setLiked(existing, true); // 1006-2 #1
    }

    if (opts.reveal !== false) await this.surfaces.revealWord(word, ctx);
    return existing == null;
  }

  newEntry(id: string, word: string, fields: Partial<VocabEntry>): VocabEntry {
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
      ...fields,
    };
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

  // ── Auto-fetch dictionary data (Wiktionary, falls back to Datamuse) ──

  // `quiet` (background queue): no notice on failure, no sidebar render.
  async enrichEntry(entry: VocabEntry, opts: { verbose?: boolean; quiet?: boolean } = {}) {
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
      if (opts.verbose) new Notice(`Vocab Tracker: fetched "${entry.word}"`);
    } catch (e: any) {
      console.error("Vocab Tracker: dictionary fetch failed", e);
      if (opts.quiet) return;
      new Notice(`Vocab Tracker: couldn't fetch "${entry.word}" — ${e?.message || e}`);
    }
  }

  refreshSidebar() {
    const view = this.sidebarView() as any;
    if (!view) return;
    const path = this.app.workspace.getActiveFile()?.path || "";
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

  // Every delete entry point (WordRow.ts's remove()) calls this instead of
  // deleteEntry directly: shows what the word is linked to (families,
  // saved trivia, verb favorite, word page, discussion), and only deletes
  // — then unlinks those — once the learner confirms. Resolves to whether
  // it was actually deleted, so the caller knows whether to refresh.
  async confirmDeleteEntry(entry: VocabEntry): Promise<boolean> {
    await Promise.all([this.learn.ensureLoaded(), this.threads.ensureLoaded()]);
    const impact = this.linkage.impact(entry.id, entry.word);
    return new Promise<boolean>((resolve) => {
      new DeleteEntryModal(this.app, entry.word, impact, (result) => {
        if (!result) {
          resolve(false);
          return;
        }
        void this.deleteEntryConfirmed(entry, result).then(() => resolve(true));
      }).open();
    });
  }

  private async deleteEntryConfirmed(entry: VocabEntry, result: DeleteEntryResult): Promise<void> {
    await this.deleteEntry(entry);
    this.linkage.unlink(entry.id);
    if (result.trashWordPage) {
      const path = this.exporter.wordPagePath(entry.id, entry.word);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file) await this.app.fileManager.trashFile(file);
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
      mark.addClass("vt-tracked-mark");
      // aria-label, not title: no hover on touch screens (規劃書 01 §2).
      mark.setAttr("aria-label", t("mobile.mark.label", { word }));
      mark.addEventListener("click", () => void this.surfaces.revealWord(word));
    });
  }
}

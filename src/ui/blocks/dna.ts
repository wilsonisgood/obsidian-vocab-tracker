import { MarkdownRenderChild, Notice, setIcon, type App, type MarkdownPostProcessorContext } from "obsidian";
import { t, type I18nKey } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import { morphemeThreadId, type BreakdownPart, type Morpheme, type MorphemeType } from "../../core/model/morpheme";
import { liveTurns } from "../../core/model/thread";
import { emojiOf } from "../../core/model/wordMeta";
import type { VocabStore } from "../../core/store/VocabStore";
import type { AiService, AiStatus } from "../../services/ai/AiService";
import type { LearnStore } from "../../services/learn/LearnStore";
import type { ThreadService } from "../../services/threads/ThreadService";
import { ChatPanel, createChatUiState, type ChatPanelOptions, type ChatSend, type ChatUiState } from "../chat/ChatPanel";
import type { SelectionTracker } from "../chat/SelectionTracker";
import {
  DNA_TAB_ORDER,
  defaultFocusEntryId,
  morphemeChips,
  parseDnaParams,
  relatedWords,
  resolveDnaSelection,
  wiktionaryUrl,
  type DnaParams,
} from "../dna/dnaModel";
import { MorphemeEditModal } from "../dna/MorphemeEditModal";
import { renderStrand } from "../dna/strand";
import type { MorphemeService as MorphemeApi, MorphemeStat } from "../../services/learn/MorphemeService";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { openPluginSettings } from "../kit/openSettings";
import { segmented } from "../kit/segmented";
import { guardReadingClicks, isAbort, learnErrorText } from "./learnUi";

// ── vocab-dna code block (規劃書 09 §7; A3/A9) ──────────────────────
//
//   ```vocab-dna
//   type: suffix        # 字首 prefix ／字尾 suffix ／字根 root (optional)
//   morpheme: ee         # which chip to select first (optional)
//   ```
//
// Three tabs (字首／字尾／字根), each with a chip per morpheme that has at
// least one liked word (`MorphemeApi.stats`); the selected chip's main
// panel shows one word's breakdown (the strand, shared with Galaxy/word
// page), its timeline and 冷知識; the side panel lists every related word
// (learned first, then AI suggestions not yet in the vocab list) and the
// three AI Tutor actions (A9).
//
// `MorphemeApi` is an alias for services/learn/MorphemeService's class type
// (整合：former ui/dna/types.ts interface removed once DS merged).

const TAB_KEY: Record<MorphemeType, I18nKey> = {
  prefix: "dna.tabs.prefix",
  suffix: "dna.tabs.suffix",
  root: "dna.tabs.root",
};

function fadeIn(el: HTMLElement): void {
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate?.(
    [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 260, easing: "ease-out" }
  );
}

// Same shape as kit/aiState.ts's renderAiGate, but taking the status
// directly instead of a full plugin — dna.ts only has DnaBlockDeps, not
// VocabTrackerPlugin (regardless of which real services back it).
function renderAiGate(parent: HTMLElement, status: AiStatus, onOpenSettings: () => void): boolean {
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
      action: { label: t("ai.action.openSettings"), icon: "settings", onClick: onOpenSettings },
    })
  );
  return true;
}

// What the block needs — bundled so it never depends on the concrete
// VocabTrackerPlugin (MorphemeService isn't even in this branch; see the
// file header). main.ts/registry.ts wire this up (整合事項).
export interface DnaBlockDeps {
  app: App;
  manifestId: string;
  vocab: VocabStore;
  learn: LearnStore;
  morphemes: MorphemeApi;
  threads: ThreadService;
  ai: AiService;
  selection: SelectionTracker;
  // Opens the word's card in the sidebar (plugin.surfaces.openWordCard).
  // Optional: without it the focused word's name just isn't clickable.
  openWord?(entry: VocabEntry): void;
}

export function renderDna(deps: DnaBlockDeps, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  ctx.addChild(new DnaBlock(el, deps, parseDnaParams(source), ctx.sourcePath));
}

class DnaBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private ready = false;
  private disposed = false;
  private initializedSelection = false;
  private type: MorphemeType = "suffix";
  private morphemeId: string | undefined;
  private focusEntryId: string | undefined;
  private expandedChat = new Set<string>();
  private chatState: ChatUiState = createChatUiState();
  private chat: ChatPanel | null = null;
  private chatHost: HTMLElement | null = null;
  private adding = new Set<string>();
  private expanding = new Set<string>();
  private analyzeCtrl: AbortController | null = null;
  private rafId: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private deps: DnaBlockDeps,
    private params: DnaParams,
    private sourcePath: string
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-dna"] });
    guardReadingClicks(this, this.root);
    this.root.createDiv({ cls: "vt-learn-loading", text: t("learn.loading") });

    const schedule = () => this.scheduleRender();
    this.register(this.deps.learn.events.on("morpheme:upsert", schedule));
    this.register(this.deps.learn.events.on("wordMeta:upsert", schedule));
    this.register(this.deps.learn.events.on("learn:reloaded", schedule));
    this.register(this.deps.vocab.events.on("data:changed", schedule));
    this.register(this.deps.morphemes.events.on("dna:progress", schedule));
    this.register(() => {
      this.disposed = true;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.analyzeCtrl?.abort();
    });

    void this.deps.learn.ensureLoaded().then(() => {
      if (this.disposed) return;
      this.ready = true;
      this.render();
    });
  }

  // rAF-throttled: a batch of morpheme/wordMeta upserts (auto-analysis)
  // shouldn't repaint once per record.
  private scheduleRender(): void {
    if (!this.ready || this.disposed || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.disposed) this.render();
    });
  }

  private statsByType(): Record<MorphemeType, readonly MorphemeStat[]> {
    const out = {} as Record<MorphemeType, readonly MorphemeStat[]>;
    for (const type of DNA_TAB_ORDER) out[type] = this.deps.morphemes.stats(type);
    return out;
  }

  // ── Render ────────────────────────────────────────────────────

  private render(): void {
    const root = this.root;
    root.empty();
    if (this.chat) this.removeChild(this.chat);
    this.chat = null;
    this.chatHost = null;

    const statsByType = this.statsByType();
    const hasAny = DNA_TAB_ORDER.some((ty) => statsByType[ty].length > 0);
    if (!hasAny) return this.renderEmpty(root);

    if (!this.initializedSelection) {
      const sel = resolveDnaSelection(this.params, statsByType);
      this.type = sel.type;
      this.morphemeId = sel.morphemeId;
      this.initializedSelection = true;
    } else if (statsByType[this.type].length === 0) {
      const fallback = DNA_TAB_ORDER.find((ty) => statsByType[ty].length > 0);
      if (fallback) this.type = fallback;
    }

    this.renderTabs(root);

    const stats = statsByType[this.type];
    if (!stats.length) {
      root.createDiv({ cls: "vt-dna-tab-empty", text: t("dna.emptyTab") });
      return;
    }
    const cur = stats.find((s) => s.morpheme.id === this.morphemeId) ?? stats[0];
    this.morphemeId = cur.morpheme.id;
    if (!this.focusEntryId || !cur.learned.some((e) => e.id === this.focusEntryId)) {
      this.focusEntryId = defaultFocusEntryId(cur);
    }

    this.renderChips(root, stats, cur);

    const layout = root.createDiv({ cls: "vt-dna-layout" });
    const main = layout.createDiv({ cls: "vt-dna-main" });
    const side = layout.createDiv({ cls: "vt-dna-side" });
    this.renderMain(main, cur);
    this.renderSide(side, cur);
    fadeIn(main);
    fadeIn(side);
  }

  private renderEmpty(root: HTMLElement): void {
    const progress = this.deps.morphemes.progress();
    if (progress.running) {
      const box = root.createDiv({ cls: "vt-learn-busy" });
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: t("dna.analyzing", { done: progress.done, total: progress.total }) });
      return;
    }
    const status = this.deps.ai.status();
    if (renderAiGate(root, status, () => openPluginSettings(this.deps.app, this.deps.manifestId))) return;

    const n = this.deps.vocab.entries.filter((e) => e.liked === true && !this.deps.learn.wordMeta(e.id)?.breakdown).length;
    root.appendChild(
      emptyState({
        icon: "dna",
        title: t("dna.emptyTitle"),
        body: t("dna.emptyBody"),
        action: n > 0 ? { label: t("dna.analyzeNow", { n }), icon: "sparkles", onClick: () => this.analyzeNow() } : undefined,
      })
    );
  }

  private renderTabs(root: HTMLElement): void {
    segmented<MorphemeType>(root.createDiv({ cls: "vt-dna-tabs" }), {
      ariaLabel: t("dna.tabsAria"),
      value: this.type,
      options: DNA_TAB_ORDER.map((ty) => ({ value: ty, label: t(TAB_KEY[ty]) })),
      onChange: (ty) => {
        this.type = ty;
        this.morphemeId = undefined;
        this.focusEntryId = undefined;
        this.render();
      },
    });
  }

  private renderChips(root: HTMLElement, stats: readonly MorphemeStat[], cur: MorphemeStat): void {
    const wrap = root.createDiv({ cls: "vt-dna-chips" });
    for (const chip of morphemeChips(stats)) {
      const btn = wrap.createEl("button", { cls: "vt-dna-chip", attr: { type: "button" } });
      const active = chip.id === cur.morpheme.id;
      btn.toggleClass("is-active", active);
      btn.setAttr("aria-pressed", String(active));
      btn.createSpan({ cls: "vt-dna-chip-form", text: chip.form });
      btn.createSpan({ cls: "vt-dna-chip-meaning", text: `${chip.meaningZh} · ${t("dna.chipLearned", { n: chip.learnedCount })}` });
      btn.addEventListener("click", () => {
        if (chip.id === this.morphemeId) return;
        this.morphemeId = chip.id;
        this.focusEntryId = undefined;
        this.render();
      });
    }
  }

  // ── Main panel ────────────────────────────────────────────────

  private renderMain(main: HTMLElement, cur: MorphemeStat): void {
    const m = cur.morpheme;
    const head = main.createDiv({ cls: "vt-dna-head" });
    head.createDiv({ cls: ["vt-dna-form", `t-${m.type}`], text: m.form });
    const info = head.createDiv({ cls: "vt-dna-head-info" });
    info.createDiv({ cls: ["vt-dna-tag", `t-${m.type}`], text: t(TAB_KEY[m.type]) });
    info.createDiv({ cls: "vt-dna-meaning", text: m.meaningZh });
    info.createDiv({ cls: "vt-dna-note", text: t("dna.source", { o: m.origin }) });

    const focus = cur.learned.find((e) => e.id === this.focusEntryId) ?? cur.learned[0];
    if (focus) {
      const section = main.createDiv({ cls: "vt-dna-section" });
      const label = section.createDiv({ cls: "vt-dna-label" });
      const emoji = emojiOf(this.deps.learn.wordMeta(focus.id), focus);
      label.appendText(`${t("dna.breakdownLabel")} · ${emoji} `);
      this.wordButton(label, focus).setText(focus.word);
      label.appendText(`（${focus.definitionZh || ""}）`);
      const breakdown = this.deps.morphemes.breakdownOf(focus.id);
      if (breakdown) renderStrand(section, breakdown, { onPart: (part) => this.focusOnPart(part) });
      else section.createDiv({ cls: "vt-dna-note", text: t("dna.notAnalyzed") });
    }

    if (m.timeline.length) {
      const section = main.createDiv({ cls: "vt-dna-section" });
      section.createDiv({ cls: "vt-dna-label", text: t("dna.timelineLabel") });
      const ol = section.createEl("ol", { cls: "vt-dna-tl" });
      for (const stage of m.timeline) {
        const li = ol.createEl("li");
        li.createDiv({ cls: "vt-dna-tl-stage", text: stage.stage });
        li.createDiv({ cls: "vt-dna-tl-form", text: stage.form });
      }
    }

    if (m.fact) {
      const fact = main.createDiv({ cls: "vt-dna-fact" });
      fact.createDiv({ cls: "vt-dna-fact-head", text: `💡 ${m.fact.title}` });
      fact.createDiv({ cls: "vt-dna-fact-body", text: m.fact.body });
    }

    const wiki = main.createDiv({ cls: "vt-dna-wiki" });
    setIcon(wiki.createSpan({ cls: "vt-dna-wiki-icon" }), "info");
    wiki.createSpan({ cls: "vt-dna-wiki-text", text: `${t("dna.wiktionaryNote")} ` });
    const link = wiki.createEl("a", { text: t("dna.wiktionaryLink"), href: wiktionaryUrl(m.form) });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener");

    const controls = main.createDiv({ cls: "vt-dna-controls" });
    const verifyBtn = controls.createEl("button", { cls: "vt-dna-verify", attr: { type: "button" } });
    verifyBtn.toggleClass("is-active", !!m.verified);
    verifyBtn.setAttr("aria-pressed", String(!!m.verified));
    setIcon(verifyBtn.createSpan({ cls: "vt-dna-verify-icon" }), m.verified ? "check-circle" : "circle");
    verifyBtn.createSpan({ text: t("dna.verified") });
    verifyBtn.addEventListener("click", () => this.deps.morphemes.setVerified(m.id, !m.verified));

    const editBtn = controls.createEl("button", { cls: "vt-dna-edit-btn", attr: { type: "button" } });
    setIcon(editBtn.createSpan({ cls: "vt-dna-edit-icon" }), "pencil");
    editBtn.createSpan({ text: t("dna.edit") });
    editBtn.addEventListener("click", () => this.openEdit(m));
  }

  private wordButton(parent: HTMLElement, entry: VocabEntry): HTMLElement {
    if (!this.deps.openWord) return parent.createSpan({ cls: "vt-dna-word" });
    const btn = parent.createEl("button", {
      cls: "vt-dna-word is-link",
      attr: { type: "button", title: t("learn.openWord", { word: entry.word }) },
    });
    btn.addEventListener("click", () => this.deps.openWord?.(entry));
    return btn;
  }

  private focusOnPart(part: BreakdownPart): void {
    if (!part.morphemeId || part.type === "inflection") return;
    this.type = part.type;
    this.morphemeId = part.morphemeId;
    this.focusEntryId = undefined;
    this.render();
  }

  private openEdit(m: Morpheme): void {
    new MorphemeEditModal(this.deps.app, m, (patch) => {
      this.deps.morphemes.edit(m.id, patch);
      this.deps.morphemes.setVerified(m.id, true);
    }).open();
  }

  // ── Side panel ────────────────────────────────────────────────

  private renderSide(side: HTMLElement, cur: MorphemeStat): void {
    const related = relatedWords(cur, (e) => emojiOf(this.deps.learn.wordMeta(e.id), e));
    const learnedCount = related.filter((r) => r.kind === "learned").length;

    const progress = side.createDiv({ cls: "vt-dna-progress" });
    progress.createSpan({ cls: "vt-dna-progress-text", text: t("dna.progress", { learned: learnedCount, total: related.length }) });
    const bar = progress.createDiv({ cls: "vt-dna-bar" });
    const pct = related.length ? Math.round((learnedCount / related.length) * 100) : 100;
    bar.createSpan({ attr: { style: `width:${pct}%` } });

    side.createDiv({ cls: "vt-dna-label", text: t("dna.related") });
    const list = side.createDiv({ cls: "vt-dna-list" });
    for (const r of related) {
      if (r.kind === "learned") {
        const row = list.createEl("button", { cls: "vt-dna-row", attr: { type: "button" } });
        row.toggleClass("is-active", r.entryId === this.focusEntryId);
        row.createSpan({ cls: "vt-dna-row-emoji", text: r.emoji });
        row.createSpan({ cls: "vt-dna-row-word", text: r.word });
        row.createSpan({ cls: "vt-dna-row-tag is-known", text: t("dna.known") });
        row.createSpan({ cls: "vt-dna-row-zh", text: r.zh });
        row.addEventListener("click", () => {
          if (r.entryId === this.focusEntryId) return;
          this.focusEntryId = r.entryId;
          this.render();
        });
      } else {
        const row = list.createDiv({ cls: "vt-dna-row is-suggested" });
        row.createSpan({ cls: "vt-dna-row-emoji", text: r.emoji });
        row.createSpan({ cls: "vt-dna-row-word", text: r.word });
        row.createSpan({ cls: "vt-dna-row-zh", text: r.zh });
        const key = `${cur.morpheme.id}\u0000${r.word.toLowerCase()}`;
        const busy = this.adding.has(key);
        const add = row.createEl("button", { cls: "vt-dna-row-add clickable-icon", attr: { type: "button" } });
        setIcon(add, busy ? "loader" : "plus");
        add.disabled = busy;
        add.setAttr("aria-label", t("dna.add", { word: r.word }));
        add.addEventListener("click", () => this.addSuggested(cur.morpheme.id, r.word));
      }
    }

    this.renderAiTutor(side, cur);
  }

  private addSuggested(morphemeId: string, word: string): void {
    const key = `${morphemeId}\u0000${word.toLowerCase()}`;
    if (this.adding.has(key)) return;
    this.adding.add(key);
    this.render();
    this.deps.morphemes
      .addSuggested(morphemeId, word)
      .then((entry) => {
        if (entry) new Notice(t("dna.added", { word: entry.word }));
      })
      .catch((e) => {
        console.error("Vocab Tracker: adding a DNA word failed", e);
        new Notice(learnErrorText(e));
      })
      .finally(() => {
        this.adding.delete(key);
        if (!this.disposed) this.render();
      });
  }

  // ── AI Tutor (A9) ─────────────────────────────────────────────

  private renderAiTutor(side: HTMLElement, cur: MorphemeStat): void {
    side.createDiv({ cls: "vt-dna-label", text: t("dna.aiTutor") });
    const row = side.createDiv({ cls: "vt-dna-tutor" });
    const ready = this.deps.ai.status() === "ready";
    const id = cur.morpheme.id;
    const busy = this.deps.morphemes.isChatBusy(id);

    const expandBtn = row.createEl("button", { cls: "vt-dna-pill", attr: { type: "button" }, text: t("dna.expandMore") });
    expandBtn.disabled = !ready || this.expanding.has(id);
    expandBtn.addEventListener("click", () => this.expandMore(id));

    const exBtn = row.createEl("button", { cls: "vt-dna-pill", attr: { type: "button" }, text: t("dna.examples") });
    exBtn.disabled = !ready || busy;
    exBtn.addEventListener("click", () => this.askChat(id, "examples"));

    const cmpBtn = row.createEl("button", { cls: "vt-dna-pill", attr: { type: "button" }, text: t("dna.compare") });
    cmpBtn.disabled = !ready || busy;
    cmpBtn.addEventListener("click", () => this.askChat(id, "compare"));

    if (!ready) row.title = this.deps.ai.status() === "offline" ? t("learn.ai.offline") : t("learn.ai.body");

    if (liveTurns(this.deps.morphemes.chatThread(id)).length > 0) this.expandedChat.add(id);
    if (this.expandedChat.has(id)) {
      this.chatHost = side.createDiv({ cls: "vt-dna-chat" });
      this.mountChat(id);
    }
  }

  private expandMore(id: string): void {
    if (this.expanding.has(id)) return;
    this.expanding.add(id);
    this.render();
    this.deps.morphemes
      .expand(id)
      .catch((e) => {
        if (isAbort(e)) return;
        console.error("Vocab Tracker: DNA expand failed", e);
        new Notice(learnErrorText(e));
      })
      .finally(() => {
        this.expanding.delete(id);
        if (!this.disposed) this.render();
      });
  }

  private askChat(id: string, kind: "examples" | "compare"): void {
    this.expandedChat.add(id);
    this.render();
    this.deps.morphemes.askChat(id, kind).catch((e) => {
      if (isAbort(e)) return;
      console.error("Vocab Tracker: DNA chat failed", e);
      new Notice(learnErrorText(e));
    });
  }

  private mountChat(id: string): void {
    const host = this.chatHost;
    if (!host) return;
    if (this.chat) this.removeChild(this.chat);
    host.empty();
    const opts: ChatPanelOptions = {
      app: this.deps.app,
      threads: this.deps.threads,
      ai: this.deps.ai,
      selection: this.deps.selection,
      threadId: morphemeThreadId(id),
      surface: "morpheme",
      customTaskId: "dna.followup",
      sourcePath: this.sourcePath,
      placeholder: t("dna.chatPlaceholder"),
      state: this.chatState,
      send: (req) => this.sendChat(id, req),
      retry: (turnId) => this.deps.morphemes.retry(id, turnId),
      onOpenSettings: () => openPluginSettings(this.deps.app, this.deps.manifestId),
    };
    this.chat = this.addChild(new ChatPanel(host, opts));
  }

  private async sendChat(id: string, req: ChatSend): Promise<void> {
    await this.deps.morphemes.followup(id, req.question ?? "", req.selection);
  }

  // ── Analyze now (empty state) ────────────────────────────────

  private analyzeNow(): void {
    if (this.analyzeCtrl) return;
    const ids = this.deps.vocab.entries
      .filter((e) => e.liked === true && !this.deps.learn.wordMeta(e.id)?.breakdown)
      .map((e) => e.id);
    if (!ids.length) return;
    const ctrl = (this.analyzeCtrl = new AbortController());
    this.render();
    this.deps.morphemes
      .analyzeNow(ids, ctrl.signal)
      .catch((e) => {
        if (isAbort(e)) return;
        console.error("Vocab Tracker: DNA analysis failed", e);
        new Notice(learnErrorText(e));
      })
      .finally(() => {
        if (this.analyzeCtrl === ctrl) this.analyzeCtrl = null;
        if (!this.disposed) this.render();
      });
  }
}

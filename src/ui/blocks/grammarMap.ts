import { MarkdownRenderChild, Notice, type MarkdownPostProcessorContext } from "obsidian";
import { GRAMMAR_TOPICS, topicById } from "../../core/grammar/catalog";
import { dueTopics, recommendNext, topicStatuses } from "../../core/grammar/progress";
import type { GrammarStage } from "../../core/model/grammar";
import type { CefrLevel } from "../../core/model/settings";
import type { GrammarStore } from "../../services/grammar/GrammarStore";
import { segmented } from "../kit/segmented";
import {
  defaultStage,
  gl,
  lockedTooltip,
  mapRows,
  mistakeEntries,
  mistakeTotal,
  parseMapParams,
  stageLabel,
  STAGES,
  type MapRow,
} from "./grammarMapModel";
import { guardReadingClicks, learnButton } from "./learnUi";

// ── vocab-grammar code block (第十五波 M, 1013 §3.1) ───────────────
//
//   ```vocab-grammar
//   stage: 2      # optional: 1–3 or 基礎／中級／進階; default = the learner's CEFR level
//   ```
//
// The grammar map (Grammar.md): a segmented 基礎／中級／進階, 「建議下一個」,
// 「今天待複習 n 個主題」, one row per topic (status dot, title, pattern,
// status) and an expandable 錯題本 grouped by error tag. A row opens the
// topic page; a 🔒 only hints at unstarted prerequisites and never blocks.
//
// What the block needs is bundled in GrammarMapDeps so it never depends on
// the concrete VocabTrackerPlugin (as dna.ts does with DnaBlockDeps);
// registry.ts builds it (整合事項).

export interface GrammarMapDeps {
  grammar: Pick<GrammarStore, "ensureLoaded" | "attempts" | "questions" | "progress" | "events">;
  // LearnerProfile.level (plugin.settings.learner.level).
  level(): CefrLevel | "";
  // GrammarPages.open: the topic's page, created on first use.
  openTopic(topicId: string): void | Promise<void>;
  now?(): Date;
}

// The stage the learner last picked, per note, for this session only (not
// saved): a re-render of the note keeps it.
const pickedStage = new Map<string, GrammarStage>();

export function renderGrammarMap(deps: GrammarMapDeps, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  ctx.addChild(new GrammarMapBlock(el, deps, source, ctx.sourcePath));
}

class GrammarMapBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private ready = false;
  private disposed = false;
  private stage: GrammarStage;
  private mistakesOpen = false;

  constructor(
    containerEl: HTMLElement,
    private deps: GrammarMapDeps,
    source: string,
    private sourcePath: string
  ) {
    super(containerEl);
    this.stage = pickedStage.get(sourcePath) ?? parseMapParams(source).stage ?? defaultStage(deps.level());
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-gr", "vt-gr-map"] });
    guardReadingClicks(this, this.root);
    this.root.createDiv({ cls: "vt-learn-loading", text: gl("map.loading") });

    const { events } = this.deps.grammar;
    const refresh = () => this.render();
    this.register(events.on("attempt:add", refresh));
    this.register(events.on("progress:upsert", refresh));
    this.register(events.on("question:upsert", refresh));
    this.register(events.on("grammar:reloaded", refresh));
    this.register(() => (this.disposed = true));

    void this.deps.grammar.ensureLoaded().then(() => {
      this.ready = true;
      this.render();
    });
  }

  private open(topicId: string): void {
    Promise.resolve(this.deps.openTopic(topicId)).catch((e: unknown) => {
      new Notice(gl("map.openFailed", { msg: e instanceof Error ? e.message : String(e) }));
    });
  }

  private render(): void {
    if (this.disposed || !this.ready) return;
    const { grammar } = this.deps;
    const now = this.deps.now?.() ?? new Date();
    const attempts = grammar.attempts();
    const statuses = topicStatuses(GRAMMAR_TOPICS, attempts, (id) => grammar.progress(id), now);
    const statusOf = (id: string) => statuses.get(id) ?? "new";

    this.root.empty();

    const head = this.root.createDiv({ cls: "vt-gr-head" });
    head.createDiv({ cls: "vt-gr-title", text: gl("map.title") });
    segmented(head, {
      options: STAGES.map((s) => ({ value: String(s), label: stageLabel(s) })),
      value: String(this.stage),
      ariaLabel: gl("map.stage"),
      onChange: (v) => {
        this.stage = Number(v) as GrammarStage;
        pickedStage.set(this.sourcePath, this.stage);
        this.render();
      },
    });

    const next = recommendNext(GRAMMAR_TOPICS, statusOf, this.deps.level());
    if (next) {
      const bar = this.root.createDiv({ cls: "vt-gr-bar vt-gr-next" });
      bar.createSpan({ cls: "vt-gr-bar-label", text: `${gl("map.next")}：` });
      bar.createSpan({ cls: "vt-gr-bar-main", text: next.title });
      bar.createSpan({ cls: "vt-gr-bar-sub", text: next.pattern });
      learnButton(bar, { label: gl("map.start"), icon: "play", cta: true, onClick: () => this.open(next.id) });
    }

    const due = dueTopics(GRAMMAR_TOPICS, (id) => grammar.progress(id), now);
    if (due.length) {
      const bar = this.root.createDiv({ cls: "vt-gr-bar vt-gr-due" });
      bar.createSpan({ cls: "vt-gr-bar-main", text: gl("map.due", { n: due.length }) });
      learnButton(bar, { label: gl("map.review"), icon: "repeat", onClick: () => this.open(due[0].id) });
    }

    const rows = mapRows(this.stage, GRAMMAR_TOPICS, statusOf, attempts);
    const list = this.root.createDiv({ cls: "vt-gr-list" });
    if (!rows.length) list.createDiv({ cls: "vt-gr-empty", text: gl("map.empty") });
    for (const row of rows) this.renderRow(list, row);

    this.renderMistakes();
  }

  private renderRow(list: HTMLElement, row: MapRow): void {
    const btn = list.createEl("button", { cls: ["vt-gr-row", `is-${row.status}`], attr: { type: "button" } });
    btn.createSpan({ cls: ["vt-gr-dot", `is-${row.status}`], attr: { "aria-hidden": "true" } });
    const text = btn.createSpan({ cls: "vt-gr-row-text" });
    text.createSpan({ cls: "vt-gr-row-title", text: row.topic.title });
    text.createSpan({ cls: "vt-gr-row-pattern", text: row.topic.pattern });
    if (row.lockedBy.length) {
      const tip = lockedTooltip(row.lockedBy);
      const lock = btn.createSpan({ cls: "vt-gr-lock", text: "🔒", attr: { title: tip, "aria-label": tip } });
      lock.setAttr("role", "img");
    }
    btn.createSpan({ cls: "vt-gr-row-status", text: row.statusText });
    btn.addEventListener("click", () => this.open(row.topic.id));
  }

  private renderMistakes(): void {
    const { grammar } = this.deps;
    const entries = mistakeEntries(grammar.questions(), grammar.attempts());
    const total = mistakeTotal(entries);
    const box = this.root.createDiv({ cls: "vt-gr-mistakes" });
    const toggle = box.createEl("button", { cls: "vt-gr-mistakes-toggle", attr: { type: "button" } });
    toggle.setAttr("aria-expanded", String(this.mistakesOpen));
    toggle.createSpan({ text: gl("map.mistakes", { n: total }) });
    const chevron = toggle.createSpan({ cls: "vt-gr-chevron", text: "›", attr: { "aria-hidden": "true" } });
    chevron.toggleClass("is-open", this.mistakesOpen);
    toggle.addEventListener("click", () => {
      this.mistakesOpen = !this.mistakesOpen;
      this.render();
    });
    if (!this.mistakesOpen) return;

    const body = box.createDiv({ cls: "vt-gr-mistakes-body" });
    if (!entries.length) body.createDiv({ cls: "vt-gr-empty", text: gl("map.mistakes.empty") });
    for (const e of entries) {
      const row = body.createDiv({ cls: "vt-gr-mistake" });
      const text = row.createDiv({ cls: "vt-gr-mistake-text" });
      text.createSpan({ cls: "vt-gr-mistake-tag", text: e.label });
      text.createSpan({ cls: "vt-gr-mistake-count", text: gl("map.mistakes.count", { n: e.count }) });
      const topic = topicById(e.topicId);
      if (topic) text.createSpan({ cls: "vt-gr-mistake-topic", text: topic.title });
      // First version: the group's biggest topic page; P's practice block
      // takes over with `mode: mistakes`.
      learnButton(row, { label: gl("map.mistakes.redo"), icon: "rotate-ccw", ghost: true, onClick: () => this.open(e.topicId) });
    }
  }
}

import { MarkdownRenderChild, Notice, setIcon, type MarkdownPostProcessorContext } from "obsidian";
import { topicById } from "../../core/grammar/catalog";
import { builtInExplanation } from "../../core/grammar/explanations";
import { grammarSightings } from "../../core/grammar/sightings";
import { t } from "../../core/i18n";
import type { GrammarSighting, GrammarTopic } from "../../core/model/grammar";
import type { AiService, AiStatus } from "../../services/ai/AiService";
import { grammarExplain } from "../../services/ai/tasks/grammarExplain";
import type { GrammarPages } from "../../services/grammar/GrammarPages";
import type { GrammarStore } from "../../services/grammar/GrammarStore";
import { findExplanationSection } from "../../services/grammar/topicPage";
import type { ThreadService } from "../../services/threads/ThreadService";
import { aiErrorBox } from "../kit/aiDebug";
import { emptyState } from "../kit/emptyState";
import { inlineNote } from "../kit/inlineNote";
import { objectiveRows, pageErrorText, parseTopicParams, sightingRows, topicChips, topicMeta } from "./grammarTopicModel";
import { guardReadingClicks, isAbort, learnButton, learnErrorText } from "./learnUi";

// ── vocab-grammar-topic code block (第十五波 M, 1013 §3.2) ─────────
//
//   ```vocab-grammar-topic
//   id: present-perfect-vs-past
//   ```
//
// The top of a grammar topic page: stage + difficulty, title, pattern,
// summary; the learning objectives with their scores; 「在你的文章裡」 (the
// reader's own sentences, from the paragraph 文法解析 answers); related
// topic chips; and, while the page's 「## 說明」 is empty, the built-in
// explanation written in by itself (or, for a topic without one, the
// 「✦ 生成說明」 button that has the AI write it once). The practice block
// (vocab-grammar-practice) is another block further down the page.
//
// Dependencies come bundled as GrammarTopicDeps (registry.ts builds them,
// 整合事項).

export interface GrammarTopicDeps {
  grammar: Pick<GrammarStore, "ensureLoaded" | "attempts" | "events">;
  threads: Pick<ThreadService, "ensureLoaded" | "paragraphThreads" | "events">;
  ai: Pick<AiService, "run" | "status">;
  pages: Pick<GrammarPages, "writeExplanation" | "writeBuiltInExplanation">;
  // GrammarPages.open: another topic's page.
  openTopic(topicId: string): void | Promise<void>;
  // The note a sighting came from (plugin.app.workspace.openLinkText).
  openNote(path: string): void | Promise<void>;
  openSettings(): void;
}

export function renderGrammarTopic(
  deps: GrammarTopicDeps,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  // The note's text as Obsidian has it now: tells whether 「## 說明」 is empty.
  const explainEmpty = (): boolean | undefined => {
    const text = ctx.getSectionInfo(el)?.text;
    return text === undefined ? undefined : findExplanationSection(text)?.empty ?? false;
  };
  ctx.addChild(new GrammarTopicBlock(el, deps, parseTopicParams(source).id, explainEmpty));
}

// The same gate as learnUi's renderLearnAiGate / dna.ts's, from a status.
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

class GrammarTopicBlock extends MarkdownRenderChild {
  private root!: HTMLElement;
  private ready = false;
  private disposed = false;
  private topic: GrammarTopic | undefined;
  // The explanation job: running, last error, or written just now.
  private ctrl: AbortController | null = null;
  private error: { text: string; cause?: unknown } | null = null;
  private written = false;
  // The built-in explanation is written by itself the first time the
  // block sees an empty 「## 說明」 (no button to press); once per block.
  private autoFilled = false;

  constructor(
    containerEl: HTMLElement,
    private deps: GrammarTopicDeps,
    private id: string | undefined,
    private explainEmpty: () => boolean | undefined
  ) {
    super(containerEl);
    this.topic = id ? topicById(id) : undefined;
  }

  onload(): void {
    this.containerEl.empty();
    this.root = this.containerEl.createDiv({ cls: ["vt", "vt-learn", "vt-gr", "vt-gr-topic"] });
    guardReadingClicks(this, this.root);

    if (!this.topic) {
      this.root.appendChild(
        inlineNote({ tone: "error", text: this.id ? t("grammar.topic.unknown", { id: this.id }) : t("grammar.topic.noId") })
      );
      return;
    }
    this.root.createDiv({ cls: "vt-learn-loading", text: t("grammar.map.loading") });

    const refresh = () => this.render();
    this.register(this.deps.grammar.events.on("attempt:add", refresh));
    this.register(this.deps.grammar.events.on("grammar:reloaded", refresh));
    this.register(this.deps.threads.events.on("thread:upsert", refresh));
    this.register(this.deps.threads.events.on("threads:reloaded", refresh));
    this.register(() => {
      this.disposed = true;
      this.ctrl?.abort();
    });

    void Promise.all([this.deps.grammar.ensureLoaded(), this.deps.threads.ensureLoaded()]).then(() => {
      this.ready = true;
      this.render();
    });
  }

  private open(topicId: string): void {
    Promise.resolve(this.deps.openTopic(topicId)).catch((e: unknown) => {
      new Notice(t("grammar.map.openFailed", { msg: e instanceof Error ? e.message : String(e) }));
    });
  }

  private render(): void {
    const topic = this.topic;
    if (this.disposed || !this.ready || !topic) return;
    this.root.empty();

    const meta = topicMeta(topic);
    const head = this.root.createDiv({ cls: "vt-gr-topic-head" });
    const tags = head.createDiv({ cls: "vt-gr-topic-tags" });
    tags.createSpan({ cls: ["vt-gr-stage", `is-stage-${topic.stage}`], text: meta.stage });
    tags.createSpan({ cls: "vt-gr-difficulty", text: meta.difficulty });
    head.createDiv({ cls: "vt-gr-topic-title", text: topic.title });
    head.createEl("code", { cls: "vt-gr-topic-pattern", text: topic.pattern });
    head.createDiv({ cls: "vt-gr-topic-summary", text: topic.summary });

    this.renderExplain();
    this.renderObjectives(topic);
    this.renderSightings(topic);
    this.renderRelated(topic);
  }

  // ── 「✦ 生成說明」 ────────────────────────────────────────────

  private renderExplain(): void {
    const box = this.root.createDiv({ cls: "vt-gr-explain" });
    if (this.ctrl) {
      const line = box.createDiv({ cls: "vt-learn-busy-text" });
      setIcon(line.createSpan({ cls: "vt-learn-busy-icon" }), "sparkles");
      line.createSpan({ text: t("grammar.topic.generating") });
      const ctrl = this.ctrl;
      learnButton(box, { label: t("grammar.topic.stop"), icon: "square", onClick: () => ctrl.abort() });
      return;
    }
    if (this.written) {
      box.appendChild(inlineNote({ text: t("grammar.topic.written") }));
      return;
    }
    if (this.error) {
      box.appendChild(aiErrorBox({ text: this.error.text, error: this.error.cause }));
    }
    // Only an empty 「## 說明」 can be filled; with the section missing or
    // written by the learner there's nothing to offer.
    if (this.explainEmpty() === false) return;
    // Built-in explanation (1013-2): no AI, the empty section is filled
    // as soon as the page shows. insertExplanation never overwrites, so an
    // unknown 「empty?」 (no section info yet) is safe to try too. The button
    // is left only as a retry after a failed write.
    if (builtInExplanation(this.topic?.id ?? "")) {
      if (!this.autoFilled) {
        this.autoFilled = true;
        void this.fillBuiltIn(true);
        return;
      }
      const label = t("grammar.topic.fillBuiltIn");
      learnButton(box, { label, icon: "file-plus", onClick: () => void this.fillBuiltIn(false) });
      return;
    }
    if (renderAiGate(box, this.deps.ai.status(), () => this.deps.openSettings())) return;
    learnButton(box, { label: t("grammar.topic.generate"), icon: "sparkles", onClick: () => void this.generate() });
  }

  // `quiet`: the automatic fill — the note re-renders with the explanation
  // in it, so there's no 「已寫入」 line to show.
  private async fillBuiltIn(quiet: boolean): Promise<void> {
    const topic = this.topic;
    if (!topic) return;
    try {
      await this.deps.pages.writeBuiltInExplanation(topic.id);
      if (quiet) return;
      this.written = true;
      this.error = null;
    } catch (e) {
      this.error = { text: pageErrorText(e) ?? learnErrorText(e), cause: e };
    }
    this.render();
  }

  private async generate(): Promise<void> {
    const topic = this.topic;
    if (!topic || this.ctrl) return;
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.error = null;
    this.render();
    try {
      const result = await this.deps.ai.run(grammarExplain, { topic }, { signal: ctrl.signal });
      const markdown = grammarExplain.parse ? grammarExplain.parse(result) : result.text;
      await this.deps.pages.writeExplanation(topic.id, markdown);
      this.written = true;
    } catch (e) {
      if (!isAbort(e)) this.error = { text: pageErrorText(e) ?? learnErrorText(e), cause: e };
    } finally {
      this.ctrl = null;
      this.render();
    }
  }

  // ── Objectives / sightings / related ──────────────────────────

  private renderObjectives(topic: GrammarTopic): void {
    const sec = this.root.createDiv({ cls: "vt-gr-sec" });
    sec.createDiv({ cls: "vt-gr-sec-title", text: t("grammar.topic.objectives") });
    const list = sec.createDiv({ cls: "vt-gr-objectives" });
    for (const o of objectiveRows(topic, this.deps.grammar.attempts(topic.id))) {
      const row = list.createDiv({ cls: ["vt-gr-objective", `is-${o.state}`] });
      row.createSpan({ cls: ["vt-gr-dot", `is-${o.state === "done" ? "mastered" : o.state === "partial" ? "learning" : "new"}`], attr: { "aria-hidden": "true" } });
      row.createSpan({ cls: "vt-gr-objective-text", text: o.text });
      row.createSpan({ cls: "vt-gr-objective-score", text: o.score });
    }
  }

  private renderSightings(topic: GrammarTopic): void {
    const sec = this.root.createDiv({ cls: "vt-gr-sec" });
    sec.createDiv({ cls: "vt-gr-sec-title", text: t("grammar.topic.sightings") });
    const all: GrammarSighting[] = grammarSightings(this.deps.threads.paragraphThreads());
    const rows = sightingRows(all, topic.id);
    if (!rows.length) {
      sec.createDiv({ cls: "vt-gr-empty", text: t("grammar.topic.sightings.empty") });
      return;
    }
    for (const r of rows) {
      const btn = sec.createEl("button", { cls: "vt-gr-sighting", attr: { type: "button" } });
      btn.createSpan({ cls: "vt-gr-sighting-text", text: `“${r.snapshot}”` });
      btn.createSpan({ cls: "vt-gr-sighting-note", text: `— ${r.note}` });
      btn.addEventListener("click", () => {
        Promise.resolve(this.deps.openNote(r.path)).catch((e: unknown) => {
          new Notice(learnErrorText(e));
        });
      });
    }
  }

  private renderRelated(topic: GrammarTopic): void {
    const chips = topicChips(topic);
    if (!chips.length) return;
    const sec = this.root.createDiv({ cls: "vt-gr-sec" });
    sec.createDiv({ cls: "vt-gr-sec-title", text: t("grammar.topic.related") });
    const row = sec.createDiv({ cls: "vt-gr-chips" });
    for (const c of chips) {
      const chip = row.createEl("button", { cls: ["vt-gr-chip", `is-${c.kind}`], attr: { type: "button" } });
      chip.createSpan({ cls: ["vt-gr-stage", `is-stage-${c.topic.stage}`, "is-dot"], attr: { "aria-hidden": "true" } });
      chip.createSpan({ text: c.topic.title });
      chip.createSpan({ cls: "vt-gr-chip-kind", text: c.label });
      chip.addEventListener("click", () => this.open(c.topic.id));
    }
  }
}

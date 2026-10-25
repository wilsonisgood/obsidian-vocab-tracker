import { collectAnalysisMaterial, collectReviewMaterial } from "../../core/learner/analysisMaterial";
import { addDays, isoWeekKey, monthKeyOf, monthRange, previousWeek, quarterKeyOf, quarterRange, shiftRange, weekRange } from "../../core/learner/period";
import { localDayOf } from "../../core/learner/reading";
import { buildReport, type LevelAdvice, type ReportData } from "../../core/learner/report";
import { baselineLevels } from "../../core/learner/levelEstimate";
import { baselineAxes } from "../../core/learner/radar";
import { collectReadingTitles } from "../../core/learner/reportAdvice";
import { removeFrontmatterField, renderReportFile, renderReviewFile, reportDigest, setFrontmatterField, verdictHeadline, type ReportMeta } from "../../core/learner/reportMarkdown";
import type { VocabEntry } from "../../core/model/entry";
import type { CefrLevel } from "../../core/model/settings";
import type { Thread } from "../../core/model/thread";
import { isEmptyAdvice, reportAdvise, resolveAdvice } from "../ai/tasks/report";
import { reportAnalyze } from "../ai/tasks/reportAnalyze";
import { reportReview } from "../ai/tasks/reportReview";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";
import type { LearnerModel } from "../learner/LearnerModel";
import { applyAnalysis } from "./applyAnalysis";

// Learning report writer (規劃書 15 §4): fills in last week's report the
// first time Obsidian opens in a new week, as `<folder>/vocab-report-<key>.md`.
// Unlike the diary, the report is written even when the AI is off; only its
// advice section needs the AI.

export type ReportWriteResult = "written" | "exists" | "busy" | "empty" | "failed";
export type ReportStatus = "idle" | "writing" | "off" | "failed";

export interface ReportLatest {
  key: string;
  path: string;
  verdict: LevelAdvice["verdict"];
  suggestedLevel?: CefrLevel;
  headline: string;
}

export interface ReportVaultPort {
  exists(path: string): boolean;
  create(path: string, content: string): Promise<unknown>;
  process(path: string, fn: (text: string) => string): Promise<unknown>;
  // Paths of the files directly inside `folder` (empty when it's missing).
  list(folder: string): string[];
  frontmatterOf(path: string): Record<string, unknown> | undefined;
}

export interface ReportServiceDeps {
  model: Pick<LearnerModel, "activity" | "snapshot" | "level">;
  vocab: { readonly entries: readonly VocabEntry[] };
  vault: ReportVaultPort;
  folder: () => string;
  enabled: () => boolean;
  ai: LearnAi;
  aiReady: () => boolean;
  // Resolves once the lazily loaded shards are in.
  ready?: () => Promise<void>;
  now?: () => Date;
  // 詳細分析／回顧 (第二十一波 R4).
  // Every thread, tombstones included.
  threads?: () => readonly Thread[];
  practiceQuestion?: (id: string) => { prompt: string; answer: string } | undefined;
  // Text of a report note (null when it can't be read).
  read?: (path: string) => Promise<string | null>;
}

export interface AnalyzeOptions {
  // Analyse from the earliest not-yet-analysed report right before this one
  // (see pendingAnalysis). false = this week only; unset = keep whatever the
  // note was analysed with last time.
  withPrevious?: boolean;
}

export const PENDING_ANALYSIS_MAX = 8;

export type ReportAnalyzeResult = "written" | "busy" | "missing" | "no-ai" | "failed";
export type ReportReviewResult = "written" | "busy" | "empty" | "no-ai" | "failed";

const REPORT_FILE = /^vocab-report-(\d{4}-W\d{2})\.md$/;
const VERDICTS = new Set<LevelAdvice["verdict"]>(["up", "keep", "down", "insufficient"]);

export class ReportService {
  private running = new Set<string>();
  private state: ReportStatus = "idle";
  private listeners = new Set<() => void>();

  constructor(private deps: ReportServiceDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  today(): string {
    return localDayOf(this.now());
  }

  pathOf(key: string): string {
    const f = this.deps.folder();
    return f ? `${f}/vocab-report-${key}.md` : `vocab-report-${key}.md`;
  }

  status(): ReportStatus {
    if (this.state === "idle" && !this.deps.enabled()) return "off";
    return this.state;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private setState(s: ReportStatus): void {
    this.state = s;
    this.notify();
  }

  isAnalyzing(key: string): boolean {
    return this.running.has(`analyze:${key}`);
  }

  private reportKeys(): string[] {
    const keys: string[] = [];
    for (const p of this.deps.vault.list(this.deps.folder())) {
      const m = REPORT_FILE.exec(p.slice(p.lastIndexOf("/") + 1));
      if (m) keys.push(m[1]);
    }
    return keys.sort();
  }

  // Earliest local day of anything recorded up to `to`.
  private earliestDay(to: string): string | null {
    const a = this.deps.model.activity("0000-01-01", to);
    const days: string[] = [];
    for (const x of a.asks) days.push(localDayOf(new Date(x.at)));
    for (const x of a.events) days.push(localDayOf(new Date(x.at)));
    for (const x of a.reviews) days.push(localDayOf(new Date(x.at)));
    for (const x of a.wordTouches) days.push(x.day);
    for (const x of a.reading) days.push(x.day);
    const valid = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    return valid.length ? valid.sort()[0] : null;
  }

  private collect(from: string, to: string): ReportData {
    const prev = shiftRange({ from, to });
    const act = this.deps.model.activity(prev.from, to);
    return buildReport(
      {
        level: this.deps.model.level(),
        ...act,
        vocab: this.deps.vocab.entries,
        grammarMastered: this.deps.model.snapshot().grammar.mastered,
      },
      { from, to },
      prev
    );
  }

  private async advice(data: ReportData): Promise<Pick<ReportMeta, "advice" | "aiNote" | "axes" | "levels">> {
    const level = this.deps.model.level();
    const baseline = baselineAxes(data);
    const levels = baselineLevels(data, level, this.deps.model.snapshot().vocab?.mature);
    if (!this.deps.aiReady()) return { aiNote: "AI 沒有開啟，這段略過", axes: baseline, levels };
    try {
      const readingTitles = collectReadingTitles(this.deps.model.activity(addDays(data.period.from, -30), data.period.to).reading, data.period);
      const { value } = await runStructured(this.deps.ai, reportAdvise, {
        digest: reportDigest(data),
        level,
        baseline,
        baselineLevels: levels,
        readingTitles,
      });
      if (!isEmptyAdvice(value)) return { advice: resolveAdvice(value, baseline, levels) };
    } catch (e) {
      console.error("Vocab Tracker: report advice failed", e);
    }
    return { aiNote: "AI 這次沒寫成功", axes: baseline, levels };
  }

  async write(key: string, opts: { overwrite?: boolean } = {}): Promise<ReportWriteResult> {
    const path = this.pathOf(key);
    if (this.running.has(key)) return "busy";
    if (!opts.overwrite && this.deps.vault.exists(path)) return "exists";
    this.running.add(key);
    this.setState("writing");
    try {
      await this.deps.ready?.();
      const week = weekRange(key);
      const first = !this.reportKeys().some((k) => k < key);
      let from = week.from;
      if (first) {
        const earliest = this.earliestDay(week.to);
        if (earliest && earliest <= week.to) from = earliest;
      }
      const data = this.collect(from, week.to);
      if (data.activity.activeDays === 0) {
        this.setState("idle");
        return "empty";
      }
      const content = renderReportFile(data, { key, first, ...(await this.advice(data)) });
      if (this.deps.vault.exists(path)) await this.deps.vault.process(path, () => content);
      else await this.deps.vault.create(path, content);
      this.setState("idle");
      return "written";
    } catch (e) {
      console.error("Vocab Tracker: report failed", e);
      this.setState("failed");
      return "failed";
    } finally {
      this.running.delete(key);
    }
  }

  // Called once after the layout is ready.
  async maybeWriteLastWeek(): Promise<ReportWriteResult | "off"> {
    if (!this.deps.enabled()) {
      this.setState("off");
      return "off";
    }
    return this.write(previousWeek(this.today()).key);
  }

  // The weeks right before `key` whose reports exist but were never analysed
  // (no `analyzed`, no `analyzed-in`), oldest first, at most 8, unbroken: the
  // first gap, an analysed week or a missing report ends the walk.
  pendingAnalysis(key: string): string[] {
    const have = new Set(this.reportKeys());
    const out: string[] = [];
    let day = weekRange(key).from;
    while (out.length < PENDING_ANALYSIS_MAX) {
      day = addDays(day, -1);
      const k = isoWeekKey(day);
      day = weekRange(k).from;
      if (!have.has(k)) break;
      const fm = this.deps.vault.frontmatterOf(this.pathOf(k));
      if (fm?.analyzed || fm?.["analyzed-in"]) break;
      out.unshift(k);
    }
    return out;
  }

  private periodOf(key: string): { from: string; to: string } {
    const fm = this.deps.vault.frontmatterOf(this.pathOf(key));
    const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(String(fm?.period ?? ""));
    return m ? { from: m[1], to: m[2] } : weekRange(key);
  }

  // 詳細分析 (規劃書 15 §6): reads the period's AI discussions, wrong answers
  // and word touches, and writes the answer into the report's managed blocks.
  async analyze(key: string, opts: AnalyzeOptions = {}): Promise<ReportAnalyzeResult> {
    const path = this.pathOf(key);
    const id = `analyze:${key}`;
    if (this.running.has(id)) return "busy";
    if (!this.deps.vault.exists(path)) return "missing";
    if (!this.deps.aiReady()) return "no-ai";
    this.running.add(id);
    this.notify();
    try {
      await this.deps.ready?.();
      const fm = this.deps.vault.frontmatterOf(path);
      const own = this.periodOf(key);
      let range = own;
      let previous: string[] = [];
      if (opts.withPrevious) {
        previous = this.pendingAnalysis(key);
        if (previous.length) range = { from: this.periodOf(previous[0]).from, to: own.to };
      } else if (opts.withPrevious === undefined && typeof fm?.["analyzed-from"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fm["analyzed-from"])) {
        // Re-analysis keeps the span it was analysed with.
        range = { from: fm["analyzed-from"], to: own.to };
      }
      const data = this.collect(range.from, range.to);
      const act = this.deps.model.activity(range.from, range.to);
      const vocab = this.deps.vocab.entries;
      const material = collectAnalysisMaterial({
        period: range,
        threads: this.deps.threads?.() ?? [],
        events: act.events,
        ...(this.deps.practiceQuestion ? { questionOf: this.deps.practiceQuestion } : {}),
        entryLabel: (id) => {
          const e = vocab.find((x) => x.id === id);
          if (!e) return undefined;
          const zh = e.definitionZh || e.sensesZh;
          return zh ? `${e.word}（${zh}）` : e.word;
        },
        words: data.words,
        digest: reportDigest(data),
        level: this.deps.model.level(),
      });
      const { value } = await runStructured(this.deps.ai, reportAnalyze, { material: material.text, level: this.deps.model.level() });
      const stamp = this.now().toISOString();
      const widened = range.from !== own.from;
      await this.deps.vault.process(path, (t) => {
        const done = applyAnalysis(t, value, stamp);
        return widened ? setFrontmatterField(done, "analyzed-from", range.from) : removeFrontmatterField(done, "analyzed-from");
      });
      // The weeks folded into this one aren't asked about again.
      for (const k of previous) await this.deps.vault.process(this.pathOf(k), (t) => setFrontmatterField(t, "analyzed-in", key));
      return "written";
    } catch (e) {
      console.error("Vocab Tracker: report analysis failed", e);
      return "failed";
    } finally {
      this.running.delete(id);
      this.notify();
    }
  }

  // 月／季回顧: summarises the weekly reports whose Sunday falls in the
  // month / quarter the user is in now (up to today).
  async review(scope: "month" | "quarter"): Promise<{ result: ReportReviewResult; path?: string }> {
    const today = this.today();
    const key = scope === "month" ? monthKeyOf(today) : quarterKeyOf(today);
    const full = scope === "month" ? monthRange(key) : quarterRange(key);
    const range = { from: full.from, to: full.to < today ? full.to : today };
    const id = `review:${key}`;
    if (this.running.has(id)) return { result: "busy" };
    if (!this.deps.aiReady()) return { result: "no-ai" };
    this.running.add(id);
    this.notify();
    try {
      await this.deps.ready?.();
      const weeks: { key: string; text: string }[] = [];
      for (const k of this.reportKeys()) {
        const sunday = weekRange(k).to;
        if (sunday < range.from || sunday > range.to) continue;
        const text = await this.deps.read?.(this.pathOf(k));
        if (text) weeks.push({ key: k, text });
      }
      if (!weeks.length) return { result: "empty" };
      const material = collectReviewMaterial(weeks);
      const { value } = await runStructured(this.deps.ai, reportReview, {
        material: material.text,
        span: scope === "month" ? "這個月" : "這一季",
        level: this.deps.model.level(),
      });
      const f = this.deps.folder();
      const path = f ? `${f}/vocab-review-${key}.md` : `vocab-review-${key}.md`;
      const content = renderReviewFile(key, range, value);
      if (this.deps.vault.exists(path)) await this.deps.vault.process(path, () => content);
      else await this.deps.vault.create(path, content);
      return { result: "written", path };
    } catch (e) {
      console.error("Vocab Tracker: report review failed", e);
      return { result: "failed" };
    } finally {
      this.running.delete(id);
      this.notify();
    }
  }

  // The newest report, for the dashboard card.
  async latest(): Promise<ReportLatest | null> {
    const key = this.reportKeys().pop();
    if (!key) return null;
    const path = this.pathOf(key);
    const fm = this.deps.vault.frontmatterOf(path);
    const v = String(fm?.verdict ?? "");
    const verdict = VERDICTS.has(v as LevelAdvice["verdict"]) ? (v as LevelAdvice["verdict"]) : "insufficient";
    const sl = fm?.["suggested-level"];
    const suggestedLevel = typeof sl === "string" && sl ? (sl as CefrLevel) : undefined;
    return { key, path, verdict, ...(suggestedLevel ? { suggestedLevel } : {}), headline: verdictHeadline(verdict, suggestedLevel) };
  }
}

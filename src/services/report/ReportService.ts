import { previousWeek, shiftRange, weekRange } from "../../core/learner/period";
import { localDayOf } from "../../core/learner/reading";
import { buildReport, type LevelAdvice, type ReportData } from "../../core/learner/report";
import { renderReportFile, reportDigest, verdictHeadline } from "../../core/learner/reportMarkdown";
import type { VocabEntry } from "../../core/model/entry";
import type { CefrLevel } from "../../core/model/settings";
import { reportAdvise } from "../ai/tasks/report";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";
import type { LearnerModel } from "../learner/LearnerModel";

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
}

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

  private setState(s: ReportStatus): void {
    this.state = s;
    for (const l of this.listeners) l();
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

  private async advice(data: ReportData): Promise<{ advice?: string[]; aiNote?: string }> {
    if (!this.deps.aiReady()) return { aiNote: "AI 沒有開啟，這段略過" };
    try {
      const { value } = await runStructured(this.deps.ai, reportAdvise, { digest: reportDigest(data), level: this.deps.model.level() });
      if (value.length) return { advice: value };
    } catch (e) {
      console.error("Vocab Tracker: report advice failed", e);
    }
    return { aiNote: "AI 這次沒寫成功" };
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

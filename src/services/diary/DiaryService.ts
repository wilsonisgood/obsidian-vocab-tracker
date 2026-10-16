import { chooseDiaryKind, materialSources, RECENT_DIARIES } from "../../core/diary/choose";
import { renderDiaryFile } from "../../core/diary/file";
import type { DiaryArticle, DiaryKind, DiaryMaterial, DiaryPoint, DiaryRecent } from "../../core/diary/types";
import { localDayOf, normalizePickKey } from "../../core/learner/reading";
import type { VocabEntry } from "../../core/model/entry";
import type { DiaryPick, LearnEvent, ReadingVisit } from "../../core/model/learner";
import type { CefrLevel, DiarySettings } from "../../core/model/settings";
import type { TriviaItem } from "../../core/model/trivia";
import { diaryWrite, type DiaryAnswer } from "../ai/tasks/diary";
import type { LearnAi } from "../learn/ports";
import { runStructured } from "../learn/structured";

// Daily diary (第十九波 D2b, 1016 #9–#13): gathers yesterday's reading and
// study, asks the AI for the text, writes `<folder>/<day>.md`.

export const LOOKBACK_DAYS = 7;
const MAX_PER_KIND = 12;
const MAX_BOLD = 40;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const NEVER = 1e9; // quoteEvery that makes the random special pick practically never fire

export interface DiaryVaultPort {
  exists(path: string): boolean;
  create(path: string, content: string): Promise<void>;
  process(path: string, fn: (text: string) => string): Promise<unknown>;
  read(path: string): Promise<string | null>;
  // Paths of the files directly inside `folder` (empty when it's missing).
  list(folder: string): string[];
  frontmatterOf(path: string): Record<string, unknown> | undefined;
}

export interface DiaryLearnerPort {
  readingOn(day: string): ReadingVisit[];
  learnEvents(opts?: { track?: "grammar" }): LearnEvent[];
  diaryPicks(): DiaryPick[];
  recordDiaryPick(p: { kind: "quote" | "place"; key: string; day: string }): void;
}

export interface DiaryServiceDeps {
  ai: LearnAi;
  aiReady: () => boolean;
  learner: DiaryLearnerPort;
  vocab: { readonly entries: VocabEntry[] };
  learn: { trivia(): TriviaItem[] };
  vault: DiaryVaultPort;
  folder: () => string;
  level: () => CefrLevel | "";
  settings: () => DiarySettings;
  labels: () => { subtitleFrom: string; disclaimer: string };
  // Resolves once the lazily loaded shards (learner, learn) are in.
  ready?: () => Promise<void>;
  now?: () => Date;
  random?: () => number;
}

export type DiaryWriteResult = "written" | "exists" | "busy" | "no-ai" | "failed";
export type DiaryStatus = "idle" | "writing" | "no-ai" | "off" | "failed";

export interface LatestDiary {
  day: string;
  path: string;
  lines: string[];
}

// "2026-10-15 08:30:00" (nowStamp) or an ISO string → local YYYY-MM-DD.
export function dayOfStamp(s: string | undefined): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}[ ]/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : localDayOf(d);
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDayOf(new Date(y, m - 1, d + delta));
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export class DiaryService {
  private running = new Set<string>();
  private wroteThisSession = new Map<string, DiaryRecent>();
  private state: DiaryStatus = "idle";
  private listeners = new Set<() => void>();

  constructor(private deps: DiaryServiceDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  today(): string {
    return localDayOf(this.now());
  }

  pathOf(day: string): string {
    const f = this.deps.folder();
    return f ? `${f}/${day}.md` : `${day}.md`;
  }

  status(): DiaryStatus {
    if (this.state === "idle" && !this.deps.settings().enabled) return "off";
    return this.state;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setState(s: DiaryStatus): void {
    this.state = s;
    for (const l of this.listeners) l();
  }

  // ── material ──────────────────────────────────────────────────

  private pointsOn(day: string): DiaryPoint[] {
    const out: DiaryPoint[] = [];
    const entries = this.deps.vocab.entries;
    const newWords = new Set<string>();
    for (const e of entries) {
      if (dayOfStamp(e.added || e.createdAt) === day) {
        out.push({ kind: "new-word", label: e.word, day });
        newWords.add(e.word.toLowerCase());
      }
    }
    for (const e of entries) {
      if (e.lastReviewed && dayOfStamp(e.lastReviewed) === day && !newWords.has(e.word.toLowerCase())) {
        out.push({ kind: "review-word", label: e.word, day });
      }
    }
    for (const ev of this.deps.learner.learnEvents()) {
      if (ev.track !== "grammar" || dayOfStamp(ev.at) !== day) continue;
      if (ev.result !== "wrong" && ev.result !== "correct") continue;
      const label = ev.focus.id.split("/").pop()?.replace(/[-_]+/g, " ") ?? ev.focus.id;
      out.push({ kind: ev.result === "wrong" ? "grammar-wrong" : "grammar-right", label, day });
    }
    for (const tv of this.deps.learn.trivia()) {
      if (dayOfStamp(tv.createdAt) === day) out.push({ kind: "trivia", label: tv.title, day });
    }
    // Wrong answers first, then drop repeats and cap each kind.
    const order = ["grammar-wrong", "new-word", "review-word", "grammar-right", "trivia"];
    out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const perKind = new Map<string, number>();
    const seen = new Set<string>();
    return out.filter((p) => {
      const key = `${p.kind}|${p.label.toLowerCase()}`;
      const n = perKind.get(p.kind) ?? 0;
      if (seen.has(key) || n >= MAX_PER_KIND) return false;
      seen.add(key);
      perKind.set(p.kind, n + 1);
      return true;
    });
  }

  collectMaterial(day: string): DiaryMaterial {
    const byPath = new Map<string, DiaryArticle>();
    for (const v of this.deps.learner.readingOn(day)) {
      let a = byPath.get(v.path);
      if (!a) byPath.set(v.path, (a = { path: v.path, title: v.title, headings: [] }));
      if (v.heading && !a.headings.includes(v.heading)) a.headings.push(v.heading);
    }
    let points = this.pointsOn(day);
    for (let i = 1; points.length === 0 && i <= LOOKBACK_DAYS; i++) points = this.pointsOn(shiftDay(day, -i));
    return { day, articles: [...byPath.values()], points };
  }

  // ── files ─────────────────────────────────────────────────────

  private diaryDays(): string[] {
    const days: string[] = [];
    for (const p of this.deps.vault.list(this.deps.folder())) {
      const m = DAY_FILE.exec(p.slice(p.lastIndexOf("/") + 1));
      if (m) days.push(m[1]);
    }
    return days.sort().reverse();
  }

  // The latest diaries before `before` (default: all), newest first.
  recent(before?: string): DiaryRecent[] {
    const out: DiaryRecent[] = [];
    for (const day of this.diaryDays()) {
      if (before && day >= before) continue;
      if (out.length >= RECENT_DIARIES) break;
      const fm = this.deps.vault.frontmatterOf(this.pathOf(day));
      const kind = fm?.["diary-kind"];
      const src = fm?.["diary-sources"];
      if (kind !== "diary" && kind !== "quote" && kind !== "place") {
        const mine = this.wroteThisSession.get(day);
        if (mine) out.push(mine);
        continue;
      }
      out.push({ day, kind, sources: Array.isArray(src) ? src.map(String) : [] });
    }
    return out;
  }

  // The newest diary, with its first two lines of text, for the dashboard.
  async latest(): Promise<LatestDiary | null> {
    const day = this.diaryDays()[0];
    if (!day) return null;
    const path = this.pathOf(day);
    const text = (await this.deps.vault.read(path)) ?? "";
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/^>\s*/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean)
      .slice(1, 3);
    return { day, path, lines };
  }

  // ── writing ───────────────────────────────────────────────────

  private boldWords(m: DiaryMaterial): string[] {
    const own = m.points.filter((p) => p.kind === "new-word" || p.kind === "review-word").map((p) => p.label);
    const text = [...m.articles.flatMap((a) => [a.title, ...a.headings]), ...m.points.filter((p) => p.kind === "trivia").map((p) => p.label)]
      .join(" ")
      .toLowerCase();
    const inText = this.deps.vocab.entries
      .map((e) => e.word.trim())
      .filter((w) => /^[a-z][a-z' -]*$/i.test(w) && new RegExp(`(^|[^a-z])${w.toLowerCase().replace(/[^a-z ' -]/g, "")}([^a-z]|$)`).test(text));
    return uniq([...own, ...inText]).slice(0, MAX_BOLD);
  }

  private async ask(kind: DiaryKind, m: DiaryMaterial, avoid: string[], bold: string[]): Promise<DiaryAnswer> {
    const input = { kind, level: this.deps.level(), material: m, avoid, boldWords: bold };
    const ok = (a: DiaryAnswer) => a.paragraphs.length > 0 && (kind !== "quote" || !!a.quote) && (kind !== "place" || !!a.place);
    let last: DiaryAnswer | undefined;
    for (let i = 0; i < (kind === "diary" ? 1 : 2); i++) {
      last = (await runStructured(this.deps.ai, diaryWrite, input)).value;
      if (ok(last)) return last;
    }
    if (kind !== "diary") return this.ask("diary", m, avoid, bold); // PICK kept failing → plain diary
    return last ?? { paragraphs: [] };
  }

  async write(day: string, opts: { overwrite?: boolean } = {}): Promise<DiaryWriteResult> {
    const path = this.pathOf(day);
    if (this.running.has(day)) return "busy";
    if (!opts.overwrite && this.deps.vault.exists(path)) return "exists";
    if (!this.deps.aiReady()) {
      this.setState("no-ai");
      return "no-ai";
    }
    this.running.add(day);
    this.setState("writing");
    try {
      await this.deps.ready?.();
      const material = this.collectMaterial(day);
      const cfg = this.deps.settings();
      const kind = chooseDiaryKind(material, this.recent(day), {
        random: this.deps.random ?? Math.random,
        quoteEvery: cfg.specialEvery > 0 ? cfg.specialEvery : NEVER,
      });
      const picks = this.deps.learner.diaryPicks();
      const avoid = picks.filter((p) => kind === "diary" || p.kind === kind).map((p) => p.key);
      const bold = this.boldWords(material);
      const asked = await this.ask(kind, material, avoid, bold);
      if (!asked.paragraphs.length) throw new Error("empty diary");
      const finalKind: DiaryKind = kind === "quote" && asked.quote ? "quote" : kind === "place" && asked.place ? "place" : "diary";
      const sources = materialSources(material);
      const content = renderDiaryFile({
        day,
        kind: finalKind,
        articles: material.articles,
        sources,
        quote: finalKind === "quote" ? asked.quote : undefined,
        place: finalKind === "place" ? asked.place : undefined,
        paragraphs: asked.paragraphs,
        labels: this.deps.labels(),
      });
      if (this.deps.vault.exists(path)) await this.deps.vault.process(path, () => content);
      else await this.deps.vault.create(path, content);
      if (finalKind === "quote" && asked.quote) {
        this.deps.learner.recordDiaryPick({ kind: "quote", key: normalizePickKey(`${asked.quote.author}|${asked.quote.text}`), day });
      } else if (finalKind === "place" && asked.place) {
        this.deps.learner.recordDiaryPick({ kind: "place", key: normalizePickKey(asked.place), day });
      }
      this.wroteThisSession.set(day, { day, kind: finalKind, sources });
      this.setState("idle");
      return "written";
    } catch (e) {
      console.error("Vocab Tracker: diary failed", e);
      this.setState("failed");
      return "failed";
    } finally {
      this.running.delete(day);
    }
  }

  // Called once after the layout is ready (1016 #10).
  async maybeWriteYesterday(): Promise<DiaryWriteResult | "off"> {
    if (!this.deps.settings().enabled) {
      this.setState("off");
      return "off";
    }
    const yesterday = shiftDay(this.today(), -1);
    return this.write(yesterday);
  }
}

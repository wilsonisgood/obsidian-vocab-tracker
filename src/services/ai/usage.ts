import type { StoragePort } from "../../core/ports";
import { AiError } from "./errors";
import type { Usage } from "./providers/types";

// Daily token usage in the `usage` shard (store/usage.json, 規劃書 06 §4.2).
//
// Bucketed per device: each device only ever rewrites its own bucket after
// re-reading the file, so two devices recording usage the same day and
// syncing the shard both keep their counts instead of one overwriting the
// other. Budget checks sum across all devices.

export interface DayUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  requests: number;
}

export interface UsageShard {
  version: 1;
  devices: Record<string, Record<string, DayUsage>>;
}

export interface UsageSummary {
  today: DayUsage;
  month: DayUsage;
  // What the monthly budget is compared against.
  monthWeighted: number;
}

const SHARD = "usage";
const KEEP_DAYS = 400;

export function emptyDay(): DayUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
}

// Cache reads are billed at ~1/10 of normal input on Anthropic; counting
// them in full would make a cached 30k-token article burn the budget ten
// times faster than it actually costs.
export function weightedTokens(d: Pick<DayUsage, "input" | "output" | "cacheRead" | "cacheWrite">): number {
  return d.input + d.output + d.cacheWrite + Math.round(d.cacheRead / 10);
}

export function localDayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function add(a: DayUsage, b: DayUsage): DayUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    requests: a.requests + b.requests,
  };
}

function normalize(raw: unknown): UsageShard {
  const r = raw as Partial<UsageShard> | null;
  if (!r || r.version !== 1 || typeof r.devices !== "object" || r.devices === null) {
    return { version: 1, devices: {} };
  }
  return { version: 1, devices: r.devices };
}

export class UsageTracker {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private storage: StoragePort,
    private deviceId: () => string,
    private now: () => Date = () => new Date()
  ) {}

  async load(): Promise<UsageShard> {
    return normalize(await this.storage.readShard<UsageShard>(SHARD));
  }

  // Serialized so two requests finishing together don't race the
  // read-modify-write and drop one of them.
  record(u: Usage): Promise<void> {
    const run = async () => {
      const shard = await this.load();
      const id = this.deviceId();
      const days = (shard.devices[id] ??= {});
      const key = localDayKey(this.now());
      days[key] = add(days[key] ?? emptyDay(), {
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
        requests: 1,
      });
      const cutoff = localDayKey(new Date(this.now().getTime() - KEEP_DAYS * 86_400_000));
      for (const day of Object.keys(days)) if (day < cutoff) delete days[day];
      await this.storage.writeShard(SHARD, shard);
    };
    this.writing = this.writing.then(run, run);
    return this.writing;
  }

  async summary(): Promise<UsageSummary> {
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
  async assertWithinBudget(budget: number): Promise<void> {
    if (!budget || budget <= 0) return;
    const { monthWeighted } = await this.summary();
    if (monthWeighted >= budget) {
      throw new AiError("budget", `Monthly budget reached (${monthWeighted}/${budget})`);
    }
  }
}

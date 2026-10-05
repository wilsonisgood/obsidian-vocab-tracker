// Prints measured numbers next to the test output. Vitest hides console
// output of passing tests, so this writes to stderr directly: the numbers
// show up on every `npm test`, pass or fail.

export interface Row {
  metric: string;
  budget: string;
  measured: string;
  note?: string;
}

export function report(title: string, rows: readonly Row[]): void {
  const w = (k: keyof Row) => Math.max(...rows.map((r) => (r[k] ?? "").length), k.length);
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  const cols: (keyof Row)[] = ["metric", "budget", "measured", "note"];
  const widths = cols.map(w);
  const line = (r: Partial<Row>) => cols.map((k, i) => pad(r[k] ?? "", widths[i])).join("  ");
  const out = [`\n[perf] ${title}`, line({ metric: "metric", budget: "budget", measured: "measured", note: "note" })];
  for (const r of rows) out.push(line(r));
  process.stderr.write(out.join("\n") + "\n");
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function flushMicrotasks(n = 30): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

// Budget multiplier for assertions: jsdom-like fakes and CI machines are
// slower and noisier than Obsidian, so the test fails only past budget ×
// factor (VT_PERF_FACTOR overrides; the printed numbers are the real data).
export const PERF_FACTOR = Number(process.env.VT_PERF_FACTOR ?? 3);

export function ms(n: number): string {
  return `${n.toFixed(n < 10 ? 2 : 1)} ms`;
}

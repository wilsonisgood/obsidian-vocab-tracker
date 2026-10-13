// 第十八波 T: when a practice tab may ask the AI for more questions.
// Pure rules plus a small DOM-free controller shared by the grammar, 常用字
// and scenario (單字情境 / 混合) tabs:
//  - opening a tab with an empty pool never asks by itself (the learner
//    presses 「開始出題」);
//  - a filter change waits FILTER_REFILL_DELAY_MS before asking, and aborts
//    the request still running for the old filter;
//  - after a failed refill nothing is retried on its own until the learner
//    presses 「再試一次」 or changes the filter.

export const FILTER_REFILL_DELAY_MS = 1500;

export interface RefillGate {
  // Set by a failed refill; cleared by 「再試一次」 or a filter change.
  paused: boolean;
}

export const openGate = (): RefillGate => ({ paused: false });

// `failed`: refill:end carried an error that isn't an abort.
export function gateAfterEnd(g: RefillGate, failed: boolean): RefillGate {
  return failed ? { paused: true } : g.paused ? g : { paused: false };
}

export type RefillCause =
  | "mount" // the tab just opened
  | "answer" // after an answer / skip / 👎
  | "filter" // the filter settled (after the debounce)
  | "manual"; // 開始出題 / 再試一次

export function shouldRefill(g: RefillGate, cause: RefillCause, poolSize: number, threshold: number): boolean {
  if (poolSize > threshold) return false;
  if (cause === "manual" || cause === "filter") return true;
  if (g.paused) return false;
  // Opening on an empty pool waits for the button; a pool that still has
  // questions keeps topping up so the story carries on.
  if (cause === "mount") return poolSize > 0;
  return true;
}

export interface RefillControllerOptions {
  poolSize(): number;
  threshold: number;
  // Starts the refill; the callee still checks its own preconditions.
  run(signal: AbortSignal): void;
  delay?: number;
}

export class RefillController {
  private gate = openGate();
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private dead = false;

  constructor(private o: RefillControllerOptions) {}

  get paused(): boolean {
    return this.gate.paused;
  }

  // Grows with every filter change.
  get scopeVersion(): number {
    return this.version;
  }

  mount(): void {
    this.request("mount");
  }

  afterAction(): void {
    this.request("answer");
  }

  manual(): void {
    this.gate = openGate();
    this.cancelTimer();
    this.request("manual");
  }

  filterChanged(): void {
    this.version++;
    this.gate = openGate();
    this.ctrl?.abort();
    this.ctrl = null;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.request("filter");
    }, this.o.delay ?? FILTER_REFILL_DELAY_MS);
  }

  ended(failed: boolean): void {
    this.gate = gateAfterEnd(this.gate, failed);
  }

  dispose(): void {
    this.dead = true;
    this.cancelTimer();
    this.ctrl?.abort();
  }

  private request(cause: RefillCause): void {
    if (this.dead || !shouldRefill(this.gate, cause, this.o.poolSize(), this.o.threshold)) return;
    this.ctrl = new AbortController();
    this.o.run(this.ctrl.signal);
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

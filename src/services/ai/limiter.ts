import { AiError } from "./errors";

// Global concurrency cap for AI requests (規劃書 06 §6.5: at most 2 in
// flight). Queued callers whose signal aborts leave the queue immediately
// instead of occupying a slot later.
export class Limiter {
  private active = 0;
  private queue: { start: () => void; signal?: AbortSignal; onAbort: () => void }[] = [];

  constructor(private readonly max: number) {}

  get running(): number {
    return this.active;
  }

  get waiting(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new AiError("aborted"));
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const item = {
        signal,
        start: () => {
          signal?.removeEventListener("abort", item.onAbort);
          this.active++;
          resolve();
        },
        onAbort: () => {
          this.queue = this.queue.filter((q) => q !== item);
          reject(new AiError("aborted"));
        },
      };
      signal?.addEventListener("abort", item.onAbort, { once: true });
      this.queue.push(item);
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next.start();
  }
}

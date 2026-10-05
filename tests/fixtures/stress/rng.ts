// Deterministic randomness for the stress fixture (規劃書 06 M8, task K):
// the same seed always builds byte-identical data, so perf numbers and
// merge results are comparable run to run.

export type Rng = () => number;

// mulberry32: tiny, fast, good enough for test data.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A base-36 id like the plugin's block ids (`vt-xxxxxx`).
export function base36(rng: Rng, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}

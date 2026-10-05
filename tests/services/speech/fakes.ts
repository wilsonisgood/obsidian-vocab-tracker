import { vi } from "vitest";
import type {
  AudioClip,
  ClipEvent,
  PronouncerDeps,
  PronounceSource,
  PronounceState,
  SpeakEvents,
} from "../../../src/services/speech/Pronouncer";

function domError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

// An <audio> element: play() stays pending until the test says the
// recording started (start), failed (fail) or was blocked (block).
export class FakeClip implements AudioClip {
  ready = false;
  loads = 0;
  plays = 0;
  pauses = 0;
  rewinds = 0;
  private listeners = new Map<ClipEvent, Set<() => void>>();
  private pending: { resolve: () => void; reject: (e: Error) => void } | null = null;

  constructor(public url: string) {}

  play(): Promise<void> {
    this.plays++;
    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  pause(): void {
    this.pauses++;
    this.settle((p) => p.reject(domError("AbortError")));
  }

  rewind(): void {
    this.rewinds++;
  }

  load(): void {
    this.loads++;
  }

  on(event: ClipEvent, cb: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set<() => void>();
    this.listeners.set(event, set);
    set.add(cb);
    return () => set.delete(cb);
  }

  listenerCount(event: ClipEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  emit(event: ClipEvent): void {
    for (const cb of [...(this.listeners.get(event) ?? [])]) cb();
  }

  // Finished loading in the background (no play pending).
  loaded(): void {
    this.ready = true;
    this.emit("ready");
  }

  start(): void {
    this.ready = true;
    this.emit("ready");
    this.emit("playing");
    this.settle((p) => p.resolve());
  }

  end(): void {
    this.emit("ended");
  }

  fail(): void {
    this.emit("error");
    this.settle((p) => p.reject(domError("NotSupportedError")));
  }

  block(): void {
    this.rejectPlay("NotAllowedError");
  }

  // play() rejects without an `error` event first.
  rejectPlay(name: string): void {
    this.settle((p) => p.reject(domError(name)));
  }

  private settle(fn: (p: { resolve: () => void; reject: (e: Error) => void }) => void): void {
    const p = this.pending;
    this.pending = null;
    if (p) fn(p);
  }
}

export class FakeSynth {
  spoken: string[] = [];
  events: SpeakEvents[] = [];
  available = true;
  cancel = vi.fn();

  speak(word: string, events: SpeakEvents = {}): boolean {
    if (!this.available) return false;
    this.spoken.push(word);
    this.events.push(events);
    return true;
  }

  // The last utterance started / ended.
  started(): void {
    this.events[this.events.length - 1]?.onStart?.();
  }

  ended(): void {
    this.events[this.events.length - 1]?.onEnd?.();
  }
}

export function fakeDeps(over: Partial<PronouncerDeps> & { source?: () => PronounceSource } = {}) {
  const clips: FakeClip[] = [];
  const synth = new FakeSynth();
  const canPlay = vi.fn((mime: string) => (mime === "audio/ogg" ? "" : "maybe"));
  let online = true;
  const deps: PronouncerDeps = {
    createClip: (url) => {
      const c = new FakeClip(url);
      clips.push(c);
      return c;
    },
    canPlayType: canPlay,
    synth,
    online: () => online,
    ...over,
  };
  return {
    deps,
    clips,
    synth,
    canPlay,
    setOnline(v: boolean) {
      online = v;
    },
  };
}

// Collects the states an attempt reports.
export function stateLog() {
  const states: PronounceState[] = [];
  return { states, on: (s: PronounceState) => states.push(s) };
}

export const flush = () => new Promise<void>((r) => queueMicrotask(r)).then(() => undefined);

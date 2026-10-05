import type { VocabEntry } from "../../core/model/entry";
import type { DeviceStatePort } from "../../core/ports";

// Pronouncing a word (1005 回饋第 12 項): the dictionary recording when
// there is one and it's quick, else the system voice.
//
// Why: the recordings stored in `entry.audio` are dictionaryapi.dev mp3s
// (the old dictionary source). When that host is slow or down, play()
// just hangs — Cloudflare answers 522 after ~20 s — and only then did the
// old code fall back to speechSynthesis, so a tap on 🔊 looked dead for
// twenty seconds. Here:
// - a recording that hasn't started within `timeoutMs` (auto mode) is
//   dropped for the system voice; it keeps loading in the background, so
//   once it's in, the next tap plays it;
// - recordings that failed, or whose format this platform can't play
//   (canPlayType), go straight to the system voice from then on;
// - loaded recordings are cached (one element per URL, LRU) and the next
//   flashcard's can be preloaded;
// - every attempt reports idle → loading → playing → idle, so the button
//   can show a spinner instead of looking unresponsive;
// - failed URLs are remembered per device (DeviceStatePort, not synced)
//   for FAILED_TTL_MS, then tried again — a 522 can be temporary;
// - on iPhone / iPad (`instantFallback`), auto mode never waits: iOS only
//   lets speechSynthesis talk from inside the tap, and a fallback fired by
//   a timer 1.5 s later can be silent. So a recording that isn't loaded
//   yet is fetched in the background while the system voice speaks right
//   away; once it's loaded, later taps play it.
// One attempt at a time: a new one stops the previous one.

export type PronounceSource = "auto" | "recording" | "synth";
export type PronounceState = "idle" | "loading" | "playing";
// How the word ended up being spoken; "none" = no voice at all,
// "stopped" = stopped (or replaced by a newer attempt) before either began.
export type PronounceVia = "recording" | "synth" | "none" | "stopped";

export const PRONOUNCE_SOURCES: readonly PronounceSource[] = ["auto", "recording", "synth"];

export function parsePronounceSource(raw: unknown): PronounceSource {
  return PRONOUNCE_SOURCES.find((s) => s === raw) ?? "auto";
}

export type ClipEvent = "playing" | "ended" | "error" | "ready";

// One recording (an <audio> element in the browser).
export interface AudioClip {
  // Resolves once playback starts; rejects when it can't (the error's
  // `name` is the DOMException name: AbortError when pause() interrupted
  // it, NotAllowedError for autoplay rules, NotSupportedError otherwise).
  play(): Promise<void>;
  pause(): void;
  rewind(): void;
  // Start fetching without playing (preload).
  load(): void;
  // Enough data to play right away.
  readonly ready: boolean;
  on(event: ClipEvent, cb: () => void): () => void;
}

export interface SpeakEvents {
  onStart?: () => void;
  onEnd?: () => void;
}

// The system voice (Speaker in ui/mobile/speech.ts).
export interface SynthPort {
  // false when the device has no speech synthesis at all.
  speak(word: string, events?: SpeakEvents): boolean;
  cancel?(): void;
}

export interface PronouncerDeps {
  createClip(url: string): AudioClip;
  // HTMLMediaElement.canPlayType: "" | "maybe" | "probably".
  canPlayType(mime: string): string;
  synth: SynthPort;
  source?: () => PronounceSource;
  // navigator.onLine; offline skips recordings that aren't loaded yet.
  online?: () => boolean;
  timeoutMs?: number;
  cacheSize?: number;
  // Where failed URLs are remembered across restarts (this device only).
  deviceState?: DeviceStatePort;
  // Mobile: the system voice must start inside the tap (see above).
  instantFallback?: () => boolean;
  now?: () => number;
}

export type PronounceRequest = Pick<VocabEntry, "word" | "audio">;

export const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_SIZE = 40;
export const FAILED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FAILED_KEY = "pronounce.failed";
// Kept small: only a handful of words ever have a recording.
const FAILED_MAX = 200;
// Resets a "playing" that never reports its end (Chromium can drop an
// utterance's onend; a stalled stream never fires `ended`).
const WATCHDOG_MS = 8000;

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: 'audio/ogg; codecs="opus"',
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
  flac: "audio/flac",
};

// The MIME type a recording URL's extension implies; null when the URL
// doesn't say (then it's just tried).
export function audioMime(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? (MIME_BY_EXT[m[1].toLowerCase()] ?? null) : null;
}

interface Cached {
  clip: AudioClip;
  ready: boolean;
  // An auto-mode attempt gave up waiting on it; it's still loading.
  timedOut: boolean;
  offs: (() => void)[];
}

interface Attempt {
  id: number;
  onState: (s: PronounceState) => void;
  state: PronounceState;
  clip: AudioClip | null;
  synth: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  watchdog: ReturnType<typeof setTimeout> | null;
  offs: (() => void)[];
  resolve: (via: PronounceVia) => void;
  settled: boolean;
}

export class Pronouncer {
  private cache = new Map<string, Cached>();
  // URL → when it failed (epoch ms); persisted, expires after FAILED_TTL_MS.
  private failed: Map<string, number>;
  // Formats this platform can't play: per device and permanent, so just
  // recomputed each session rather than stored.
  private unsupported = new Set<string>();
  private current: Attempt | null = null;
  private seq = 0;

  constructor(private deps: PronouncerDeps) {
    this.failed = this.loadFailed();
  }

  get source(): PronounceSource {
    return this.deps.source?.() ?? "auto";
  }

  // The recording URL an attempt would try first, or null for the system
  // voice straight away.
  recordingFor(req: PronounceRequest): string | null {
    const url = req.audio?.trim();
    if (!url || this.source === "synth" || this.hasFailed(url)) return null;
    if (!this.playable(url)) {
      this.unsupported.add(url);
      return null;
    }
    const cached = this.cache.get(url);
    if (this.isCached(url)) return url;
    if (this.deps.online && !this.deps.online()) return null;
    // An earlier tap already waited on it; don't make this one wait again.
    if (cached?.timedOut && this.source === "auto") return null;
    return url;
  }

  hasFailed(url: string): boolean {
    if (this.unsupported.has(url)) return true;
    const at = this.failed.get(url);
    if (at === undefined) return false;
    if (this.now() - at < FAILED_TTL_MS) return true;
    // Expired: give it another chance.
    this.failed.delete(url);
    this.saveFailed();
    return false;
  }

  isCached(url: string): boolean {
    const c = this.cache.get(url);
    return !!c && (c.ready || c.clip.ready);
  }

  // Speaks the word. Resolves with how it was spoken once that's decided
  // (the recording started, or the system voice took over).
  pronounce(req: PronounceRequest, onState: (s: PronounceState) => void = () => {}): Promise<PronounceVia> {
    this.stop();
    return new Promise<PronounceVia>((resolve) => {
      const a: Attempt = {
        id: ++this.seq,
        onState,
        state: "idle",
        clip: null,
        synth: false,
        timer: null,
        watchdog: null,
        offs: [],
        resolve,
        settled: false,
      };
      this.current = a;
      const url = this.recordingFor(req);
      if (url && this.source === "auto" && this.instant() && !this.isCached(url)) {
        // Mobile: speak now, inside the tap; fetch the recording for later.
        this.preload(req);
        this.speakSynth(a, req.word);
      } else if (url) this.playRecording(a, url, req.word);
      else this.speakSynth(a, req.word);
    });
  }

  // Starts fetching a recording without playing it (the next flashcard).
  preload(req: PronounceRequest): void {
    const url = this.recordingFor(req);
    if (!url || this.cache.has(url)) return;
    const c = this.entry(url);
    try {
      c.clip.load();
    } catch (e) {
      console.error("Vocab Tracker: audio preload failed", e);
    }
  }

  // Stops whatever is playing or loading.
  stop(): void {
    const a = this.current;
    if (!a) return;
    this.current = null;
    if (a.clip) a.clip.pause();
    if (a.synth) this.deps.synth.cancel?.();
    this.finish(a, "stopped");
  }

  dispose(): void {
    this.stop();
    for (const c of this.cache.values()) this.drop(c);
    this.cache.clear();
  }

  // ── Internals ─────────────────────────────────────────────────

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private instant(): boolean {
    try {
      return this.deps.instantFallback?.() ?? false;
    } catch {
      return false;
    }
  }

  private loadFailed(): Map<string, number> {
    const out = new Map<string, number>();
    const store = this.deps.deviceState;
    if (!store) return out;
    try {
      const raw = store.get(FAILED_KEY);
      if (!raw) return out;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return out;
      const now = this.now();
      for (const [url, at] of Object.entries(data as Record<string, unknown>)) {
        if (typeof at === "number" && now - at < FAILED_TTL_MS) out.set(url, at);
      }
    } catch (e) {
      console.error("Vocab Tracker: couldn't read failed pronunciations", e);
    }
    return out;
  }

  private saveFailed(): void {
    const store = this.deps.deviceState;
    if (!store) return;
    // Oldest first out when over the cap (Map keeps insertion order).
    while (this.failed.size > FAILED_MAX) {
      const oldest = this.failed.keys().next().value;
      if (oldest === undefined) break;
      this.failed.delete(oldest);
    }
    try {
      store.set(FAILED_KEY, this.failed.size ? JSON.stringify(Object.fromEntries(this.failed)) : null);
    } catch (e) {
      console.error("Vocab Tracker: couldn't save failed pronunciations", e);
    }
  }

  private playable(url: string): boolean {
    const mime = audioMime(url);
    if (!mime) return true;
    try {
      return this.deps.canPlayType(mime) !== "";
    } catch {
      return true;
    }
  }

  private entry(url: string): Cached {
    const hit = this.cache.get(url);
    if (hit) {
      // LRU: most recently used last.
      this.cache.delete(url);
      this.cache.set(url, hit);
      return hit;
    }
    const clip = this.deps.createClip(url);
    const c: Cached = { clip, ready: clip.ready, timedOut: false, offs: [] };
    c.offs.push(
      clip.on("ready", () => {
        c.ready = true;
        c.timedOut = false;
      }),
      clip.on("error", () => this.markFailed(url))
    );
    this.cache.set(url, c);
    const max = this.deps.cacheSize ?? DEFAULT_CACHE_SIZE;
    for (const [key, old] of this.cache) {
      if (this.cache.size <= max) break;
      if (old === c || this.current?.clip === old.clip) continue;
      this.drop(old);
      this.cache.delete(key);
    }
    return c;
  }

  private drop(c: Cached): void {
    for (const off of c.offs) off();
    c.offs = [];
    try {
      c.clip.pause();
    } catch {
      // already gone
    }
  }

  private markFailed(url: string): void {
    this.failed.delete(url);
    this.failed.set(url, this.now());
    this.saveFailed();
    const c = this.cache.get(url);
    if (c) {
      this.drop(c);
      this.cache.delete(url);
    }
  }

  private live(a: Attempt): boolean {
    return this.current === a;
  }

  private setState(a: Attempt, s: PronounceState): void {
    if (a.state === s) return;
    a.state = s;
    if (a.watchdog) clearTimeout(a.watchdog);
    a.watchdog = null;
    if (s === "playing") {
      a.watchdog = setTimeout(() => {
        if (this.live(a)) {
          this.current = null;
          this.finish(a, a.synth ? "synth" : "recording");
        }
      }, WATCHDOG_MS);
    }
    a.onState(s);
  }

  private settle(a: Attempt, via: PronounceVia): void {
    if (a.settled) return;
    a.settled = true;
    a.resolve(via);
  }

  // Ends an attempt: clears its timers and listeners, reports idle.
  private finish(a: Attempt, via: PronounceVia): void {
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    for (const off of a.offs) off();
    a.offs = [];
    this.setState(a, "idle");
    if (a.watchdog) clearTimeout(a.watchdog);
    a.watchdog = null;
    this.settle(a, via);
  }

  private playRecording(a: Attempt, url: string, word: string): void {
    const c = this.entry(url);
    const clip = c.clip;
    a.clip = clip;
    if (clip.ready) c.ready = true;
    if (!c.ready) this.setState(a, "loading");

    let fellBack = false;
    const fallBack = () => {
      if (!this.live(a) || fellBack) return;
      fellBack = true;
      for (const off of a.offs) off();
      a.offs = [];
      if (a.timer) clearTimeout(a.timer);
      a.timer = null;
      clip.pause();
      a.clip = null;
      this.speakSynth(a, word);
    };

    a.offs.push(
      clip.on("playing", () => {
        if (!this.live(a) || fellBack) return;
        if (a.timer) clearTimeout(a.timer);
        a.timer = null;
        c.ready = true;
        this.setState(a, "playing");
        this.settle(a, "recording");
      }),
      clip.on("ended", () => {
        if (!this.live(a) || fellBack) return;
        this.current = null;
        this.finish(a, "recording");
      }),
      // markFailed (registered with the clip) has already run.
      clip.on("error", fallBack)
    );

    if (this.source === "auto" && !c.ready) {
      const ms = this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      a.timer = setTimeout(() => {
        a.timer = null;
        if (!this.live(a) || fellBack || a.state === "playing") return;
        c.timedOut = true;
        fallBack();
      }, ms);
    }

    try {
      clip.rewind();
    } catch {
      // not seekable yet
    }
    let started: Promise<void>;
    try {
      started = clip.play();
    } catch (e) {
      started = Promise.reject(e);
    }
    started.then(
      () => {
        // Some engines resolve play() without a separate `playing` event
        // reaching us first.
        if (!this.live(a) || fellBack || a.state === "playing") return;
        if (a.timer) clearTimeout(a.timer);
        a.timer = null;
        c.ready = true;
        this.setState(a, "playing");
        this.settle(a, "recording");
      },
      (err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        // pause() interrupted it: we stopped it ourselves.
        if (name === "AbortError") return;
        // Autoplay rules aren't the recording's fault; anything else is.
        if (name !== "NotAllowedError") this.markFailed(url);
        fallBack();
      }
    );
  }

  private speakSynth(a: Attempt, word: string): void {
    if (!this.live(a)) return;
    a.synth = true;
    this.setState(a, "loading");
    let ok = false;
    try {
      ok = this.deps.synth.speak(word, {
        onStart: () => {
          if (!this.live(a)) return;
          this.setState(a, "playing");
        },
        onEnd: () => {
          if (!this.live(a)) return;
          this.current = null;
          this.finish(a, "synth");
        },
      });
    } catch (e) {
      console.error("Vocab Tracker: speechSynthesis failed", e);
    }
    if (!ok) {
      if (this.live(a)) this.current = null;
      this.finish(a, "none");
      return;
    }
    this.settle(a, "synth");
    // No onstart within the watchdog window (some engines never fire it):
    // stop showing a spinner.
    if (a.state === "loading") {
      a.watchdog = setTimeout(() => {
        if (this.live(a) && a.state === "loading") {
          this.current = null;
          this.finish(a, "synth");
        }
      }, WATCHDOG_MS);
    }
  }
}

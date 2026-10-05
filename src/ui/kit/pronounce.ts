import { Notice } from "obsidian";
import { getLocale } from "../../core/i18n";
import type { VocabEntry } from "../../core/model/entry";
import type { DeviceStatePort } from "../../core/ports";
import {
  Pronouncer,
  type AudioClip,
  type ClipEvent,
  type PronounceSource,
  type PronounceState,
  type PronounceVia,
} from "../../services/speech/Pronouncer";
import { isMobileForm } from "../mobile/formFactor";
import { currentFormFactor } from "../mobile/platform";
import { sharedSpeaker } from "../mobile/speech";

// 🔊 buttons (1005 回饋第 12 項): one shared Pronouncer for the plugin, and
// the button states — `is-loading` (spinner) while the recording or the
// system voice is getting ready, `is-playing` while it speaks. State is
// tracked per word, not per element: a flashcard re-renders on flip, and
// the 🔊 it draws then still shows that the word is loading.

// TODO(i18n): move into the dictionaries as pronounce.noVoice /
// pronounce.loading.
const L = {
  noVoice: {
    "zh-TW": "這台裝置沒有可用的發音。",
    en: "No pronunciation available on this device.",
  },
  loading: {
    "zh-TW": "讀取發音中…",
    en: "Loading pronunciation…",
  },
} as const;

function l(key: keyof typeof L): string {
  return getLocale() === "zh-TW" ? L[key]["zh-TW"] : L[key].en;
}

// ── The browser side of the ports ───────────────────────────────

const CLIP_EVENTS: Record<ClipEvent, string> = {
  playing: "playing",
  ended: "ended",
  error: "error",
  ready: "canplaythrough",
};

export function htmlAudioClip(url: string): AudioClip {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  return {
    play: () => audio.play(),
    pause: () => audio.pause(),
    rewind: () => {
      if (audio.currentTime > 0) audio.currentTime = 0;
    },
    load: () => audio.load(),
    get ready() {
      return audio.readyState >= 3; // HAVE_FUTURE_DATA
    },
    on(event, cb) {
      const type = CLIP_EVENTS[event];
      audio.addEventListener(type, cb);
      return () => audio.removeEventListener(type, cb);
    },
  };
}

let probe: HTMLAudioElement | null = null;
function canPlayType(mime: string): string {
  probe ??= document.createElement("audio");
  return probe.canPlayType(mime);
}

// ── Shared instance ─────────────────────────────────────────────

interface Config {
  source?: () => PronounceSource;
  timeoutMs?: number;
  // Failed recording URLs, remembered on this device for 7 days
  // (main.ts: new ObsidianDeviceState(this.app)).
  deviceState?: DeviceStatePort;
  // Defaults to "iPhone / iPad" (incl. emulateMobile).
  mobile?: () => boolean;
}

function isMobileNow(): boolean {
  try {
    return isMobileForm(currentFormFactor());
  } catch {
    return false;
  }
}

let config: Config = {};
let shared: Pronouncer | null = null;

export function pronouncer(): Pronouncer {
  shared ??= new Pronouncer({
    createClip: htmlAudioClip,
    canPlayType,
    synth: sharedSpeaker(),
    source: () => config.source?.() ?? "auto",
    online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    timeoutMs: config.timeoutMs,
    deviceState: config.deviceState,
    instantFallback: () => (config.mobile ?? isMobileNow)(),
  });
  return shared;
}

// main.ts: where the 「發音來源」 setting lives.
export function configurePronouncer(next: Config): void {
  config = { ...config, ...next };
  // Both are read when the Pronouncer is built: rebuild it.
  if ((next.timeoutMs !== undefined || next.deviceState !== undefined) && shared) {
    shared.dispose();
    shared = null;
  }
}

// main.ts onunload: stop playback, release cached recordings.
export function disposePronouncer(): void {
  shared?.dispose();
  shared = null;
  active = null;
  buttons.clear();
}

// For tests: swap in a Pronouncer built on fakes.
export function setPronouncerForTests(p: Pronouncer | null): void {
  shared?.dispose();
  shared = p;
  active = null;
  buttons.clear();
}

// ── Button states ───────────────────────────────────────────────

type Target = Pick<VocabEntry, "word" | "audio"> & { id?: string };

function keyOf(entry: Target): string {
  return entry.id || entry.word.toLowerCase();
}

interface Bound {
  el: HTMLElement;
  key: string;
}

const buttons = new Set<Bound>();
let active: { key: string; state: PronounceState; token: number } | null = null;
let token = 0;

export function applyPronounceState(el: HTMLElement, state: PronounceState): void {
  el.toggleClass("is-loading", state === "loading");
  el.toggleClass("is-playing", state === "playing");
  if (state === "loading") {
    el.setAttr("aria-busy", "true");
    el.setAttr("title", l("loading"));
  } else {
    el.removeAttribute("aria-busy");
    el.removeAttribute("title");
  }
}

function paint(): void {
  for (const b of buttons) {
    if (!b.el.isConnected) continue;
    applyPronounceState(b.el, active && active.key === b.key ? active.state : "idle");
  }
}

function track(el: HTMLElement, key: string): void {
  if (buttons.size > 100) {
    for (const b of buttons) if (!b.el.isConnected) buttons.delete(b);
  }
  buttons.add({ el, key });
  el.addClass("vt-pronounce");
  applyPronounceState(el, active && active.key === key ? active.state : "idle");
}

// Speaks a word; every 🔊 bound to it shows the progress. A notice when
// the device can't speak at all.
export function pronounce(entry: Target): Promise<PronounceVia> {
  const key = keyOf(entry);
  const mine = ++token;
  return pronouncer()
    .pronounce(entry, (state) => {
      if (state === "idle") {
        if (active?.token !== mine) return;
        active = null;
      } else {
        active = { key, state, token: mine };
      }
      paint();
    })
    .then((via) => {
      if (via === "none") new Notice(l("noVoice"));
      return via;
    });
}

// Wires a 🔊 element to pronounce `entry` (or what the getter returns at
// click time) with loading / playing states. `after` runs after the
// click is handled (e.g. hand keyboard focus back to a flashcard).
export function bindPronounceButton(
  el: HTMLElement,
  entry: Target | (() => Target | undefined),
  opts: { stopPropagation?: boolean; after?: (e: MouseEvent) => void } = {}
): void {
  const get = typeof entry === "function" ? entry : () => entry;
  const first = get();
  if (first) track(el, keyOf(first));
  el.addEventListener("click", (e) => {
    if (opts.stopPropagation) e.stopPropagation();
    const target = get();
    if (target) void pronounce(target);
    opts.after?.(e);
  });
}

// Fetch a recording ahead of time (the next flashcard).
export function preloadPronunciation(entry: Target | undefined): void {
  if (entry) pronouncer().preload(entry);
}

// Stops playback when the word being spoken has a 🔊 inside `root` (a
// flashcards block or modal going away).
export function stopPronouncingIn(root: HTMLElement): void {
  if (!active) return;
  const key = active.key;
  for (const b of buttons) {
    if (b.key === key && root.contains(b.el)) {
      shared?.stop();
      return;
    }
  }
}

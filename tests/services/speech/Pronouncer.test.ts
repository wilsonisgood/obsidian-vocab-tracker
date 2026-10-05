import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioMime,
  DEFAULT_TIMEOUT_MS,
  FAILED_KEY,
  FAILED_TTL_MS,
  parsePronounceSource,
  Pronouncer,
  type PronounceSource,
} from "../../../src/services/speech/Pronouncer";
import { fakeDeps, FakeDeviceState, stateLog } from "./fakes";

const PERTINENT = {
  word: "pertinent",
  audio: "https://api.dictionaryapi.dev/media/pronunciations/en/pertinent-us.mp3",
};
const LABOR = { word: "labor", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/labor-us.mp3" };
const NO_AUDIO = { word: "glittery", audio: undefined };

// Lets pending promise callbacks (play() resolving / rejecting) run.
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("audioMime", () => {
  it("maps the URL's extension, ignoring query and hash", () => {
    expect(audioMime(PERTINENT.audio)).toBe("audio/mpeg");
    expect(audioMime("https://upload.wikimedia.org/x/En-us-pertinent.ogg")).toBe("audio/ogg");
    expect(audioMime("https://x/y.OGA?download=1#t=0")).toBe("audio/ogg");
    expect(audioMime("https://x/y.m4a")).toBe("audio/mp4");
    expect(audioMime("https://x/y.wav")).toBe("audio/wav");
  });

  it("is null when the URL doesn't say", () => {
    expect(audioMime("https://x/play?word=pertinent")).toBeNull();
    expect(audioMime("https://x/y.php")).toBeNull();
  });
});

describe("parsePronounceSource", () => {
  it("accepts the three sources, else auto", () => {
    expect(parsePronounceSource("synth")).toBe("synth");
    expect(parsePronounceSource("recording")).toBe("recording");
    expect(parsePronounceSource("auto")).toBe("auto");
    expect(parsePronounceSource(undefined)).toBe("auto");
    expect(parsePronounceSource("bogus")).toBe("auto");
  });
});

describe("Pronouncer — recordings", () => {
  it("plays a recording that starts in time: loading → playing → idle", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const log = stateLog();
    const via = p.pronounce(PERTINENT, log.on);
    expect(log.states).toEqual(["loading"]);
    expect(clips).toHaveLength(1);
    expect(clips[0].plays).toBe(1);

    clips[0].start();
    expect(await via).toBe("recording");
    expect(log.states).toEqual(["loading", "playing"]);
    clips[0].end();
    expect(log.states).toEqual(["loading", "playing", "idle"]);
    expect(synth.spoken).toEqual([]);
  });

  it("falls back to the system voice when the recording hasn't started in 1.5 s (the pertinent lag)", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const log = stateLog();
    const via = p.pronounce(PERTINENT, log.on);

    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS - 1);
    expect(synth.spoken).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(clips[0].pauses).toBe(1); // the late recording must not play over it
    expect(await via).toBe("synth");

    synth.started();
    synth.ended();
    expect(log.states).toEqual(["loading", "playing", "idle"]);

    // The recording never plays late, even if it finishes loading now.
    clips[0].emit("playing");
    expect(log.states).toEqual(["loading", "playing", "idle"]);
  });

  it("a timeout is configurable", () => {
    const { deps, synth } = fakeDeps({ timeoutMs: 500 });
    void new Pronouncer(deps).pronounce(PERTINENT);
    vi.advanceTimersByTime(500);
    expect(synth.spoken).toEqual(["pertinent"]);
  });

  it("after a timeout, the next tap doesn't wait again while it's still loading", () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS);
    synth.ended();

    const log = stateLog();
    void p.pronounce(PERTINENT, log.on);
    expect(synth.spoken).toEqual(["pertinent", "pertinent"]);
    expect(clips[0].plays).toBe(1);
  });

  it("a slow recording that finishes loading in the background plays on the next tap", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS);
    synth.ended();

    clips[0].loaded();
    expect(p.isCached(PERTINENT.audio)).toBe(true);

    const log = stateLog();
    const via = p.pronounce(PERTINENT, log.on);
    expect(clips).toHaveLength(1); // cached element reused
    expect(clips[0].plays).toBe(2);
    expect(log.states).toEqual([]); // ready: no spinner
    clips[0].start();
    expect(await via).toBe("recording");
    // A ready recording isn't on a timer.
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS * 2);
    expect(synth.spoken).toEqual(["pertinent"]);
  });

  it("caches loaded recordings: one element per URL, rewound each time", async () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    clips[0].start();
    clips[0].end();
    void p.pronounce(PERTINENT);
    clips[0].start();
    clips[0].end();
    await settle();
    expect(clips).toHaveLength(1);
    expect(clips[0].rewinds).toBe(2);
  });

  it("remembers a recording that errored: next time straight to the system voice", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const via = p.pronounce(PERTINENT);
    clips[0].fail(); // e.g. Cloudflare 522 after ~20 s
    expect(await via).toBe("synth");
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(p.hasFailed(PERTINENT.audio)).toBe(true);
    synth.ended();

    const log = stateLog();
    void p.pronounce(PERTINENT, log.on);
    expect(clips).toHaveLength(1);
    expect(synth.spoken).toEqual(["pertinent", "pertinent"]);
    expect(log.states).toEqual(["loading"]);
    synth.started();
    expect(log.states).toEqual(["loading", "playing"]);
  });

  it("a rejected play() (unsupported source) is remembered too", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const via = p.pronounce(PERTINENT);
    clips[0].rejectPlay("NotSupportedError");
    expect(await via).toBe("synth");
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(p.hasFailed(PERTINENT.audio)).toBe(true);
  });

  it("an autoplay block falls back without blaming the recording", async () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const via = p.pronounce(PERTINENT);
    clips[0].block();
    expect(await via).toBe("synth");
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(p.hasFailed(PERTINENT.audio)).toBe(false);
  });

  it("skips formats the platform can't play (canPlayType) without loading them", async () => {
    const { deps, clips, synth, canPlay } = fakeDeps();
    const p = new Pronouncer(deps);
    const ogg = { word: "tenure", audio: "https://upload.wikimedia.org/x/En-us-tenure.ogg" };
    expect(await p.pronounce(ogg)).toBe("synth");
    expect(canPlay).toHaveBeenCalledWith("audio/ogg");
    expect(clips).toHaveLength(0);
    expect(synth.spoken).toEqual(["tenure"]);
    expect(p.hasFailed(ogg.audio)).toBe(true);
  });

  it("words without a recording use the system voice", async () => {
    const { deps, clips, synth } = fakeDeps();
    expect(await new Pronouncer(deps).pronounce(NO_AUDIO)).toBe("synth");
    expect(clips).toHaveLength(0);
    expect(synth.spoken).toEqual(["glittery"]);
  });

  it("offline: system voice unless the recording is already loaded", async () => {
    const { deps, clips, synth, setOnline } = fakeDeps();
    const p = new Pronouncer(deps);
    void p.pronounce(LABOR);
    clips[0].start();
    clips[0].end();
    setOnline(false);
    void p.pronounce(PERTINENT);
    expect(synth.spoken).toEqual(["pertinent"]);
    synth.ended();
    const via = p.pronounce(LABOR);
    clips[0].start();
    expect(await via).toBe("recording");
  });

  it("stops a recording that gets stuck playing (watchdog)", () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    const log = stateLog();
    void p.pronounce(PERTINENT, log.on);
    clips[0].start();
    vi.advanceTimersByTime(8000);
    expect(log.states).toEqual(["loading", "playing", "idle"]);
  });
});

describe("Pronouncer — sources", () => {
  it("synth: never touches recordings", async () => {
    const { deps, clips, synth } = fakeDeps({ source: () => "synth" });
    const p = new Pronouncer(deps);
    expect(await p.pronounce(PERTINENT)).toBe("synth");
    p.preload(LABOR);
    expect(clips).toHaveLength(0);
    expect(synth.spoken).toEqual(["pertinent"]);
  });

  it("recording: waits for the recording however long it takes", async () => {
    const { deps, clips, synth } = fakeDeps({ source: () => "recording" });
    const p = new Pronouncer(deps);
    const log = stateLog();
    const via = p.pronounce(PERTINENT, log.on);
    vi.advanceTimersByTime(10_000);
    expect(synth.spoken).toEqual([]);
    expect(log.states).toEqual(["loading"]);
    clips[0].start();
    expect(await via).toBe("recording");
  });

  it("recording: still falls back when it fails or there is none", async () => {
    const { deps, clips, synth } = fakeDeps({ source: () => "recording" });
    const p = new Pronouncer(deps);
    const via = p.pronounce(PERTINENT);
    clips[0].fail();
    expect(await via).toBe("synth");
    synth.ended();
    expect(await p.pronounce(NO_AUDIO)).toBe("synth");
    expect(synth.spoken).toEqual(["pertinent", "glittery"]);
  });

  it("reads the source on every tap (a settings change applies right away)", async () => {
    let source: PronounceSource = "synth";
    const { deps, clips } = fakeDeps({ source: () => source });
    const p = new Pronouncer(deps);
    await p.pronounce(PERTINENT);
    expect(clips).toHaveLength(0);
    source = "auto";
    void p.pronounce(PERTINENT);
    expect(clips).toHaveLength(1);
  });
});

describe("Pronouncer — one at a time", () => {
  it("a new tap stops the previous attempt and reports it idle", async () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    const first = stateLog();
    const firstVia = p.pronounce(PERTINENT, first.on);
    const second = stateLog();
    void p.pronounce(LABOR, second.on);

    expect(first.states).toEqual(["loading", "idle"]);
    expect(clips[0].pauses).toBe(1);
    expect(await firstVia).toBe("stopped");
    expect(second.states).toEqual(["loading"]);

    // The first one's timer must not fire the system voice later.
    clips[1].start();
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS * 2);
    expect(second.states).toEqual(["loading", "playing"]);
  });

  it("stopping the system voice cancels it; its late events are ignored", () => {
    const { deps, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    const first = stateLog();
    void p.pronounce(NO_AUDIO, first.on);
    synth.started();
    const firstEvents = synth.events[0];
    p.stop();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(first.states).toEqual(["loading", "playing", "idle"]);

    const second = stateLog();
    void p.pronounce({ word: "leotard" }, second.on);
    firstEvents.onEnd?.(); // WebKit fires onerror("interrupted") for the old one
    expect(second.states).toEqual(["loading"]);
  });

  it("no voice at all: via none, back to idle", async () => {
    const { deps, synth } = fakeDeps();
    synth.available = false;
    const log = stateLog();
    expect(await new Pronouncer(deps).pronounce(NO_AUDIO, log.on)).toBe("none");
    expect(log.states).toEqual(["loading", "idle"]);
  });

  it("a system voice that never reports onstart stops spinning (watchdog)", () => {
    const { deps } = fakeDeps();
    const log = stateLog();
    void new Pronouncer(deps).pronounce(NO_AUDIO, log.on);
    vi.advanceTimersByTime(8000);
    expect(log.states).toEqual(["loading", "idle"]);
  });
});

describe("Pronouncer — preload and cache", () => {
  it("preloads a recording once and plays it from the cache", async () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    p.preload(LABOR);
    p.preload(LABOR);
    expect(clips).toHaveLength(1);
    expect(clips[0].loads).toBe(1);
    expect(clips[0].plays).toBe(0);

    clips[0].loaded();
    const log = stateLog();
    const via = p.pronounce(LABOR, log.on);
    expect(clips).toHaveLength(1);
    expect(log.states).toEqual([]);
    clips[0].start();
    expect(await via).toBe("recording");
  });

  it("a preload that errors marks the recording failed before anyone taps", () => {
    const { deps, clips, synth } = fakeDeps();
    const p = new Pronouncer(deps);
    p.preload(PERTINENT);
    clips[0].fail();
    expect(p.hasFailed(PERTINENT.audio)).toBe(true);
    void p.pronounce(PERTINENT);
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(clips).toHaveLength(1);
  });

  it("preload skips words without a usable recording", () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    p.preload(NO_AUDIO);
    p.preload({ word: "x", audio: "https://x/y.ogg" });
    expect(clips).toHaveLength(0);
  });

  it("evicts the least recently used recording past the cache size", () => {
    const { deps, clips } = fakeDeps({ cacheSize: 2 });
    const p = new Pronouncer(deps);
    p.preload({ word: "a", audio: "https://x/a.mp3" });
    p.preload({ word: "b", audio: "https://x/b.mp3" });
    p.preload({ word: "c", audio: "https://x/c.mp3" });
    expect(clips[0].pauses).toBe(1);
    expect(clips[0].listenerCount("error")).toBe(0);
    p.preload({ word: "a", audio: "https://x/a.mp3" });
    expect(clips).toHaveLength(4); // a was evicted, so it's fetched again
  });

  it("dispose stops playback and releases every cached element", () => {
    const { deps, clips } = fakeDeps();
    const p = new Pronouncer(deps);
    p.preload(LABOR);
    const log = stateLog();
    void p.pronounce(PERTINENT, log.on);
    p.dispose();
    expect(log.states).toEqual(["loading", "idle"]);
    for (const c of clips) {
      expect(c.pauses).toBeGreaterThan(0);
      expect(c.listenerCount("ready")).toBe(0);
    }
  });
});

describe("Pronouncer — mobile (speak inside the tap)", () => {
  it("auto: a recording that isn't loaded yet → system voice right away, recording fetched in the background", async () => {
    const { deps, clips, synth } = fakeDeps({ instantFallback: () => true });
    const p = new Pronouncer(deps);
    const log = stateLog();
    const via = p.pronounce(PERTINENT, log.on);
    // Synchronously — still inside the click handler.
    expect(synth.spoken).toEqual(["pertinent"]);
    expect(clips).toHaveLength(1);
    expect(clips[0].loads).toBe(1);
    expect(clips[0].plays).toBe(0);
    expect(await via).toBe("synth");
    // No 1.5 s timer involved.
    vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS * 2);
    expect(synth.spoken).toEqual(["pertinent"]);
    synth.started();
    synth.ended();
    expect(log.states).toEqual(["loading", "playing", "idle"]);
  });

  it("auto: once the recording is loaded, the next tap plays it", async () => {
    const { deps, clips, synth } = fakeDeps({ instantFallback: () => true });
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    synth.ended();
    clips[0].loaded();

    const via = p.pronounce(PERTINENT);
    expect(clips).toHaveLength(1);
    expect(clips[0].plays).toBe(1);
    clips[0].start();
    expect(await via).toBe("recording");
    expect(synth.spoken).toEqual(["pertinent"]);
  });

  it("auto: a tap while it's still loading speaks again without waiting or refetching", () => {
    const { deps, clips, synth } = fakeDeps({ instantFallback: () => true });
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    synth.ended();
    void p.pronounce(PERTINENT);
    expect(synth.spoken).toEqual(["pertinent", "pertinent"]);
    expect(clips).toHaveLength(1);
    expect(clips[0].loads).toBe(1);
  });

  it("auto: a preloaded (flashcard) recording that's ready plays right away", async () => {
    const { deps, clips } = fakeDeps({ instantFallback: () => true });
    const p = new Pronouncer(deps);
    p.preload(LABOR);
    clips[0].loaded();
    const via = p.pronounce(LABOR);
    clips[0].start();
    expect(await via).toBe("recording");
  });

  it("recording: plays from inside the tap and waits; another tap plays it again (no timer)", () => {
    const { deps, clips, synth } = fakeDeps({ instantFallback: () => true, source: () => "recording" });
    const p = new Pronouncer(deps);
    const log = stateLog();
    void p.pronounce(PERTINENT, log.on);
    expect(clips[0].plays).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(synth.spoken).toEqual([]);
    void p.pronounce(PERTINENT);
    expect(clips[0].plays).toBe(2);
    expect(clips).toHaveLength(1);
  });

  it("is read on every tap (emulateMobile can flip it)", () => {
    let mobile = false;
    const { deps, clips, synth } = fakeDeps({ instantFallback: () => mobile });
    const p = new Pronouncer(deps);
    void p.pronounce(PERTINENT);
    expect(clips[0].plays).toBe(1);
    expect(synth.spoken).toEqual([]);
    mobile = true;
    void p.pronounce(LABOR);
    expect(synth.spoken).toEqual(["labor"]);
  });
});

describe("Pronouncer — failed URLs remembered on this device", () => {
  const T0 = Date.UTC(2026, 9, 5);

  it("saves a failure and skips the URL after a restart", () => {
    const store = new FakeDeviceState();
    let now = T0;
    const first = fakeDeps({ deviceState: store, now: () => now });
    const entry = { ...PERTINENT };
    void new Pronouncer(first.deps).pronounce(entry);
    first.clips[0].fail();
    expect(JSON.parse(store.get(FAILED_KEY)!)).toEqual({ [PERTINENT.audio]: T0 });
    expect(entry.audio).toBe(PERTINENT.audio); // the entry itself is untouched

    now = T0 + 60_000;
    const second = fakeDeps({ deviceState: store, now: () => now });
    const p = new Pronouncer(second.deps);
    expect(p.hasFailed(PERTINENT.audio)).toBe(true);
    void p.pronounce(PERTINENT);
    expect(second.clips).toHaveLength(0);
    expect(second.synth.spoken).toEqual(["pertinent"]);
  });

  it("tries again after 7 days (a 522 can be temporary)", () => {
    const store = new FakeDeviceState();
    store.set(FAILED_KEY, JSON.stringify({ [PERTINENT.audio]: T0, [LABOR.audio]: T0 + FAILED_TTL_MS }));
    let now = T0 + FAILED_TTL_MS - 1;
    const { deps, clips } = fakeDeps({ deviceState: store, now: () => now });
    const p = new Pronouncer(deps);
    expect(p.hasFailed(PERTINENT.audio)).toBe(true);
    now = T0 + FAILED_TTL_MS;
    expect(p.hasFailed(PERTINENT.audio)).toBe(false);
    expect(JSON.parse(store.get(FAILED_KEY)!)).toEqual({ [LABOR.audio]: T0 + FAILED_TTL_MS });
    void p.pronounce(PERTINENT);
    expect(clips).toHaveLength(1);
  });

  it("drops expired entries when loading", () => {
    const store = new FakeDeviceState();
    store.set(FAILED_KEY, JSON.stringify({ [PERTINENT.audio]: T0 - FAILED_TTL_MS, bogus: "x" }));
    const { deps } = fakeDeps({ deviceState: store, now: () => T0 });
    const p = new Pronouncer(deps);
    expect(p.hasFailed(PERTINENT.audio)).toBe(false);
    expect(p.hasFailed("bogus")).toBe(false);
  });

  it("stores every failed URL with its time", () => {
    const store = new FakeDeviceState();
    const { deps, clips } = fakeDeps({ deviceState: store, now: () => T0 });
    const p = new Pronouncer(deps);
    p.preload(PERTINENT);
    p.preload(LABOR);
    clips[0].fail();
    clips[1].fail();
    expect(Object.keys(JSON.parse(store.get(FAILED_KEY)!))).toEqual([PERTINENT.audio, LABOR.audio]);
  });

  it("formats the device can't play aren't stored (recomputed each session)", () => {
    const store = new FakeDeviceState();
    const { deps } = fakeDeps({ deviceState: store });
    void new Pronouncer(deps).pronounce({ word: "tenure", audio: "https://x/tenure.ogg" });
    expect(store.get(FAILED_KEY)).toBeNull();
  });

  it("corrupt or unavailable storage doesn't break pronouncing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = new FakeDeviceState();
    bad.set(FAILED_KEY, "{not json");
    const a = fakeDeps({ deviceState: bad });
    expect(() => new Pronouncer(a.deps)).not.toThrow();

    const throwing = {
      get: () => {
        throw new Error("denied");
      },
      set: () => {
        throw new Error("denied");
      },
    };
    const b = fakeDeps({ deviceState: throwing });
    const p = new Pronouncer(b.deps);
    void p.pronounce(PERTINENT);
    expect(() => b.clips[0].fail()).not.toThrow();
    expect(b.synth.spoken).toEqual(["pertinent"]);
    err.mockRestore();
  });
});

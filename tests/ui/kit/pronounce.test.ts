import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notices: string[] = [];
vi.mock("obsidian", () => ({
  Notice: class {
    constructor(msg: string) {
      notices.push(msg);
    }
  },
}));

import { setLocale } from "../../../src/core/i18n";
import { Pronouncer } from "../../../src/services/speech/Pronouncer";
import {
  applyPronounceState,
  bindPronounceButton,
  configurePronouncer,
  disposePronouncer,
  pronounce,
  preloadPronunciation,
  setPronouncerForTests,
  stopPronouncingIn,
} from "../../../src/ui/kit/pronounce";
import { fakeDeps, FakeDeviceState } from "../../services/speech/fakes";

// Just what the kit touches on a button.
class Btn {
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  isConnected = true;
  parent: Btn | null = null;
  private clicks: ((e: { detail: number; stopPropagation(): void }) => void)[] = [];
  addClass(c: string) {
    this.classes.add(c);
  }
  toggleClass(c: string, on: boolean) {
    if (on) this.classes.add(c);
    else this.classes.delete(c);
  }
  setAttr(k: string, v: string) {
    this.attrs[k] = v;
  }
  removeAttribute(k: string) {
    delete this.attrs[k];
  }
  addEventListener(_type: string, cb: (e: { detail: number; stopPropagation(): void }) => void) {
    this.clicks.push(cb);
  }
  contains(other: Btn): boolean {
    for (let n: Btn | null = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  click() {
    const e = { detail: 1, stopPropagation: vi.fn() };
    for (const cb of this.clicks) cb(e);
    return e;
  }
}
const el = (b: Btn) => b as unknown as HTMLElement;
const state = (b: Btn) => (b.classes.has("is-loading") ? "loading" : b.classes.has("is-playing") ? "playing" : "idle");

const PERTINENT = {
  id: "p1",
  word: "pertinent",
  audio: "https://api.dictionaryapi.dev/media/pronunciations/en/pertinent-us.mp3",
};
const LABOR = { id: "l1", word: "labor", audio: "https://x/labor-us.mp3" };

let fake: ReturnType<typeof fakeDeps>;
beforeEach(() => {
  vi.useFakeTimers();
  setLocale("zh-TW");
  notices.length = 0;
  fake = fakeDeps();
  setPronouncerForTests(new Pronouncer(fake.deps));
});
afterEach(() => {
  setPronouncerForTests(null);
  vi.useRealTimers();
});

describe("applyPronounceState", () => {
  it("toggles is-loading / is-playing and aria-busy", () => {
    const b = new Btn();
    applyPronounceState(el(b), "loading");
    expect(b.classes.has("is-loading")).toBe(true);
    expect(b.attrs["aria-busy"]).toBe("true");
    expect(b.attrs.title).toBe("讀取發音中…");
    applyPronounceState(el(b), "playing");
    expect([...b.classes]).toEqual(["is-playing"]);
    expect(b.attrs["aria-busy"]).toBeUndefined();
    applyPronounceState(el(b), "idle");
    expect(b.classes.size).toBe(0);
  });
});

describe("🔊 buttons", () => {
  it("shows the spinner right away on click, then playing, then idle", () => {
    const b = new Btn();
    bindPronounceButton(el(b), PERTINENT);
    expect(b.classes.has("vt-pronounce")).toBe(true);
    b.click();
    expect(state(b)).toBe("loading");
    fake.clips[0].start();
    expect(state(b)).toBe("playing");
    fake.clips[0].end();
    expect(state(b)).toBe("idle");
  });

  it("every button of the same word follows; others don't — including one drawn mid-load (flip)", () => {
    const card = new Btn();
    const row = new Btn();
    const other = new Btn();
    bindPronounceButton(el(card), PERTINENT);
    bindPronounceButton(el(row), PERTINENT);
    bindPronounceButton(el(other), LABOR);
    card.click();
    expect(state(row)).toBe("loading");
    expect(state(other)).toBe("idle");

    // The card re-renders while loading: the new 🔊 starts out loading.
    card.isConnected = false;
    const redrawn = new Btn();
    bindPronounceButton(el(redrawn), PERTINENT);
    expect(state(redrawn)).toBe("loading");

    vi.advanceTimersByTime(1500); // slow recording → system voice
    expect(fake.synth.spoken).toEqual(["pertinent"]);
    fake.synth.started();
    expect(state(redrawn)).toBe("playing");
    fake.synth.ended();
    expect(state(redrawn)).toBe("idle");
  });

  it("a second word's tap resets the first word's button", () => {
    const a = new Btn();
    const b = new Btn();
    bindPronounceButton(el(a), PERTINENT);
    bindPronounceButton(el(b), LABOR);
    a.click();
    b.click();
    expect(state(a)).toBe("idle");
    expect(state(b)).toBe("loading");
  });

  it("a getter is read at click time; `after` and stopPropagation run", () => {
    let current = PERTINENT;
    const b = new Btn();
    const after = vi.fn();
    bindPronounceButton(el(b), () => current, { stopPropagation: true, after });
    current = { ...LABOR, audio: "" } as typeof LABOR;
    const e = b.click();
    expect(fake.synth.spoken).toEqual(["labor"]);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(after).toHaveBeenCalledWith(e);
  });

  it("says so when the device has no voice at all", async () => {
    fake.synth.available = false;
    expect(await pronounce({ word: "glittery" })).toBe("none");
    expect(notices).toEqual(["這台裝置沒有可用的發音。"]);
  });

  it("no notice for an attempt that was just replaced", async () => {
    const first = pronounce(PERTINENT);
    void pronounce(LABOR);
    expect(await first).toBe("stopped");
    expect(notices).toEqual([]);
  });

  it("stopPronouncingIn stops only a word that has a 🔊 inside that root", async () => {
    const root = new Btn();
    const inside = new Btn();
    inside.parent = root;
    bindPronounceButton(el(inside), PERTINENT);
    const elsewhere = new Btn();
    bindPronounceButton(el(elsewhere), LABOR);

    elsewhere.click();
    stopPronouncingIn(el(root));
    expect(state(elsewhere)).toBe("loading");

    inside.click();
    stopPronouncingIn(el(root));
    expect(state(inside)).toBe("idle");
    expect(fake.clips[1].pauses).toBe(1);
  });

  it("preloadPronunciation fetches ahead", () => {
    preloadPronunciation(LABOR);
    preloadPronunciation(undefined);
    expect(fake.clips).toHaveLength(1);
    expect(fake.clips[0].loads).toBe(1);
  });
});

describe("configurePronouncer — the real wiring (browser globals stubbed)", () => {
  afterEach(() => {
    disposePronouncer();
    configurePronouncer({ mobile: undefined });
    vi.unstubAllGlobals();
  });

  function stubBrowser() {
    const audios: { src: string; loads: number; plays: number }[] = [];
    class FakeAudio {
      src = "";
      preload = "";
      readyState = 0;
      currentTime = 0;
      loads = 0;
      plays = 0;
      constructor() {
        audios.push(this);
      }
      load() {
        this.loads++;
      }
      play() {
        this.plays++;
        return new Promise<void>(() => {});
      }
      pause() {}
      addEventListener() {}
      removeEventListener() {}
    }
    const spoken: string[] = [];
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("document", { createElement: () => ({ canPlayType: () => "maybe" }) });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      constructor(public text: string) {}
    });
    vi.stubGlobal("window", {
      speechSynthesis: {
        speaking: false,
        pending: false,
        getVoices: () => [],
        cancel: () => {},
        speak: (u: { text: string }) => spoken.push(u.text),
      },
    });
    return { audios, spoken };
  }

  it("mobile: speaks inside the tap and fetches the recording; failures go to device storage", () => {
    setPronouncerForTests(null);
    const { audios, spoken } = stubBrowser();
    const store = new FakeDeviceState();
    configurePronouncer({ mobile: () => true, deviceState: store });
    void pronounce(PERTINENT);
    expect(spoken).toEqual(["pertinent"]);
    expect(audios).toHaveLength(1);
    expect(audios[0].src).toBe(PERTINENT.audio);
    expect(audios[0].loads).toBe(1);
    expect(audios[0].plays).toBe(0);
  });

  it("desktop: tries the recording first", () => {
    setPronouncerForTests(null);
    const { audios, spoken } = stubBrowser();
    configurePronouncer({ mobile: () => false });
    void pronounce(PERTINENT);
    expect(spoken).toEqual([]);
    expect(audios[0].plays).toBe(1);
  });
});

// Text-to-speech for words without a recording (規劃書 01 §2, step 6).
//
// iOS quirks handled here:
// - The first speak() after launch is sometimes silent until the voice list
//   has been asked for once — so warmUp() calls getVoices() at plugin load,
//   and speak() makes sure it happened.
// - cancel() right before speak() can swallow the new utterance in WebKit,
//   so it only cancels when something is actually playing.
// The voice itself is left to the system (lang = en-US): Apple's voice list
// also has novelty en-US voices, so "the first English voice" can't be
// trusted to be a sensible one.
// speak() reports start / end (onstart, onend / onerror) so the 🔊 button
// can show loading and playing (1005 回饋第 12 項, services/speech).

import type { SpeakEvents, SynthPort } from "../../services/speech/Pronouncer";

export interface SynthUtterance {
  lang: string;
  // `never` parameter: SpeechSynthesisUtterance's own handler types fit.
  onstart?: ((ev: never) => unknown) | null;
  onend?: ((ev: never) => unknown) | null;
  onerror?: ((ev: never) => unknown) | null;
}

export interface Synth {
  speaking: boolean;
  pending: boolean;
  getVoices(): unknown[];
  cancel(): void;
  speak(u: SynthUtterance): void;
}

export class Speaker implements SynthPort {
  private warmed = false;
  // Held so Chromium doesn't garbage-collect the utterance mid-speech
  // (its onend would then never fire).
  private utterance: SynthUtterance | null = null;

  constructor(
    private synth: Synth | null,
    private makeUtterance: (text: string) => SynthUtterance
  ) {}

  get available(): boolean {
    return !!this.synth;
  }

  warmUp(): void {
    if (!this.synth || this.warmed) return;
    this.warmed = true;
    try {
      this.synth.getVoices();
    } catch (e) {
      console.error("Vocab Tracker: speechSynthesis warm-up failed", e);
    }
  }

  // false when the device has no speech synthesis at all.
  speak(word: string, events: SpeakEvents = {}): boolean {
    const synth = this.synth;
    if (!synth) return false;
    this.warmUp();
    const u = this.makeUtterance(word);
    u.lang = "en-US";
    const done = () => {
      if (this.utterance === u) this.utterance = null;
      events.onEnd?.();
    };
    if (events.onStart) u.onstart = () => events.onStart?.();
    u.onend = done;
    u.onerror = done;
    if (synth.speaking || synth.pending) synth.cancel();
    this.utterance = u;
    synth.speak(u);
    return true;
  }

  // Stops the current utterance (only when something is playing — see
  // the WebKit note above).
  cancel(): void {
    const synth = this.synth;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }
}

// The browser's speechSynthesis, when there is one.
export function browserSpeaker(): Speaker {
  const w = typeof window !== "undefined" ? (window as unknown as { speechSynthesis?: Synth }) : undefined;
  const synth = w?.speechSynthesis ?? null;
  return new Speaker(synth, (text) => new SpeechSynthesisUtterance(text));
}

// One Speaker for the whole plugin: main.ts warms it up at load and the
// pronounce kit (ui/kit/pronounce.ts) speaks through it.
let shared: Speaker | null = null;
export function sharedSpeaker(): Speaker {
  shared ??= browserSpeaker();
  return shared;
}

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

export interface SynthUtterance {
  lang: string;
}

export interface Synth {
  speaking: boolean;
  pending: boolean;
  getVoices(): unknown[];
  cancel(): void;
  speak(u: SynthUtterance): void;
}

export class Speaker {
  private warmed = false;

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
  speak(word: string): boolean {
    const synth = this.synth;
    if (!synth) return false;
    this.warmUp();
    const u = this.makeUtterance(word);
    u.lang = "en-US";
    if (synth.speaking || synth.pending) synth.cancel();
    synth.speak(u);
    return true;
  }
}

// The browser's speechSynthesis, when there is one.
export function browserSpeaker(): Speaker {
  const w = typeof window !== "undefined" ? (window as unknown as { speechSynthesis?: Synth }) : undefined;
  const synth = w?.speechSynthesis ?? null;
  return new Speaker(synth, (text) => new SpeechSynthesisUtterance(text));
}

import { describe, expect, it, vi } from "vitest";
import { Speaker, type Synth, type SynthUtterance } from "../../../src/ui/mobile/speech";

function fakeSynth(over: Partial<Synth> = {}) {
  const spoken: SynthUtterance[] = [];
  const synth = {
    speaking: false,
    pending: false,
    getVoices: vi.fn(() => []),
    cancel: vi.fn(),
    speak: vi.fn((u: SynthUtterance) => spoken.push(u)),
    ...over,
  };
  return { synth, spoken };
}

const utterance = (text: string) => ({ text, lang: "" }) as SynthUtterance & { text: string };

describe("Speaker", () => {
  it("warms up once: getVoices before the first speak (iOS silent first call)", () => {
    const { synth } = fakeSynth();
    const s = new Speaker(synth, utterance);
    s.warmUp();
    s.warmUp();
    expect(synth.getVoices).toHaveBeenCalledTimes(1);
    s.speak("glittery");
    expect(synth.getVoices).toHaveBeenCalledTimes(1);
  });

  it("speak() warms up itself when warmUp() wasn't called", () => {
    const { synth } = fakeSynth();
    new Speaker(synth, utterance).speak("leotard");
    expect(synth.getVoices).toHaveBeenCalledTimes(1);
    expect(vi.mocked(synth.getVoices).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(synth.speak).mock.invocationCallOrder[0]);
  });

  it("speaks in en-US and only cancels when something is playing", () => {
    const { synth, spoken } = fakeSynth();
    const s = new Speaker(synth, utterance);
    expect(s.speak("glittery")).toBe(true);
    expect(spoken[0]).toMatchObject({ text: "glittery", lang: "en-US" });
    expect(synth.cancel).not.toHaveBeenCalled();
    synth.speaking = true;
    s.speak("leotard");
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it("reports no speech synthesis", () => {
    const s = new Speaker(null, utterance);
    expect(s.available).toBe(false);
    s.warmUp();
    expect(s.speak("x")).toBe(false);
  });

  it("a throwing getVoices doesn't break speaking", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { synth, spoken } = fakeSynth({
      getVoices: vi.fn(() => {
        throw new Error("nope");
      }),
    });
    new Speaker(synth, utterance).speak("x");
    expect(spoken).toHaveLength(1);
    err.mockRestore();
  });
});

describe("Speaker — events for the 🔊 button states", () => {
  it("reports start and end through the utterance's handlers", () => {
    const { synth, spoken } = fakeSynth();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    new Speaker(synth, utterance).speak("pertinent", { onStart, onEnd });
    const u = spoken[0] as SynthUtterance & { onstart: () => void; onend: () => void };
    u.onstart();
    expect(onStart).toHaveBeenCalledTimes(1);
    u.onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("an error (e.g. interrupted) also counts as the end", () => {
    const { synth, spoken } = fakeSynth();
    const onEnd = vi.fn();
    new Speaker(synth, utterance).speak("pertinent", { onEnd });
    (spoken[0] as SynthUtterance & { onerror: () => void }).onerror();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("cancel() only cancels when something is speaking", () => {
    const { synth } = fakeSynth();
    const s = new Speaker(synth, utterance);
    s.cancel();
    expect(synth.cancel).not.toHaveBeenCalled();
    synth.pending = true;
    s.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    new Speaker(null, utterance).cancel(); // no synth: no throw
  });
});

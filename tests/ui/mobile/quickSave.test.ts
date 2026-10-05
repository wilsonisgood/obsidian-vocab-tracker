import { describe, expect, it, vi } from "vitest";
import type { VocabEntry } from "../../../src/core/model/entry";
import type { NoticeAction } from "../../../src/ui/mobile/actionNotice";
import { quickSave } from "../../../src/ui/mobile/quickSave";

const entry = { id: "1", word: "glittery" } as VocabEntry;

function setup(added: VocabEntry | null) {
  const notes: { text: string; actions?: NoticeAction[] }[] = [];
  const deps = {
    add: vi.fn(async () => added),
    remove: vi.fn(async () => {}),
    notify: (text: string, actions?: NoticeAction[]) => notes.push({ text, actions }),
  };
  return { deps, notes };
}

describe("quickSave (tap action: save)", () => {
  it("adds the word and confirms with an undo button", async () => {
    const { deps, notes } = setup(entry);
    expect(await quickSave("glittery", deps)).toBe(entry);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain("glittery");
    expect(notes[0].actions).toHaveLength(1);
  });

  it("undo deletes the entry once, then says so", async () => {
    const { deps, notes } = setup(entry);
    await quickSave("glittery", deps);
    const undo = notes[0].actions![0];
    undo.run();
    undo.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.remove).toHaveBeenCalledTimes(1);
    expect(deps.remove).toHaveBeenCalledWith(entry);
    expect(notes).toHaveLength(2);
    expect(notes[1].actions).toBeUndefined();
  });

  it("nothing to undo when the word was already saved", async () => {
    const { deps, notes } = setup(null);
    expect(await quickSave("glittery", deps)).toBeNull();
    expect(notes).toHaveLength(0);
  });
});

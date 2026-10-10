import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ui/mobile/actionNotice", () => ({ actionNotice: vi.fn() }));
import { UndoableQueue, type UndoScheduler } from "../../../src/ui/kit/undoable";
import { clearFamilyMemberEntry } from "../../../src/services/learn/linkage";
import type { Family } from "../../../src/core/model/family";

function fakeScheduler() {
  let fn: (() => void) | null = null;
  let ms = 0;
  const s: UndoScheduler = {
    setTimeout: (f, m) => ((fn = f), (ms = m), 1),
    clearTimeout: () => void (fn = null),
  };
  return { s, fire: () => fn?.(), ms: () => ms };
}

const family = {
  id: "f1",
  topic: "t",
  label: "t",
  source: "ai",
  groups: [
    { label: "A", members: [{ word: "a1", zh: "" }, { word: "a2", zh: "", entryId: "e2" }] },
    { label: "B", members: [{ word: "b1", zh: "", entryId: "e1" }, { word: "b2", zh: "" }] },
  ],
} as unknown as Family;

// Mirrors unlikeEntry: soft-delete on apply, family unlink only on commit.
function setup(ms: number) {
  const sch = fakeScheduler();
  const q = new UndoableQueue(sch.s);
  const state = { deleted: false, family };
  const h = q.start({
    ms,
    apply: () => void (state.deleted = true),
    restore: () => void (state.deleted = false),
    commit: () => void (state.family = clearFamilyMemberEntry(state.family, "e1")),
  });
  return { sch, state, h };
}

describe("galaxy delete -> undo", () => {
  it("uses the 5s window passed in", () => {
    expect(setup(5000).sch.ms()).toBe(5000);
  });
  it("undo before commit restores the entry and leaves group/index untouched", () => {
    const { sch, state, h } = setup(5000);
    expect(state.deleted).toBe(true);
    h.restore();
    sch.fire();
    expect(state.deleted).toBe(false);
    expect(state.family).toBe(family);
    expect(state.family.groups[1].members[0]).toMatchObject({ word: "b1", entryId: "e1" });
  });
  it("commit keeps the member text in its group and index, only dropping the pointer", () => {
    const { sch, state } = setup(5000);
    sch.fire();
    const g = state.family.groups[1];
    expect(g.label).toBe("B");
    expect(g.members[0]).toEqual({ word: "b1", zh: "" });
    expect(g.members).toHaveLength(2);
    expect(state.family.groups[0]).toBe(family.groups[0]);
  });
});

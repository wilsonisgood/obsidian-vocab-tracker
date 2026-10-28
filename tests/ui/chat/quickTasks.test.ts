import { describe, expect, it } from "vitest";
import { quickTasksToShow, selectionToAttach } from "../../../src/ui/chat/quickTasks";
import { showSinkButton } from "../../../src/ui/blocks/scrollBottom";

const tasks = [{ id: "a", label: "A" }, { id: "b" }, { id: "c", label: "C" }];
const get = (id: string) => tasks.find((t) => t.id === id);

describe("ChatPanel options keep the defaults", () => {
  it("shows every labeled task of the surface when the host chooses none", () => {
    expect(quickTasksToShow(tasks, get).map((t) => t.id)).toEqual(["a", "c"]);
  });
  it("shows the host's ids in its order, skipping unknown and unlabeled ones", () => {
    expect(quickTasksToShow(tasks, get, ["c", "b", "zzz", "a"]).map((t) => t.id)).toEqual(["c", "a"]);
  });
  it("attaches the selection unless the page opted out", () => {
    expect(selectionToAttach(undefined, "x")).toBe("x");
    expect(selectionToAttach(true, "x")).toBe("x");
    expect(selectionToAttach(false, "x")).toBeUndefined();
    expect(selectionToAttach(undefined, undefined)).toBeUndefined();
  });
});

describe("sink button", () => {
  it("shows only when scrolled away from the bottom", () => {
    expect(showSinkButton(0, 800, 2000)).toBe(true);
    expect(showSinkButton(1190, 800, 2000)).toBe(false);
    expect(showSinkButton(1100, 800, 2000)).toBe(true);
    expect(showSinkButton(0, 800, 700)).toBe(false);
  });
});

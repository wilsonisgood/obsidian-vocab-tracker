import { describe, expect, it } from "vitest";
import { quickTasksToShow, selectionToAttach } from "../../../src/ui/chat/quickTasks";
import { shouldFollow, sinkSearch, isScrollableOverflow, showSinkButton } from "../../../src/ui/blocks/scrollBottom";

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

describe("finding the scroll container", () => {
  it("waits for the block to be attached, then gives up after the tries", () => {
    expect(sinkSearch(true, 0)).toBe("setup");
    expect(sinkSearch(false, 0)).toBe("retry");
    expect(sinkSearch(false, 38)).toBe("retry");
    expect(sinkSearch(false, 39)).toBe("giveup");
    expect(sinkSearch(true, 12)).toBe("setup");
  });
  it("knows a scrolling overflow", () => {
    expect(isScrollableOverflow("auto")).toBe(true);
    expect(isScrollableOverflow("scroll")).toBe(true);
    expect(isScrollableOverflow("visible")).toBe(false);
    expect(isScrollableOverflow("hidden")).toBe(false);
  });
});

describe("following an answer", () => {
  it("follows only near the bottom", () => {
    expect(shouldFollow(-300)).toBe(true);
    expect(shouldFollow(0)).toBe(true);
    expect(shouldFollow(119)).toBe(true);
    expect(shouldFollow(120)).toBe(false);
    expect(shouldFollow(900)).toBe(false);
  });
});

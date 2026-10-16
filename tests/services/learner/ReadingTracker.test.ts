import { describe, expect, it, vi } from "vitest";
import { ReadingTracker } from "../../../src/services/learner/ReadingTracker";

const mk = (isPlugin: boolean, text: string | null = "# T\n## H\nbody") => {
  const rec = vi.fn();
  const t = new ReadingTracker({ isPluginNote: () => isPlugin, read: async () => text }, { recordReading: rec });
  return { t, rec };
};

describe("ReadingTracker", () => {
  it("records title and heading", async () => {
    const { t, rec } = mk(false);
    await t.note("a/b.md", 2, "word");
    expect(rec).toHaveBeenCalledWith({ path: "a/b.md", title: "T", heading: "H", kind: "word" });
  });
  it("skips plugin pages and non-md", async () => {
    const a = mk(true);
    await a.t.note("w.md", 0, "word");
    const b = mk(false);
    await b.t.note("x.png", 0, "word");
    expect(a.rec).not.toHaveBeenCalled();
    expect(b.rec).not.toHaveBeenCalled();
  });
  it("uses the file name without H1 and swallows errors", async () => {
    const { t, rec } = mk(false, "plain");
    await t.note("dir/My Note.md", null, "paragraph");
    expect(rec).toHaveBeenCalledWith({ path: "dir/My Note.md", title: "My Note", heading: undefined, kind: "paragraph" });
    const bad = new ReadingTracker({ isPluginNote: () => false, read: async () => { throw new Error("x"); } }, { recordReading: rec });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(bad.note("a.md", 0, "add")).resolves.toBeUndefined();
  });
});

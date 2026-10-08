import { describe, expect, it } from "vitest";
import { PageContextHub, type PageContext } from "../../../src/ui/page/pageContext";

function ctx(over: Partial<PageContext> = {}): PageContext {
  return {
    kind: "families",
    sourcePath: "vocab-list/字族樹.md",
    groups: [{ key: "family:a", title: "🌊 ocean 海洋", words: [{ word: "tide", zh: "潮汐", emoji: "🌊", entryId: "e1" }] }],
    activeGroupKey: "family:a",
    selectWord: () => {},
    addWord: async () => undefined,
    ...over,
  };
}

function hubWithLog() {
  const hub = new PageContextHub();
  const log: (PageContext | null)[] = [];
  hub.events.on("changed", (c) => log.push(c));
  return { hub, log };
}

describe("PageContextHub (規劃書 10 §2.1)", () => {
  it("does not re-emit when the same owner publishes the same content", () => {
    const { hub, log } = hubWithLog();
    const owner = {};
    hub.publish(owner, ctx());
    hub.publish(owner, ctx());
    expect(log).toHaveLength(1);
  });

  it("emits when the content changes", () => {
    const { hub, log } = hubWithLog();
    const owner = {};
    hub.publish(owner, ctx());
    hub.publish(owner, ctx({ activeGroupKey: "family:b" }));
    expect(log).toHaveLength(2);
    expect(hub.current()?.activeGroupKey).toBe("family:b");
  });

  it("emits when a different owner publishes the same content", () => {
    const { hub, log } = hubWithLog();
    hub.publish({}, ctx());
    hub.publish({}, ctx());
    expect(log).toHaveLength(2);
  });

  it("ignores clear() from an owner that is not current", () => {
    const { hub, log } = hubWithLog();
    const owner = {};
    hub.publish(owner, ctx());
    hub.clear({});
    expect(hub.current()).not.toBeNull();
    hub.clear(owner);
    expect(hub.current()).toBeNull();
    expect(log).toEqual([expect.anything(), null]);
  });

  it("for() only returns the context for its own source path", () => {
    const hub = new PageContextHub();
    hub.publish({}, ctx());
    expect(hub.for("vocab-list/字族樹.md")?.kind).toBe("families");
    expect(hub.for("vocab-list/Word DNA.md")).toBeNull();
    expect(hub.for(null)).toBeNull();
  });
});

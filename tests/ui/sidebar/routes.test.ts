import { describe, expect, it } from "vitest";
import { LIST_ROUTE, SidebarRouter, routeForActiveNote, routeKey, routePath, sameRoute, type SidebarRoute } from "../../../src/ui/sidebar/routes";

const section = { path: "eng/a.md", lineStart: 4, lineEnd: 5, text: "Hello there.\nGeneral Kenobi." };
const draft: SidebarRoute = { name: "paragraph-draft", section };
const para = (threadId: string): SidebarRoute => ({ name: "paragraph", threadId });
const paths: Record<string, string | null> = { t1: "eng/a.md", t2: "eng/b.md", gone: null };
const threadPath = (id: string) => paths[id] ?? null;

describe("routeKey / sameRoute", () => {
  it("identifies what a route shows", () => {
    expect(routeKey(LIST_ROUTE)).toBe("list");
    expect(routeKey(para("t1"))).toBe("paragraph:t1");
    expect(routeKey(draft)).toBe("draft:eng/a.md:4");
    expect(sameRoute(para("t1"), { name: "paragraph", threadId: "t1" })).toBe(true);
    expect(sameRoute(para("t1"), para("t2"))).toBe(false);
    // A draft is the same draft even if the text was re-read since.
    expect(sameRoute(draft, { name: "paragraph-draft", section: { ...section, text: "edited" } })).toBe(true);
  });

  it("knows which note a route belongs to", () => {
    expect(routePath(LIST_ROUTE, threadPath)).toBeNull();
    expect(routePath(para("t2"), threadPath)).toBe("eng/b.md");
    expect(routePath(draft, threadPath)).toBe("eng/a.md");
    expect(routePath(para("gone"), threadPath)).toBeNull();
  });
});

describe("routeForActiveNote", () => {
  it("keeps a pane while its note is the active one", () => {
    expect(routeForActiveNote(para("t1"), "eng/a.md", threadPath)).toEqual(para("t1"));
    expect(routeForActiveNote(draft, "eng/a.md", threadPath)).toBe(draft);
  });

  it("goes back to the list when another note becomes active", () => {
    expect(routeForActiveNote(para("t1"), "eng/b.md", threadPath)).toBe(LIST_ROUTE);
    expect(routeForActiveNote(draft, "eng/b.md", threadPath)).toBe(LIST_ROUTE);
  });

  it("keeps a discussion whose note is gone, and anything when no note is active", () => {
    expect(routeForActiveNote(para("gone"), "eng/b.md", threadPath)).toEqual(para("gone"));
    expect(routeForActiveNote(para("t1"), null, threadPath)).toEqual(para("t1"));
    expect(routeForActiveNote(LIST_ROUTE, "eng/b.md", threadPath)).toBe(LIST_ROUTE);
  });
});

describe("SidebarRouter", () => {
  it("starts on the list and reports real changes only", () => {
    const r = new SidebarRouter();
    expect(r.current).toEqual(LIST_ROUTE);
    expect(r.canGoBack).toBe(false);
    expect(r.go(LIST_ROUTE)).toBe(false);
    expect(r.go(para("t1"))).toBe(true);
    expect(r.go(para("t1"))).toBe(false);
    expect(r.canGoBack).toBe(true);
  });

  it("goes back to the list, never to another paragraph", () => {
    const r = new SidebarRouter();
    r.go(para("t1"));
    r.go(para("t2"));
    expect(r.back()).toBe(true);
    expect(r.current).toEqual(LIST_ROUTE);
    expect(r.back()).toBe(false);
  });

  it("promotes the draft once its thread exists", () => {
    const r = new SidebarRouter();
    r.go(draft);
    expect(r.promoteDraft({ path: "eng/a.md", lineStart: 4 }, "t9")).toBe(true);
    expect(r.current).toEqual(para("t9"));
  });

  it("ignores a promotion for a draft that's no longer showing", () => {
    const r = new SidebarRouter();
    r.go(draft);
    expect(r.promoteDraft({ path: "eng/a.md", lineStart: 8 }, "t9")).toBe(false);
    r.back();
    expect(r.promoteDraft({ path: "eng/a.md", lineStart: 4 }, "t9")).toBe(false);
    expect(r.current).toEqual(LIST_ROUTE);
  });
});

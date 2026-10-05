import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";

// Sidebar routes (規劃書 06 §9.4, design D1/D5). Plain data, no DOM, so the
// navigation rules are unit-tested.
//
//   list             the This note / All tabs
//   paragraph        one paragraph's discussion (D5), with a back button
//   paragraph-draft  a paragraph nobody has asked about yet: same pane, but
//                    there's no thread id until the first question creates
//                    the anchor and the thread — then it's replaced by
//                    { name: "paragraph", threadId } (promoteDraft).

export type SidebarRoute =
  | { name: "list" }
  | { name: "paragraph"; threadId: string }
  | { name: "paragraph-draft"; section: SectionRef };

export const LIST_ROUTE: SidebarRoute = { name: "list" };

// Stable identity of a route: two routes with the same key show the same
// thing, so navigating between them needn't redraw anything.
export function routeKey(route: SidebarRoute): string {
  switch (route.name) {
    case "list":
      return "list";
    case "paragraph":
      return `paragraph:${route.threadId}`;
    case "paragraph-draft":
      return `draft:${route.section.path}:${route.section.lineStart}`;
  }
}

export function sameRoute(a: SidebarRoute, b: SidebarRoute): boolean {
  return routeKey(a) === routeKey(b);
}

// The note a route belongs to; null for the list (it follows the active
// note itself) and for a thread that no longer exists.
export function routePath(route: SidebarRoute, threadPath: (threadId: string) => string | null): string | null {
  switch (route.name) {
    case "list":
      return null;
    case "paragraph":
      return threadPath(route.threadId);
    case "paragraph-draft":
      return route.section.path;
  }
}

// Switching to another article closes a paragraph pane that belongs to the
// previous one (§9.4: switching articles redraws everything). A pane whose
// thread is orphaned (its note is gone) or was opened from the All tab
// stays put when there's no active note to switch to.
export function routeForActiveNote(
  route: SidebarRoute,
  activePath: string | null,
  threadPath: (threadId: string) => string | null
): SidebarRoute {
  if (route.name === "list" || activePath === null) return route;
  const path = routePath(route, threadPath);
  if (path === null) return route.name === "paragraph-draft" ? LIST_ROUTE : route;
  return path === activePath ? route : LIST_ROUTE;
}

// Holds the current route. The back button always returns to the list
// (D5's 「← This note」): paragraph panes don't stack on each other.
export class SidebarRouter {
  private route: SidebarRoute = LIST_ROUTE;

  get current(): SidebarRoute {
    return this.route;
  }

  get canGoBack(): boolean {
    return this.route.name !== "list";
  }

  // Returns false when already there (nothing to redraw).
  go(route: SidebarRoute): boolean {
    if (sameRoute(route, this.route)) return false;
    this.route = route;
    return true;
  }

  back(): boolean {
    return this.go(LIST_ROUTE);
  }

  // The draft's first question created thread `threadId`. Ignored unless
  // the draft for that same section is still showing (the user may have
  // gone back, or opened another paragraph, while the anchor was written).
  promoteDraft(section: Pick<SectionRef, "path" | "lineStart">, threadId: string): boolean {
    const r = this.route;
    if (r.name !== "paragraph-draft" || r.section.path !== section.path || r.section.lineStart !== section.lineStart) return false;
    this.route = { name: "paragraph", threadId };
    return true;
  }
}

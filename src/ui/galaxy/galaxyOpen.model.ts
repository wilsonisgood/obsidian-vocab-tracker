// Pure half of galaxyOpen.ts's setViewState patch (1007-2 #6) — split out
// so it's unit-tested without importing "obsidian" (that package ships
// types only; importing a real binding like WorkspaceLeaf from it blows up
// under vitest, see galaxyOpen.ts for the installer that needs it).

export interface MarkdownViewState {
  type: string;
  state?: Record<string, unknown>;
}

// Whether opening this view state should become the full-screen galaxy
// instead: a plain "markdown" open of 字族樹.md itself, unless the ⋯ menu's
// 「開啟 Markdown 原始檔」escape hatch set `vtRaw: true` on the state.
export function shouldOpenAsGalaxy(vs: MarkdownViewState | null | undefined, familiesPath: string | null): boolean {
  if (!familiesPath) return false;
  if (!vs || vs.type !== "markdown") return false;
  if (vs.state?.vtRaw === true) return false;
  return vs.state?.file === familiesPath;
}

import { WorkspaceLeaf } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { GALAXY_VIEW_TYPE } from "./GalaxyView";
import { shouldOpenAsGalaxy, type MarkdownViewState } from "./galaxyOpen.model";

// 規劃書 10 §2.1 #6: opening 字族樹.md switches straight to the full-screen
// galaxy, same tab — same trick as the Kanban plugin, patching
// WorkspaceLeaf.prototype.setViewState so a "markdown" open of that one
// file becomes a GALAXY_VIEW_TYPE open instead (the judging logic itself,
// shouldOpenAsGalaxy, lives in galaxyOpen.model.ts so it's unit-tested
// without touching "obsidian"). No monkey-around dependency (project
// rule): the patch is hand-written here and undone via `plugin.register()`.

export function installGalaxyOpen(plugin: VocabTrackerPlugin): void {
  const proto = WorkspaceLeaf.prototype as unknown as {
    setViewState(this: WorkspaceLeaf, viewState: MarkdownViewState, eState?: unknown): Promise<void>;
  };
  const original = proto.setViewState;
  proto.setViewState = function (this: WorkspaceLeaf, viewState: MarkdownViewState, eState?: unknown): Promise<void> {
    const familiesPath = plugin.files.entryFilePath("families");
    if (shouldOpenAsGalaxy(viewState, familiesPath)) {
      return original.call(this, { ...viewState, type: GALAXY_VIEW_TYPE }, eState);
    }
    return original.call(this, viewState, eState);
  };
  plugin.register(() => {
    proto.setViewState = original;
  });
}

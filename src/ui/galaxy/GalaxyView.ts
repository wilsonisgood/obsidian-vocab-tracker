import { FileView, type TFile, type WorkspaceLeaf } from "obsidian";
import type VocabTrackerPlugin from "../../../main";
import { FamiliesBlock } from "../blocks/families";

// Full-screen Galaxy (規劃書 09 §6.1, 10 §2 #6「GalaxyView」) — opening 字族
// 樹.md itself (via galaxyOpen.ts's setViewState patch) lands here instead
// of the plain Markdown editor, same-tab. A FileView (not a bare ItemView)
// so `workspace.getActiveFile()?.path` still resolves to 字族樹.md while
// it's open — that's how the sidebar tells "page mode" apart from a normal
// note (規劃書 10 §2.1). All the actual rendering (topic row, toolbar,
// graph) is the same FamiliesBlock the embedded code block uses, just with
// `opts.fullscreen: true`; nothing is duplicated here.

export const GALAXY_VIEW_TYPE = "vocab-galaxy-view";

export class GalaxyView extends FileView {
  allowNoFile = false;
  private block: FamiliesBlock | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: VocabTrackerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return GALAXY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Word Galaxy";
  }

  getIcon(): string {
    return "orbit";
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (this.block) {
      this.removeChild(this.block);
      this.block = null;
    }
    this.contentEl.empty();
    // FamiliesBlock shows its own loading state until plugin.families is
    // ready — same as the embedded code block, no need to wait here.
    this.block = this.addChild(new FamiliesBlock(this.contentEl, this.plugin, {}, file.path, { fullscreen: true }));
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    if (this.block) {
      this.removeChild(this.block);
      this.block = null;
    }
    this.contentEl.empty();
  }
}

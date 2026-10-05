import type { WordContext } from "../../core/model/word-context";
import type { SectionRef } from "../../services/anchors/ParagraphAnchorService";
import type { WordTab } from "../word/wordUi";
import { wordSurface, type FormFactor } from "./formFactor";

// Where a word card or a paragraph discussion opens (規劃書 06 §9.7): the
// bottom sheet on iPhone, the right sidebar on iPad and desktop. main.ts
// sends every "show this word / paragraph" through here, so the iPhone
// never gets the full-screen right drawer pushed over the article.

export interface SheetTarget {
  showWord(word: string, opts?: { tab?: WordTab; ctx?: Partial<WordContext> }): void;
  openWord(entryId: string, tab: WordTab): void;
  openParagraph(ref: SectionRef): Promise<void>;
  // Waiting for a ✦ tap to move a discussion (started from the sheet).
  readonly rebinding: boolean;
}

export interface SidebarTarget {
  setWord(word: string): void;
  openWord(entryId: string, tab: WordTab): void;
  openParagraph(ref: SectionRef): Promise<void>;
  rebindThreadId: string | null;
}

export interface WordSurfacesDeps {
  form(): FormFactor;
  sheet: SheetTarget;
  // Opens the sidebar if needed, and brings it to the front.
  revealSidebar(): Promise<SidebarTarget>;
  // The sidebar if it's open already — never opens it.
  existingSidebar(): SidebarTarget | null;
}

export class WordSurfaces {
  constructor(private deps: WordSurfacesDeps) {}

  private get useSheet(): boolean {
    return wordSurface(this.deps.form()) === "sheet";
  }

  // A tapped word: its card, or the 「加入單字庫」 prompt when it isn't saved.
  async revealWord(word: string, ctx?: Partial<WordContext>): Promise<void> {
    if (this.useSheet) return this.deps.sheet.showWord(word, { ctx });
    (await this.deps.revealSidebar()).setWord(word);
  }

  // A saved word's card on a given tab (the word page's 「在側欄開啟」).
  async openWordCard(entryId: string, tab: WordTab): Promise<void> {
    if (this.useSheet) return this.deps.sheet.openWord(entryId, tab);
    (await this.deps.revealSidebar()).openWord(entryId, tab);
  }

  // A reading-view ✦. A rebind waits for this tap wherever it started:
  // the sidebar can still be opened by hand on iPhone (its own banner).
  async openParagraph(ref: SectionRef): Promise<void> {
    const open = this.deps.existingSidebar();
    if (open?.rebindThreadId) return open.openParagraph(ref);
    if (this.deps.sheet.rebinding || this.useSheet) return this.deps.sheet.openParagraph(ref);
    await (await this.deps.revealSidebar()).openParagraph(ref);
  }
}

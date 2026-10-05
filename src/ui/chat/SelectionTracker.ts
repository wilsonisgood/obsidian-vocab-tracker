import { MarkdownView, type App } from "obsidian";
import { TypedEmitter } from "../../core/events";

// Remembers the text last highlighted in a note (規劃書 06 §6.4.1 #1), so
// a discussion opened afterwards can attach it without the user copying
// anything: the selection is the best hint for 「我看不懂這句」.
//
// - Only selections inside a markdown leaf count (reading view and editor).
// - Collapsing the selection inside a note clears it; clicking into the
//   sidebar (which moves the DOM selection there) leaves it alone.
// - In the editor the text comes from editor.getSelection(): CodeMirror only
//   renders the visible lines, so the DOM selection of a long range is cut off.

export const MAX_SELECTION_CHARS = 1500;

export interface TrackedSelection {
  text: string;
  path?: string;
  // Bumped on every change, so a panel can tell "already used" from "new".
  version: number;
}

export class SelectionTracker {
  readonly events = new TypedEmitter<{ change: TrackedSelection | null }>();
  private current: TrackedSelection | null = null;
  private version = 0;

  constructor(private app: App) {}

  get(): TrackedSelection | null {
    return this.current;
  }

  // The selection went out with a question, or the user dismissed it.
  clear(): void {
    if (this.current) this.set(null);
  }

  // Wire to document "selectionchange".
  update(): void {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node) return;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    if (!el?.closest('.workspace-leaf-content[data-type="markdown"]')) return;

    const view = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((v): v is MarkdownView => v instanceof MarkdownView && v.containerEl.contains(el));
    const raw = view?.getMode() === "source" ? view.editor.getSelection() : sel.toString();
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SELECTION_CHARS);

    if (!text) {
      if (this.current) this.set(null);
      return;
    }
    if (this.current?.text === text) return;
    this.set({ text, path: view?.file?.path, version: ++this.version });
  }

  private set(next: TrackedSelection | null): void {
    this.current = next;
    this.events.emit("change", next);
  }
}

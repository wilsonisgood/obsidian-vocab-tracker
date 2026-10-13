import { topicById } from "../../core/grammar/catalog";
import type { VaultPort } from "../../core/ports";
import { GRAMMAR_PAGE_KIND, insertExplanation, renderTopicPage, topicPagePath } from "./topicPage";

// Grammar topic pages as notes (第十五波 M, rule 9; 1013 §3.2). A page is
// made the first time the learner opens its topic — not for all 85 up
// front — and found again by its frontmatter id, so renaming or moving it
// is fine. Never overwrites a file; the only write into an existing page
// is the explanation under 「## 說明」, and only while that section is empty.

export type GrammarPagesVault = Pick<VaultPort, "exists" | "create" | "process" | "findManaged" | "ready">;

export interface GrammarPagesDeps {
  vault: GrammarPagesVault;
  // The entry-file folder (EntryFilesService.paths().folder); topic pages
  // live in its Grammar/ subfolder. Read on every call, so settings apply now.
  folder(): string;
  // Opens a note in the workspace (main.ts: openLinkText / getLeaf).
  openPath(path: string): Promise<void>;
}

export class GrammarPages {
  // topic id → the ensure() in progress, so two quick calls create once.
  private pending = new Map<string, Promise<string>>();

  constructor(private deps: GrammarPagesDeps) {}

  // Where the topic's page is now (found by id), else where a new one goes.
  pathOf(topicId: string): string {
    const topic = topicById(topicId);
    if (!topic) throw new Error(`Unknown grammar topic: ${topicId}`);
    return (
      this.deps.vault.findManaged(GRAMMAR_PAGE_KIND, topicId) ?? topicPagePath(this.deps.folder(), topic.title, topicId)
    );
  }

  // The page's path, creating the page if there is none.
  ensure(topicId: string): Promise<string> {
    const running = this.pending.get(topicId);
    if (running) return running;
    const job = this.doEnsure(topicId).finally(() => this.pending.delete(topicId));
    this.pending.set(topicId, job);
    return job;
  }

  private async doEnsure(topicId: string): Promise<string> {
    const { vault } = this.deps;
    await vault.ready?.();
    const path = this.pathOf(topicId);
    // A file already there (found by id, or a note of the same name) is used as is.
    if (vault.exists(path)) return path;
    try {
      await vault.create(path, renderTopicPage(topicId));
    } catch (e) {
      // Appeared meanwhile (sync, another call): use it, don't overwrite.
      if (!vault.exists(path)) throw e;
    }
    return path;
  }

  // openGrammarTopic (the wave-15 cross-task interface).
  async open(topicId: string): Promise<void> {
    await this.deps.openPath(await this.ensure(topicId));
  }

  // Writes the AI explanation under 「## 說明」. Rejects with a
  // GrammarPageError ("not-empty": the learner already wrote something
  // there; "no-section": they removed the heading) and leaves the note as it is.
  async writeExplanation(topicId: string, markdown: string): Promise<void> {
    const path = await this.ensure(topicId);
    await this.deps.vault.process(path, (text) => insertExplanation(text, markdown));
  }
}

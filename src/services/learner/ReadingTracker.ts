import { basenameOf, headingContext } from "../../core/learner/reading";
import type { ReadingKind } from "../../core/model/learner";

// 閱讀紀錄 (第十九波 D1, 1016 #6-#8): records that the learner interacted with
// an article (clicked a word, asked about a paragraph, added a word), by title
// and nearest H2/H3 only. The plugin's own pages never count.

export interface ReadingTrackerPort {
  // True for the plugin's own pages (pluginNoteKind(frontmatter) !== null);
  // services can't import ui, so main.ts supplies it.
  isPluginNote(path: string): boolean;
  read(path: string): Promise<string | null>;
}

export interface ReadingSink {
  recordReading(input: { path: string; title: string; heading?: string; kind: ReadingKind }): void;
}

export class ReadingTracker {
  constructor(
    private port: ReadingTrackerPort,
    private learner: ReadingSink
  ) {}

  // `line` is the 0-based source line of the interaction (null / negative: unknown).
  async note(path: string, line: number | null, kind: ReadingKind): Promise<void> {
    try {
      if (!/\.md$/i.test(path)) return;
      if (this.port.isPluginNote(path)) return;
      const text = await this.port.read(path);
      if (text === null) return;
      const ctx = headingContext(text, line, basenameOf(path));
      this.learner.recordReading({ path, title: ctx.title, heading: ctx.heading, kind });
    } catch (e) {
      console.error("Vocab Tracker: couldn't record reading", e);
    }
  }
}

import { lemmaCandidates } from "./lemma";

export interface Wordlist {
  tag: string;
  words: string[];
  // Where the list came from, for the settings page.
  path?: string;
}

export interface WordlistInfo {
  tag: string;
  words: number;
  paths: string[];
}

const NONE: readonly string[] = [];

export interface WordMatch {
  // The list entry that matched — "analyze" for text that says "analyzed".
  base: string;
  tags: readonly string[];
}

// word → tags lookup over every loaded list. Two files with the same tag
// (e.g. exam-TOEFL.md and a frontmatter `tag: exam/TOEFL` elsewhere) merge.
export class WordlistIndex {
  private byWord = new Map<string, string[]>();
  private info = new Map<string, WordlistInfo>();
  // Lookups repeat a lot (the same "the", "data"… across every paragraph),
  // and inflection fallback tries several candidates, so remember answers.
  private memo = new Map<string, WordMatch | null>();

  constructor(lists: Wordlist[] = []) {
    for (const list of lists) {
      const info = this.info.get(list.tag) ?? { tag: list.tag, words: 0, paths: [] };
      if (list.path) info.paths.push(list.path);
      this.info.set(list.tag, info);
      for (const word of list.words) {
        const tags = this.byWord.get(word);
        if (!tags) {
          this.byWord.set(word, [list.tag]);
          info.words++;
        } else if (!tags.includes(list.tag)) {
          tags.push(list.tag);
          info.words++;
        }
      }
    }
    const order = this.tags;
    for (const tags of this.byWord.values()) tags.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  // Every tag, alphabetical — the order chips and settings rows appear in,
  // and the priority when a word belongs to several (first one's colour).
  get tags(): string[] {
    return [...this.info.keys()].sort((a, b) => a.localeCompare(b));
  }

  get lists(): WordlistInfo[] {
    return this.tags.map((t) => this.info.get(t)!);
  }

  get isEmpty(): boolean {
    return this.byWord.size === 0;
  }

  // The list entry a word as it appears in text (any case, possibly
  // inflected) belongs to, or null when it's in no list.
  match(word: string, inflections = true): WordMatch | null {
    const lower = word.toLowerCase();
    const key = inflections ? lower : `=${lower}`;
    const memo = this.memo.get(key);
    if (memo !== undefined) return memo;

    let hit: WordMatch | null = null;
    const exact = this.byWord.get(lower);
    if (exact) hit = { base: lower, tags: exact };
    else if (inflections) {
      for (const base of lemmaCandidates(lower)) {
        const tags = this.byWord.get(base);
        if (tags) {
          hit = { base, tags };
          break;
        }
      }
    }
    this.memo.set(key, hit);
    return hit;
  }

  // Just the tags; empty when the word is in no list.
  lookup(word: string, inflections = true): readonly string[] {
    return this.match(word, inflections)?.tags ?? NONE;
  }
}

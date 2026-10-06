import type { DictionaryResult } from "../../core/model/dictionary";
import type { VocabEntry } from "../../core/model/entry";
import {
  familyMembers,
  familyOrigin,
  familyScope,
  type Family,
  type FamilyGroup,
  type FamilyMember,
  type FamilyScope,
} from "../../core/model/family";
import { nowStamp } from "../../core/nowStamp";
import { TypedEmitter } from "../../core/events";
import { entryAddedMs } from "../ai/context/triviaContext";
import { familyGenerate, type FamilyDraft, type FamilyWord } from "../ai/tasks/family";
import type { LearnStore } from "./LearnStore";
import type { DictionaryLookupPort, LearnAi, LearnVocabPort } from "./ports";
import { runStructured } from "./structured";
import { WordIndex } from "./wordIndex";

// 字族 (規劃書 06 §7.2, screens W3/L5). generate() asks the AI and returns
// candidates only; nothing is stored until the learner confirms with
// save(). Ticked new words are looked up in the dictionary first and then
// added to the vocab list, marked as coming from the family.

export const FAMILY_THREAD_ID = "family";
// Words sent as context. Seeds always go in, on top of the most recent ones.
export const MAX_FAMILY_CONTEXT = 300;
// 「單字庫增加 20% 以上時」 (§7.2).
export const REGROUP_GROWTH = 1.2;

export interface FamilyCandidate {
  topic: string;
  label: string;
  // Members carry entryId when the word is already learned.
  groups: FamilyGroup[];
  seedEntryIds: string[];
}

export interface SaveOptions {
  // New words (any case) to add to the vocab list along with the families.
  addWords?: string[];
  // 重新分群: tombstone the families of the previous whole-list grouping
  // first. Families found from a word (找字族, scope "word") stay.
  replace?: boolean;
}

// A candidate grown from seed words came from 找字族; one without seeds
// from grouping the whole list.
export function candidateScope(c: Pick<FamilyCandidate, "seedEntryIds">): FamilyScope {
  return c.seedEntryIds.length ? "word" : "list";
}

export interface FamilyServiceDeps {
  ai: LearnAi;
  vocab: LearnVocabPort;
  learn: LearnStore;
  dictionary: DictionaryLookupPort;
  clock?: () => Date;
  newId?: () => string;
}

// Wave 7 Y — 自動 like 的掛鉤 (1006report.md #15)：save() 存檔成功後，AutoLike
// 訂閱這個事件，把找字族用到的 seed 字（不含被建議加入的新字——那些不是「對
// 這個字做了動作」）標成已 like。整體分群（scope "list"）沒有 seed，事件會帶
// 空陣列，AutoLike 收到空陣列什麼都不做。
export interface FamilyServiceEvents {
  "family:saved": { seedEntryIds: string[] };
}

function toWord(e: VocabEntry): FamilyWord {
  return { word: e.word, partOfSpeech: e.partOfSpeech, zh: e.definitionZh };
}

const key = (w: string) => w.trim().toLowerCase();

export class FamilyService {
  readonly events = new TypedEmitter<FamilyServiceEvents>();
  private clock: () => Date;
  private newId: () => string;
  private seq = 0;

  constructor(private deps: FamilyServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.newId = deps.newId ?? (() => `${this.clock().getTime()}-f${++this.seq}`);
  }

  ensureLoaded(): Promise<void> {
    return this.deps.learn.ensureLoaded();
  }

  families(): Family[] {
    return this.deps.learn.families();
  }

  // Families a word belongs to (word page 「字族」 section).
  familiesOf(entryId: string): Family[] {
    return this.families().filter((f) => familyMembers(f).some((m) => m.entryId === entryId));
  }

  // The families 重新分群 replaces: AI groupings of the whole list.
  private regroupable(): Family[] {
    return this.families().filter((f) => f.source === "ai" && familyScope(f) === "list");
  }

  // L5: 「有新單字，要重新分群嗎」 once the list has grown 20% since the
  // newest whole-list grouping (a 找字族 on a word page doesn't count:
  // it only looked at one word).
  needsRegroup(): boolean {
    const ai = this.regroupable().filter((f) => f.entryCountAtGenerate);
    if (!ai.length) return false;
    const newest = ai.reduce((a, b) => ((b.createdAt ?? "") > (a.createdAt ?? "") ? b : a));
    const base = newest.entryCountAtGenerate ?? 0;
    return this.deps.vocab.entries.length >= base * REGROUP_GROWTH && this.deps.vocab.entries.length > base;
  }

  stop(): void {
    this.deps.ai.cancel(FAMILY_THREAD_ID);
  }

  // Asks the AI for families (around `seedEntryIds` for W3, the whole list
  // for L5). Returns candidates; AI errors propagate (bad_output when the
  // JSON doesn't hold — carrying the prompt and the raw answer).
  async generate(opts: { seedEntryIds?: string[]; signal?: AbortSignal } = {}): Promise<FamilyCandidate[]> {
    await this.ensureLoaded();
    const entries = this.deps.vocab.entries;
    const seedIds = new Set(opts.seedEntryIds ?? []);
    // 整體分群 (無 seed, scope "list") 只用 like 的字 (1006report.md #24)：
    // 不然考試字表匯進來的幾百個還沒學的字會被硬湊成「家族」。找字族
    // (有 seed) 本身就是對那個字的動作，seed 字不管有沒有 like 都要找——點
    // 下去找字族這個動作本身就會讓它自動 like (#15)。
    const pool = seedIds.size ? entries : entries.filter((e) => e.liked === true);
    const seeds = pool.filter((e) => seedIds.has(e.id));
    const recent = pool
      .filter((e) => !seedIds.has(e.id))
      .sort((a, b) => entryAddedMs(b) - entryAddedMs(a))
      .slice(0, Math.max(0, MAX_FAMILY_CONTEXT - seeds.length));
    const { value: drafts } = await runStructured(
      this.deps.ai,
      familyGenerate,
      {
        known: [...seeds, ...recent].map(toWord),
        seeds: seeds.map(toWord),
        existingTopics: seeds.length ? this.families().map((f) => f.topic) : [],
      },
      { threadId: FAMILY_THREAD_ID, signal: opts.signal }
    );
    // Member → entry resolution still searches every entry (liked or not):
    // a family can surface an already-tracked but unliked word as a known
    // member without that changing anything about #24's grouping pool.
    const index = new WordIndex(entries);
    return drafts.map((d) => this.candidate(d, index, seeds.map((e) => e.id)));
  }

  private candidate(d: FamilyDraft, index: WordIndex, seedEntryIds: string[]): FamilyCandidate {
    return {
      topic: d.topic,
      label: d.label,
      seedEntryIds,
      groups: d.groups.map((g) => ({ label: g.label, members: g.members.map((m) => this.member(m.word, m.zh, index)) })),
    };
  }

  private member(word: string, zh: string, index: WordIndex): FamilyMember {
    const e = index.find(word);
    return e ? { entryId: e.id, word, zh } : { word, zh };
  }

  // Suggested words across the candidates (「把 3 個字加入單字庫」), once each.
  newWords(candidates: FamilyCandidate[]): FamilyMember[] {
    const seen = new Set<string>();
    const out: FamilyMember[] = [];
    for (const c of candidates) {
      for (const m of c.groups.flatMap((g) => g.members)) {
        if (m.entryId || seen.has(key(m.word))) continue;
        seen.add(key(m.word));
        out.push(m);
      }
    }
    return out;
  }

  // Stores the confirmed candidates (只存字族 / 存字族並加字). A candidate
  // whose topic already exists is merged into that family instead of
  // duplicating it.
  async save(candidates: FamilyCandidate[], opts: SaveOptions = {}): Promise<{ families: Family[]; added: VocabEntry[] }> {
    await this.ensureLoaded();
    // 重新分群: a family whose topic comes back keeps its id (and 加入日期)
    // with the new groups, so what points at it — a word's origin
    // `family:<id>` (「來源：字族樹 …」), an open tree — still finds it.
    // The rest of the old grouping is tombstoned.
    const renewed = new Set<string>();
    if (opts.replace) {
      const topics = new Set(candidates.map((c) => key(c.topic)));
      for (const f of this.regroupable()) {
        if (topics.has(key(f.topic))) renewed.add(f.id);
        else this.deps.learn.deleteFamily(f.id, "regroup");
      }
    }
    const count = this.deps.vocab.entries.length;
    const families = candidates.map((c) => this.toFamily(c, count, renewed));

    const wanted = new Set((opts.addWords ?? []).map(key));
    const toAdd = new Map<string, { word: string; zh: string; familyId: string }>();
    for (const f of families) {
      for (const m of familyMembers(f)) {
        if (!m.entryId && wanted.has(key(m.word)) && !toAdd.has(key(m.word))) {
          toAdd.set(key(m.word), { word: m.word, zh: m.zh, familyId: f.id });
        }
      }
    }
    const added = await this.addWords([...toAdd.values()]);

    const index = new WordIndex(this.deps.vocab.entries);
    for (const f of families) {
      this.link(f, index);
      this.deps.learn.putFamily(f);
    }
    // 只有「找字族」(scope "word") 帶種子字；重新分群 (scope "list") 的
    // candidate 沒有 seedEntryIds，不會讓任何字被自動 like (1006report.md #15)。
    const seedEntryIds = [...new Set(candidates.flatMap((c) => c.seedEntryIds))];
    this.events.emit("family:saved", { seedEntryIds });
    return { families, added };
  }

  // L5 「點一下加入」: adds one suggested word of a saved family.
  async addSuggested(familyId: string, word: string): Promise<VocabEntry | undefined> {
    await this.ensureLoaded();
    const f = this.deps.learn.family(familyId);
    const m = f && familyMembers(f).find((x) => key(x.word) === key(word));
    if (!f || !m) return undefined;
    const index = new WordIndex(this.deps.vocab.entries);
    const existing = index.find(m.word);
    const [entry] = existing ? [existing] : await this.addWords([{ word: m.word, zh: m.zh, familyId: f.id }]);
    this.link(f, new WordIndex(this.deps.vocab.entries));
    this.deps.learn.putFamily(f);
    return entry;
  }

  remove(familyId: string): void {
    this.deps.learn.deleteFamily(familyId);
  }

  private toFamily(c: FamilyCandidate, entryCount: number, renewed: Set<string> = new Set()): Family {
    const existing = this.families().find((f) => key(f.topic) === key(c.topic));
    if (existing && renewed.has(existing.id)) {
      // Same topic in a new grouping: new content under the old id.
      renewed.delete(existing.id);
      return {
        ...existing,
        label: c.label,
        scope: candidateScope(c),
        groups: c.groups.map((g) => ({ label: g.label, members: g.members.map((m) => ({ ...m })) })),
        seedEntryIds: c.seedEntryIds,
        entryCountAtGenerate: entryCount,
      };
    }
    if (existing) return mergeFamily(existing, c);
    return {
      id: this.newId(),
      topic: c.topic,
      label: c.label,
      source: "ai",
      scope: candidateScope(c),
      groups: c.groups.map((g) => ({ label: g.label, members: g.members.map((m) => ({ ...m })) })),
      seedEntryIds: c.seedEntryIds,
      entryCountAtGenerate: entryCount,
    };
  }

  // Points members at entries (newly added words, or words learned since).
  private link(f: Family, index: WordIndex): void {
    for (const m of familyMembers(f)) {
      const e = m.entryId ? undefined : index.find(m.word);
      if (e) m.entryId = e.id;
    }
  }

  // Dictionary first, then one batch into the vocab list. A failed lookup
  // still adds the word with the AI's Chinese gloss; the startup enrich
  // pass retries words without a definition.
  private async addWords(words: { word: string; zh: string; familyId: string }[]): Promise<VocabEntry[]> {
    if (!words.length) return [];
    const now = this.clock();
    const entries: VocabEntry[] = [];
    for (const w of words) {
      let d: DictionaryResult | undefined;
      try {
        d = await this.deps.dictionary.fetchDictionary(w.word);
      } catch (e) {
        console.error(`Vocab Tracker: dictionary lookup failed for "${w.word}"`, e);
      }
      const entry: VocabEntry = {
        id: this.newId(),
        word: w.word,
        level: "",
        synonyms: d?.synonyms.join(", ") ?? "",
        antonyms: d?.antonyms.join(", ") ?? "",
        example: "",
        definition: d?.definition ?? "",
        definitionZh: d?.definitionZh || w.zh,
        phonetic: d?.phonetic ?? "",
        partOfSpeech: d?.partOfSpeech ?? "",
        grammar: "",
        source: null,
        added: nowStamp(now),
        lastReviewed: nowStamp(now),
        reviews: 0,
      };
      if (d?.audio) entry.audio = d.audio;
      entry.origin = familyOrigin(w.familyId);
      entries.push(entry);
    }
    await this.deps.vocab.addEntries(entries);
    return entries;
  }
}

// Union of an existing family and a new candidate for the same topic:
// groups by label, members by word; existing members win. Once a 找字族
// result is merged in, the family is a "word" family: 重新分群 would
// otherwise throw away what the learner found from the word page.
export function mergeFamily(f: Family, c: FamilyCandidate): Family {
  const groups = f.groups.map((g) => ({ label: g.label, members: [...g.members] }));
  for (const cg of c.groups) {
    let g = groups.find((x) => key(x.label) === key(cg.label));
    if (!g) {
      g = { label: cg.label, members: [] };
      groups.push(g);
    }
    for (const m of cg.members) if (!g.members.some((x) => key(x.word) === key(m.word))) g.members.push({ ...m });
  }
  const seeds = [...new Set([...(f.seedEntryIds ?? []), ...c.seedEntryIds])];
  const scope: FamilyScope = familyScope(f) === "word" || candidateScope(c) === "word" ? "word" : "list";
  return { ...f, groups, seedEntryIds: seeds, scope };
}

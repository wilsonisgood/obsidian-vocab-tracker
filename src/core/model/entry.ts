import type { FamilyOrigin } from "./family";
import type { SrsCard } from "./srs";
import type { UsageBlock } from "./usage";
import type { PluginSettings } from "./settings";

export interface VocabSource {
  path: string;
  line: number;
}

// Common fields added in M1 (schema v2) so core/store/merge.ts can resolve
// multi-device conflicts by recency instead of "last write wins" clobbering
// the other device's edits. Optional: data read before migration, or an
// entry built by code that hasn't been switched to VocabStore's stamping
// methods yet, may not have these populated — migrate() and VocabStore
// always set real values, everything else should treat them as unknown-old.
export interface Record_ {
  createdAt?: string;
  updatedAt?: string;
  // Soft-delete marker (tombstone) instead of removing the entry, so a
  // delete on one device can be merged against an edit on another instead
  // of just disappearing or reappearing depending on write order.
  deletedAt?: string;
  rev?: number;
}

export interface VocabEntry extends Record_ {
  id: string;
  word: string;
  // Reserved for future non-English support (see 規劃書 06 §1.2); every
  // entry is "en" today.
  lang?: "en";
  // Free-form, comma-separated level/exam tags (e.g. "多益中級, 托福高級")
  // — a word can carry several at once, unlike the old single CEFR select.
  level: string;
  synonyms: string;
  antonyms: string;
  example: string;
  definition: string;
  definitionZh: string;
  phonetic: string;
  audio?: string;
  partOfSpeech: string;
  grammar: string;
  source: VocabSource | null;
  added: string;
  lastReviewed: string;
  reviews: number;
  // FSRS scheduling state. Absent on entries that have never been rated —
  // including every entry migrated before M2, since v1→v2 shipped without
  // it. services/srs treats a missing card as a brand-new one (due now)
  // rather than adding a v2→v3 migration just to backfill empty cards.
  srs?: SrsCard;
  // How the word got here. Absent = added by hand (click in reading view);
  // "wordlist" = auto-imported from an exam word list match;
  // "family:<id>" = added from a word family's suggestions (規劃書 06 §7.2).
  origin?: "wordlist" | FamilyOrigin;
  // Verb usage (L6, 規劃書 06 §7.3).
  usage?: UsageBlock;
  // Wave 7 F — 單字的「like」狀態（1006report.md 定案規格 #13-#15, #23）。
  // true/false = 已回填過的真實狀態；undefined = 尚未回填（schema 升級前的
  // 舊資料，或還沒跑過一次性遷移）。呼叫端不應把 undefined 當成「未 like」
  // 直接拿來篩選——core/model/like.ts 的 isListed() 只看 liked === true，
  // 所以在遷移跑完之前 undefined 的字一律不算「已 like」地被列出，但仍可能
  // 靠亮著的考試標籤被列出。VocabStore.backfillLiked() 負責把 undefined
  // 一次性填成確定值，填法見 core/model/like.ts 的 initialLiked()。
  liked?: boolean;
}

export interface VocabData {
  schemaVersion?: 2;
  settings?: PluginSettings;
  entries: VocabEntry[];
}

import type { Record_ } from "../../core/model/entry";
import { familyScope, type Family } from "../../core/model/family";
import { normalizeForm, type Morpheme } from "../../core/model/morpheme";
import type { TriviaItem } from "../../core/model/trivia";
import type { VerbFavorite } from "../../core/model/usage";
import type { WordMeta } from "../../core/model/wordMeta";

// Multi-device merge for store/learn.json (規劃書 06 §4.3): records are
// unioned by id; the same id keeps the copy with the newer updatedAt, and
// on a tie the higher rev (then the local copy). A tombstone (deletedAt) is
// a record like any other, so a delete and a concurrent edit resolve by
// whichever happened later. Pure, so it's unit-tested without storage.

export interface LearnShard {
  families: Family[];
  trivia: TriviaItem[];
  // Saved verb usages (動詞用法收藏). Absent in files written before it
  // existed (normalizeLearnShard fills it in).
  verbs?: VerbFavorite[];
  // Word DNA (規劃書 09 §2 決定 1). Absent in files written before it
  // existed (normalizeLearnShard fills it in).
  morphemes?: Morpheme[];
  wordMeta?: WordMeta[];
}

type Rec = Record_ & { id: string };

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function ms(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function pickNewer<T extends Rec>(local: T, remote: T): T {
  const l = ms(local.updatedAt);
  const r = ms(remote.updatedAt);
  if (l !== r) return r > l ? remote : local;
  return (remote.rev ?? 0) > (local.rev ?? 0) ? remote : local;
}

export function mergeRecords<T extends Rec>(
  local: readonly T[],
  remote: readonly T[],
  pick: (local: T, remote: T) => T = pickNewer
): T[] {
  const byId = new Map<string, T>();
  const order: string[] = [];
  for (const rec of local) {
    if (!byId.has(rec.id)) order.push(rec.id);
    byId.set(rec.id, rec);
  }
  for (const rec of remote) {
    const mine = byId.get(rec.id);
    if (!mine) order.push(rec.id);
    byId.set(rec.id, mine ? pick(mine, rec) : rec);
  }
  return order.map((id) => byId.get(id) as T);
}

// Newer copy wins, with one exception: 重新分群 on one device only deletes
// families it sees as whole-list groupings. If another device meanwhile
// turned that family into a "word" family (a 找字族 result merged into
// it), the regroup's tombstone loses to the live copy even when it's
// newer — the regroup never meant to remove a word-page family.
export function pickFamily(local: Family, remote: Family): Family {
  const winner = pickNewer(local, remote);
  const other = winner === local ? remote : local;
  if (winner.deletedAt && winner.deletedBy === "regroup" && !other.deletedAt && familyScope(other) === "word") {
    return other;
  }
  return winner;
}

// Tombstones are purged 30 days after the delete — by then every device
// has had the chance to sync the deletedAt (same window as entries).
export function dropOldTombstones<T extends Rec>(records: readonly T[], now: number): T[] {
  return records.filter((r) => !r.deletedAt || now - ms(r.deletedAt) < TOMBSTONE_TTL_MS);
}

export function emptyLearnShard(): LearnShard {
  return { families: [], trivia: [], verbs: [], morphemes: [], wordMeta: [] };
}

// A half-synced or hand-edited file may be missing either array.
export function normalizeLearnShard(raw: unknown): LearnShard {
  const s = (raw ?? {}) as Partial<LearnShard>;
  return {
    families: Array.isArray(s.families) ? s.families : [],
    trivia: Array.isArray(s.trivia) ? s.trivia : [],
    verbs: Array.isArray(s.verbs) ? s.verbs : [],
    morphemes: Array.isArray(s.morphemes) ? s.morphemes : [],
    wordMeta: Array.isArray(s.wordMeta) ? s.wordMeta : [],
  };
}

// What a merge can change: which families / trivia / morphemes / wordMeta
// exist and their versions — not array order. LearnStore.reload() writes
// the union back only when this differs from the synced copy, so devices
// that agree never ping-pong.
export function learnFingerprint(shard: LearnShard): string {
  const recs = (kind: string, list: readonly Rec[]) =>
    list.map((r) => `${kind}|${r.id}|${r.updatedAt ?? ""}|${r.rev ?? 0}|${r.deletedAt ?? ""}`);
  return [
    ...recs("f", shard.families),
    ...recs("t", shard.trivia),
    ...recs("v", shard.verbs ?? []),
    ...recs("m", shard.morphemes ?? []),
    ...recs("w", shard.wordMeta ?? []),
  ]
    .sort()
    .join("\n");
}

// 決定 3 (09 §2): a verified morpheme beats an unverified one unconditionally
// — a confirmed fact shouldn't lose to a newer but still-unverified guess.
// Only kicks in when exactly one side is verified and that side isn't
// itself a tombstone (a delete should still be able to win normally).
export function pickMorpheme(local: Morpheme, remote: Morpheme): Morpheme {
  const lv = !!local.verified;
  const rv = !!remote.verified;
  if (lv !== rv) {
    const verifiedSide = lv ? local : remote;
    if (!verifiedSide.deletedAt) return verifiedSide;
  }
  return pickNewer(local, remote);
}

// Groups live (not deleted, not already redirected) morphemes that two
// devices independently coined for the same type+spelling — matched the
// same way matchMorpheme() looks one up, via normalizeForm(form) equality
// or a variants overlap — and keeps one canonical record per group,
// marking the rest `mergedInto` (resolveMorphemeId() follows the redirect).
// Grouping is computed as connected components over that pairwise match
// relation, so it comes out the same regardless of which device's array
// order it's run on. Canonical pick: verified first, then earliest
// createdAt, then smallest id. Pure and deterministic: never touches
// updatedAt, so running it again on an already-deduped list is a no-op.
export function dedupeMorphemes(list: readonly Morpheme[]): Morpheme[] {
  const live = list.filter((m) => !m.deletedAt && !m.mergedInto);
  const rest = list.filter((m) => m.deletedAt || m.mergedInto);
  if (live.length < 2) return list.slice();

  const keysOf = (m: Morpheme) => new Set([normalizeForm(m.form), ...m.variants.map(normalizeForm)]);
  const keys = live.map(keysOf);
  const intersects = (a: Set<string>, b: Set<string>) => {
    for (const k of a) if (b.has(k)) return true;
    return false;
  };

  // Union-find over live's indices: a connected component is the dedupe
  // group, independent of processing order.
  const parent = live.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (live[i].type === live[j].type && intersects(keys[i], keys[j])) union(i, j);
    }
  }

  const groups = new Map<number, Morpheme[]>();
  live.forEach((m, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(m);
    else groups.set(root, [m]);
  });

  const out: Morpheme[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const canonical = [...group].sort((a, b) => {
      const av = a.verified ? 0 : 1;
      const bv = b.verified ? 0 : 1;
      if (av !== bv) return av - bv;
      const ac = ms(a.createdAt);
      const bc = ms(b.createdAt);
      if (ac !== bc) return ac - bc;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0];
    const others = group.filter((m) => m !== canonical);

    const canonicalFormKey = normalizeForm(canonical.form);
    const variantKeys = new Set(canonical.variants.map(normalizeForm));
    const variants = [...canonical.variants];
    for (const o of others) {
      for (const v of [o.form, ...o.variants]) {
        const key = normalizeForm(v);
        if (key !== canonicalFormKey && !variantKeys.has(key)) {
          variantKeys.add(key);
          variants.push(v);
        }
      }
    }

    const suggestedKeys = new Set(canonical.suggested.map((s) => s.word.toLowerCase()));
    const suggested = [...canonical.suggested];
    for (const o of others) {
      for (const s of o.suggested) {
        const key = s.word.toLowerCase();
        if (!suggestedKeys.has(key)) {
          suggestedKeys.add(key);
          suggested.push(s);
        }
      }
    }

    out.push({ ...canonical, variants, suggested });
    for (const o of others) out.push({ ...o, mergedInto: canonical.id });
  }
  return [...out, ...rest];
}

// 整筆先 pickNewer；emoji 例外（決定 1）：一邊是使用者自己選的 emoji
// (emojiSource "user")、另一邊不是 → user 那邊的 emoji/emojiSource 永遠贏，
// 不論哪邊比較新。breakdown 取 generatedAt 較新的那份；一邊沒有就用有的。
export function pickWordMeta(local: WordMeta, remote: WordMeta): WordMeta {
  const out: WordMeta = { ...pickNewer(local, remote) };

  const lu = local.emojiSource === "user";
  const ru = remote.emojiSource === "user";
  if (lu !== ru) {
    const userSide = lu ? local : remote;
    out.emoji = userSide.emoji;
    out.emojiSource = userSide.emojiSource;
  }

  const lb = local.breakdown;
  const rb = remote.breakdown;
  out.breakdown = !lb ? rb : !rb ? lb : ms(lb.generatedAt) >= ms(rb.generatedAt) ? lb : rb;

  return out;
}

export function mergeLearn(local: LearnShard, remote: LearnShard): LearnShard {
  return {
    families: mergeRecords(local.families, remote.families, pickFamily),
    trivia: mergeRecords(local.trivia, remote.trivia),
    verbs: mergeRecords(local.verbs ?? [], remote.verbs ?? []),
    morphemes: dedupeMorphemes(mergeRecords(local.morphemes ?? [], remote.morphemes ?? [], pickMorpheme)),
    wordMeta: mergeRecords(local.wordMeta ?? [], remote.wordMeta ?? [], pickWordMeta),
  };
}

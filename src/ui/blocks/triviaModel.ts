import type { Turn } from "../../core/model/thread";
import type { TriviaItem } from "../../core/model/trivia";
import { TRIVIA_TASK_BY_KIND, triviaFollowup, type TriviaKind } from "../../services/ai/tasks/trivia";
import { parseBlockParams } from "./params";

// View-models for the vocab-trivia block (規劃書 06 §7.4, §9.3, screens L7 /
// M4). Pure — no "obsidian" import — so it's unit-tested.

export interface TriviaParams {
  // Talk about this word (word page): quick actions keep it as the subject
  // and only its favorites are listed.
  word?: string;
  // `favorites: off` hides the 「收藏的冷知識」 list.
  favorites: boolean;
}

const OFF = new Set(["off", "false", "no", "0", "hide", "關", "否"]);

export function parseTriviaParams(source: string): TriviaParams {
  const p = parseBlockParams(source);
  const out: TriviaParams = { favorites: !OFF.has((p.favorites ?? "").trim().toLowerCase()) };
  const word = (p.word ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (word) out.word = word;
  return out;
}

const KIND_BY_TASK: ReadonlyMap<string, TriviaKind> = new Map(
  (Object.entries(TRIVIA_TASK_BY_KIND) as [TriviaKind, { id: string }][]).map(([kind, task]) => [task.id, kind])
);

export function triviaKindOf(taskId: string | undefined): TriviaKind | undefined {
  return taskId ? KIND_BY_TASK.get(taskId) : undefined;
}

// What ChatPanel's send() turns into on the TriviaService.
export type TriviaCall =
  | { type: "ask"; kind: TriviaKind; entryId?: string }
  | { type: "followup"; question: string; selection?: string };

// A quick action (再來一則 / 考我一題 / 字源 / 笑話) → ask(kind); the composer →
// followup. `pinnedEntryId` (word mode) keeps every round on that word;
// otherwise 再來一則 leaves the pick to the service (§7.4: recent words
// first, never one of the last 30 subjects).
export function triviaCall(
  req: { taskId: string; question?: string; selection?: string },
  pinnedEntryId?: string
): TriviaCall | null {
  const kind = triviaKindOf(req.taskId);
  if (kind) return pinnedEntryId ? { type: "ask", kind, entryId: pinnedEntryId } : { type: "ask", kind };
  const question = req.question?.trim();
  if (req.taskId !== triviaFollowup.id || !question) return null;
  return req.selection ? { type: "followup", question, selection: req.selection } : { type: "followup", question };
}

// ── Turn actions: 👍 👎 and 收藏 (L7) ────────────────────────────

export type TriviaActionKind = "up" | "down" | "favorite" | "unfavorite";

export interface TriviaActionSpec {
  kind: TriviaActionKind;
  // learnText key + params, resolved by the block.
  label: "learn.trivia.up" | "learn.trivia.down" | "learn.trivia.favorite" | "learn.trivia.favoriteTo" | "learn.trivia.favorited";
  params?: Record<string, string>;
  icon: string;
  active: boolean;
  // Icon-only buttons (👍 👎); the label is the tooltip.
  iconOnly: boolean;
}

export interface TriviaActionContext {
  // The answer's subject word, if it's still in the vocab list.
  subjectWord?: string;
  // The favorite saved from this turn, if any.
  favorite?: Pick<TriviaItem, "id">;
  // Whether feedback can be stored (ThreadService.setFeedback exists).
  feedback: boolean;
}

// Only finished answers get actions (ChatPanel already filters to "done").
// A new round says 「收藏到 apron」, a follow-up just 「收藏」 (design L7).
export function triviaTurnActions(turn: Turn, ctx: TriviaActionContext): TriviaActionSpec[] {
  if (turn.role !== "assistant" || turn.status !== "done" || !turn.content.trim()) return [];
  const out: TriviaActionSpec[] = [];
  if (ctx.feedback) {
    out.push({ kind: "up", label: "learn.trivia.up", icon: "thumbs-up", active: turn.feedback === "up", iconOnly: true });
    out.push({ kind: "down", label: "learn.trivia.down", icon: "thumbs-down", active: turn.feedback === "down", iconOnly: true });
  }
  if (ctx.favorite) {
    out.push({ kind: "unfavorite", label: "learn.trivia.favorited", icon: "bookmark-check", active: true, iconOnly: false });
  } else if (ctx.subjectWord) {
    const round = !!triviaKindOf(turn.taskId);
    out.push(
      round
        ? { kind: "favorite", label: "learn.trivia.favoriteTo", params: { word: ctx.subjectWord }, icon: "bookmark", active: false, iconOnly: false }
        : { kind: "favorite", label: "learn.trivia.favorite", icon: "bookmark", active: false, iconOnly: false }
    );
  }
  return out;
}

// Clicking the active thumb clears it.
export function nextFeedback(current: Turn["feedback"], clicked: "up" | "down"): Turn["feedback"] {
  return current === clicked ? undefined : clicked;
}

// Header over an answer: 「冷知識 · apron」, 「考我一題 · apron」. Follow-ups
// have none.
export function triviaTurnHeader(
  turn: Turn,
  subjectWord: string | undefined,
  labelOf: (kind: TriviaKind) => string
): string | undefined {
  if (turn.role !== "assistant" || !subjectWord) return undefined;
  const kind = triviaKindOf(turn.taskId);
  return kind ? `${labelOf(kind)} · ${subjectWord}` : undefined;
}

// ── 收藏的冷知識 ─────────────────────────────────────────────────

export interface FavoriteView {
  id: string;
  // 「apron · a napron → an apron」
  heading: string;
  body: string;
  date?: string;
  // Other learned words the text brings up.
  mentions: string[];
}

export function favoriteViews(
  items: readonly TriviaItem[],
  wordOf: (entryId: string) => string | undefined,
  dateOf: (iso: string | undefined) => string | undefined
): FavoriteView[] {
  return items.map((it) => {
    const word = wordOf(it.entryId);
    return {
      id: it.id,
      heading: word ? `${word} · ${it.title}` : it.title,
      body: it.body,
      date: dateOf(it.createdAt),
      mentions: it.mentions.map(wordOf).filter((w): w is string => !!w),
    };
  });
}

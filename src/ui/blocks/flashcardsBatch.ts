import type { CardMode, Rating } from "../../core/model/srs";

// "本批單字" list for the vocab-flashcards block: which words are in the
// current review session and how each one went. Pure so the answer-hiding
// rules can be unit-tested per mode without a DOM.

export type BatchStatus = "rated" | "current" | "pending";

export interface BatchWord {
  word: string;
  // Short meaning shown next to the word (definitionZh, else definition).
  zh: string;
}

export interface BatchState {
  mode: CardMode;
  // Session card ids in order (the snapshot taken at session start).
  session: readonly string[];
  // Ratings given so far, in order; a later rating of the same id wins.
  results: readonly { id: string; rating: Rating }[];
  // Index of the card on screen; ignored unless `phase` is "card".
  index: number;
  flipped: boolean;
  phase: "card" | "done";
  // Ids that were new cards when the session started — rating a card
  // changes its state, so this can't be re-derived from the live entry.
  newIds: ReadonlySet<string>;
}

export interface BatchRow {
  id: string;
  status: BatchStatus;
  isNew: boolean;
  rating?: Rating;
  // null = hidden because showing it would give away the card's answer.
  word: string | null;
  zh: string | null;
}

// What a card asks for in each mode — the part that must stay hidden
// until the card has been answered:
//   en-zh  shows the word, asks for the meaning   → hide zh
//   zh-en  shows the meaning, asks for the word   → hide word
//   cloze  shows a blanked sentence + zh hint     → hide word
//   listen plays audio, asks for the spelling     → hide both (the meaning
//          would narrow the spelling down to one word)
export function hiddenFields(mode: CardMode): { word: boolean; zh: boolean } {
  switch (mode) {
    case "en-zh":
      return { word: false, zh: true };
    case "zh-en":
    case "cloze":
      return { word: true, zh: false };
    case "listen":
      return { word: true, zh: true };
  }
}

// First line of the meaning, so a multi-line definition stays one row.
export function briefMeaning(text: string | undefined): string {
  return (text ?? "").split(/\r?\n/)[0].trim();
}

// One row per session card still in the store (`lookup` returns undefined
// for deleted words, which are skipped). A card counts as revealed once
// it's rated, or while it's the current card and already flipped.
export function buildBatchRows(
  state: BatchState,
  lookup: (id: string) => BatchWord | undefined
): BatchRow[] {
  const ratings = new Map<string, Rating>();
  for (const r of state.results) ratings.set(r.id, r.rating);
  const hide = hiddenFields(state.mode);

  const rows: BatchRow[] = [];
  state.session.forEach((id, i) => {
    const w = lookup(id);
    if (!w) return;
    const rating = ratings.get(id);
    const isCurrent = state.phase === "card" && i === state.index;
    const status: BatchStatus =
      rating !== undefined ? "rated" : isCurrent ? "current" : "pending";
    const revealed = status === "rated" || (status === "current" && state.flipped);
    const zh = briefMeaning(w.zh);
    rows.push({
      id,
      status,
      isNew: state.newIds.has(id),
      ...(rating !== undefined ? { rating } : {}),
      word: revealed || !hide.word ? w.word : null,
      zh: revealed || !hide.zh ? zh || null : null,
    });
  });
  return rows;
}

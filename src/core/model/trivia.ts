import type { Record_ } from "./entry";

// A saved (收藏) trivia answer (規劃書 06 §4.1, §7.4). Persisted in
// store/learn.json, owned by services/learn/LearnStore. The conversation
// itself lives in the single `trivia-session` thread (threads.json).

export interface TriviaItem extends Record_ {
  id: string;
  // The word the trivia is about (掛在主角字).
  entryId: string;
  // Other learned words the text mentions — the word pages show a
  // back-link for each (反向連結).
  mentions: string[];
  title: string;
  body: string;
  // The assistant turn in the trivia thread it was saved from.
  fromTurnId?: string;
}

// The one global trivia conversation (Anchor kind "trivia-session"). A
// fixed id so two devices that each start chatting end up with one thread.
export const TRIVIA_THREAD_ID = "trivia-session";

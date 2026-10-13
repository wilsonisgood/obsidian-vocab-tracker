// 情境播放器的介面 (第十六波 P／G, 規劃書 12 §1.2). One player for every
// practice track: it shows a continuing scene — answered lines stay above
// with the answer filled in — and asks one tap-only question at a time
// (1013-2: no typing, skip and 👎 on every question). The track (grammar,
// 常用字, …) turns its own questions into PlayerQuestion and decides what
// answering / skipping / retiring does to its pool, mistakes and events.

// choice: `text` has one "____"; find-error: `text` is the whole sentence and
// the options are fragments of it (tap the wrong one); which-sense /
// same-sense: `text` marks the target word as [[word]]; pick-word: like
// choice, the options are English words.
export type PlayerKind = "choice" | "find-error" | "which-sense" | "pick-word" | "same-sense";

export interface PlayerLine {
  speaker?: string;
  text: string;
}

export interface PlayerQuestion {
  // Stable across refreshes (the track's question id).
  id: string;
  // Questions of one scene share it; a new scene id starts a new block of
  // history with its `scene` heading.
  scenarioId?: string;
  scene?: string;
  // Non-question lines shown before this question (串場句).
  lead?: PlayerLine[];
  speaker?: string;
  kind: PlayerKind;
  text: string;
  options: { id: string; text: string }[];
  answerId: string;
  // After answering (60 字以內), notes per wrong option id, and the whole
  // line in Chinese with the answer put back.
  explanation: string;
  optionNotes?: Record<string, string>;
  sentenceZh?: string;
  // The line as it reads once answered (blank filled / fragment fixed),
  // shown in the history. Defaults to `text` with the answer put in.
  answered?: string;
  // 💡 提示 (常用字): shown on request, per option id. Absent = no 💡 button.
  hints?: Record<string, string>;
  // Small label over the question, e.g. 「文法 · 現在完成式」.
  tag?: string;
}

export interface PlayerAnswer {
  question: PlayerQuestion;
  optionId: string;
  correct: boolean;
  // The learner opened 💡 before answering.
  hinted: boolean;
}

export interface PlayerCallbacks {
  // Called once per question when an option is tapped (feedback shows
  // right after, before 「下一題」).
  onAnswer(a: PlayerAnswer): void;
  onSkip(q: PlayerQuestion): void;
  onRetire(q: PlayerQuestion): void;
  // The player reached the end of what questions() returned.
  onEmpty?(): void;
}

export interface PlayerOptions {
  // The questions still to answer, in order; read again on refresh().
  questions(): readonly PlayerQuestion[];
  callbacks: PlayerCallbacks;
  // Shown when questions() is empty: e.g. 「題目準備中…」 or 「AI 沒開…」.
  emptyText?(): string;
  // A button under the empty text (「開始出題」); null = none right now.
  emptyAction?(): { label: string; run(): void } | null;
}

export interface PlayerHandle {
  // Re-read questions() (new ones were added); the question on screen stays.
  refresh(): void;
  unload(): void;
}

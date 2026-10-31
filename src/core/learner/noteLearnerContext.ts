import type { VocabEntry } from "../model/entry";
import { SrsState } from "../model/srs";
import { liveTurns, type Thread } from "../model/thread";
import { trailingBlockId } from "../text/blockId";
import { paragraphHash } from "../text/hash";
import { splitParagraphSpans } from "../text/paragraphs";

// 〔學習狀況〕 for the whole-note quiz (1030 #4 「複習這篇筆記」的 AI 討論):
// what the learner already did with this note — its saved words and how
// well they're known, what they asked the AI about each word, and which
// paragraphs they discussed and asked what — so the AI's questions aim
// where they struggled. Only what was asked, not the AI's answers. Pure.

const MAX_WORDS = 30;
const MAX_QUESTION = 40;
const MATURE_STABILITY_DAYS = 21;

const TASK_NAMES: Record<string, string> = {
  "paragraph.translate": "翻譯",
  "paragraph.grammar": "文法",
  "paragraph.vocab": "生字",
  "paragraph.paraphrase": "換句話說",
  "word.usage": "用法",
  "word.compare": "比較",
  "word.sentence": "造句",
  "word.mnemonic": "記憶法",
};

// What the learner asked in one thread: quick actions by name, typed
// questions quoted; each once.
function asksOf(th: Thread | undefined): string[] {
  const asks: string[] = [];
  if (!th || th.deletedAt) return asks;
  for (const turn of liveTurns(th)) {
    if (turn.role !== "user") continue;
    const q = turn.question?.trim();
    const name = TASK_NAMES[turn.taskId ?? ""];
    const ask = q ? `提問「${clip(q)}」` : name;
    if (ask && !asks.includes(ask)) asks.push(ask);
  }
  return asks;
}

export function wordStatus(e: Pick<VocabEntry, "srs">, now: Date): string {
  const s = e.srs;
  if (!s || s.state === SrsState.New) return "新";
  if (Date.parse(s.due) <= now.getTime()) return "到期";
  return s.state === SrsState.Review && s.stability >= MATURE_STABILITY_DAYS ? "熟" : "學習中";
}

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > MAX_QUESTION ? `${one.slice(0, MAX_QUESTION - 1)}…` : one;
}

// 1-based ¶ number of the discussed paragraph (block id, then text hash),
// or null when it's not in the note any more.
function paragraphNumber(content: string, anchor: Thread["anchor"]): number | null {
  if (anchor.kind !== "paragraph") return null;
  const spans = splitParagraphSpans(content);
  const i = spans.findIndex(
    (s) => (anchor.blockId && trailingBlockId(s.text) === anchor.blockId) || paragraphHash(s.text) === anchor.hash
  );
  return i < 0 ? null : i + 1;
}

export function noteLearnerContext(
  content: string,
  words: readonly (Pick<VocabEntry, "word" | "srs" | "deletedAt"> & { thread?: Thread })[],
  paragraphThreads: readonly Thread[],
  now: Date
): string {
  const lines = ["〔學習狀況〕（學習者在這篇做過的事，出題時優先考這些地方）"];
  const live = words.filter((w) => !w.deletedAt);
  if (live.length) {
    const list = live.slice(0, MAX_WORDS).map((w) => `${w.word}（${wordStatus(w, now)}）`);
    lines.push(`- 這篇收錄的單字（${live.length}）：${list.join("、")}${live.length > MAX_WORDS ? "…" : ""}`);
  }
  const wordAsks = live.flatMap((w) => {
    const asks = asksOf(w.thread);
    return asks.length ? [`${w.word} ${asks.join("、")}`] : [];
  });
  if (wordAsks.length) lines.push(`- 問過 AI 的單字：${wordAsks.join("；")}`);
  const discussed: { n: number | null; asks: string[] }[] = [];
  for (const th of paragraphThreads) {
    const asks = asksOf(th);
    if (asks.length) discussed.push({ n: paragraphNumber(content, th.anchor), asks });
  }
  discussed.sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity));
  if (discussed.length) {
    const list = discussed.map((d) => `${d.n === null ? "（已改動的段落）" : `¶${d.n}`} ${d.asks.join("、")}`);
    lines.push(`- 討論過的段落：${list.join("；")}`);
  }
  if (lines.length === 1) lines.push("- 這篇還沒有收錄單字，也還沒討論過段落。");
  return lines.join("\n");
}

import type { DiaryKind, DiaryMaterial, DiaryPointKind } from "../../../core/diary/types";
import type { CefrLevel } from "../../../core/model/settings";
import type { AiResult } from "../providers/types";
import { composeRequest } from "./compose";
import type { AiTask, TaskContext } from "./types";

// Daily diary writer (1016 #12–#13). One call per day, no history. The
// answer has a fixed shape so parseDiaryAnswer stays simple:
//   PICK: <author> | <quote>     (quote)   /   PICK: <place>   /   PICK: -
//   <blank line>
//   2–3 paragraphs separated by blank lines

export interface DiaryTaskInput {
  kind: DiaryKind;
  level: CefrLevel | "";
  material: DiaryMaterial;
  // Normalized keys of quotes / places already used; never pick these again.
  avoid: string[];
  // Words the learner studied; bold them in the text.
  boldWords: string[];
}

export interface DiaryAnswer {
  paragraphs: string[];
  quote?: { text: string; author: string };
  place?: string;
}

export const DIARY_BASE_PROMPT = `你是一位文筆優美、溫暖的英文寫作者，替一位以中文為母語的英文學習者寫「每日日記」。

通用規則：
1. 全文用英文寫，不要附任何翻譯、不要寫標題、不要寫前言或說明。
2. 口吻是一位朋友自己的日記或寫給你的一封信：朋友自己經歷了這些事（讀了這些文章、學了這些字），分享給你。要優美、有溫度、有畫面，像真人經歷過，不要像報告或教材。用第一人稱。
3. 用字和句型要符合指定的 CEFR 程度；沒有指定時用中等程度（約 B1–B2）。
4. 全文 300 個英文字以內，分 2 到 3 段，段落之間空一行。每段至少兩三句。
5. 〔要粗體的字〕裡的字如果自然地用到，就用 **粗體** 標出（只用 ** **，不要用 == ==）。不要為了粗體硬塞。
6. 把〔素材〕自然地寫進去：文章的主題與段落標題、學到的字、文法、冷知識；不要逐項列清單。答錯的文法或字是這位朋友卡關過的地方，可以寫成「我一直搞不清楚，後來才懂」的小心得。
7. 不確定的事實不要編造。

輸出格式（嚴格遵守，第一行固定是 PICK）：
- 第一行：PICK: ...（依下面各類型的說明）
- 空一行，之後才是日記正文。
- 不要用 code fence，不要用 # 標題。`;

const KIND_PROMPTS: Record<DiaryKind, string> = {
  diary: `類型：一般日記。
第一行寫「PICK: -」。正文依〔素材〕寫這位朋友今天的閱讀與學習。`,
  quote: `類型：名人金句反思。
挑一句真實、可靠、廣為人知的名人金句（英文原文，盡量與〔素材〕的主題有關；不要挑〔不要再選〕裡的）。
第一行寫「PICK: <作者> | <金句原文>」，例如「PICK: Maya Angelou | Nothing will work unless you do.」。
正文是這位朋友對這句金句的反思，並自然地把〔素材〕寫進去。不要在正文重複整句金句。作者與金句不確定時，改挑你最有把握的一句。`,
  place: `類型：著名景點描述。
挑一個真實、著名的景點（盡量與〔素材〕的主題有關；不要挑〔不要再選〕裡的）。
第一行寫「PICK: <景點英文名稱>」，例如「PICK: Santorini」。
正文是這位朋友到訪（或神遊）那個地方的描寫，有畫面、有感官細節，並自然地把〔素材〕寫進去。不確定的細節不要編造。`,
};

const POINT_LABELS: Record<DiaryPointKind, string> = {
  "new-word": "新加的字",
  "review-word": "複習的字",
  "grammar-wrong": "文法練習（答錯）",
  "grammar-right": "文法練習（答對）",
  trivia: "冷知識",
};

export function renderDiaryMaterial(m: DiaryMaterial): string {
  const lines: string[] = [`〔素材〕日期：${m.day}`];
  if (m.articles.length) {
    lines.push("讀過的文章：");
    for (const a of m.articles) {
      lines.push(`- ${a.title}${a.headings.length ? `（段落：${a.headings.join("；")}）` : ""}`);
    }
  }
  const order: DiaryPointKind[] = ["grammar-wrong", "new-word", "review-word", "grammar-right", "trivia"];
  for (const k of order) {
    const ps = m.points.filter((p) => p.kind === k);
    if (ps.length) lines.push(`${POINT_LABELS[k]}：${ps.map((p) => p.label).join("、")}`);
  }
  if (lines.length === 1) lines.push("（今天沒有特別的素材）");
  return lines.join("\n");
}

function buildUser(input: DiaryTaskInput): string {
  const blocks = [
    KIND_PROMPTS[input.kind],
    `〔CEFR 程度〕${input.level || "未指定"}`,
    renderDiaryMaterial(input.material),
  ];
  if (input.boldWords.length) blocks.push(`〔要粗體的字〕${input.boldWords.join(", ")}`);
  if (input.kind !== "diary" && input.avoid.length) blocks.push(`〔不要再選〕\n${input.avoid.map((a) => `- ${a}`).join("\n")}`);
  return blocks.join("\n\n");
}

const FENCE_RE = /^\s*```[a-z]*\s*$/i;
const PICK_RE = /^\s*(?:\*\*)?PICK(?:\*\*)?\s*[:：]\s*(.*)$/i;

function cleanPick(s: string): string {
  return s.replace(/^[\s"“'‘*]+|[\s"”'’*]+$/g, "").trim();
}

// Tolerant of fences, stray titles/headings, extra blank lines, no PICK line.
export function parseDiaryAnswer(text: string): DiaryAnswer {
  const lines = text.split(/\r?\n/).filter((l) => !FENCE_RE.test(l));
  let pick = "";
  const bodyLines: string[] = [];
  for (const l of lines) {
    const m = PICK_RE.exec(l);
    if (m && !pick) {
      pick = m[1].trim();
      continue;
    }
    if (/^\s*#{1,6}\s/.test(l)) continue;
    bodyLines.push(l);
  }
  const paragraphs = bodyLines
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p && !/^(?:\*\*|__)[^.?!]*(?:\*\*|__)$/.test(p)); // bold-only title line
  const out: DiaryAnswer = { paragraphs };
  if (pick && pick !== "-" && pick !== "—") {
    const bar = pick.indexOf("|");
    if (bar >= 0) {
      const author = cleanPick(pick.slice(0, bar));
      const quote = cleanPick(pick.slice(bar + 1));
      if (author && quote) out.quote = { text: quote, author };
    } else {
      const place = cleanPick(pick);
      if (place) out.place = place;
    }
  }
  return out;
}

export const diaryWrite: AiTask<DiaryTaskInput, DiaryAnswer> = {
  id: "diary.write",
  version: 1,
  surface: "diary",
  tier: "smart",
  maxTokens: 4096,
  build(input: DiaryTaskInput, ctx: TaskContext) {
    return composeRequest({
      base: DIARY_BASE_PROMPT,
      profile: ctx.profile,
      history: [],
      user: buildUser(input),
      tier: "smart",
      maxTokens: 4096,
    });
  },
  parse(r: AiResult): DiaryAnswer {
    return parseDiaryAnswer(r.text);
  },
};

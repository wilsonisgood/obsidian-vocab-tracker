// What the learning buddy knows about the learner (規劃書 15 §7). Pure: the
// service hands in LearnerModel.snapshot() (structurally typed here, since
// core/** can't import services) and the newest report's Markdown.

export const BUDDY_REPORT_SECTION_MAX = 3000;
export const BUDDY_REPORT_SECTIONS = ["程度建議", "給你的建議", "詳細分析"] as const;

export interface BuddySnapshot {
  level: string;
  vocab: { total: number; learning: number; mature: number; due: number };
  grammar: { started: number; mastered: number; due: number };
  poly: { practisedSenses: number; weakSenses: number };
  weak: Array<{ focus: { kind: string; id: string }; track: string; wrong: number; commonGiven?: string }>;
}

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

// The body of the "## <name>" section (up to the next "## "), trimmed.
export function reportSection(markdown: string, name: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    const h = /^##(?!#)\s*(.*?)\s*$/.exec(line);
    if (h) {
      if (inside) break;
      inside = h[1].startsWith(name);
      continue;
    }
    if (inside) out.push(line);
  }
  return out.join("\n").trim();
}

function snapshotLines(s: BuddySnapshot): string[] {
  const out: string[] = [];
  if (s.level) out.push(`- 目前設定的程度：${s.level}`);
  if (s.vocab.total > 0) {
    out.push(`- 單字：共 ${s.vocab.total} 個，學習中 ${s.vocab.learning} 個、已熟悉 ${s.vocab.mature} 個，${s.vocab.due} 個等著複習`);
  }
  if (s.grammar.started > 0 || s.grammar.mastered > 0) {
    out.push(`- 文法：開始練了 ${s.grammar.started} 個主題，已掌握 ${s.grammar.mastered} 個，${s.grammar.due} 個等著複習`);
  }
  if (s.poly.practisedSenses > 0) {
    out.push(`- 多義字：練過 ${s.poly.practisedSenses} 個意思，其中 ${s.poly.weakSenses} 個還不太穩`);
  }
  if (s.weak.length) {
    out.push("- 最近比較卡住的地方：");
    for (const w of s.weak) {
      const given = w.commonGiven ? `，常選成「${w.commonGiven}」` : "";
      out.push(`  - ${w.focus.id}（${w.track}）：最近錯 ${w.wrong} 次${given}`);
    }
  }
  return out;
}

// "" when there is nothing to say yet.
export function buddyContext(snapshot: BuddySnapshot, latestReport?: string): string {
  const blocks: string[] = [];
  const lines = snapshotLines(snapshot);
  if (lines.length) blocks.push(`【學習紀錄摘要】\n${lines.join("\n")}`);
  if (latestReport?.trim()) {
    for (const name of BUDDY_REPORT_SECTIONS) {
      const body = reportSection(latestReport, name);
      if (body) blocks.push(`【最新學習報告：${name}】\n${clip(body, BUDDY_REPORT_SECTION_MAX)}`);
    }
  }
  return blocks.join("\n\n");
}

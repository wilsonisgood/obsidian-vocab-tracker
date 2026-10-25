// Pulls the prose sections out of a weekly report note (第二十二波 R6). Two
// layouts exist:
//   old — "## 程度建議" / "## 給你的建議" / "## 詳細分析" top-level sections
//   new — a letter under the title, then two callouts whose "#### " small
//         headings are the sections; every callout line is prefixed "> ".
// Both are read here; names are the new layout's (the old one yields
// 程度建議, 給你的建議 and 詳細分析 only).

export const PART_LETTER = "信";
export const PART_LEVEL_TABLE = "程度推估表";
export const PART_ADVICE = "程度建議";
export const PART_FOCUS = "照你的程度可以加強";
export const PART_TRY = "下週一起試試";
export const PART_READING = "適合你的閱讀";
export const PART_OLD_ADVICE = "給你的建議";
export const PART_ANALYSIS = "詳細分析";
export const ANALYSIS_NOW = "詳細分析 · 現況";
export const ANALYSIS_NEXT = "詳細分析 · 四週方向";

export type ReportParts = Record<string, string>;

const MARKER_LINE = /^[ \t]*%%[ \t]*vt:(?:begin|end)[ \t]+[a-z0-9-]+[ \t]*%%[ \t]*$/;
const CALLOUT_TITLE = /^\[!\w+\][+-]?/;

export function isCalloutLayout(text: string): boolean {
  return /^> \[!abstract\]/m.test(text);
}

function clean(lines: string[]): string {
  return lines.filter((l) => !MARKER_LINE.test(l)).join("\n").trim();
}

function oldParts(lines: string[]): ReportParts {
  const out: Record<string, string[]> = {};
  let cur: string[] | null = null;
  for (const line of lines) {
    const h = /^##(?!#)\s*(.*?)\s*$/.exec(line);
    if (h) {
      cur = [];
      out[h[1]] = cur;
      continue;
    }
    // The analyze button block closes the file; it isn't prose.
    if (/^```vocab-report-analyze/.test(line)) cur = null;
    cur?.push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, clean(v)]));
}

function newParts(lines: string[]): ReportParts {
  const out: Record<string, string[]> = {};
  const title = lines.findIndex((l) => /^# /.test(l));
  // The letter: plain text between the title and the first callout.
  if (title >= 0) {
    const letter: string[] = [];
    for (let i = title + 1; i < lines.length; i++) {
      if (lines[i].startsWith(">")) break;
      // The grey period line under the title isn't part of the letter.
      if (/^<span style="color: gray">\d{4}-\d{2}-\d{2}/.test(lines[i])) continue;
      letter.push(lines[i]);
    }
    out[PART_LETTER] = letter;
  }
  let cur: string[] | null = null;
  let head = false;
  for (const line of lines) {
    if (!line.startsWith(">")) {
      cur = null;
      head = false;
      continue;
    }
    const body = line.replace(/^>[ \t]?/, "");
    if (CALLOUT_TITLE.test(body)) {
      const isLevel = /^\[!abstract\]/.test(body);
      head = isLevel;
      cur = isLevel ? (out[PART_LEVEL_TABLE] = []) : null;
      continue;
    }
    const h = /^####(?!#)\s*(.*?)\s*$/.exec(body);
    if (h) {
      head = false;
      cur = out[h[1]] = [];
      continue;
    }
    // Before the first small heading of the level callout, only the table rows count.
    if (head) {
      if (/^\s*\|/.test(body)) cur?.push(body);
      continue;
    }
    cur?.push(body);
  }
  const parts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v));
  // Both halves of the detailed analysis under one name.
  const halves: string[] = [];
  if (parts[ANALYSIS_NOW]) halves.push(`【現況】\n${parts[ANALYSIS_NOW]}`);
  if (parts[ANALYSIS_NEXT]) halves.push(`【四週方向】\n${parts[ANALYSIS_NEXT]}`);
  if (halves.length) parts[PART_ANALYSIS] = halves.join("\n\n");
  return parts;
}

export function extractReportParts(text: string): ReportParts {
  const lines = text.split(/\r?\n/);
  return isCalloutLayout(text) ? newParts(lines) : oldParts(lines);
}

// A section by name; a heading that merely starts with it counts too.
export function reportPart(text: string, name: string): string {
  const parts = extractReportParts(text);
  if (parts[name] !== undefined) return parts[name];
  const key = Object.keys(parts).find((k) => k.startsWith(name));
  return key ? parts[key] : "";
}

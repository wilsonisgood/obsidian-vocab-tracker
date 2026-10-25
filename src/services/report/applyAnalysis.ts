import { ANALYZE_LANG, ANALYSIS_HEADING, setFrontmatterField } from "../../core/learner/reportMarkdown";
import { ANALYSIS_NEXT, ANALYSIS_NOW, isCalloutLayout } from "../../core/learner/reportSections";
import type { ReportAnalysis } from "../ai/tasks/reportAnalyze";
import { applyManagedBlocks } from "../export/managedBlock";

export const ANALYSIS_BLOCK = "analysis";
export const ANALYSIS_NOW_BLOCK = "analysis-now";
export const ANALYSIS_NEXT_BLOCK = "analysis-next";

// Writes the 詳細分析 and `analyzed: <iso>` into a report note.
// Re-analysis only swaps the managed blocks' content.
//
// New layout (callouts): one managed block at the end of each callout, every
// line prefixed "> ". Old layout: a "## 詳細分析" section right above the
// analyze button block (or at the end of the note) with one managed block.
export function applyAnalysis(text: string, analysis: string | ReportAnalysis, analyzedAt: string): string {
  const out = isCalloutLayout(text) ? applyInCallouts(text, analysis) : applyOld(text, analysis);
  return setFrontmatterField(out, "analyzed", analyzedAt);
}

function applyOld(text: string, analysis: string | ReportAnalysis): string {
  const body = typeof analysis === "string" ? analysis : [analysis.now, analysis.next && `**接下來四週可以試試的方向**\n\n${analysis.next}`].filter(Boolean).join("\n\n");
  let out = text;
  if (!/^[ \t]*%%[ \t]*vt:begin analysis[ \t]*%%/m.test(out)) {
    const slot = `${ANALYSIS_HEADING}\n\n%% vt:begin ${ANALYSIS_BLOCK} %%\n%% vt:end ${ANALYSIS_BLOCK} %%\n\n`;
    const i = out.search(new RegExp("^```" + ANALYZE_LANG, "m"));
    if (i >= 0) out = out.slice(0, i) + slot + out.slice(i);
    else out = out.replace(/\n*$/, "\n\n") + slot.replace(/\n+$/, "\n");
  }
  return applyManagedBlocks(out, [{ name: ANALYSIS_BLOCK, body }]);
}

// A heading inside a callout would split the sections the readers look up
// by their "#### " headings.
const demote = (md: string): string => md.replace(/^(#{1,4})(\s)/gm, "#####$2");
const quote = (l: string): string => (l === "" ? ">" : `> ${l}`);
const markerRe = (kind: "begin" | "end", name: string) => new RegExp(`^>[ \\t]*%%[ \\t]*vt:${kind}[ \\t]+${name}[ \\t]*%%[ \\t]*$`);

function setBlock(lines: string[], calloutStart: RegExp, heading: string, block: string, body: string): string[] {
  const start = lines.findIndex((l) => calloutStart.test(l));
  if (start < 0) return lines;
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith(">")) end++;
  const inner = body.trim() === "" ? [] : demote(body.trim()).split(/\r?\n/).map(quote);
  const begin = lines.findIndex((l, i) => i > start && i < end && markerRe("begin", block).test(l));
  const close = begin < 0 ? -1 : lines.findIndex((l, i) => i > begin && i < end && markerRe("end", block).test(l));
  if (begin >= 0 && close > begin) {
    return [...lines.slice(0, begin + 1), ...inner, ...lines.slice(close)];
  }
  const slot = [">", `> #### ${heading}`, ">", `> %% vt:begin ${block} %%`, ...inner, `> %% vt:end ${block} %%`];
  return [...lines.slice(0, end), ...slot, ...lines.slice(end)];
}

function applyInCallouts(text: string, analysis: string | ReportAnalysis): string {
  const a = typeof analysis === "string" ? { now: analysis, next: "" } : analysis;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let lines = text.split(/\r?\n/);
  lines = setBlock(lines, /^> \[!abstract\]/, ANALYSIS_NOW, ANALYSIS_NOW_BLOCK, a.now);
  lines = setBlock(lines, /^> \[!tip\]/, ANALYSIS_NEXT, ANALYSIS_NEXT_BLOCK, a.next);
  return lines.join(eol);
}

import { ANALYZE_LANG, ANALYSIS_HEADING, setFrontmatterField } from "../../core/learner/reportMarkdown";
import { applyManagedBlocks } from "../export/managedBlock";

export const ANALYSIS_BLOCK = "analysis";


// Writes the 詳細分析 section and `analyzed: <iso>` into a report note.
// Re-analysis only swaps the managed block's content. A new section goes
// right above the analyze button block (or at the end of the note).
export function applyAnalysis(text: string, analysis: string, analyzedAt: string): string {
  let out = text;
  if (!/^[ \t]*%%[ \t]*vt:begin analysis[ \t]*%%/m.test(out)) {
    const slot = `${ANALYSIS_HEADING}\n\n%% vt:begin ${ANALYSIS_BLOCK} %%\n%% vt:end ${ANALYSIS_BLOCK} %%\n\n`;
    const i = out.search(new RegExp("^```" + ANALYZE_LANG, "m"));
    if (i >= 0) out = out.slice(0, i) + slot + out.slice(i);
    else out = out.replace(/\n*$/, "\n\n") + slot.replace(/\n+$/, "\n");
  }
  out = applyManagedBlocks(out, [{ name: ANALYSIS_BLOCK, body: analysis }]);
  return setFrontmatterField(out, "analyzed", analyzedAt);
}


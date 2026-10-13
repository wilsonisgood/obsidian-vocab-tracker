import { describe, expect, it } from "vitest";
import { isTargetForm } from "../../../../src/services/ai/tasks/sentenceCheck";

// Every past / participle form of the 常用字 verbs must count as the target.
const FORMS: Record<string, string[]> = {
  get: ["got", "gotten"],
  take: ["took", "taken"],
  make: ["made"],
  have: ["had", "has"],
  do: ["did", "done", "does"],
  go: ["went", "gone", "goes"],
  come: ["came"],
  give: ["gave", "given"],
  run: ["ran"],
  keep: ["kept"],
  break: ["broke", "broken"],
  hold: ["held"],
  bring: ["brought"],
  catch: ["caught"],
  stand: ["stood"],
  draw: ["drew", "drawn"],
  see: ["saw", "seen"],
  fall: ["fell", "fallen"],
  find: ["found"],
  feel: ["felt"],
};

describe("isTargetForm — irregular verbs of the poly list", () => {
  for (const [base, forms] of Object.entries(FORMS)) {
    it(base, () => {
      for (const f of forms) expect(isTargetForm(f, base), `${f} → ${base}`).toBe(true);
    });
  }
});

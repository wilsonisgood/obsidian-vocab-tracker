import { describe, expect, it } from "vitest";
import { defaultLearnerProfile } from "../../../../src/core/model/settings";
import { diaryWrite, parseDiaryAnswer, type DiaryTaskInput } from "../../../../src/services/ai/tasks/diary";

const INPUT: DiaryTaskInput = {
  kind: "quote",
  level: "B1",
  material: {
    day: "2026-10-15",
    articles: [{ path: "Coral Reefs.md", title: "Coral Reefs", headings: ["Bleaching"] }],
    points: [
      { kind: "new-word", label: "ephemeral", day: "2026-10-15" },
      { kind: "grammar-wrong", label: "present perfect", day: "2026-10-15" },
    ],
  },
  avoid: ["maya angelou|nothing will work unless you do"],
  boldWords: ["ephemeral"],
};

describe("diary.write build", () => {
  it("is a smart-tier diary task", () => {
    expect(diaryWrite.id).toBe("diary.write");
    expect(diaryWrite.surface).toBe("diary");
    const req = diaryWrite.build(INPUT, { profile: defaultLearnerProfile(), history: [] });
    expect(req.tier).toBe("smart");
    const user = req.messages.at(-1)?.content ?? "";
    expect(user).toContain("Coral Reefs");
    expect(user).toContain("Bleaching");
    expect(user).toContain("B1");
    expect(user).toContain("ephemeral");
    expect(user).toContain("maya angelou|nothing will work unless you do");
    expect(user).toContain("PICK: <作者> | <金句原文>");
  });
  it("diary kind omits the avoid list", () => {
    const req = diaryWrite.build({ ...INPUT, kind: "diary" }, { profile: defaultLearnerProfile(), history: [] });
    expect(req.messages.at(-1)?.content).not.toContain("不要再選");
  });
});

describe("parseDiaryAnswer", () => {
  it("quote", () => {
    const a = parseDiaryAnswer('PICK: Maya Angelou | "Nothing will work unless you do."\n\nFirst para.\n\nSecond para.');
    expect(a.quote).toEqual({ author: "Maya Angelou", text: "Nothing will work unless you do." });
    expect(a.paragraphs).toEqual(["First para.", "Second para."]);
  });
  it("place", () => {
    const a = parseDiaryAnswer("PICK: Santorini\n\nBlue domes.");
    expect(a.place).toBe("Santorini");
    expect(a.quote).toBeUndefined();
  });
  it("diary dash", () => {
    const a = parseDiaryAnswer("PICK: -\n\nOne.");
    expect(a).toEqual({ paragraphs: ["One."] });
  });
  it("tolerates fences, titles, extra blank lines, wrapped lines", () => {
    const a = parseDiaryAnswer("```markdown\n\n**PICK:** Santorini\n\n\n# A Title\n\n**Blue Days**\n\nLine one\nline two.\n\n\n\nLast.\n```\n");
    expect(a.place).toBe("Santorini");
    expect(a.paragraphs).toEqual(["Line one line two.", "Last."]);
  });
  it("no PICK line: everything is body", () => {
    expect(parseDiaryAnswer("Just text.\n\nMore.")).toEqual({ paragraphs: ["Just text.", "More."] });
  });
  it("malformed quote pick yields no quote", () => {
    expect(parseDiaryAnswer("PICK: Someone | \n\nBody.").quote).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { parseWordlist, tagFromBasename, tagLabel } from "../../../src/core/wordlists/parse";

describe("tagFromBasename / tagLabel", () => {
  it("turns the first dash into a nesting slash", () => {
    expect(tagFromBasename("exam-TOEFL")).toBe("exam/TOEFL");
    expect(tagFromBasename("exam-GEPT-中級")).toBe("exam/GEPT-中級");
    expect(tagFromBasename("TOEFL")).toBe("TOEFL");
    expect(tagFromBasename("-x")).toBe("-x");
  });

  it("labels a tag by its last segment", () => {
    expect(tagLabel("exam/TOEFL")).toBe("TOEFL");
    expect(tagLabel("IELTS")).toBe("IELTS");
  });
});

describe("parseWordlist", () => {
  it("reads one word per line in many common formats", () => {
    const { words } = parseWordlist(
      [
        "# TOEFL 核心字彙",
        "abandon",
        "- Abstract",
        "- [ ] accelerate",
        "4. accommodate",
        "accumulate v. 累積",
        "accurate adj. 準確的",
        "acquire /əˈkwaɪər/ 獲得",
        "adapt, 適應, v",
        "adequate\t足夠的",
        "| adjacent | 鄰近的 |",
        "|---|---|",
        "[[advocate]]",
        "**aggregate**",
        "",
        "abandon",
      ].join("\n")
    );
    expect(words).toEqual([
      "abandon", "abstract", "accelerate", "accommodate", "accumulate", "accurate",
      "acquire", "adapt", "adequate", "adjacent", "advocate", "aggregate",
    ]);
  });

  it("skips multi-word phrases and code blocks", () => {
    const { words } = parseWordlist("take off 起飛\nin spite of\n```\nignored\n```\nbenefit");
    expect(words).toEqual(["benefit"]);
  });

  it("uses frontmatter tag and doesn't read frontmatter as words", () => {
    const parsed = parseWordlist("---\ntag: \"#exam/IELTS\"\naliases: [x]\n---\nanalyse");
    expect(parsed).toEqual({ tag: "exam/IELTS", words: ["analyse"] });
  });
});

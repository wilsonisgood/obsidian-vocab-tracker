import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../../src/core/i18n";
import { en } from "../../../src/core/i18n/en";
import { joinWords, LEARN_STRINGS, lt } from "../../../src/ui/blocks/learnText";

afterEach(() => setLocale("en"));

describe("learn block strings", () => {
  it("has both languages for every key, with the same placeholders", () => {
    for (const [key, [zh, english]] of Object.entries(LEARN_STRINGS)) {
      expect(zh.trim(), key).not.toBe("");
      expect(english.trim(), key).not.toBe("");
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(zh), key).toEqual(vars(english));
    }
  });

  it("doesn't clash with keys already in the dictionaries", () => {
    for (const key of Object.keys(LEARN_STRINGS)) expect(key in en, key).toBe(false);
  });

  it("follows the active locale and fills placeholders", () => {
    setLocale("zh-TW");
    expect(lt("learn.family.saveAdd", { n: 3 })).toBe("存字族，並把 3 個字加入單字庫");
    expect(joinWords(["aprons", "kitchenware"])).toBe("aprons、kitchenware");
    setLocale("en");
    expect(lt("learn.family.saveAdd", { n: 3 })).toBe("Save, and add 3 words");
    expect(joinWords(["a", "b"])).toBe("a, b");
    expect(lt("learn.trivia.random")).toBe("Random from your {n} words");
  });
});

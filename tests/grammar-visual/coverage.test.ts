import { describe, expect, it } from "vitest";
import { GRAMMAR_TOPICS } from "../../src/core/grammar/catalog";
import { builtinVisual, layoutOf, parseVisual } from "../../src/grammar-visual";
import { draw } from "./support";

// 文法目錄的每個主題都有一份內建版面，而且電腦版、手機版都畫得出來
// （沒有退回只剩文字說明）。
describe("每個主題的內建版面", () => {
  for (const topic of GRAMMAR_TOPICS) {
    it(topic.id, () => {
      const v = builtinVisual(topic.id);
      expect(v, "沒有內建版面").not.toBeNull();
      expect(v!.kind).toBe(layoutOf(topic.id));
      expect(parseVisual(JSON.parse(JSON.stringify(v)))).toEqual(v);
      for (const mobile of [false, true]) {
        const host = draw(v!, mobile);
        const body = host.querySelector(".gv-body")!;
        const fellBack = body.children.length === 1 && body.children[0].classList.contains("gv-explain");
        expect(fellBack, mobile ? "手機版畫失敗" : "電腦版畫失敗").toBe(false);
      }
    });
  }
});

// 各版面測試共用：在假的 DOM 上畫一次，方便查文字、點按鈕。
import { installDom, type FakeElement } from "../perf/support/dom";
import { renderGrammarVisual, type Visual } from "../../src/grammar-visual";

export function draw(v: Visual, mobile = false): FakeElement {
  const doc = installDom();
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  renderGrammarVisual(host as unknown as HTMLElement, v, { mobile });
  return host;
}

// 點 root 底下第一個文字含 label 的按鈕。
export function clickButton(root: FakeElement, label: string): void {
  const b = root.querySelectorAll("button").find((x) => (x.textContent ?? "").includes(label));
  if (!b) throw new Error(`no button "${label}"`);
  b.click();
}

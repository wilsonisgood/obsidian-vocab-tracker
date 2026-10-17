import { describe, expect, it } from "vitest";
import { paragraphHash } from "../../../src/core/text/hash";
import { lostParts, restoreArticle } from "../../../src/services/anchors/restoreArticle";

// What the article looked like before it was deleted, and the plain copy
// Reading Feed writes back when it's loaded again.
const BEFORE = [
  "## 00:00 Intro",
  "",
  "Loneliness ==ravages== the body as well as the mind. %%rf:10.5%%",
  "",
  "I'm here to talk about a possible cure for loneliness. %%rf:128.86%% ^vt-aaaaaa",
  "",
  "And I think we could see loneliness as similar to boredom. %%rf:140%%",
].join("\n");
const RELOADED = BEFORE.replace(" ^vt-aaaaaa", "").replace("==ravages==", "ravages");

const anchor = (blockId: string | undefined, text: string) => ({ blockId, hash: paragraphHash(text) });

describe("restoreArticle", () => {
  it("writes a discussion's ^vt id back onto the paragraph it was made against", () => {
    const r = restoreArticle(RELOADED, [anchor("vt-aaaaaa", "I'm here to talk about a possible cure for loneliness. %%rf:128.86%%")], []);
    expect(r.rebound).toBe(1);
    expect(r.content.split("\n")[4]).toBe("I'm here to talk about a possible cure for loneliness. %%rf:128.86%% ^vt-aaaaaa");
  });

  it("highlights the article's saved words again, without doubling existing marks", () => {
    const r = restoreArticle(RELOADED, [], ["ravages", "Boredom", "absent"]);
    expect(r.highlighted).toBe(2);
    expect(r.content).toContain("Loneliness ==ravages== the body");
    expect(r.content).toContain("similar to ==boredom==.");
    expect(restoreArticle(r.content, [], ["ravages"]).content).toBe(r.content);
  });

  it("puts the note back exactly as it was before the delete", () => {
    const r = restoreArticle(
      RELOADED,
      [anchor("vt-aaaaaa", "I'm here to talk about a possible cure for loneliness. %%rf:128.86%%")],
      ["ravages"]
    );
    expect(r.content).toBe(BEFORE);
  });

  it("leaves ids that are still there, hash anchors, and paragraphs that changed alone", () => {
    expect(restoreArticle(BEFORE, [anchor("vt-aaaaaa", "whatever")], []).rebound).toBe(0);
    expect(restoreArticle(RELOADED, [anchor(undefined, "And I think we could see loneliness as similar to boredom. %%rf:140%%")], []).content).toBe(RELOADED);
    expect(restoreArticle(RELOADED, [anchor("vt-bbbbbb", "A paragraph that isn't in the note anymore.")], []).content).toBe(RELOADED);
  });

  it("doesn't put a second id on a paragraph that already has one", () => {
    const text = "I'm here to talk about a possible cure for loneliness. %%rf:128.86%%";
    const r = restoreArticle(BEFORE.replace("^vt-aaaaaa", "^vt-cccccc"), [anchor("vt-aaaaaa", text)], []);
    expect(r.rebound).toBe(0);
  });
});

describe("restoreArticle — notes loaded before Reading Feed's rf-schema 2", () => {
  // Schema 1: one paragraph per TED paragraph. Schema 2: the same text cut
  // into sentence-sized paragraphs, each with its own timestamp.
  const OLD = "I'm here to talk about a possible cure for loneliness and what it might mean. And I think we could see loneliness as similar to boredom. %%rf:120%%";
  const NEW = [
    "## 02:00 I'm here to talk about a…",
    "",
    "I'm here to talk about a possible cure for loneliness and what it might mean. %%rf:128.86%%",
    "",
    "And I think we could see loneliness as similar to boredom. %%rf:134.2%%",
  ].join("\n");

  it("anchors an old paragraph's discussion to the first paragraph it was cut into", () => {
    const r = restoreArticle(NEW, [{ blockId: "vt-aaaaaa", hash: paragraphHash(OLD), snapshot: OLD }], []);
    expect(r.rebound).toBe(1);
    expect(r.content.split("\n")[2]).toBe("I'm here to talk about a possible cure for loneliness and what it might mean. %%rf:128.86%% ^vt-aaaaaa");
  });

  it("doesn't anchor to a paragraph that merely starts the same way but is too short to tell", () => {
    const note = "Hi.\n\nSomething else entirely.";
    expect(restoreArticle(note, [{ blockId: "vt-aaaaaa", hash: "x", snapshot: "Hi. And then a lot more." }], []).rebound).toBe(0);
  });
});

describe("lostParts", () => {
  const anchors = [{ blockId: "vt-aaaaaa", hash: "h" }, { blockId: "vt-bbbbbb", hash: "h2" }];

  it("picks what was lost wholesale", () => {
    const lost = lostParts(RELOADED, anchors, ["ravages", "boredom"]);
    expect(lost.anchors).toHaveLength(2);
    expect(lost.words).toEqual(["ravages", "boredom"]);
  });

  it("leaves a note alone where some ids or highlights survive", () => {
    const lost = lostParts(BEFORE, anchors, ["ravages", "boredom"]);
    expect(lost).toEqual({ anchors: [], words: [] });
  });
});

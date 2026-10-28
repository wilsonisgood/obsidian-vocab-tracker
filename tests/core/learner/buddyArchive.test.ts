import { describe, expect, it } from "vitest";
import {
  appendBatch,
  archiveFileName,
  archiveNoteId,
  archivePath,
  batchMarker,
  buildEntries,
  conversationCallout,
  digestConversation,
  fallbackWords,
  hhmm,
  renderBatchSection,
  renderDayNote,
  turnKind,
} from "../../../src/core/learner/buddyArchive";
import { parseDigest, type Digest } from "../../../src/core/learner/buddyDigest";
import type { ArchivePair } from "../../../src/core/learner/buddyGroups";
import type { Turn } from "../../../src/core/model/thread";

const NOW = new Date(2026, 9, 28, 11, 44);
const at = (h: number, m: number) => new Date(2026, 9, 28, h, m).toISOString();
const user = (id: string, h: number, m: number, o: Partial<Turn> = {}): Turn => ({ id, role: "user", content: "", at: at(h, m), status: "done", taskId: "buddy.custom", ...o });
const ans = (id: string, content: string): Turn => ({ id, role: "assistant", content, at: "", status: "done" });
const pair = (u: Turn, a: string): ArchivePair => ({ user: u, assistant: ans(`a${u.id}`, a) });
const labelOf = (id: string) => (id === "buddy.grammar" ? "聊聊文法怎麼學" : undefined);

describe("digest parsing", () => {
  it("parses a full digest, also inside a code fence", () => {
    const d = parseDigest('```json\n{"topics":["displace","Ellis Island"],"corrections":[{"yours":"I go home","better":"I went home","why":"過去式"}],"understandings":[{"subject":"dramatic","yours":"富有張力","ok":true,"feedback":"也指明顯變化"}],"words":["displace","dramatic"]}\n```');
    expect(d).toEqual({
      topics: ["displace", "Ellis Island"],
      corrections: [{ yours: "I go home", better: "I went home", why: "過去式" }],
      understandings: [{ subject: "dramatic", yours: "富有張力", ok: true, feedback: "也指明顯變化" }],
      words: ["displace", "dramatic"],
    });
  });
  it("is forgiving about missing or odd fields; null for non-JSON", () => {
    expect(parseDigest('{"topics":"x","corrections":[{"yours":"a"},5],"words":["w","w"]}')).toEqual({ topics: [], corrections: [], understandings: [], words: ["w"] });
    expect(parseDigest("sorry")).toBeNull();
    expect(parseDigest("{bad")).toBeNull();
  });
});

describe("entries", () => {
  it("tells typed text, quick buttons and shares apart", () => {
    expect(turnKind(user("1", 1, 1, { question: "hi" }))).toBe("typed");
    expect(turnKind(user("1", 1, 1, { taskId: "buddy.grammar" }))).toBe("button");
    expect(turnKind(user("1", 1, 1, { taskId: "buddy.review", question: "my text" }))).toBe("typed");
    expect(turnKind(user("1", 1, 1, { taskId: "buddy.share" }))).toBe("share");
  });

  it("writes buttons and picks as descriptions, not as what the learner said", () => {
    const pairs = [
      pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "supplement" }), "你覺得 supplement 是？"),
      pair(user("2", 9, 6, { question: "補給品？" }), "接近！"),
      pair(user("3", 9, 7, { taskId: "buddy.share", shareSubject: "〈Ellis Island〉" }), "這段在講…"),
      pair(user("4", 9, 8, { taskId: "buddy.grammar" }), "文法怎麼學…\n〔接著聊〕a｜b｜c"),
    ];
    const e = buildEntries(pairs, undefined, labelOf);
    expect(e.map((x) => x.you)).toEqual([
      "（夥伴挑了 **supplement**）",
      "補給品？",
      "（夥伴挑了〈Ellis Island〉那段 · 略過）",
      "（點了「聊聊文法怎麼學」）",
    ]);
    expect(e.map((x) => x.skipped)).toEqual([false, false, true, false]);
    expect(e[3].answer).toBe("文法怎麼學…");
  });

  it("a pick followed by another button is skipped; the last pick looks at the next turn", () => {
    const p = [pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "attach" }), "q?")];
    expect(buildEntries(p, user("n", 9, 6, { taskId: "buddy.plan" }), labelOf)[0].skipped).toBe(true);
    expect(buildEntries(p, user("n", 9, 6, { question: "answer" }), labelOf)[0].skipped).toBe(false);
    expect(buildEntries(p, undefined, labelOf)[0].skipped).toBe(false);
    expect(buildEntries([pair(user("1", 9, 5, { taskId: "buddy.share" }), "x")], undefined, labelOf)[0].you).toBe("（夥伴邀他聊聊最近讀了什麼）");
  });

  it("the digest never sees a skipped pick's question", () => {
    const e = buildEntries(
      [pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "attach" }), "SECRET-Q")],
      user("n", 9, 6, { taskId: "buddy.plan" }),
      labelOf
    );
    expect(digestConversation(e)).not.toContain("SECRET-Q");
  });
});

describe("words", () => {
  it("falls back to picked and bold English words that are in the list", () => {
    const e = buildEntries(
      [
        pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "displace" }), "x"),
        pair(user("2", 9, 6, { question: "q" }), "**dramatic** 和 **Scathing** 還有 **中文** 與 **unknownword**"),
      ],
      undefined,
      labelOf
    );
    const saved = new Set(["displace", "dramatic", "scathing"]);
    expect(fallbackWords(e, (w) => saved.has(w.toLowerCase()))).toEqual(["displace", "dramatic", "Scathing"]);
  });
});

describe("note", () => {
  it("names a file and an id per day", () => {
    expect(archiveFileName("2026-10-28")).toBe("Buddy-2026-10-28.md");
    expect(archivePath("vocab-list/討論串/", "2026-10-28")).toBe("vocab-list/討論串/Buddy-2026-10-28.md");
    expect(archiveNoteId("2026-10-28")).toBe("buddy-day-2026-10-28");
    expect(hhmm(at(9, 5))).toBe("09:05");
  });

  const entries = buildEntries(
    [
      pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "displace" }), "你覺得呢？"),
      pair(user("2", 9, 6, { question: "我覺得是取代" }), "很接近！\n\n- 取代\n- 移走"),
    ],
    undefined,
    labelOf
  );
  const digest: Digest = {
    topics: ["displace", "聚會的英文"],
    corrections: [{ yours: "I go home", better: "I went home", why: "過去式" }],
    understandings: [{ subject: "displace", yours: "取代", ok: false, feedback: "還有移走的意思" }],
    words: ["displace"],
  };
  const link = (w: string) => (w === "displace" ? "words/displace.md" : null);

  it("the callout is collapsed, every line quoted, each turn timed", () => {
    const c = conversationCallout(entries);
    expect(c.split("\n")[0]).toBe("> [!quote]- 完整對話（2 則）");
    expect(c.split("\n").every((l) => l === ">" || l.startsWith("> "))).toBe(true);
    expect(c).toContain("> **你**（09:05）：（夥伴挑了 **displace**）");
    expect(c).toContain("> **你**（09:06）：我覺得是取代");
    expect(c).toContain("> **夥伴**：\n> \n".replace("> \n", ">\n") + "> 很接近！");
  });

  it("renders 這次的收穫 with links, and the section header", () => {
    const s = renderBatchSection({ threadId: "buddy:x", start: 8, entries, digest, words: ["displace"], now: NOW, wordLink: link });
    expect(s).toContain("## 11:44 · 第 9–10 則：displace、聚會的英文");
    expect(s).toContain("<!-- buddy-batch:buddy:x:8 -->");
    expect(s).toContain("### 這次的收穫");
    expect(s).toContain("- I go home → I went home（過去式）");
    expect(s).toContain("- [[words/displace|displace]]：取代 再想想；還有移走的意思");
    expect(s).toContain("**聊過的字**\n[[words/displace|displace]]");
  });

  it("omits empty parts; without a digest only 聊過的字; no words at all drops the heading", () => {
    const part = renderBatchSection({ threadId: "t", start: 0, entries, digest: { ...digest, corrections: [], understandings: [] }, words: ["displace"], now: NOW });
    expect(part).not.toContain("你寫的");
    expect(part).not.toContain("你的理解");
    expect(part).toContain("**聊過的字**\n**displace**");
    const none = renderBatchSection({ threadId: "t", start: 0, entries, digest: null, words: [], now: NOW });
    expect(none).toContain("## 11:44 · 第 1–2 則\n");
    expect(none).not.toContain("這次的收穫");
    const fb = renderBatchSection({ threadId: "t", start: 0, entries, digest: null, words: ["a", "b", "c", "d"], now: NOW });
    expect(fb).toContain("：a、b、c\n");
  });

  it("a new day note has frontmatter and the day title", () => {
    const md = renderDayNote("2026-10-28", ["displace"], "## sec\n", NOW);
    expect(md.startsWith('---\nvocab-tracker: ai-note\nvocab-tracker-id: "buddy-day-2026-10-28"\ndate: 2026-10-28\nwords: ["displace"]\n---\n# 學習夥伴 · 10/28\n\n## sec')).toBe(true);
  });

  it("appends a second batch in order, unions words, never twice", () => {
    const first = renderDayNote("2026-10-28", ["displace", "dramatic"], renderBatchSection({ threadId: "t", start: 0, entries, digest: null, words: ["displace"], now: NOW }), NOW);
    const sec2 = renderBatchSection({ threadId: "t", start: 8, entries, digest: null, words: ["Dramatic", "scathing"], now: new Date(2026, 9, 28, 15, 2) });
    const next = appendBatch(first, batchMarker("t", 8), sec2, ["Dramatic", "scathing"]) as string;
    expect(next.indexOf("第 1–2 則")).toBeLessThan(next.indexOf("第 9–10 則"));
    expect(next).toContain('words: ["displace","dramatic","scathing"]');
    expect(appendBatch(next, batchMarker("t", 8), sec2, [])).toBeNull();
    expect(appendBatch(next, batchMarker("t", 16), sec2, [])).not.toBeNull();
    // another day: a separate file
    expect(archivePath("f", "2026-10-29")).not.toBe(archivePath("f", "2026-10-28"));
  });
});

describe("quote in the full conversation", () => {
  const share = (src: Turn["shareSource"], o: Partial<Turn> = {}) =>
    pair(user("1", 9, 5, { taskId: "buddy.share", shareSubject: "apron", shareSource: src, ...o }), "你覺得呢？");
  it("puts the picked paragraph (word in bold) under the pick, one more quote level inside the callout", () => {
    const e = buildEntries([share({ kind: "word", word: "apron", title: "Cooking", text: "She wore an apron." })], undefined, labelOf);
    const c = conversationCallout(e);
    expect(c).toContain("> > 出自〈Cooking〉");
    expect(c).toContain("> > She wore an **apron**.");
    expect(c.indexOf("> > 出自")).toBeGreaterThan(c.indexOf("（夥伴挑了 **apron**）"));
    expect(c.indexOf("> > 出自")).toBeLessThan(c.indexOf("**夥伴**"));
  });
  it("a bare word shows word and meaning; a skipped pick shows no quote", () => {
    const bare = conversationCallout(buildEntries([share({ kind: "word", word: "apron", meaning: "圍裙" })], undefined, labelOf));
    expect(bare).toContain("> > **apron**（圍裙）");
    const skipped = conversationCallout(buildEntries([share({ kind: "word", word: "apron", meaning: "圍裙" })], user("n", 9, 6, { taskId: "buddy.plan" }), labelOf));
    expect(skipped).not.toContain("圍裙");
  });
});

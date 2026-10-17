// 1017：從 Reading Feed 刪掉文章再重新載入（同一個路徑、乾淨的原文），以前的段落
// 討論和單字標記要自動接回。AI 呼叫換成假的回應，走真的 askParagraph 流程。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endSession, startSession, type E2eSession } from "./lib/setup";

const PORT = 9351;
const NOTE = "Reading Feed/TED/2026-09-30 AI and the end of loneliness.md";
const BODY = [
  "---",
  "rf-source: ted",
  "rf-id: test_talk",
  "---",
  "",
  "## 00:00 Intro",
  "",
  "Loneliness ravages the body as well as the mind. %%rf:10.5%%",
  "",
  "I'm here to talk about a possible cure for loneliness and what it might mean. %%rf:128.86%%",
  "",
  "And I think we could see loneliness as similar to boredom. %%rf:140%%",
  "",
].join("\n");

describe("刪除文章再重新載入後，討論與單字標記自動接回", () => {
  let session: E2eSession;

  beforeAll(async () => {
    session = await startSession(PORT);
  });

  afterAll(async () => {
    await endSession(session);
  });

  it("接回 ^vt id 與 ==單字==，討論數也回來", async () => {
    const r = await session.cdp.evaluate<string>(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const t0 = Date.now();
      while (!app.plugins.plugins["vocab-tracker"]?.paragraphBadges) {
        if (Date.now() - t0 > 20000) throw new Error("plugin not ready");
        await sleep(200);
      }
      const plugin = app.plugins.plugins["vocab-tracker"];
      const path = ${JSON.stringify(NOTE)};
      await app.vault.createFolder("Reading Feed/TED").catch(() => {});
      let file = await app.vault.create(path, ${JSON.stringify(BODY)});
      await app.workspace.getLeaf(false).openFile(file);
      await sleep(500);

      // A word saved from this article, and a paragraph discussion.
      await plugin.addWordToVocab("ravages", { sentence: "Loneliness ravages the body as well as the mind." }, { reveal: false, enrich: false });
      const lines = (await app.vault.read(file)).split("\\n");
      const line = lines.findIndex((l) => l.startsWith("I'm here"));
      plugin.threads.deps.ai.complete = async () => ({
        text: "ok", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: "fake", stop: "end", transport: "fetch",
      });
      const threadId = await plugin.threads.askParagraph(
        { path, lineStart: line, lineEnd: line, text: lines[line] },
        { taskId: "paragraph.translate", question: "?" }
      );
      await sleep(300);
      const before = await app.vault.read(file);

      // Delete, then load it again the way Reading Feed does.
      await app.vault.delete(file);
      await sleep(300);
      file = await app.vault.create(path, ${JSON.stringify(BODY)});
      await sleep(1500);
      const after = await app.vault.read(file);
      const status = await plugin.threads.paragraphStatus(threadId);

      // Loaded again before restoring existed: plain text, no "create" event.
      await app.vault.modify(file, ${JSON.stringify(BODY)});
      await sleep(300);
      await plugin.restoreLostArticles();
      await sleep(300);
      const swept = await app.vault.read(file);
      return JSON.stringify({ before, after, swept, threadId, via: status?.status === "found" ? status.via : status?.status });
    })()`);
    const { before, after, swept, threadId, via } = JSON.parse(r) as { before: string; after: string; swept: string; threadId: string; via: string };
    console.log("[before]", JSON.stringify(before));
    console.log("[after]", JSON.stringify(after));
    expect(threadId).toBeTruthy();
    expect(before).toMatch(/\^vt-[a-z0-9]+/);
    expect(before).toContain("==ravages==");
    expect(after).toBe(before);
    expect(via).toBe("blockId");
    expect(swept).toBe(before);
  }, 180000);
});

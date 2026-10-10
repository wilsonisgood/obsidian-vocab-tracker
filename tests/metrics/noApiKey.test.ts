import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("../perf/support/obsidian"));

import type { VocabData, VocabEntry } from "../../src/core/model/entry";
import { t } from "../../src/core/i18n";
import { Rating } from "../../src/core/model/srs";
import { isListed, type IsListedContext } from "../../src/core/model/like";
import { likeChipOn, resolveWordlistSettings, tagEnabled } from "../../src/core/model/wordlists";
import type { VocabSidebarView } from "../../src/ui/sidebar/VocabSidebarView";
import { buildStressFixture } from "../fixtures/stress";
import { networkLog, type FakeElement } from "../perf/support/dom";
import { bootPlugin, closeSidebar, openSidebar, readNote, settle, type Booted } from "../perf/support/harness";

// 規劃書 06 §1.3「沒有 API key 時，所有非 AI 功能（單字卡、列表、單字頁閱讀）
// 完全可用」, on the real plugin with the 1,000-word / 200-thread library
// and no API key anywhere — both with AI switched on (the user enabled it
// but never entered a key) and with AI off (the default). Every non-AI
// surface is drawn and used; none may throw, log an error, or touch the
// network (fetch or requestUrl).

const fx = buildStressFixture();

function rootOf(view: VocabSidebarView): FakeElement {
  return view.containerEl.children[1] as unknown as FakeElement;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await settle(2);
}

describe.each([
  { label: "AI on, no key", enabled: true },
  { label: "AI off (default), no key", enabled: false },
])("without an API key — $label", ({ enabled }) => {
  let b: Booted;
  const errors: unknown[][] = [];
  let spy: { mockRestore(): void };

  // 1006report.md #7: the sidebar now only lists isListed words — pick
  // from those, not any live entry, so these non-AI flows still find a
  // row to click on.
  function isListedEntry(pred: (e: VocabEntry) => boolean): VocabEntry {
    const knownTags = b.plugin.wordlists.index.tags;
    const ctx: IsListedContext = {
      knownTags,
      isTagOn: (tag) => tagEnabled(resolveWordlistSettings(b.plugin.store.settings.wordlists), tag),
    likeOn: likeChipOn(resolveWordlistSettings(b.plugin.store.settings.wordlists)),
    };
    return fx.liveEntries.find((e) => isListed(e, ctx) && pred(e))!;
  }

  beforeAll(async () => {
    spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args));
    networkLog.length = 0;
    const data = fx.data() as VocabData;
    data.settings!.ai!.enabled = enabled;
    expect(data.settings!.ai!.providers.anthropic.apiKey).toBe("");
    expect(data.settings!.ai!.providers["openai-compatible"].apiKey).toBe("");
    b = await bootPlugin(fx, { data });
  });

  afterAll(async () => {
    await b?.unload();
    spy.mockRestore();
    // Unloading (the final saves) didn't either.
    expect(networkLog).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("the sidebar lists the words (both tabs) and expands a card", async () => {
    for (const filter of ["all", "note"] as const) {
      const view = await openSidebar(b, filter);
      await flush();
      expect(rootOf(view).querySelectorAll(".vt-row").length).toBeGreaterThan(0);
      closeSidebar(b, view);
    }
    const view = await openSidebar(b, "all");
    const entry = isListedEntry((e) => !!e.antonyms && !!e.source);
    // 1006-2 #10/#12: a sidebar row can only reach "half" now (顯示更多/底部
    // 收合 are gone) and only shows 英文定義／中文定義 — the rest (incl.
    // antonyms/source) moved to the word page, so this only checks those
    // two fields render without an API key, not the now-removed full set.
    view.expandState.set(entry.id, "half");
    view.render();
    await flush();
    const row = rootOf(view).querySelector(`.vt-row[data-entry-id="${entry.id}"]`)!;
    expect(row.querySelectorAll(".vt-field").length).toBe(2);
    closeSidebar(b, view);
  });

  it("the AI tab on a word card shows its hint instead of failing", async () => {
    const view = await openSidebar(b, "all");
    const entry = isListedEntry(() => true);
    view.openWord(entry.id, "ai");
    await flush();
    const row = rootOf(view).querySelector(`.vt-row[data-entry-id="${entry.id}"]`)!;
    expect(row.querySelector(".vt-chat")).not.toBeNull();
    // 「設定 AI 後才能討論」 / 「AI 目前關閉」 with a button to the settings.
    expect(row.textContent).toContain(t(enabled ? "ai.gate.noKey.title" : "ai.gate.disabled.title"));
    closeSidebar(b, view);
  });

  it("flashcards: the entry file's block draws a card and a review is saved", async () => {
    const path = await b.plugin.files.ensure("flashcards");
    const els = readNote(b, path);
    await flush();
    const block = els.find((el) => el.hasClass("block-language-vocab-card"))!;
    expect(block.textContent.length).toBeGreaterThan(0);

    await b.plugin.srs.ensureLoaded();
    const due = b.plugin.srs.queue();
    expect(due.length).toBeGreaterThan(0);
    const card = due[0];
    await b.plugin.srs.rate(card, Rating.Good, "en-zh");
    expect(b.plugin.srs.reviewLogs().some((l) => l.entryId === card.id)).toBe(true);
  });

  it("a word page reads fine: header block, section buttons, exported content", async () => {
    const entry = fx.liveEntries.find((e) => b.plugin.threads.wordThread(e.id) && e.usage)
      ?? fx.liveEntries.find((e) => b.plugin.threads.wordThread(e.id))!;
    const path = (await b.plugin.files.openWordPage(entry.id))!;
    await b.plugin.exporter.flush();
    const els = readNote(b, path);
    await flush();
    const header = els.find((el) => el.hasClass("block-language-vocab-word"))!;
    expect(header.querySelector(".vt-wh-word")?.textContent).toBe(entry.word);
    expect(els.some((el) => el.querySelector(".vt-wp-actions"))).toBe(true);
  });

  it("the 字族 / 動詞 / 冷知識 entry files show their saved content", async () => {
    const learn = fx.learnShard();
    const paths = { families: await b.plugin.files.ensure("families"), verbs: await b.plugin.files.ensure("verbs"), trivia: await b.plugin.files.ensure("trivia") };
    // 冷知識.md lists the saved items in its exported section (the block
    // itself has `favorites: off`): let the export land first.
    await b.plugin.exporter.flush();
    const families = readNote(b, paths.families);
    const verbs = readNote(b, paths.verbs);
    const trivia = readNote(b, paths.trivia);
    await flush();
    const text = (els: FakeElement[], lang: string) => els.find((el) => el.hasClass(`block-language-${lang}`))?.textContent ?? "";

    expect(text(families, "vocab-galaxy")).toContain(learn.families[0].label);
    const verb = fx.liveEntries.find((e) => e.usage)!;
    expect(text(verbs, "vocab-usage")).toContain(verb.word);
    // The trivia block draws (its AI part just says AI needs setting up)…
    expect(text(trivia, "vocab-eureka").length).toBeGreaterThan(0);
    // …and every saved item is listed under it.
    const page = trivia.map((el) => el.textContent).join("\n");
    for (const item of learn.trivia) expect(page).toContain(item.title);
  });

  it("reading view: every post-processor runs over the long article", async () => {
    const els = readNote(b, fx.article.path);
    await flush();
    expect(els.some((el) => el.querySelector(".vt-exam-word"))).toBe(true);
    expect(els.some((el) => el.querySelector(".vt-pbadge.has-count"))).toBe(true);
  });

  it("none of the above touched the network or logged an error", () => {
    expect(networkLog).toEqual([]);
    expect(errors).toEqual([]);
  });
});

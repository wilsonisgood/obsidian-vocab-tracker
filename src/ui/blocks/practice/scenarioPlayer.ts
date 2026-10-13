// Shared scenario player (第十六波 P, 規劃書 12 §1.2). Renders the state
// machine of scenarioPlayerModel.ts; the track decides what answering,
// skipping and 👎 do through PlayerOptions.callbacks.
import type { Component } from "obsidian";
import { getLocale } from "../../../core/i18n";
import { learnButton } from "../learnUi";
import type { PlayerHandle, PlayerOptions, PlayerQuestion } from "./playerTypes";
import {
  MOBILE_HISTORY_LIMIT, answerState, canHint, entrySpeakers, feedbackNote, historyEntries,
  initialState, keyAction, nextState, optionColumns, questionSegments, refreshState, retireState,
  showHint, skipState, speakerSides, statsLabel, trimHistory,
  type AnsweredPart, type PlayerState,
} from "./scenarioPlayerModel";

const L = {
  "zh-TW": {
    skip: "跳過", retire: "👎 這題有問題", hint: "💡 提示", next: "下一題",
    right: "✓ 答對了", wrong: "✗ 答錯了", answer: "正解", earlier: "顯示更早的",
    empty: "題目準備中…", you: "你選的",
  },
  en: {
    skip: "Skip", retire: "👎 Bad question", hint: "💡 Hint", next: "Next",
    right: "✓ Correct", wrong: "✗ Not quite", answer: "Answer", earlier: "Show earlier",
    empty: "Preparing questions…", you: "You chose",
  },
};

const isMobile = () => document.body.classList.contains("is-mobile");

export function mountScenarioPlayer(el: HTMLElement, opts: PlayerOptions, owner: Component): PlayerHandle {
  const zh = getLocale() === "zh-TW";
  const T = zh ? L["zh-TW"] : L.en;
  const root = el.createDiv({ cls: "vt-pr-player" });
  root.tabIndex = 0;
  let state: PlayerState = initialState();
  let expanded = false;
  let emptyNotified = false;
  let dead = false;

  const questions = () => opts.questions();

  function sync(next: PlayerState): void {
    state = next;
    if (state.phase === "empty") {
      if (!emptyNotified) {
        emptyNotified = true;
        opts.callbacks.onEmpty?.();
      }
    } else emptyNotified = false;
    render();
  }

  function pick(optionId: string): void {
    const r = answerState(state, optionId);
    if (!r || !state.current) return;
    const q = state.current;
    state = r.state;
    opts.callbacks.onAnswer({ question: q, optionId, correct: r.correct, hinted: state.hinted });
    render();
  }
  function next(): void {
    sync(nextState(state, questions()));
  }
  function skip(): void {
    const q = state.current;
    const r = skipState(state, questions());
    if (r.skipped && q) opts.callbacks.onSkip(q);
    sync(r.state);
  }
  function retire(): void {
    const q = state.current;
    if (!q) return;
    opts.callbacks.onRetire(q);
    sync(retireState(state, questions()));
  }
  function hint(): void {
    state = showHint(state);
    render();
  }

  owner.registerDomEvent(root, "keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = keyAction(e.key, state);
    if (!a) return;
    e.preventDefault();
    if (a.type === "pick") pick(state.current!.options[a.index].id);
    else if (a.type === "next") next();
    else if (a.type === "skip") skip();
    else hint();
  });

  function renderParts(parent: HTMLElement, parts: AnsweredPart[]): void {
    for (const p of parts) {
      if (p.t === "strike") parent.createEl("s", { cls: "vt-pr-strike", text: p.text });
      else if (p.t === "fix") parent.createSpan({ cls: "vt-pr-fix", text: ` → ${p.text}` });
      else if (p.t === "target") parent.createEl("strong", { cls: "vt-pr-target", text: p.text });
      else parent.appendText(p.text);
    }
  }

  function renderHistory(parent: HTMLElement): void {
    const all = historyEntries(state.history);
    if (!all.length) return;
    const limited = isMobile() && !expanded;
    const { shown, hidden } = limited ? trimHistory(all, MOBILE_HISTORY_LIMIT) : { shown: all, hidden: 0 };
    const side = speakerSides(entrySpeakers(all, state.current));
    const box = parent.createDiv({ cls: "vt-pr-history" });
    if (hidden > 0) {
      const more = box.createEl("button", { cls: "vt-pr-more", text: `${T.earlier} (${hidden})` });
      more.addEventListener("click", () => {
        expanded = true;
        render();
      });
    }
    for (const e of shown) {
      if (e.type === "scene") {
        box.createDiv({ cls: "vt-pr-scene", text: e.text });
        continue;
      }
      const bubble = !!e.speaker;
      const line = box.createDiv({ cls: "vt-pr-line" });
      if (e.lead) line.addClass("is-lead");
      if (e.skipped) line.addClass("is-skipped");
      if (bubble) line.addClass("is-bubble", side(e.speaker) === "right" ? "is-right" : "is-left");
      if (bubble) line.createDiv({ cls: "vt-pr-speaker", text: e.speaker });
      renderParts(line.createDiv({ cls: "vt-pr-text" }), e.parts);
    }
  }

  function renderCurrent(parent: HTMLElement, q: PlayerQuestion): void {
    const box = parent.createDiv({ cls: "vt-pr-current" });
    if (q.tag) box.createDiv({ cls: "vt-pr-tag", text: q.tag });
    const all = [...historyEntries(state.history)];
    const side = speakerSides(entrySpeakers(all, q));
    const wrap = (cls: string, speaker: string | undefined) => {
      const d = box.createDiv({ cls });
      if (speaker) d.addClass("is-bubble", side(speaker) === "right" ? "is-right" : "is-left");
      if (speaker) d.createDiv({ cls: "vt-pr-speaker", text: speaker });
      return d.createDiv({ cls: "vt-pr-text" });
    };
    for (const l of q.lead ?? []) wrap("vt-pr-line is-lead", l.speaker).appendText(l.text);

    const feedback = state.phase === "feedback";
    const body = wrap("vt-pr-line is-question", q.speaker);
    const fragMode = q.kind === "find-error";
    for (const s of questionSegments(q)) {
      if (s.t === "text") body.appendText(s.text);
      else if (s.t === "blank") {
        const b = body.createSpan({ cls: "vt-pr-blank" });
        if (feedback) b.setText(q.options.find((o) => o.id === q.answerId)?.text ?? "");
        else b.setText("      ");
      } else if (s.t === "target") body.createEl("strong", { cls: "vt-pr-target", text: s.text });
      else {
        const f = body.createEl("button", { cls: "vt-pr-frag", text: s.text, attr: { type: "button" } });
        if (feedback) {
          f.disabled = true;
          if (s.optionId === q.answerId) f.addClass("is-answer");
          else if (s.optionId === state.chosen) f.addClass("is-wrong");
        } else f.addEventListener("click", () => pick(s.optionId));
      }
    }

    // Options (find-error taps the sentence; fragments that could not be
    // located in the text fall back to buttons).
    const located = new Set(questionSegments(q).flatMap((s) => (s.t === "frag" ? [s.optionId] : [])));
    const buttons = q.options.filter((o) => !fragMode || !located.has(o.id));
    if (buttons.length) {
      const grid = box.createDiv({ cls: `vt-pr-options cols-${optionColumns(q.kind, isMobile())}` });
      q.options.forEach((o, i) => {
        if (!buttons.includes(o)) return;
        const b = grid.createEl("button", { cls: "vt-pr-option", attr: { type: "button" } });
        b.createSpan({ cls: "vt-pr-key", text: String(i + 1) });
        b.createSpan({ cls: "vt-pr-option-text", text: o.text });
        if (feedback) {
          b.disabled = true;
          if (o.id === q.answerId) b.addClass("is-answer");
          else if (o.id === state.chosen) b.addClass("is-wrong");
        } else b.addEventListener("click", () => pick(o.id));
        if (state.hintShown && q.hints?.[o.id]) b.createDiv({ cls: "vt-pr-hint", text: q.hints[o.id] });
      });
    }
    if (state.hintShown && fragMode) {
      const hl = box.createDiv({ cls: "vt-pr-hints" });
      for (const o of q.options) if (q.hints?.[o.id]) hl.createDiv({ cls: "vt-pr-hint", text: `${o.text}: ${q.hints[o.id]}` });
    }

    const actions = box.createDiv({ cls: "vt-pr-actions" });
    if (!feedback) learnButton(actions, { label: T.skip, ghost: true, onClick: skip });
    if (canHint(state)) learnButton(actions, { label: T.hint, ghost: true, onClick: hint });
    learnButton(actions, { label: T.retire, ghost: true, onClick: retire });

    if (feedback) renderFeedback(box, q);
  }

  function renderFeedback(parent: HTMLElement, q: PlayerQuestion): void {
    const fb = parent.createDiv({ cls: `vt-pr-feedback ${state.correct ? "is-right" : "is-wrong"}` });
    fb.createDiv({ cls: "vt-pr-verdict", text: state.correct ? T.right : T.wrong });
    const ans = q.options.find((o) => o.id === q.answerId)?.text ?? "";
    fb.createDiv({ cls: "vt-pr-answer", text: `${T.answer}: ${ans}` });
    if (q.explanation) fb.createDiv({ cls: "vt-pr-explain", text: q.explanation });
    const note = feedbackNote(state);
    if (note) fb.createDiv({ cls: "vt-pr-note", text: note });
    if (q.sentenceZh) fb.createDiv({ cls: "vt-pr-zh", text: q.sentenceZh });
    const row = fb.createDiv({ cls: "vt-pr-actions" });
    const nb = learnButton(row, { label: `${T.next}  ↵`, cta: true, onClick: next });
    nb.addClass("vt-pr-next");
  }

  function render(): void {
    if (dead) return;
    const hadFocus = root.contains(document.activeElement);
    root.empty();
    root.createDiv({ cls: "vt-pr-stats", text: statsLabel(state, zh) });
    renderHistory(root);
    if (state.current && state.phase !== "empty") renderCurrent(root, state.current);
    else root.createDiv({ cls: "vt-pr-empty", text: opts.emptyText?.() ?? T.empty });
    if (hadFocus) root.focus({ preventScroll: true });
  }

  sync(refreshState(state, questions()));

  return {
    refresh() {
      if (dead) return;
      sync(refreshState(state, questions()));
    },
    unload() {
      dead = true;
      root.remove();
    },
  };
}

import { interactionStyle, type CefrLevel, type InteractionStyle, type LearnerGoal, type LearnerProfile } from "../../../core/model/settings";
import type { LearnerSnapshot } from "../../learner/LearnerModel";
import { t } from "../../../core/i18n";
import { renderTemplate } from "../../../core/text/template";

// The learner-profile system block appended to every AI request. Kept as
// its own block — after the cached article prefix — so editing the profile
// never invalidates the (potentially 30k-token) article cache; see
// tasks/compose.ts for the full ordering.
export const PROFILE_TEMPLATE = `〔學習者設定〕
我是{{who}}的英文學習者。回答簡明扼要{{#maxChars}}，盡量在 {{maxChars}} 字以內完成說明（英文原文與例句不計入字數）{{/maxChars}}。
互動語言：{{language}}這一條優先於其他規則裡「預設用繁體中文」之類的說法；引用的英文原文、例句照舊用英文，JSON 欄位有指定語言的照欄位規定。
{{#extra}}其他補充：{{extra}}{{/extra}}`;

const LEVEL_LABEL: Record<CefrLevel, string> = {
  A1: "A1（入門）",
  A2: "A2（初級）",
  B1: "B1（中級）",
  B2: "B2（中高級）",
  C1: "C1（高級）",
  C2: "C2（精通）",
};

const GOAL_PHRASE: Record<LearnerGoal, string> = {
  general: "以閱讀英文文章為主",
  toefl: "正在準備托福（TOEFL）",
  toeic: "正在準備多益（TOEIC）",
  ielts: "正在準備雅思（IELTS）",
  gept: "正在準備全民英檢（GEPT）",
  school: "正在準備學校考試（會考／學測）",
};

// 1101 互動語言 (core/model/settings.ts interactionStyle).
const LANGUAGE_PHRASE: Record<InteractionStyle, string> = {
  zh: "全程用繁體中文（台灣用語）。",
  zhEasy: "以繁體中文為主，穿插簡單的英文短句（例如先用一句簡單英文說，再用中文說明）。",
  basic: "以簡單的英文為主（常用字、短句）；比較難的字和關鍵的解釋在後面用括號附繁體中文。",
  middle: "用中等程度的英文；只有很難的字或概念才補一句繁體中文。",
  advanced: "全程用自然、進階的英文，不用中文（除非學生要求）。",
};

// Optional: lets the block carry a one-line learning summary. Without it
// the output is exactly what it was before (wave 17 Z).
export interface ProfileDeps {
  learnerModel?: { snapshot(): LearnerSnapshot };
}

// composeRequest() calls renderProfile(profile) with no deps, so main.ts
// registers the model once here; an explicit deps argument still wins.
let defaultDeps: ProfileDeps = {};
export function setProfileDeps(deps: ProfileDeps): void {
  defaultDeps = deps;
}

// One short line, only the parts that have something to say; "" when empty.
export function renderLearnerSummary(s: LearnerSnapshot): string {
  const parts: string[] = [];
  const learned = s.vocab.learning + s.vocab.mature;
  if (learned > 0) parts.push(t("learner.summary.vocab", { n: learned, mature: s.vocab.mature }));
  if (s.grammar.mastered > 0) parts.push(t("learner.summary.grammar", { n: s.grammar.mastered }));
  if (s.poly.practisedSenses > 0) parts.push(t("learner.summary.poly", { n: s.poly.practisedSenses }));
  return parts.length ? t("learner.summary.prefix") + parts.join(" · ") : "";
}

export function renderProfile(p: LearnerProfile, deps: ProfileDeps = defaultDeps): string {
  const parts: string[] = [];
  // Leading space so the Latin level reads 「一個 A1（入門）程度」.
  if (p.level) parts.push(` ${LEVEL_LABEL[p.level]}程度`);
  parts.push(GOAL_PHRASE[p.goal] ?? GOAL_PHRASE.general);
  const base = renderTemplate(PROFILE_TEMPLATE, {
    who: `一個${parts.join("、")}`,
    language: LANGUAGE_PHRASE[interactionStyle(p)],
    maxChars: p.maxAnswerChars > 0 ? p.maxAnswerChars : undefined,
    extra: p.extra.trim(),
  });
  const summary = deps.learnerModel ? renderLearnerSummary(deps.learnerModel.snapshot()) : "";
  return summary ? `${base}\n${summary}` : base;
}

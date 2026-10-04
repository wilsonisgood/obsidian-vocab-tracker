import type { AnswerLanguage, CefrLevel, LearnerGoal, LearnerProfile } from "../../../core/model/settings";
import { renderTemplate } from "../../../core/text/template";

// The learner-profile system block appended to every AI request. Kept as
// its own block — after the cached article prefix — so editing the profile
// never invalidates the (potentially 30k-token) article cache; see
// tasks/compose.ts for the full ordering.
export const PROFILE_TEMPLATE = `〔學習者設定〕
我是{{who}}的英文學習者。請用{{language}}回答，簡明扼要{{#maxChars}}，盡量在 {{maxChars}} 字以內完成說明{{/maxChars}}。
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

const LANGUAGE_PHRASE: Record<AnswerLanguage, string> = {
  "zh-TW": "繁體中文（台灣用語）",
  en: "淺顯的英文",
  bilingual: "中英對照（以繁體中文為主，關鍵處附英文）",
};

export function renderProfile(p: LearnerProfile): string {
  const parts: string[] = [];
  // Leading space so the Latin level reads 「一個 A1（入門）程度」.
  if (p.level) parts.push(` ${LEVEL_LABEL[p.level]}程度`);
  parts.push(GOAL_PHRASE[p.goal] ?? GOAL_PHRASE.general);
  return renderTemplate(PROFILE_TEMPLATE, {
    who: `一個${parts.join("、")}`,
    language: LANGUAGE_PHRASE[p.answerLanguage] ?? LANGUAGE_PHRASE["zh-TW"],
    maxChars: p.maxAnswerChars > 0 ? p.maxAnswerChars : undefined,
    extra: p.extra.trim(),
  });
}

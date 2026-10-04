import { getLocale } from "../../core/i18n";

// TEMPORARY (07 §2.3): strings for the M7 learning services until the
// integration moves them into core/i18n/{zh-TW,en}.ts — then replace
// learnLabel(k) with t(k).
const L = {
  en: {
    "ai.task.family.generate": "Find families",
    "ai.task.verb.usage": "Generate usage",
    "ai.task.trivia.next": "Another one",
    "ai.task.trivia.quiz": "Quiz me",
    "ai.task.trivia.etymology": "Etymology",
    "ai.task.trivia.joke": "Joke",
  },
  "zh-TW": {
    "ai.task.family.generate": "找字族",
    "ai.task.verb.usage": "產生用法",
    "ai.task.trivia.next": "再來一則",
    "ai.task.trivia.quiz": "考我一題",
    "ai.task.trivia.etymology": "字源",
    "ai.task.trivia.joke": "笑話",
  },
} as const;

export type LearnLabelKey = keyof (typeof L)["en"];

export function learnLabel(key: LearnLabelKey): string {
  return L[getLocale()][key] ?? L.en[key];
}

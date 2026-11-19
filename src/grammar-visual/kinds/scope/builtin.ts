import type { ScopeVisual } from "../../types";

export const SCOPE_BUILTIN: Record<string, ScopeVisual> = {
  "prepositions-time-place": {
    kind: "scope",
    sentence: {
      text: "The meeting is on Monday at 3 p.m.",
      marks: [{ text: "on", tone: "accent" }, { text: "at", tone: "accent" }],
    },
    explain: "Monday 是「一整天」，比月份小、比時間點大，所以用 on；3 p.m. 是一個點，用 at。地點的邏輯一樣：大範圍 in、表面 on、定點 at。",
    domain: "time",
    levels: [
      { word: "in", examples: "in 2026 · in May · in the morning", gloss: "年、月、季節、一天中的時段" },
      { word: "on", examples: "on Monday · on May 5th", gloss: "某一天" },
      { word: "at", examples: "at 3 p.m. · at noon", gloss: "一個時間點" },
    ],
    hit: 1,
    alt: [
      {
        domain: "place",
        levels: [
          { word: "in", examples: "in Taipei · in a room", gloss: "城市、國家、封閉的空間" },
          { word: "on", examples: "on Main Street · on the wall", gloss: "街道、表面" },
          { word: "at", examples: "at the station · at the door", gloss: "一個定點" },
        ],
        hit: 2,
      },
    ],
  },
  "preposition-meaning": {
    kind: "scope",
    sentence: {
      text: "She cut the cake with a knife for her friend.",
      marks: [{ text: "with a knife", tone: "accent" }, { text: "for her friend", tone: "amber" }],
    },
    explain: "介系詞的核心意思決定用法：for 朝向目標或對象，by 在旁邊或經手，with 緊貼著、伴隨或當工具。用 with a knife 切，因為刀跟手貼在一起。",
    domain: "abstract",
    levels: [
      { word: "for", examples: "for you · for two hours · for lunch", gloss: "朝向目標、對象與期間" },
      { word: "by", examples: "by the door · by bus · by Orwell", gloss: "在旁邊、經由、經手的人" },
      { word: "with", examples: "with a friend · with a knife · with care", gloss: "貼在一起：伴隨、工具、方式" },
    ],
    hit: 2,
    alt: [
      {
        domain: "abstract",
        levels: [
          { word: "of", examples: "a cup of tea · the end of the day", gloss: "整體與部分、內容" },
          { word: "of", examples: "a friend of mine · the author of the book", gloss: "屬於、來源" },
        ],
        hit: 0,
      },
    ],
  },
  "preposition-abstract": {
    kind: "scope",
    sentence: { text: "She is in trouble and on a diet.", marks: [{ text: "in trouble", tone: "accent" }, { text: "on a diet", tone: "accent" }] },
    explain: "抽象的狀態也當成空間：in 像被包在裡面的處境，on 像貼著、持續進行的狀況，at 像站在某個定點上的狀態。",
    domain: "abstract",
    levels: [
      { word: "in", examples: "in trouble · in love · in a hurry", gloss: "被包在裡面的處境與情緒" },
      { word: "on", examples: "on a diet · on duty · on fire", gloss: "貼著、持續進行中的狀況" },
      { word: "at", examples: "at risk · at peace · at work", gloss: "某一個定點上的狀態" },
    ],
    hit: 0,
    alt: [
      {
        domain: "abstract",
        levels: [
          { word: "of", examples: "a member of the team · the top of the hill", gloss: "整體與部分" },
          { word: "of", examples: "a cup of tea · a sense of humor", gloss: "內容與特質" },
        ],
        hit: 0,
      },
    ],
  },
};

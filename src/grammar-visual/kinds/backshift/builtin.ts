import type { BackshiftVisual } from "../../types";

export const BUILTIN: Record<string, BackshiftVisual> = {
  "reported-speech": {
    kind: "backshift",
    sentence: {
      text: "She said she would call me the next day.",
      marks: [
        { text: "she", tone: "accent" },
        { text: "would", tone: "accent" },
        { text: "me", tone: "accent" },
        { text: "the next day", tone: "accent" },
      ],
    },
    explain: "這些字都在回答同一件事：從轉述的這一刻看回去，那句話裡的時間和人是誰。",
    direct: "I will call you tomorrow.",
    swaps: [
      { from: "I", to: "she", type: "person", why: "換成轉述者看到的說話的人" },
      { from: "will", to: "would", type: "tense", why: "說話的時間已經過去，往過去退一格" },
      { from: "you", to: "me", type: "person", why: "換成轉述者的角度" },
      { from: "tomorrow", to: "the next day", type: "time", why: "「明天」已經不是明天了" },
    ],
  },
};

import type { CefrLevel } from "../model/settings";

// Typical vocabulary size per CEFR level, a range (第二十二波 R6).
export const VOCAB_SIZE: Record<CefrLevel, [number, number]> = {
  A1: [500, 700],
  A2: [1000, 1500],
  B1: [2000, 2500],
  B2: [4000, 5000],
  C1: [8000, 10000],
  C2: [16000, 20000],
};
export const num = (n: number) => n.toLocaleString("en-US");

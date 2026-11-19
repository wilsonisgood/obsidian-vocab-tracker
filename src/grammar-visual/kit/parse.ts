import type { LayoutKind, Mark, MarkTone, MarkedSentence } from "../types";

// 驗證 AI 輸出的小工具。規則一律是「不合格就 null」，呼叫端用
// `if (x === null) return null` 一路往外丟，不修補、不猜。

export type Obj = Record<string, unknown>;

export function obj(raw: unknown): Obj | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Obj) : null;
}

// 修掉前後空白；超過 max 字或不是字串就 null。allowEmpty=false 時空字串也 null。
export function str(raw: unknown, max: number, allowEmpty = false): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!allowEmpty && s === "") return null;
  return s.length > max ? null : s;
}

export function num(raw: unknown, min: number, max: number): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= min && raw <= max ? raw : null;
}

export function int(raw: unknown, min: number, max: number): number | null {
  const n = num(raw, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
}

export function bool(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

export function oneOf<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

// 陣列長度要在 [min, max]；任何一項 item() 回 null 就整個 null。
export function arr<T>(raw: unknown, min: number, max: number, item: (x: unknown, i: number) => T | null): T[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) return null;
  const out: T[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = item(raw[i], i);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

export const MARK_TONES: readonly MarkTone[] = ["accent", "amber", "muted", "strike"];

export const SENTENCE_MAX = 160;
export const EXPLAIN_MAX = 120;
// 一般短欄位（標籤、片語、說明一行）。
export const SHORT_MAX = 60;

export function marked(raw: unknown): MarkedSentence | null {
  const o = obj(raw);
  if (!o) return null;
  const text = str(o.text, SENTENCE_MAX);
  if (text === null) return null;
  const marks = arr(o.marks, 0, 6, (m): Mark | null => {
    const mo = obj(m);
    if (!mo) return null;
    const t = str(mo.text, SENTENCE_MAX);
    const tone = oneOf(mo.tone, MARK_TONES);
    return t !== null && tone !== null ? { text: t, tone } : null;
  });
  return marks === null ? null : { text, marks };
}

// 每種版面都有的 kind / sentence / explain。
export function base<K extends LayoutKind>(
  raw: unknown,
  kind: K
): { o: Obj; kind: K; sentence: MarkedSentence; explain: string } | null {
  const o = obj(raw);
  if (!o || o.kind !== kind) return null;
  const sentence = marked(o.sentence);
  const explain = str(o.explain, EXPLAIN_MAX);
  if (!sentence || explain === null) return null;
  return { o, kind, sentence, explain };
}

// ── JSON schema 片段（strict 模式：全部 required、不准多欄位）──────

export function sObj(properties: Record<string, unknown>, description?: string): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
    ...(description ? { description } : {}),
  };
}
export const sStr = (description: string): Record<string, unknown> => ({ type: "string", description });
export const sNum = (description: string): Record<string, unknown> => ({ type: "number", description });
export const sInt = (description: string): Record<string, unknown> => ({ type: "integer", description });
export const sBool = (description: string): Record<string, unknown> => ({ type: "boolean", description });
export const sEnum = (values: readonly string[], description: string): Record<string, unknown> => ({
  type: "string",
  enum: [...values],
  description,
});
export const sArr = (items: Record<string, unknown>, description: string): Record<string, unknown> => ({
  type: "array",
  items,
  description,
});

export const SENTENCE_SCHEMA = sObj(
  {
    text: sStr("英文例句"),
    marks: sArr(
      sObj({
        text: sStr("例句裡要標出來的一段，必須原樣出現在例句中"),
        tone: sEnum(MARK_TONES, "accent＝這句的重點；amber＝修飾、子句或假設；muted＝次要；strike＝判斷時先劃掉"),
      }),
      "要標色的片段，由左到右，最多 6 個；不標就給 []"
    ),
  },
  "例句"
);

// 每種版面 schema 的開頭三欄。
export function baseSchema(kind: LayoutKind): Record<string, unknown> {
  return {
    kind: sEnum([kind], "固定填這個值"),
    sentence: SENTENCE_SCHEMA,
    explain: sStr("一兩句繁體中文解說，120 字以內，說清楚為什麼是這樣"),
  };
}

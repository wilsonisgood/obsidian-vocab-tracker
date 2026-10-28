// 「這次的收穫」: what the AI distils from eight buddy question-answer
// groups when they are tidied into a note. Parsing is forgiving: a missing
// field is just empty. Pure.

export interface DigestCorrection {
  yours: string;
  better: string;
  why: string;
}
export interface DigestUnderstanding {
  subject: string;
  yours: string;
  ok: boolean;
  feedback: string;
}
export interface Digest {
  topics: string[];
  corrections: DigestCorrection[];
  understandings: DigestUnderstanding[];
  words: string[];
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown, max: number): string[] => {
  const out: string[] = [];
  for (const x of list(v)) {
    const s = str(x);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

// null when the text holds no JSON object.
export function parseDigest(text: string): Digest | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  const corrections: DigestCorrection[] = [];
  for (const c of list(raw.corrections)) {
    if (!isObj(c)) continue;
    const yours = str(c.yours);
    const better = str(c.better);
    if (yours && better) corrections.push({ yours, better, why: str(c.why) });
  }
  const understandings: DigestUnderstanding[] = [];
  for (const u of list(raw.understandings)) {
    if (!isObj(u)) continue;
    const subject = str(u.subject);
    const yours = str(u.yours);
    if (subject && yours) understandings.push({ subject, yours, ok: u.ok === true, feedback: str(u.feedback) });
  }
  return { topics: strings(raw.topics, 3), corrections, understandings, words: strings(raw.words, 20) };
}

export function digestIsEmpty(d: Digest): boolean {
  return !d.topics.length && !d.corrections.length && !d.understandings.length && !d.words.length;
}

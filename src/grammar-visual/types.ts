// 文法概念版面（grammar-visual）的資料合約。
//
// 這個資料夾是獨立模組：只用標準 DOM，不 import obsidian 也不 import
// 插件的其他部分（eslint 會擋），之後要整包搬到另一個插件。
//
// AI 只填這些結構化欄位，畫面由各版面的 render 畫；欄位不合格就整個
// 退回 null，由呼叫端改顯示文字說明。AI 的 structured output 規定所有
// 欄位都要給，所以「可省略」的欄位一律用 "" 或 [] 表示沒有。

export type LayoutKind =
  | "timeline"
  | "scale"
  | "unreal"
  | "backshift"
  | "focus"
  | "verbslot"
  | "path"
  | "connector"
  | "order"
  | "scope"
  | "clause"
  | "compare"
  | "link"
  | "agreement";

export const LAYOUT_KINDS: readonly LayoutKind[] = [
  "timeline",
  "scale",
  "unreal",
  "backshift",
  "focus",
  "verbslot",
  "path",
  "connector",
  "order",
  "scope",
  "clause",
  "compare",
  "link",
  "agreement",
];

// ── 共用 ───────────────────────────────────────────────────────────

// accent＝這句的重點（紫）；amber＝修飾、子句、假設那一側（黃）；
// muted＝次要；strike＝判斷時先劃掉的部分。
export type MarkTone = "accent" | "amber" | "muted" | "strike";
export interface Mark {
  text: string;
  tone: MarkTone;
}
// 英文例句；marks 依序在 text 裡由左到右找，找不到的就忽略。
export interface MarkedSentence {
  text: string;
  marks: Mark[];
}

interface Base<K extends LayoutKind> {
  kind: K;
  sentence: MarkedSentence;
  // 一兩句繁中解說（≤ 120 字）。
  explain: string;
}

// ── G1 時間軸 ─────────────────────────────────────────────────────
// 軸上的位置：-3（很久以前）… 0（現在）… 3（未來）。
export type TimelineShape = "point" | "span" | "span-to-now" | "repeat" | "ongoing";
export interface TimelineEvent {
  label: string;
  shape: TimelineShape;
  at: number;
  // span 的終點；其他形狀填跟 at 一樣的值。
  to: number;
  // 這句在講的那一件。
  focus: boolean;
}
export interface TimelineVisual extends Base<"timeline"> {
  events: TimelineEvent[];
  // 說話者站的時間點（通常 0＝現在；過去觀點的未來就放在過去）。
  ref: { at: number; label: string };
}

// ── G2 程度量尺 ───────────────────────────────────────────────────
export type ScaleType = "certainty" | "obligation" | "frequency" | "amount" | "formality" | "politeness" | "polarity";
export interface ScaleStep {
  word: string;
  gloss: string;
}
export interface ScaleSet {
  scale: ScaleType;
  // 由高（最確定／最強）到低，2–6 格。
  steps: ScaleStep[];
  pick: number;
}
export interface ScaleVisual extends Base<"scale">, ScaleSet {
  // 推論時的證據；沒有填 ""。
  evidence: string;
  // 可切換的另一把量尺（推論 ↔ 義務）；沒有填 []，最多 1 個。
  alt: ScaleSet[];
}

// ── G3 現實與假設 ─────────────────────────────────────────────────
export interface UnrealCase {
  label: string;
  time: "present" | "past" | "future" | "mixed";
  // 現實那張卡（真實狀況）與假設那張卡。真實條件句的 hypo 填 ""。
  real: string;
  hypo: string;
  // 動詞往過去退一格的對照（have → had）。
  shifts: { from: string; to: string }[];
}
export interface UnrealVisual extends Base<"unreal"> {
  current: UnrealCase;
  // 切換鈕的其他條件句類型；沒有填 []，最多 3 個。
  others: UnrealCase[];
}

// ── G4 往過去退一格 ───────────────────────────────────────────────
export interface BackshiftSwap {
  from: string;
  to: string;
  type: "tense" | "person" | "time" | "place";
  why: string;
}
export interface BackshiftVisual extends Base<"backshift"> {
  // sentence＝轉述後的句子。
  direct: string;
  swaps: BackshiftSwap[];
}

// ── G5 焦點轉移 ───────────────────────────────────────────────────
export type FocusRole = "doer" | "action" | "receiver" | "cause" | "feeler";
export interface FocusCard {
  label: string;
  text: string;
  roles: { text: string; role: FocusRole }[];
  focus: FocusRole;
  // 例句用的是這一張。
  current: boolean;
}
export interface FocusVisual extends Base<"focus"> {
  cards: FocusCard[];
}

// ── G6 動詞後面接什麼 ─────────────────────────────────────────────
export interface VerbSlotCard {
  pattern: string;
  meaning: string;
  // 小圖：一串方塊，stop＝停掉／打叉，accent＝接著去做的事。
  picture: { text: string; tone: "plain" | "stop" | "accent" }[];
  current: boolean;
}
export interface VerbSlotVisual extends Base<"verbslot"> {
  verb: string;
  cards: VerbSlotCard[];
  // 同一組的其他動詞；沒有填 []。
  family: string[];
}

// ── G7 判斷路徑 ───────────────────────────────────────────────────
export interface PathStep {
  q: string;
  // 走到這一步時這句的狀況，例如「知道：前一句剛提過」。
  note: string;
  // 這一步成立時的答案，例如「the」。
  result: string;
}
export interface PathVisual extends Base<"path"> {
  steps: PathStep[];
  // 這句停在第幾步（0 起算）。
  stopAt: number;
}

// ── G8 邏輯連接 ───────────────────────────────────────────────────
export type Relation = "cause" | "contrast" | "condition" | "purpose" | "addition" | "sequence";
export interface ConnectorSet {
  relation: Relation;
  link: string;
  left: { text: string; note: string };
  right: { text: string; note: string };
  // 同一種關係、後面接法不同的幾個字；第一個是這句用的。
  compare: { word: string; form: string; example: string }[];
}
export interface ConnectorVisual extends Base<"connector">, ConnectorSet {}

// ── G9 語序搬移 ───────────────────────────────────────────────────
export interface OrderToken {
  text: string;
  role: "plain" | "moved" | "aux";
  // 搬移步驟的編號；沒搬的填 0。
  step: number;
}
export interface OrderVisual extends Base<"order"> {
  baseLabel: string;
  base: OrderToken[];
  resultLabel: string;
  result: OrderToken[];
  steps: string[];
}

// ── G10 範圍大小 ──────────────────────────────────────────────────
export interface ScopeSet {
  domain: "time" | "place" | "abstract";
  // 由大到小，2–3 層。
  levels: { word: string; examples: string; gloss: string }[];
  hit: number;
}
export interface ScopeVisual extends Base<"scope">, ScopeSet {
  // 切換鈕的另一組（時間 ↔ 地點）；沒有填 []，最多 1 個。
  alt: ScopeSet[];
}

// ── G11 子句套疊 ──────────────────────────────────────────────────
export interface ClausePart {
  text: string;
  // 給人看的種類名稱，例如「關係子句（限定）」。
  type: string;
  attachTo: string;
  gloss: string;
  depth: number;
}
export interface ClauseVisual extends Base<"clause"> {
  core: string;
  clauses: ClausePart[];
}

// ── G12 比較長條 ──────────────────────────────────────────────────
export interface CompareVisual extends Base<"compare"> {
  items: { label: string; value: number; note: string }[];
  relation: "comparative" | "equal" | "superlative";
  focus: string;
  // 形容詞變化，例如 ["tall", "taller", "tallest"]；沒有填 []。
  forms: string[];
}

// ── G13 連到哪個字 ────────────────────────────────────────────────
export interface LinkItem {
  from: string;
  to: string;
  kind: "refer" | "modify";
  why: string;
}
export interface LinkVisual extends Base<"link"> {
  links: LinkItem[];
}

// ── G14 主詞動詞一致 ──────────────────────────────────────────────
export interface AgreementVisual extends Base<"agreement"> {
  head: string;
  number: "singular" | "plural";
  // 先劃掉的修飾；沒有填 ""。
  skip: string;
  verb: string;
  steps: string[];
  // 容易看錯的例子；沒有填 []。
  traps: { example: string; note: string }[];
}

export type Visual =
  | TimelineVisual
  | ScaleVisual
  | UnrealVisual
  | BackshiftVisual
  | FocusVisual
  | VerbSlotVisual
  | PathVisual
  | ConnectorVisual
  | OrderVisual
  | ScopeVisual
  | ClauseVisual
  | CompareVisual
  | LinkVisual
  | AgreementVisual;

export type VisualOf<K extends LayoutKind> = Extract<Visual, { kind: K }>;

// ── 每種版面的模組介面 ────────────────────────────────────────────

export type JsonSchema = Record<string, unknown>;

export interface RenderCtx {
  doc: Document;
  // 手機版（窄、觸控）；呼叫端決定，模組不看 body class。
  mobile: boolean;
}

export interface KindModule<K extends LayoutKind> {
  kind: K;
  // raw 是已經 JSON.parse 過的物件；不合格回傳 null。
  parse(raw: unknown): VisualOf<K> | null;
  // 給 AI structured output 的 JSON schema（strict：所有欄位 required、
  // additionalProperties: false，最外層含 kind）。
  schema: JsonSchema;
  // 給 AI 的填寫說明（繁中，≤ 600 字）。
  guide: string;
  // 畫進 parent；切換鈕等互動只動自己畫出來的節點。
  render(parent: HTMLElement, v: VisualOf<K>, ctx: RenderCtx): void;
  // 主題 id → 內建版面（不用 AI 就能看）。
  builtin: Readonly<Record<string, VisualOf<K>>>;
}

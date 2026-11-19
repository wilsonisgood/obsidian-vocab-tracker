import type { Mark, ScaleSet, ScaleStep, ScaleType, ScaleVisual } from "../../types";

const st = (word: string, gloss: string): ScaleStep => ({ word, gloss });
const set = (scale: ScaleType, pick: number, steps: ScaleStep[]): ScaleSet => ({ scale, steps, pick });
const acc = (text: string): Mark => ({ text, tone: "accent" });

function sc(
  text: string,
  marks: Mark[],
  explain: string,
  main: ScaleSet,
  evidence = "",
  alt: ScaleSet[] = []
): ScaleVisual {
  return { kind: "scale", sentence: { text, marks }, explain, ...main, evidence, alt };
}

const CERTAINTY = (pick: number): ScaleSet =>
  set("certainty", pick, [st("must", "幾乎確定"), st("should", "應該"), st("might / could", "也許"), st("can't", "不可能")]);
const OBLIGATION = (pick: number): ScaleSet =>
  set("obligation", pick, [st("must", "非做不可"), st("have to", "必須（外在規定）"), st("should", "應該（建議）"), st("don't have to", "不必")]);

export const scaleBuiltin: Record<string, ScaleVisual> = {
  "can-cant": sc(
    "Can I borrow your pen?",
    [acc("Can")],
    "can 除了表示能力，也能用來請求許可。同樣是請求，may 最正式、could 較客氣、can 最日常，朋友之間用 can 就很自然。",
    set("politeness", 2, [st("May I", "最正式、很客氣"), st("Could I", "客氣"), st("Can I", "日常、口語")])
  ),
  "modals-deduction": sc(
    "The lights are off. They must be asleep.",
    [acc("must")],
    "證據是燈都關了，說話的人幾乎確定，用 must。如果只是猜，會往下移到 might；有證據顯示不可能，就用 can't。",
    CERTAINTY(0),
    "The lights are off.",
    [OBLIGATION(0)]
  ),
  "must-vs-have-to": sc(
    "You don't have to come early.",
    [acc("don't have to")],
    "must 是說話者自己要求，have to 多半是外在的規定。don't have to 是「不必」，可做可不做；mustn't 則是「禁止」，意思完全不同。",
    OBLIGATION(3)
  ),
  "modals-nuance": sc(
    "You should see a doctor.",
    [acc("should")],
    "同一個 should 在不同句子有不同強度：給建議時比 must 弱、比 might want to 強。想更委婉，就換成 might 或加 maybe。",
    set("obligation", 1, [st("must", "強烈要求"), st("should", "建議、應該"), st("might want to", "委婉的提議")]),
    "",
    [CERTAINTY(1)]
  ),
  "would-rather-had-better": sc(
    "You had better take an umbrella.",
    [acc("had better")],
    "had better 是強烈的建議，暗示不照做會有不好的後果；should 較溫和；would rather 則是說自己比較想要什麼，是偏好不是義務。",
    set("obligation", 1, [st("must", "非做不可"), st("had better", "最好（不然有麻煩）"), st("should", "應該"), st("would rather", "我寧願（偏好）")])
  ),
  "frequency-adverbs": sc(
    "She usually walks to work.",
    [acc("usually")],
    "頻率副詞依多常發生排成一把尺：always 是每次，usually 大約八九成，never 則是完全沒有。位置通常在一般動詞前、be 動詞後。",
    set("frequency", 1, [
      st("always", "每次（100%）"),
      st("usually", "通常（約 80–90%）"),
      st("often", "經常（約 60%）"),
      st("sometimes", "有時（約 30–40%）"),
      st("rarely", "很少"),
      st("never", "從不（0%）"),
    ])
  ),
  "stance-adverbs": sc(
    "The company has reportedly lost millions.",
    [acc("reportedly")],
    "這類副詞標明資訊的來源與可信度：reportedly 是「據報導」，allegedly 是「據稱」而且還沒證實，supposedly 則帶有懷疑的語氣。",
    set("certainty", 1, [st("clearly", "明顯如此"), st("reportedly", "據報導（有來源）"), st("allegedly", "據稱（尚未證實）"), st("supposedly", "據說（帶懷疑）")])
  ),
  "register-choice": sc(
    "I would appreciate it if you could reply soon.",
    [acc("I would appreciate it if you could reply soon")],
    "同一個請求可以用不同語體說：寫給客戶或上司用最上面這種，跟朋友就直接說 Reply soon。選擇要看對象和場合。",
    set("formality", 0, [
      st("I would appreciate it if you could…", "正式（書信、客戶）"),
      st("Could you please…?", "中性有禮貌"),
      st("Can you…?", "日常口語"),
      st("Reply soon.", "隨口、很直接"),
    ])
  ),
  imperatives: sc(
    "Please close the door.",
    [acc("Please close")],
    "命令句直接用原形動詞開頭，語氣再靠 please 或問句調整：加 please 變成客氣的請求，Could you…? 則更委婉，只講 Close the door. 最直接。",
    set("politeness", 1, [
      st("Could you close the door?", "很客氣的請求"),
      st("Please close the door.", "客氣的指示"),
      st("Close the door.", "直接的命令"),
      st("Close the door now!", "強硬、不耐煩"),
    ])
  ),
  "advanced-negation": sc(
    "He is anything but lazy.",
    [acc("anything but")],
    "anything but 看起來像在說「什麼都是只除了…」，其實是「絕對不是」：He is anything but lazy 的意思是他一點也不懶。",
    set("polarity", 1, [
      st("by no means", "絕不"),
      st("anything but", "絕對不是"),
      st("far from", "遠遠不是"),
      st("not entirely", "不完全是"),
    ])
  ),
  "negation-quantifiers-advanced": sc(
    "Few people came to the meeting.",
    [acc("Few")],
    "few（可數）和 little（不可數）已經是否定的意思：幾乎沒有；加了 a 的 a few / a little 才是「有一些」，語氣是肯定的。",
    set("amount", 2, [st("many", "很多"), st("a few", "有一些（肯定）"), st("few", "幾乎沒有（否定）"), st("none", "完全沒有")]),
    "",
    [set("amount", 2, [st("much", "很多"), st("a little", "有一點（肯定）"), st("little", "幾乎沒有（否定）"), st("none", "完全沒有")])]
  ),
};

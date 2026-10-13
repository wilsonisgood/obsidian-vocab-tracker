import type { GrammarStage, GrammarTopic } from "../model/grammar";

// The built-in grammar topic list (wave 15 F). Ids are permanent
// (rule 1) — attempts, progress and sightings hang on them — so only add;
// never rename. `order` is only a sort key inside a stage. Titles,
// summaries and objectives are original wording; no book names anywhere
// (rule 2).

type Obj = [id: string, text: string];

interface Def {
  id: string;
  d: number;
  title: string;
  pattern: string;
  summary: string;
  obj: Obj[];
  pre?: string[];
  hint?: string;
}

const STAGE1: Def[] = [
  { id: "be-verb", d: 1, title: "be 動詞", pattern: "am / is / are", summary: "用 am、is、are 說明身分、狀態與特徵。",
    obj: [["subject-be", "主詞與 am / is / are 的搭配"], ["negative-question", "be 動詞的否定句與疑問句"], ["describe", "用 be 動詞描述身分與特徵"]] },
  { id: "personal-pronouns", d: 1, title: "人稱代名詞", pattern: "I / me / my / mine", summary: "分清主格、受格、所有格與所有代名詞。",
    obj: [["subject-object", "分辨主格與受格"], ["possessive", "分辨所有格（my）與所有代名詞（mine）"], ["reference", "代名詞指回前面提到的人事物"]] },
  { id: "noun-plurals", d: 1, title: "名詞單複數", pattern: "book / books", summary: "名詞變複數的規則與常見不規則變化。",
    obj: [["regular-plural", "規則複數的變化（-s / -es / -ies）"], ["irregular-plural", "不規則複數（children, people）"], ["number-noun", "數量詞後的名詞用單數或複數"]] },
  { id: "articles-basic", d: 1, title: "冠詞", pattern: "a / an / the", summary: "第一次提到用 a / an，已知特定對象用 the。",
    obj: [["a-an", "依發音選 a 或 an"], ["first-mention", "首次提及用 a，再次提及用 the"], ["specific", "特定或獨一無二的事物用 the"]] },
  { id: "demonstratives", d: 1, title: "指示詞", pattern: "this / that / these / those", summary: "用遠近與單複數選對指示詞。",
    obj: [["near-far", "分辨近處的 this / these 與遠處的 that / those"], ["singular-plural", "指示詞的單複數要與名詞一致"], ["as-pronoun", "指示詞單獨當代名詞使用"]] },
  { id: "there-is-are", d: 1, title: "存在句", pattern: "there is / there are", summary: "說明某處有某物，動詞跟著後面的名詞變化。",
    obj: [["singular-plural", "there is / are 與後面名詞一致"], ["negative-question", "存在句的否定句與疑問句"], ["vs-have", "分辨存在句與 have 的用法"]] },
  { id: "present-simple", d: 1, title: "一般現在式", pattern: "I work / she works", summary: "描述習慣、事實與固定狀態。",
    obj: [["third-person-s", "第三人稱單數動詞加 -s / -es"], ["habit-fact", "用現在式描述習慣與事實"], ["negative-question", "現在式的否定句與疑問句"]] },
  { id: "present-continuous", d: 1, title: "現在進行式", pattern: "I am working", summary: "描述正在發生或暫時的動作。",
    obj: [["form", "am / is / are + 動詞-ing 的形式"], ["now-temporary", "表示正在發生或暫時的狀態"], ["vs-simple", "分辨進行式與一般現在式"], ["stative-verbs", "狀態動詞通常不用進行式"]],
    pre: ["be-verb", "present-simple"],
    hint: "狀態動詞（know、like、want）那個目標至少出一題，避免只考 -ing 拼法。" },
  { id: "past-simple", d: 1, title: "一般過去式", pattern: "I worked / went", summary: "描述已經結束的過去事件。",
    obj: [["regular", "規則動詞加 -ed 及拼法變化"], ["irregular", "常見不規則動詞的過去式"], ["time-markers", "yesterday、ago、last week 等過去時間詞"]],
    pre: ["present-simple"] },
  { id: "do-does-did-questions", d: 1, title: "疑問句與否定句", pattern: "do / does / did", summary: "用助動詞 do、does、did 造問句與否定句。",
    obj: [["negative", "用 don't / doesn't / didn't 造否定句"], ["question-form", "助動詞放句首造疑問句"], ["base-form", "助動詞後面動詞用原形"], ["short-answers", "簡答 Yes, I do. / No, she didn't."]],
    pre: ["present-simple", "past-simple"] },
  { id: "possessive-s", d: 1, title: "所有格 's", pattern: "Tom's book", summary: "用 's 表示誰擁有什麼。",
    obj: [["singular", "單數名詞加 's"], ["plural", "複數名詞加 '（the boys' room）"], ["s-vs-of", "分辨 's 與 of 的使用"]],
    pre: ["noun-plurals"] },
  { id: "wh-questions", d: 1, title: "疑問詞問句", pattern: "what / where / who / how", summary: "用 wh- 疑問詞問資訊並排對語序。",
    obj: [["choose-wh", "依想問的內容選疑問詞"], ["word-order", "疑問詞問句的語序"], ["who-subject", "疑問詞當主詞時不加助動詞"]],
    pre: ["be-verb"] },
  { id: "have-got", d: 1, title: "have got", pattern: "I've got / she hasn't got", summary: "用 have got 表示擁有。",
    obj: [["form", "have got / has got 的形式"], ["negative-question", "have got 的否定句與疑問句"], ["vs-have", "have got 與 have 的差別"]],
    pre: ["be-verb"] },
  { id: "imperatives", d: 2, title: "命令句", pattern: "Open the door.", summary: "用原形動詞下指示、提出請求或禁止。",
    obj: [["affirmative", "用原形動詞開頭的命令句"], ["negative", "用 Don't 開頭的否定命令"], ["polite", "加 please 與 Let's 的用法"]],
    pre: ["present-simple"] },
  { id: "can-cant", d: 2, title: "情態動詞入門", pattern: "can / can't", summary: "用 can 表達能力、許可與可能。",
    obj: [["ability", "用 can / can't 表達能力"], ["permission", "用 can 請求或給予許可"], ["form", "can 後面接原形動詞，否定與疑問的形式"]],
    pre: ["present-simple"] },
  { id: "future-will-going-to", d: 2, title: "未來表達", pattern: "will / be going to", summary: "分辨 will 與 be going to 表達的未來。",
    obj: [["will-decision", "當下決定與預測用 will"], ["going-to-plan", "已有計畫或有跡象用 be going to"], ["negative-question", "未來式的否定句與疑問句"]],
    pre: ["present-simple"] },
  { id: "prepositions-time-place", d: 2, title: "時間與地點介系詞", pattern: "in / on / at", summary: "用 in、on、at 表示時間與位置。",
    obj: [["time", "時間用 in / on / at 的分別"], ["place", "地點用 in / on / at 的分別"], ["fixed-phrases", "常見固定搭配（at home, in bed）"]] },
  { id: "some-any-much-many", d: 2, title: "量詞", pattern: "some / any / much / many", summary: "依可數、不可數與句型選對量詞。",
    obj: [["some-any", "肯定句用 some，否定與疑問用 any"], ["much-many", "不可數用 much，可數用 many"], ["a-lot-of", "a lot of / lots of 的用法"]],
    pre: ["countable-uncountable"] },
  { id: "countable-uncountable", d: 2, title: "可數與不可數名詞", pattern: "a book / some water", summary: "分辨可數與不可數名詞，並選對量與動詞。",
    obj: [["identify", "判斷名詞可數或不可數"], ["units", "不可數名詞用單位詞（a piece of）"], ["agreement", "不可數名詞搭配單數動詞"]],
    pre: ["noun-plurals"] },
  { id: "comparatives-superlatives", d: 2, title: "比較級與最高級", pattern: "bigger / the biggest", summary: "用 -er、-est 或 more、most 做比較。",
    obj: [["short-adj", "短形容詞加 -er / -est 與拼法"], ["long-adj", "長形容詞用 more / most"], ["irregular", "不規則形式（better, worst）"], ["than-the", "比較級搭配 than，最高級搭配 the"]] },
  { id: "frequency-adverbs", d: 2, title: "頻率副詞", pattern: "always / usually", summary: "用頻率副詞說明多常發生，並放對位置。",
    obj: [["scale", "依頻率高低選擇副詞"], ["position", "副詞在一般動詞前、be 動詞後"]],
    pre: ["present-simple"] },
  { id: "adjectives-adverbs", d: 2, title: "形容詞與副詞", pattern: "careful / carefully", summary: "形容詞修飾名詞，副詞修飾動作。",
    obj: [["adj-noun", "形容詞修飾名詞、放在 be 動詞後"], ["adv-form", "副詞的形成與修飾動作"], ["irregular", "易混淆的 good / well、fast、hard"]] },
  { id: "used-to-past-habit", d: 2, title: "過去習慣 used to", pattern: "I used to play", summary: "用 used to 說過去的習慣或狀態。",
    obj: [["form", "used to + 原形動詞"], ["past-vs-now", "表達過去如此、現在不同"], ["negative-question", "否定與疑問用 didn't use to / Did ... use to"]],
    pre: ["past-simple"] },
  { id: "present-perfect-intro", d: 3, title: "現在完成式入門", pattern: "have done", summary: "用 have / has + 過去分詞連結過去與現在。",
    obj: [["form", "have / has + 過去分詞的形式"], ["experience", "表達經驗（ever, never）"], ["result", "表達與現在有關的結果"], ["for-since", "for 與 since 的用法"]],
    pre: ["past-simple"] },
  { id: "gerund-infinitive-intro", d: 3, title: "動名詞與不定詞入門", pattern: "enjoy doing / want to do", summary: "記住常見動詞後面接 -ing 或 to do。",
    obj: [["verb-ing", "enjoy、finish、mind 等後接動名詞"], ["verb-to", "want、hope、decide 等後接不定詞"], ["both", "like、love、start 兩種皆可"]],
    pre: ["present-simple"] },
  { id: "relative-clauses-basic", d: 3, title: "基本關係子句", pattern: "who / which / that", summary: "用關係子句補充說明人或事物。",
    obj: [["who-which", "人用 who，事物用 which"], ["that", "that 可指人或事物"], ["clause-position", "關係子句緊跟在被修飾的名詞後"]],
    pre: ["present-simple"] },
  { id: "basic-conjunctions", d: 3, title: "基本連接詞", pattern: "and / but / because / so", summary: "用連接詞表示並列、轉折、原因與結果。",
    obj: [["and-but", "and 表並列，but 表轉折"], ["because-so", "分辨 because 表原因、so 表結果"], ["punctuation", "連接詞前後的逗號"]] },
  { id: "passive-basic", d: 3, title: "基本被動語態", pattern: "is made / was built", summary: "當重點是承受動作的人事物時用被動。",
    obj: [["form", "be + 過去分詞的形式"], ["when-passive", "何時用被動而非主動"], ["by-agent", "用 by 說出動作者"]],
    pre: ["past-simple"] },
  { id: "conditionals-basic", d: 3, title: "基本條件句", pattern: "If it rains, ...", summary: "用 if 說明條件與可能的結果。",
    obj: [["if-present", "if 子句用現在式"], ["result-will", "結果用 will + 原形動詞"], ["clause-order", "if 子句在前要加逗號"]],
    pre: ["present-simple", "future-will-going-to"] },
  { id: "reflexive-pronouns", d: 3, title: "反身代名詞", pattern: "myself / themselves", summary: "動作回到自己身上時用反身代名詞。",
    obj: [["forms", "myself、himself、themselves 等形式"], ["same-subject", "主詞與受詞相同時使用"], ["emphasis", "用 by myself 或同位強調"]],
    pre: ["personal-pronouns"] },
  { id: "purpose-to-infinitive", d: 3, title: "表目的的 to do", pattern: "I went out to buy milk.", summary: "用 to + 原形動詞說明做某事的目的。",
    obj: [["to-purpose", "to + 原形動詞表達目的"], ["for-vs-to", "分辨 for + 名詞與 to do"]],
    pre: ["gerund-infinitive-intro"] },
];

const STAGE2: Def[] = [
  { id: "present-perfect-vs-past", d: 4, title: "現在完成式與過去式", pattern: "have done / did", summary: "看事情是否與現在有關，選完成式或過去式。",
    obj: [["finished-time", "有明確過去時間用過去式"], ["present-link", "結果或經驗連到現在用完成式"], ["just-already-yet", "just、already、yet 的用法"]],
    pre: ["present-perfect-intro", "past-simple"],
    hint: "至少一題用 already / yet，但不能只靠關鍵字就猜得到答案。" },
  { id: "present-perfect-continuous", d: 4, title: "現在完成進行式", pattern: "have been doing", summary: "強調動作持續到現在或剛結束。",
    obj: [["form", "have / has been + 動詞-ing 的形式"], ["duration", "表達持續多久（for, since）"], ["recent-result", "近期活動與可見的結果"]],
    pre: ["present-perfect-intro", "present-continuous"] },
  { id: "past-perfect", d: 4, title: "過去完成式", pattern: "had done", summary: "表示在過去某時間點之前已發生的事。",
    obj: [["form", "had + 過去分詞的形式"], ["earlier-past", "兩個過去事件中先發生的一個"], ["vs-past-simple", "分辨過去完成式與一般過去式"]],
    pre: ["present-perfect-intro"] },
  { id: "future-continuous-perfect", d: 4, title: "未來進行式與未來完成式", pattern: "will be doing / will have done", summary: "從未來某個時間點看正在進行或已完成的事。",
    obj: [["future-continuous", "will be doing 表未來某時正在進行"], ["future-perfect", "will have done 表未來某時已完成"], ["by-then", "by + 時間點的搭配"]],
    pre: ["future-will-going-to", "present-perfect-intro"] },
  { id: "modals-deduction", d: 4, title: "情態動詞的推論", pattern: "must / might / can't", summary: "依證據判斷事情有多確定。",
    obj: [["certainty-scale", "must、might、can't 的確定程度"], ["evidence", "根據線索選擇適當的推論"], ["past-deduction", "must have done 等對過去的推論"]],
    pre: ["can-cant"] },
  { id: "passive-advanced", d: 4, title: "被動語態進階", pattern: "has been done", summary: "在各種時態與情態動詞中使用被動。",
    obj: [["perfect-passive", "完成式的被動（has been done）"], ["modal-passive", "情態動詞的被動（must be done）"], ["continuous-passive", "進行式的被動（is being done）"]],
    pre: ["passive-basic"] },
  { id: "conditionals-real", d: 4, title: "真實條件句", pattern: "zero / first conditional", summary: "用條件句談事實與有可能發生的事。",
    obj: [["zero", "零型條件：普遍事實與規律"], ["first", "第一型條件：未來可能的情況"], ["if-vs-when", "分辨 if 與 when"]],
    pre: ["conditionals-basic"] },
  { id: "conditionals-unreal", d: 4, title: "假設條件句", pattern: "second / third conditional", summary: "用條件句談與現實不符或已無法改變的事。",
    obj: [["second", "第二型條件：與現在事實相反（If I were）"], ["third", "第三型條件：與過去事實相反（If I had known）"], ["would-have", "would have done 的結果子句"]],
    pre: ["conditionals-real"] },
  { id: "gerund-vs-infinitive-meaning", d: 4, title: "動名詞與不定詞的意思差異", pattern: "stop doing / stop to do", summary: "同一個動詞接 -ing 或 to do，意思不同。",
    obj: [["stop-remember", "stop、remember、forget 後接不同形式"], ["try-regret", "try、regret、go on 的意思差異"], ["choose-form", "依語意選擇 -ing 或 to do"]],
    pre: ["gerund-infinitive-intro"] },
  { id: "relative-clauses-defining-non", d: 4, title: "限定與非限定關係子句", pattern: "defining / non-defining", summary: "分辨必要資訊與補充資訊，並用對逗號。",
    obj: [["defining", "限定子句提供辨識所需的資訊"], ["non-defining", "非限定子句用逗號補充資訊"], ["omit-relative", "可省略的關係代名詞"]],
    pre: ["relative-clauses-basic"] },
  { id: "reported-speech", d: 4, title: "間接引述", pattern: "reported speech", summary: "轉述別人的話時調整人稱、時態與時間詞。",
    obj: [["backshift", "時態往後推一格"], ["pronoun-time", "人稱與時間詞的轉換"], ["questions-commands", "轉述疑問句與命令"]],
    pre: ["past-simple"] },
  { id: "must-vs-have-to", d: 4, title: "must 與 have to", pattern: "must / have to / don't have to", summary: "分辨義務、必要與不必要。",
    obj: [["obligation", "must 與 have to 表義務的差異"], ["prohibition-no-need", "mustn't 與 don't have to 意思不同"], ["past-had-to", "過去的義務用 had to"]],
    pre: ["can-cant"] },
  { id: "articles-advanced", d: 5, title: "冠詞進階", pattern: "a / the / zero article", summary: "泛指、特指與不加冠詞的情況。",
    obj: [["generic", "泛指類別的幾種說法"], ["abstract-zero", "抽象與不可數名詞通常不加冠詞"], ["fixed-phrases", "固定搭配中的冠詞（in hospital, the sea）"]],
    pre: ["articles-basic"] },
  { id: "verb-preposition", d: 5, title: "動詞加介系詞", pattern: "depend on / belong to", summary: "記住動詞固定搭配的介系詞。",
    obj: [["common-pairs", "常見的動詞加介系詞組合"], ["prep-ing", "介系詞後面接動名詞"], ["with-object", "動詞、受詞、介系詞的順序"]],
    pre: ["prepositions-time-place"] },
  { id: "adjective-preposition", d: 5, title: "形容詞加介系詞", pattern: "interested in / afraid of", summary: "記住形容詞固定搭配的介系詞。",
    obj: [["common-pairs", "常見的形容詞加介系詞組合"], ["prep-ing", "介系詞後面接動名詞或名詞"]],
    pre: ["prepositions-time-place"] },
  { id: "participle-adjectives", d: 5, title: "分詞形容詞", pattern: "boring / bored", summary: "-ing 表造成感受，-ed 表感受到。",
    obj: [["ing-ed", "分辨 -ing 與 -ed 形容詞"], ["cause-feeling", "修飾事物用 -ing，修飾人的感受用 -ed"]],
    pre: ["adjectives-adverbs"] },
  { id: "comparison-advanced", d: 5, title: "比較結構進階", pattern: "as ... as / less ... than", summary: "表達相等、較少與程度的變化。",
    obj: [["as-as", "as ... as 表示相等"], ["less-than", "less ... than 與 the least"], ["the-more", "the more ..., the more ... 的用法"]],
    pre: ["comparatives-superlatives"] },
  { id: "causative-perception-verbs", d: 5, title: "使役與感官動詞", pattern: "make / let / have / get", summary: "受詞後面的動詞形式要跟著動詞選。",
    obj: [["make-let", "make、let 後接原形動詞"], ["have-get", "have 與 get 的使役用法"], ["see-hear", "感官動詞後接原形或 -ing"]],
    pre: ["gerund-infinitive-intro"] },
  { id: "wish-if-only", d: 5, title: "願望與遺憾", pattern: "wish / if only", summary: "用 wish 表達與現實不符的願望。",
    obj: [["wish-present", "對現在的願望用過去式"], ["wish-past", "對過去的遺憾用過去完成式"], ["wish-would", "wish ... would 表達不滿或期望"]],
    pre: ["conditionals-unreal"] },
  { id: "phrasal-verbs", d: 5, title: "片語動詞", pattern: "give up / carry out", summary: "認識動詞加副詞的組合與受詞位置。",
    obj: [["meaning", "常見片語動詞的意思"], ["separable", "可分離片語動詞的受詞位置"], ["inseparable", "不可分離與三字片語動詞"]] },
  { id: "used-to-be-used-to", d: 5, title: "used to / be used to / get used to", pattern: "used to / be used to / get used to", summary: "分辨過去習慣與習慣某事。",
    obj: [["used-to", "used to + 原形動詞表過去習慣"], ["be-used-to", "be used to + -ing 表已經習慣"], ["get-used-to", "get used to + -ing 表逐漸習慣"]],
    pre: ["used-to-past-habit"] },
  { id: "question-tags", d: 5, title: "附加問句", pattern: "isn't it? / don't you?", summary: "在句尾加簡短問句來確認或徵求同意。",
    obj: [["form", "附加問句的助動詞與人稱"], ["polarity", "肯定句接否定尾巴，否定句接肯定尾巴"], ["intonation", "語調決定是確認還是真的在問"]],
    pre: ["do-does-did-questions"] },
  { id: "future-time-clauses", d: 5, title: "未來時間子句", pattern: "when I get home", summary: "時間子句談未來時，動詞不用 will。",
    obj: [["present-for-future", "時間子句用現在式表未來"], ["when-after-before", "when、after、before 的用法"], ["until-as-soon-as", "until、as soon as 的用法"]],
    pre: ["future-will-going-to"] },
  { id: "noun-clauses", d: 6, title: "名詞子句", pattern: "what / whether / that", summary: "用子句當作主詞、受詞或補語。",
    obj: [["that-clause", "that 引導的名詞子句"], ["wh-clause", "疑問詞引導的名詞子句與語序"], ["if-whether", "if / whether 引導的名詞子句"]],
    pre: ["wh-questions"] },
  { id: "participle-clauses-intro", d: 6, title: "分詞子句入門", pattern: "Walking down the street, ...", summary: "用分詞簡化子句，主詞要一致。",
    obj: [["ing-clause", "-ing 分詞子句表主動與同時"], ["ed-clause", "-ed 分詞子句表被動"], ["same-subject", "分詞的意義主詞要與主句主詞一致"]],
    pre: ["participle-adjectives"] },
  { id: "concession-contrast", d: 6, title: "讓步與轉折", pattern: "although / despite / however", summary: "分辨連接詞、介系詞與連接副詞的用法。",
    obj: [["although-despite", "although 接子句，despite 接名詞"], ["however", "however 與 nevertheless 連接兩句"], ["choose-word", "依詞性與標點選對轉折詞"]],
    pre: ["basic-conjunctions"] },
  { id: "negation-quantifiers-advanced", d: 6, title: "否定與量詞進階", pattern: "hardly / few / little", summary: "表達幾乎沒有與數量多寡的細微差別。",
    obj: [["hardly", "hardly、scarcely 的否定意味"], ["few-little", "few 與 little 的用法"], ["a-few", "a few / a little 與 few / little 的差異"]],
    pre: ["some-any-much-many"] },
  { id: "emphasis-do-so-such", d: 6, title: "強調", pattern: "do / so / such", summary: "強調動作與程度。",
    obj: [["emphatic-do", "用助動詞 do 強調動詞"], ["so-such", "so + 形容詞，such + 名詞"], ["result-clause", "so ... that / such ... that 的結果"]] },
  { id: "preposition-meaning", d: 6, title: "介系詞的語意", pattern: "of / for / by / with", summary: "從核心意思理解介系詞的抽象用法。",
    obj: [["of-for", "of 與 for 的核心意思"], ["by-with", "by 與 with 的核心意思"], ["abstract", "從具體關係延伸到抽象用法"]],
    pre: ["prepositions-time-place"] },
  { id: "unless-in-case-as-long-as", d: 6, title: "條件連接詞", pattern: "unless / in case / as long as", summary: "分辨 unless、in case、as long as。",
    obj: [["unless", "unless 等於 if ... not"], ["in-case", "in case 表預防，不同於 if"], ["as-long-as", "as long as 表只要"]],
    pre: ["conditionals-real"] },
  { id: "all-both-each", d: 6, title: "all / both / each", pattern: "all / both / each", summary: "用 all、both、each 指整體或個別。",
    obj: [["all", "all 的位置與搭配"], ["both", "both 與 both of 的用法"], ["each", "each 後面接單數"]],
    pre: ["some-any-much-many"] },
];

const STAGE3: Def[] = [
  { id: "perfect-vs-progressive-nuance", d: 7, title: "完成式與進行式的細微差異", pattern: "has done / has been doing", summary: "從結果或活動的角度選擇動詞形式。",
    obj: [["result-activity", "強調結果或強調活動"], ["speaker-view", "說話者的視角如何影響選擇"], ["stative-limit", "狀態動詞的限制"]],
    pre: ["present-perfect-vs-past", "present-perfect-continuous"] },
  { id: "future-in-the-past", d: 7, title: "過去觀點中的未來", pattern: "was going to / would", summary: "從過去的角度談當時預期的未來。",
    obj: [["was-going-to", "was going to 表未實現的計畫"], ["would", "would 表過去觀點中的未來"], ["was-about-to", "was about to 與其他說法"]],
    pre: ["past-perfect"] },
  { id: "modals-nuance", d: 7, title: "情態動詞的細微語意", pattern: "must / should / would", summary: "分辨推論、義務、委婉與立場的強度。",
    obj: [["strength", "不同情態動詞的強度"], ["politeness", "用情態動詞讓語氣委婉"], ["past-modals", "should have done 等對過去的評論"]],
    pre: ["modals-deduction", "must-vs-have-to"] },
  { id: "mixed-conditionals", d: 7, title: "混合條件句", pattern: "mixed conditionals", summary: "條件與結果發生在不同的時間。",
    obj: [["past-present", "過去的條件造成現在的結果"], ["present-past", "現在的狀況影響過去的結果"], ["implied-if", "沒有 if 的隱含條件"]],
    pre: ["conditionals-unreal"] },
  { id: "impersonal-passive", d: 7, title: "非人稱被動與報導結構", pattern: "It is believed that ...", summary: "用被動句型正式地轉述普遍看法。",
    obj: [["it-that", "It is said that ... 的句型"], ["subject-to-inf", "He is said to ... 的句型"], ["perfect-infinitive", "to have done 表示較早的事"]],
    pre: ["passive-advanced", "reported-speech"] },
  { id: "negative-inversion", d: 7, title: "否定副詞倒裝", pattern: "Rarely have I ...", summary: "否定副詞放句首時，主詞與助動詞倒裝。",
    obj: [["trigger-words", "never、rarely、hardly 等觸發倒裝"], ["aux-order", "助動詞放主詞前"], ["no-sooner", "no sooner ... than 與 hardly ... when"]] },
  { id: "cleft-sentences", d: 7, title: "分裂句", pattern: "What I need is ... / It was ... that", summary: "用分裂句把重點放在想強調的部分。",
    obj: [["it-cleft", "It was ... that 強調某個成分"], ["wh-cleft", "What ... is 強調資訊"], ["contrast", "用分裂句表達對比"]],
    pre: ["emphasis-do-so-such"] },
  { id: "formal-conditional-inversion", d: 7, title: "正式假設與倒裝條件", pattern: "were to / had I known", summary: "省略 if，用倒裝寫出正式的條件句。",
    obj: [["were-to", "Were ... to 與 Should ... 的倒裝"], ["had-inversion", "Had I known ... 的倒裝"], ["formal-register", "什麼情況適合使用倒裝條件"]],
    pre: ["conditionals-unreal"] },
  { id: "formal-it-object", d: 7, title: "形式主詞與形式受詞 it", pattern: "I find it hard to ...", summary: "用 it 暫代長的不定詞或子句。",
    obj: [["formal-subject", "It is + 形容詞 + to do / that"], ["formal-object", "find / make + it + 形容詞 + to do"]] },
  { id: "would-rather-had-better", d: 7, title: "would rather 與 had better", pattern: "would rather / had better", summary: "表達偏好與強烈的建議。",
    obj: [["would-rather", "would rather + 原形動詞或過去式"], ["had-better", "had better + 原形動詞，否定放 not"], ["compare-should", "與 should、ought to 比較"]] },
  { id: "advanced-relative-clauses", d: 8, title: "高級關係子句", pattern: "whose / whom / preposition + which", summary: "使用 whose、介系詞前置等正式關係子句。",
    obj: [["whose", "whose 表所屬"], ["prep-which", "介系詞 + whom / which"], ["sentential", "which 指整個前面的句子"]],
    pre: ["relative-clauses-defining-non"] },
  { id: "nominalization", d: 8, title: "名詞化", pattern: "the rapid expansion of ...", summary: "把動作改成名詞，讓書面語更精簡。",
    obj: [["verb-to-noun", "動詞與形容詞轉成名詞"], ["dense-writing", "用名詞化壓縮資訊"], ["unpack", "把名詞化的句子還原讀懂"]] },
  { id: "participle-reduced-clauses", d: 8, title: "分詞與縮減子句", pattern: "Having completed ..., ...", summary: "用完成分詞與縮減子句表達時間與原因。",
    obj: [["perfect-participle", "Having done 表先發生的動作"], ["reduced-adverbial", "縮減時間與原因副詞子句"], ["dangling", "避免主詞不一致的分詞"]],
    pre: ["participle-clauses-intro"] },
  { id: "stance-adverbs", d: 8, title: "引述立場副詞", pattern: "allegedly / reportedly", summary: "用副詞表明資訊來源與作者的態度。",
    obj: [["source", "reportedly、allegedly 標示資訊來源"], ["attitude", "surprisingly 等表示作者態度"], ["position", "副詞在句子中的位置"]] },
  { id: "ellipsis-substitution", d: 8, title: "省略與替代", pattern: "do so / neither / so do I", summary: "用省略與替代詞避免重複。",
    obj: [["so-neither", "so do I / neither do I 的回應"], ["do-so", "do so、one、ones 的替代"], ["ellipsis", "省略前文已出現的成分"]] },
  { id: "agreement-difficult", d: 8, title: "主詞動詞一致的難點", pattern: "a number of / the number of", summary: "處理集合名詞與很長的主詞的一致問題。",
    obj: [["number-of", "a number of 與 the number of"], ["collective", "集合名詞用單數或複數"], ["long-subject", "找出很長主詞的核心名詞"]] },
  { id: "determiners-reference", d: 8, title: "限定詞與指涉範圍", pattern: "each / every / either / neither", summary: "分辨個體與群體，並選對限定詞。",
    obj: [["each-every", "each 與 every 的差別"], ["either-neither", "either 與 neither 的用法"], ["agreement", "限定詞後的動詞形式"]],
    pre: ["articles-advanced", "all-both-each"] },
  { id: "preposition-abstract", d: 8, title: "介系詞的抽象關係", pattern: "of / in / on / at", summary: "從具體空間延伸理解抽象概念中的介系詞。",
    obj: [["abstract-in-on-at", "in、on、at 用於抽象概念"], ["of-relation", "of 表示的各種關係"], ["boundaries", "語意相近介系詞的界線"]],
    pre: ["preposition-meaning"] },
  { id: "concessive-inversion", d: 8, title: "讓步倒裝", pattern: "Much as I like ..., Try as he might ...", summary: "用倒裝的讓步結構表達儘管如此。",
    obj: [["much-as", "Much as + 主詞 + 動詞 的讓步"], ["adj-as", "形容詞 + as + 主詞 + be 的結構"], ["try-as", "Try as he might 一類固定結構"]],
    pre: ["concession-contrast", "negative-inversion"] },
  { id: "word-order-information-structure", d: 9, title: "語序與資訊結構", pattern: "fronting / end-weight", summary: "依新舊資訊安排語序，長成分放後面。",
    obj: [["old-new", "舊資訊在前，新資訊在後"], ["fronting", "把成分移到句首以強調"], ["end-weight", "較長的成分放在句尾"]],
    pre: ["cleft-sentences"] },
  { id: "discourse-connectors", d: 9, title: "篇章連接", pattern: "whereas / notwithstanding", summary: "用正式連接詞組織對比與讓步。",
    obj: [["contrast", "whereas、while 表對比"], ["concession", "notwithstanding 等正式讓步"], ["logic-flow", "依論述邏輯選擇連接詞"]],
    pre: ["concession-contrast"] },
  { id: "advanced-negation", d: 9, title: "高級否定", pattern: "not least / anything but", summary: "辨認容易誤讀的否定結構。",
    obj: [["anything-but", "anything but、far from 的意思"], ["not-least", "not least、not only 的意思"], ["double-negation", "雙重否定與隱含否定"]],
    pre: ["negation-quantifiers-advanced"] },
  { id: "register-choice", d: 9, title: "語體選擇", pattern: "formal / neutral / informal", summary: "同一個意思，依場合選擇不同的說法。",
    obj: [["formal-informal", "辨別正式與口語的措辭"], ["rewrite-register", "把句子改寫成適合場合的語體"], ["context-fit", "判斷說法是否適合情境"]] },
];

// Related links across stages ("跨級串接"); each edge is symmetric.
const RELATED_EDGES: [string, string][] = [
  ["prepositions-time-place", "verb-preposition"],
  ["prepositions-time-place", "adjective-preposition"],
  ["prepositions-time-place", "preposition-meaning"],
  ["preposition-meaning", "preposition-abstract"],
  ["articles-basic", "articles-advanced"],
  ["articles-advanced", "determiners-reference"],
  ["present-perfect-intro", "present-perfect-vs-past"],
  ["present-perfect-intro", "present-perfect-continuous"],
  ["present-perfect-vs-past", "perfect-vs-progressive-nuance"],
  ["present-perfect-continuous", "perfect-vs-progressive-nuance"],
  ["conditionals-basic", "conditionals-real"],
  ["conditionals-basic", "conditionals-unreal"],
  ["conditionals-real", "conditionals-unreal"],
  ["conditionals-real", "unless-in-case-as-long-as"],
  ["conditionals-unreal", "mixed-conditionals"],
  ["conditionals-unreal", "formal-conditional-inversion"],
  ["conditionals-unreal", "wish-if-only"],
  ["mixed-conditionals", "formal-conditional-inversion"],
  ["passive-basic", "passive-advanced"],
  ["passive-advanced", "impersonal-passive"],
  ["relative-clauses-basic", "relative-clauses-defining-non"],
  ["relative-clauses-defining-non", "advanced-relative-clauses"],
  ["gerund-infinitive-intro", "gerund-vs-infinitive-meaning"],
  ["gerund-infinitive-intro", "purpose-to-infinitive"],
  ["participle-clauses-intro", "participle-reduced-clauses"],
  ["used-to-past-habit", "used-to-be-used-to"],
  ["can-cant", "modals-deduction"],
  ["modals-deduction", "modals-nuance"],
  ["must-vs-have-to", "modals-nuance"],
  ["future-will-going-to", "future-time-clauses"],
  ["countable-uncountable", "some-any-much-many"],
  ["do-does-did-questions", "question-tags"],
  ["emphasis-do-so-such", "cleft-sentences"],
  ["negative-inversion", "concessive-inversion"],
];

function buildRelated(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const l = m.get(a) ?? [];
    if (!l.includes(b)) l.push(b);
    m.set(a, l);
  };
  for (const [a, b] of RELATED_EDGES) {
    add(a, b);
    add(b, a);
  }
  return m;
}

function build(): readonly GrammarTopic[] {
  const related = buildRelated();
  const out: GrammarTopic[] = [];
  const stages: [GrammarStage, Def[]][] = [
    [1, STAGE1],
    [2, STAGE2],
    [3, STAGE3],
  ];
  for (const [stage, defs] of stages) {
    defs.forEach((d, i) => {
      out.push({
        id: d.id,
        stage,
        order: (i + 1) * 10,
        difficulty: d.d,
        title: d.title,
        pattern: d.pattern,
        summary: d.summary,
        objectives: d.obj.map(([id, text]) => ({ id, text })),
        prerequisites: d.pre ?? [],
        related: related.get(d.id) ?? [],
        ...(d.hint ? { promptHint: d.hint } : {}),
      });
    });
  }
  return out;
}

export const GRAMMAR_TOPICS: readonly GrammarTopic[] = build();

const BY_ID = new Map(GRAMMAR_TOPICS.map((t) => [t.id, t]));

export function topicById(id: string): GrammarTopic | undefined {
  return BY_ID.get(id);
}

export function topicsOfStage(stage: GrammarStage): GrammarTopic[] {
  return GRAMMAR_TOPICS.filter((t) => t.stage === stage).sort((a, b) => a.order - b.order);
}

// The compact list the model picks topic ids from: one `id — title（pattern）`
// line per topic, in stage / order sequence.
export function catalogPromptList(): string {
  return GRAMMAR_TOPICS.map((t) => `${t.id} — ${t.title}（${t.pattern}）`).join("\n");
}

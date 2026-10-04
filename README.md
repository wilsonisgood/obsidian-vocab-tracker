# Vocab Tracker

在 Obsidian 讀英文文章時，順手收集單字、查字典、用單字卡複習。可以選擇接上 AI 家教（預設關閉）。

> English summary at the [bottom](#english-summary).

## 主要功能

- **點字收集**：在閱讀模式點任何英文字，從選單加入單字庫（點已經是 `==螢光標記==` 的字會打開側欄；還沒收錄的話，側欄有「＋ 加入單字庫」按鈕）。加入時，插件會把這篇筆記裡**每一處**出現的這個字改成 `==螢光標記==`，並記下出處（筆記與行號）和所在的句子。從單字庫刪除這個字時，會把標記拿掉。
- **自動查字典**：加入單字後，背景會抓英文定義、詞性、中文翻譯，以及同義詞和反義詞（服務列在下面的〈隱私與資料流向〉）。
- **側欄**：列出目前這篇筆記收集的單字、考試字彙的統計，展開單字可以看「資料」和「AI」兩個分頁。
- **單字總表**：`vocab-list/vocab-list.md`（裡面是 `vocab-dashboard` 區塊），欄位可以直接編輯。
- **單字卡**：`vocab-list/單字卡.md`，用 FSRS 排程複習。
- **考試字表**：把托福、雅思、多益等字表放進 vault，閱讀模式會在這些字底下加上彩色虛線，第一次打開筆記時會把字表裡的字自動加入單字庫（見〈考試字表〉）。
- **AI 單字家教（選用）**：針對單字問「用法、比較、造句、記憶法」，或自由提問。支援 Anthropic（Claude）和任何 OpenAI 相容端點（OpenAI、Gemini、Ollama…）。
- **多裝置同步**：單字庫、複習紀錄和 AI 對話放在插件資料夾，用 iCloud、Git 等方式同步時，會合併各裝置的修改，而不是由最後寫入的一方蓋掉另一方。

## 隱私與資料流向

### 總覽

| 什麼時候 | 送出的內容 | 送到哪裡 | 需要 key |
|---|---|---|---|
| 加入單字後、啟動 5 秒後補抓沒有定義的字 | 單字本身 | Wiktionary（`en.wiktionary.org`）、Datamuse（`api.datamuse.com`） | 不用 |
| 同上 | 抓到的英文定義（要翻成中文） | Google 翻譯的非官方端點（`translate.googleapis.com`）；失敗時改用 MyMemory（`api.mymemory.translated.net`） | 不用 |
| 你在 AI 分頁按快捷鈕或送出問題 | 見下方〈AI 會送出哪些文字〉 | 你在設定選的服務：Anthropic（`api.anthropic.com`），或你填的 OpenAI 相容 Base URL | Anthropic 需要；OpenAI 相容端點可以不填（例如本機 Ollama） |
| 你在設定按「測試連線」 | 每個設定的模型各送一次 `ping` | 同上 | 同上 |

除此之外，插件不會連到其他地方，也沒有任何統計或追蹤。發音用的是裝置內建的語音合成；唯一的例外是舊版插件查過字典、單字資料裡存有發音檔網址的單字，按發音時會從那個網址播放（播放失敗才改用語音合成）。

字典與翻譯不受「啟用 AI」開關控制，加入單字後就會查詢；送出的只有單字和它的英文定義，不包含筆記內容。

### AI：預設關閉，只在你按下時送出

- 「設定 › Vocab Tracker › AI › 啟用 AI」預設關閉。關閉時，提問和快捷鈕都不會送出任何內容。唯一的例外是「測試連線」：開關關著也能按，方便你先確認設定。
- AI 只會在你按下快捷鈕、送出問題或「重試」時發出請求，沒有任何背景的 AI 呼叫。
- 沒有 key、或 AI 關閉時，AI 以外的功能（收集單字、字典、側欄、單字卡、考試字表）都照常可以用。

### AI 會送出哪些文字

在某個單字的「AI」分頁提問時，一次請求包含：

1. **固定的指示**：插件內建的家教規則，每次都一樣，不含你的資料。
2. **這個單字的資料**：單字、音標、詞性、中文、英文定義、同義詞、反義詞，以及你在「文法提示」欄寫的內容。空白的欄位不送。
3. **出處段落**：插件會打開單字的出處筆記，送出**單字所在的那一整段**（不是只有那一句；段落以空行分隔，沒有空行的筆記可能整篇被當成一段送出），以及**筆記的檔名**（不含資料夾路徑）。找不到出處筆記或那一行時，改送單字卡上存的例句。
4. **學習者設定**：程度、目標、回答語言、回答長度，和「其他補充」欄位的原文。這一塊的內容會完整顯示在「設定 › 學習者設定 › AI 會看到」，送出的就是那段文字。
5. **對話歷史**：同一個單字之前最多 6 輪的問答（你當時送出的內容和 AI 的回答）。失敗的那幾輪不送。
6. **這次的問題**：你打的問題，或快捷鈕的任務說明。
7. **反白的文字**：你最近一次在任一篇筆記（閱讀模式或編輯模式）反白的文字，最多 1,500 個字元。它會先顯示在輸入框上方的「選取：『…』」，可以按 × 不附上；送出一次後，下一個問題就不會再附上，要重新反白才會再出現。不過附上過的選取文字會留在那一輪的對話裡，之後最多 6 輪會隨著對話歷史再送出。

**不會**送出：其他筆記（除了第 7 項你反白附上的文字）、整篇出處筆記（只送那一段）、單字庫裡的其他單字、複習紀錄、vault 名稱或資料夾路徑，以及上面第 4 項學習者設定以外的其他設定。API key 只會放在請求的驗證 header 裡，送到你選的那個服務，不會出現在 prompt 內容中。

> 段落討論的介面還沒推出。程式裡已經寫好的段落 prompt 會送出整篇筆記（太長時只送該段前後各 3 段），推出時會在這裡補上說明。

### AI 服務端怎麼處理你的資料

送出的內容由你選的服務處理，適用該服務自己的資料政策（Anthropic、OpenAI、Google 等）。如果用的是本機的 Ollama（`http://localhost:11434/v1`），請求不會離開你的電腦。

### API key 存在哪裡

依你的 Obsidian 版本而定，設定頁「API key」欄位的說明會寫出目前是哪一種：

- **Obsidian 1.11.4 以上**：存在 Obsidian 的機密儲存（SecretStorage），只在這台裝置，**不會**寫進 `data.json`。每台裝置要各自輸入一次。
- **更舊的版本**：存在插件的 `data.json`（`.obsidian/plugins/vocab-tracker/data.json`），**是明文**。如果你的同步方式會同步插件資料夾（iCloud、Git、Syncthing 等；Obsidian Sync 開啟社群插件的同步設定時，`data.json` 也會同步），**key 會跟著同步到其他裝置**；把 vault 或插件資料夾分享給別人時，key 也會一起給出去。
- 從舊版 Obsidian 升級上來、原本存在 `data.json` 的 key 會繼續使用；在新版重新輸入一次，就會搬進機密儲存，並把 `data.json` 裡的那份清掉。

「測試連線」會顯示請求與回應的內容，方便排查問題。分享之前請注意：

- 只有驗證類的 header（`Authorization`、`x-api-key`、`x-goog-api-key`、`api-key`）會遮起來，而且會保留 key 的前 6 碼、後 4 碼和總長度（例如 `sk-ant…AbCd [108]`），方便辨認用的是哪一把。
- 其他內容原樣顯示。**不要把 key 寫進 Base URL 的 query（例如 `?key=…`）**，那部分不會被遮。

### 建議：用專用 key，並設定用量上限

1. **為這個插件另開一把專用的 API key**，不要和其他程式共用。外洩時只要撤銷這一把。
2. **在服務商的後台設定花費或用量上限**（例如在 Anthropic Console 設定每月花費上限）。這是唯一能真正擋住費用的地方。
3. **插件內的「每月 token 上限」**（設定 › AI）：本月用量到達上限後，插件就不再送出請求，直到下個月。0 代表不限。要注意：
   - 這是插件自己算的，不是服務商的帳單。快取讀取的 token 以 1/10 計；OpenAI 相容端點沒有回報用量時，以字數估算。
   - 每次送出前檢查，所以讓用量越過上限的那一次請求仍會完成，下一次才會被擋。
   - 用量依裝置分開記錄在 `store/usage.json`，上限比較的是所有已同步裝置的合計。
   - 設定頁的「用量」會顯示本月與今天的用量。

### 資料存在哪裡

全部在你的 vault 裡，插件沒有自己的伺服器：

| 位置 | 內容 |
|---|---|
| `.obsidian/plugins/vocab-tracker/data.json` | 單字庫與設定（舊版 Obsidian 也包含 API key） |
| `.obsidian/plugins/vocab-tracker/store/threads.json` | AI 對話：你的問題、附上的選取文字、實際送出的訊息和 AI 的回答 |
| `.obsidian/plugins/vocab-tracker/store/reviews.json` | 單字卡複習紀錄 |
| `.obsidian/plugins/vocab-tracker/store/usage.json` | AI 每日用量（依裝置） |
| `.obsidian/plugins/vocab-tracker/store/imports.json` | 哪些筆記已經自動匯入過考試字彙 |
| `.obsidian/plugins/vocab-tracker/backup/` | 資料格式升級前的備份 |
| `vocab-list/vocab-list.md`、`vocab-list/單字卡.md` | 單字總表與單字卡的入口筆記 |

（`.obsidian` 是預設的設定資料夾名稱；如果你改過，就在你設定的那個資料夾裡。）

## 考試字表

把考試字表（托福、雅思、多益、全民英檢…）放進 vault，插件會：

- 在**閱讀模式**用彩色虛線標出筆記裡屬於字表的字，滑過去可以看到屬於哪些字表；
- 在側欄顯示這篇筆記有多少個考試字；
- 第一次打開筆記時，把裡面的考試字自動加入單字庫，並在「程度」欄標上考試名稱。

### 放在哪裡

- 預設資料夾是 vault 根目錄的 **`vocab-wordlists/`**，可以在「設定 › 考試字表 › 字表資料夾」修改。子資料夾裡的檔案也會讀。
- **一個檔案就是一份字表**。支援 `.md`、`.txt`、`.csv`、`.tsv`。
- 檔名開頭是 `_` 的檔案，以及名為 `README` 的檔案會略過，可以拿來寫說明。
- 新增、修改、刪除字表檔案會自動重新載入；也可以在設定頁按「重新載入」，或用指令「重新載入考試字表」。

### 檔名就是標籤

| 檔名 | 標籤 | 畫面和「程度」欄顯示 |
|---|---|---|
| `TOEFL.md` | `TOEFL` | TOEFL |
| `exam-TOEFL.md` | `exam/TOEFL` | TOEFL |
| `exam-GEPT-中級.txt` | `exam/GEPT-中級` | GEPT-中級 |

- 檔名裡的**第一個** `-` 會變成標籤的層級 `/`，畫面上只顯示最後一層。
- 想用別的標籤，可以在字表檔案開頭的 frontmatter 寫 `tag: exam/TOEFL`，會取代檔名推出來的標籤。
- 同一個標籤可以分成好幾個檔案。
- 托福、雅思、多益、全民英檢、GRE／GMAT／SAT 有固定的顏色，其他標籤自動配色。每份字表的顏色和開關可以在「設定 › 考試字表 › 已載入的字表」調整；關掉的字表不畫底線，也不會被拿來自動加入單字或標考試。

### 字表的格式

一行一個字。插件從每一行取**第一個英文單字**，後面的詞性、音標、中文解釋都會略過，所以從講義或 PDF 貼過來的字表通常可以直接用：

```text
abandon v. 放棄
- ability n. 能力
1. absorb 吸收
- [ ] accurate
| academic | adj. | 學術的 |
achieve,達成,v.
```

- 會自動處理：清單符號（`-`、`*`、`+`）、核取方塊（`- [ ]`）、編號（`1.`、`1)`、`1、`）、表格（只取第一欄）、CSV／TSV（只取第一欄，分隔符號可以是 `,`、Tab、`|`、`;`）、`[[連結]]`、`**粗體**`、引號。
- 會略過：空行、`#` 開頭的行（標題）、`//` 開頭的行、表格分隔線、程式碼區塊（```` ``` ````、`~~~`）裡的內容、frontmatter。
- 大小寫不分，重複的字只算一次。
- **不支援片語**：`take off` 這種多個英文字的行會被略過（除非第二個字是 `n`、`v`、`adj` 這類詞性縮寫）。
- 「比對詞形變化」（預設開啟）讓 `analyzed`、`analyzing`、`analyzes` 也算 `analyze`。只處理規則變化（-s、-es、-ed、-ing、-ies、-ied、-ly、`'s`），不處理 `went → go` 這類不規則變化。

### 閱讀模式的底線

- **只出現在閱讀模式**，編輯模式和即時預覽沒有。
- **只是畫面上的裝飾，不會修改筆記的內容**。關掉底線或刪掉字表，筆記不會留下任何痕跡。
- 程式碼、連結、標籤、數學式、`==螢光標記==`、frontmatter 和插件自己的區塊不畫底線。
- 用指令「切換考試字彙底線」、設定頁的「標示字表單字」，或點側欄的考試標籤，可以開關底線。

### 自動加入單字庫

- 「設定 › 考試字表 › 自動加入考試字彙」預設開啟。
- **每篇筆記只自動匯入一次**：第一次打開時，把筆記裡屬於字表的字全部加入單字庫，「程度」欄標上考試名稱（例如 `TOEFL, IELTS`），例句用該字第一次出現的那一句。之後再打開、或筆記後來新增了內容，都不會再自動匯入。
- 只要已經載入任何字表，筆記一打開就會被記為「已匯入」，**就算裡面沒有考試字也一樣**。所以新增一份字表之後，在那之前就打開過的筆記不會自動補上新字表的字，要用下面的指令手動匯入。
- 想對同一篇再匯入一次，用指令「把本篇的考試字彙加入單字庫」。
- 已經在單字庫裡的字不會重複加入，只會在「程度」欄補上考試名稱。
- **刪掉的字不會回來**：已經匯入過的筆記不會再匯入，所以你刪掉的字不會因為重新打開筆記又出現；刪除後 30 天內，其他筆記的自動匯入和上面的指令也會跳過它。（30 天後刪除紀錄會被清掉，這時才第一次打開、而且含有這個字的筆記，還是會把它加回來。）
- 自動加入的字**不會**在筆記裡加上 `==螢光標記==`，筆記內容不變。
- 字表資料夾和 `vocab-list/` 裡的筆記不會被匯入。
- 新加入的字會在背景逐一查字典（每個字間隔約 0.4 秒），所以一次匯入很多字時，定義會慢慢補上。

## English summary

**Vocab Tracker** lets you click English words in reading view to build a vocabulary list, auto-fetches definitions, reviews them with FSRS flashcards, underlines exam-list words, and (optionally) discusses words with an AI tutor.

**Privacy**

- **Dictionary/translation (always on, no key):** the word is sent to Wiktionary and Datamuse; its English definition is sent to Google Translate's unofficial endpoint (fallback: MyMemory). No note content is sent.
- **AI (off by default):** nothing is sent until you enable AI and press a quick action / send a question (or click "Test connection", which sends `ping`). A word question sends: the built-in tutor instructions, the word's fields (incl. your "grammar note"), the **full source paragraph and the note's file name**, your learner profile (shown verbatim under *Learner settings › What the AI sees*), up to the last 6 rounds of that word's conversation (including selections attached in those rounds), your question, and your most recent text selection in any note (max 1,500 characters; shown above the composer and removable with ×). The API key only travels in the auth header to that provider. Requests go only to the provider you chose: Anthropic, or the OpenAI-compatible base URL you entered (OpenAI, Gemini, a local Ollama…).
- **API key storage:** on Obsidian 1.11.4+ the key is kept in Obsidian's SecretStorage on that device only (not in `data.json`; enter it once per device). On older versions it is stored **in plain text** in the plugin's `data.json` and **syncs with your vault** if your sync includes the plugin folder.
- **Recommended:** create a dedicated key for this plugin, set a spend limit in your provider's console, and set the plugin's *Monthly token limit* (Settings › AI; counted by the plugin, cache reads weighted 1/10, checked before each request).
- Without a key, every non-AI feature keeps working.
- All data stays in your vault (`.obsidian/plugins/vocab-tracker/data.json` and `store/*.json`, plus `vocab-list/`).

**Exam word lists:** put one file per list in `vocab-wordlists/` (`.md`/`.txt`/`.csv`/`.tsv`); the file name is the tag (`exam-TOEFL.md` → `exam/TOEFL`, shown as "TOEFL"; override with frontmatter `tag:`). Each line contributes its first English word; part of speech, phonetics and translations after it are ignored; multi-word phrases are skipped. Underlines appear in reading view only and never modify your notes. The first time a note is opened, its list words are added to your vocab list once; words you delete don't come back from that note (and for 30 days not from any note).

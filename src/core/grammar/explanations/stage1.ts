// Built-in 「說明」 for stage-1 grammar topics (第十六波 C, 1013-2): written once
// here so no learner has to generate them. Original wording and examples.
export const STAGE1_EXPLANATIONS: Readonly<Record<string, string>> = {
  "be-verb": `**核心概念**
be 動詞（be verb）是英文最基本的動詞，用來說明「誰是什麼」「誰處於什麼狀態」「誰有什麼特徵」。它會依主詞改變形式：I 搭配 am，he / she / it 和單數名詞搭配 is，you / we / they 和複數名詞搭配 are。

**句型**
- \`主詞 + am / is / are + 名詞或形容詞\`：描述身分、狀態與特徵。
- \`主詞 + am / is / are + not\`：否定句，not 放在 be 動詞後面。
- \`Am / Is / Are + 主詞 ...?\`：疑問句，把 be 動詞移到句首。

**例句**
- I am a student.——我是學生。
- Your shoes are very clean.——你的鞋子很乾淨。
- Is the soup hot?——這碗湯燙嗎？

**容易犯的錯**
- ❌ She are my sister. ✅ She is my sister. 主詞是 she，要搭配 is。
- ❌ They not are late. ✅ They are not late. 否定的 not 要放在 be 動詞之後。
- ❌ You are happy? ✅ Are you happy? 疑問句要把 be 動詞放到句首。`,

  "personal-pronouns": `**核心概念**
人稱代名詞（personal pronoun）用來代替前面提過的人或事物，避免重複。同一個「人」會因為在句子裡的角色不同而換形式：做主詞用主格，做動詞或介系詞的受詞用受格，表示「誰的」用所有格或所有代名詞。

**句型**
- 主格：\`I / you / he / she / it / we / they\`，放在動詞前面當主詞。
- 受格：\`me / you / him / her / it / us / them\`，放在動詞或介系詞後面。
- 所有格：\`my / your / his / her / its / our / their\` 後面要接名詞；所有代名詞：\`mine / yours / his / hers / ours / theirs\` 單獨使用，不接名詞。

**例句**
- Mia lost her keys, so I helped her look for them.——Mia 弄丟了鑰匙，所以我幫她找。
- This bag is mine, not yours.——這個包包是我的，不是你的。
- We love our dog, and he loves us too.——我們愛我們的狗，牠也愛我們。

**容易犯的錯**
- ❌ Me and him are friends. ✅ He and I are friends. 當主詞要用主格 he、I。
- ❌ This is my. ✅ This is mine. 後面沒有名詞時要用 mine，不能用 my。
- ❌ Give the book to I. ✅ Give the book to me. 介系詞後面要用受格。`,

  "noun-plurals": `**核心概念**
可數名詞（countable noun）有單數和複數，說到兩個以上就要用複數形。大多數名詞直接加 -s，但有些詞尾要變化，還有一些不規則的字要另外記。

**句型**
- 一般規則：\`book → books\`，直接加 -s。
- 詞尾是 s, x, ch, sh 加 -es：\`box → boxes\`；子音加 y 去 y 加 -ies：\`baby → babies\`。
- 不規則：\`child → children\`、\`man → men\`、\`foot → feet\`；\`sheep\` 單複數同形；\`people\` 本身就是複數。
- 數量詞後面：\`one book\` 用單數，\`two books\`、\`many books\` 用複數。

**例句**
- There are three boxes on the table.——桌上有三個箱子。
- The children are playing with two puppies.——孩子們正在和兩隻小狗玩。
- Many people take the bus here.——這裡很多人搭公車。

**容易犯的錯**
- ❌ two book ✅ two books。two 以上的數量，名詞要用複數。
- ❌ childs ✅ children。child 是不規則複數，不能加 -s。
- ❌ babys ✅ babies。子音加 y 結尾，要改成 -ies。
- ❌ The people is kind. ✅ The people are kind. people 是複數，動詞用 are。`,

  "articles-basic": `**核心概念**
冠詞（article）放在名詞前面，告訴對方這個名詞是「任何一個」還是「特定的那個」。a / an 用在第一次提到、不特定的單數可數名詞；the 用在說話雙方都知道是哪一個的時候。

**句型**
- \`a + 子音開頭的發音\`：a book、a university（u 唸成 /ju/，是子音）。
- \`an + 母音開頭的發音\`：an apple、an hour（h 不發音）。看的是發音，不是字母。
- \`I saw a dog. The dog was big.\`：第一次提到用 a，再次提到用 the。
- 獨一無二的東西用 the：\`the sun\`、\`the moon\`。

**例句**
- I bought an umbrella yesterday.——我昨天買了一把傘。
- She has a cat. The cat likes fish.——她養了一隻貓。那隻貓愛吃魚。
- Please close the window.——請把窗戶關上。

**容易犯的錯**
- ❌ a apple ✅ an apple。apple 以母音發音開頭，要用 an。
- ❌ an university ✅ a university。university 開頭唸 /ju/，是子音，要用 a。
- ❌ I have a dog. A dog is brown. ✅ I have a dog. The dog is brown. 再次提到同一隻，要用 the。

**和相關主題的差別**
- 冠詞進階：基礎只處理 a / an / the 的選擇；進階會談沒有冠詞（零冠詞）等更細的用法。`,

  "demonstratives": `**核心概念**
指示詞（demonstrative）用來「指出」某個人事物，依距離和數量分成四個：近處的單數 this、近處的複數 these、遠處的單數 that、遠處的複數 those。

**句型**
- \`this / that + 單數名詞\`：this pen、that house。
- \`these / those + 複數名詞\`：these shoes、those trees。
- 單獨當代名詞：\`This is my room.\`、\`Are those yours?\`，後面不接名詞。

**例句**
- This cup is mine, and that one is yours.——這個杯子是我的，那個是你的。
- These apples are fresh, but those are old.——這些蘋果很新鮮，那些是舊的。
- What is that?——那是什麼？

**容易犯的錯**
- ❌ These book is new. ✅ This book is new. 單複數要和名詞一致，book 是單數就用 this。
- ❌ Those is my bag. ✅ That is my bag. 單數用 that；複數的 those 要搭配 are。
- ❌ I like this shoes. ✅ I like these shoes. shoes 是複數，要用 these。`,

  "there-is-are": `**核心概念**
存在句用來說「某個地方有某樣東西」，開頭是 there，後面接 be 動詞。這裡的 there 只是引出句子，真正的主詞是 be 動詞後面的名詞，所以動詞 is / are 要和後面的名詞一致。

**句型**
- \`There is + 單數名詞\` / \`There are + 複數名詞\`：There is a cat on the sofa.
- 否定：\`There is not (isn't) ...\`、\`There are not (aren't) ...\`，也可以用 no。
- 疑問：\`Is there ...?\`、\`Are there ...?\`，回答 Yes, there is. / No, there aren't.
- 與 have 不同：存在句說「某處有某物」；have 說「某人擁有某物」。

**例句**
- There is a bank near the station.——車站附近有一間銀行。
- There are two eggs in the fridge.——冰箱裡有兩顆蛋。
- Are there any chairs in the room?——房間裡有椅子嗎？

**容易犯的錯**
- ❌ There is three books on the desk. ✅ There are three books on the desk. 後面是複數，要用 are。
- ❌ Is there some students? ✅ Are there any students? 名詞是複數，疑問句通常用 any。
- ❌ In my room has a desk. ✅ There is a desk in my room. 說「某處有某物」要用 there is，不能拿地點當主詞配 has。`,

  "present-simple": `**核心概念**
一般現在式（present simple）用來說習慣、事實，以及固定不變的狀態，不強調「現在這一刻」正在做什麼。常搭配 always、every day、often 這類表示頻率的詞。

**句型**
- \`主詞 + 原形動詞\`：I work, they live。
- 第三人稱單數（he / she / it）動詞加 -s 或 -es：\`she works\`、\`he watches\`、\`it carries\`（子音加 y 改 -ies）。
- 否定與疑問要借助 do / does：\`I do not work.\`、\`Does she work?\`，這時動詞回到原形。

**例句**
- My brother plays tennis every Sunday.——我哥哥每個週日打網球。
- Water boils at 100 degrees Celsius.——水在攝氏一百度沸騰。
- Do you live near here?——你住在這附近嗎？

**容易犯的錯**
- ❌ He go to school by bus. ✅ He goes to school by bus. 第三人稱單數動詞要加 -es。
- ❌ She doesn't likes tea. ✅ She doesn't like tea. 有 doesn't 之後動詞用原形。
- ❌ Does he works here? ✅ Does he work here? 疑問句的 does 已經帶了 -s，動詞不用再加。`,

  "present-continuous": `**核心概念**
現在進行式（present continuous）說的是「此刻正在進行」或「這段時間暫時如此」的動作，由 be 動詞加上動詞的 -ing 形式組成。它和一般現在式不同：現在式談習慣和事實，進行式談正在發生的事。

**句型**
- \`am / is / are + 動詞-ing\`：I am reading.
- 否定：\`is not (isn't) working\`；疑問：\`Are you working?\`
- 動詞-ing 的拼法：\`make → making\`（去 e）、\`run → running\`（重複尾字母）。
- 狀態動詞（stative verb）如 know、like、want、love 通常不用進行式，直接用現在式。

**例句**
- Look! It is raining outside.——你看！外面正在下雨。
- I am staying with my aunt this week.——我這週暫時住在阿姨家。
- She wants a glass of water.——她想要一杯水。

**容易犯的錯**
- ❌ She is read a book. ✅ She is reading a book. be 動詞後面要接 -ing。
- ❌ I am knowing the answer. ✅ I know the answer. know 是狀態動詞，通常不用進行式。
- ❌ He is runing. ✅ He is running. 短母音加單子音結尾，-ing 前要重複字母。`,

  "past-simple": `**核心概念**
一般過去式（past simple）用來說已經結束的過去事件或狀態，通常有明確的過去時間，例如 yesterday、two days ago、last week。

**句型**
- 規則動詞加 -ed：\`work → worked\`；e 結尾只加 -d：\`like → liked\`；子音加 y 改 -ied：\`study → studied\`。
- 常見不規則動詞要個別記：\`go → went\`、\`see → saw\`、\`buy → bought\`、\`have → had\`。
- be 動詞的過去式：\`was / were\`。

**例句**
- We visited my grandmother last weekend.——我們上週末去探望了奶奶。
- He bought a new phone two days ago.——他兩天前買了新手機。
- I was tired after the trip.——旅行之後我很累。

**容易犯的錯**
- ❌ I goed to the park. ✅ I went to the park. go 是不規則動詞，過去式是 went。
- ❌ She studyed hard. ✅ She studied hard. 子音加 y 結尾要改成 -ied。
- ❌ I see him yesterday. ✅ I saw him yesterday. 有 yesterday 這類過去時間詞，動詞要用過去式。`,

  "do-does-did-questions": `**核心概念**
助動詞（auxiliary verb）do、does、did 幫一般動詞造否定句和疑問句。現在式用 do / does，過去式用 did。這三個字已經負責表示時態和人稱，所以後面的動詞一律回到原形。

**句型**
- 否定：\`主詞 + don't / doesn't / didn't + 原形動詞\`。
- 疑問：\`Do / Does / Did + 主詞 + 原形動詞 ...?\`
- 簡答：\`Yes, I do.\`、\`No, she doesn't.\`、\`Yes, they did.\`，不用重複整個動詞。
- 主詞是 he / she / it 時用 does；過去式不分人稱，都用 did。

**例句**
- I don't eat meat.——我不吃肉。
- Does your sister speak French?——你姊姊會說法文嗎？ No, she doesn't.——不，她不會。
- Did they arrive on time?——他們準時到了嗎？

**容易犯的錯**
- ❌ She doesn't likes coffee. ✅ She doesn't like coffee. doesn't 後面動詞用原形。
- ❌ Did you went there? ✅ Did you go there? did 已經表示過去，動詞用原形。
- ❌ You like pizza? Yes, I like. ✅ Do you like pizza? Yes, I do. 疑問句要加 do，簡答用助動詞。

**和相關主題的差別**
- 附加問句：附加問句也用 do / does / did 在句尾確認，是這個主題的延伸。`,

  "possessive-s": `**核心概念**
所有格 's 用來表示「誰的」，也就是某人或某物擁有、所屬的關係。它加在名詞後面，後面再接被擁有的東西。

**句型**
- 單數名詞加 's：\`Tom's book\`、\`my mother's car\`。
- 以 -s 結尾的複數名詞只加撇號 '：\`the boys' room\`（男孩們的房間）。
- 不規則複數沒有 -s，仍然加 's：\`the children's toys\`。
- 通常人或動物用 's；東西常用 of：\`the door of the room\`。

**例句**
- This is Anna's umbrella.——這是 Anna 的傘。
- The students' bags are in the hall.——學生們的書包在走廊上。
- What is the name of this street?——這條街叫什麼名字？

**容易犯的錯**
- ❌ the girls book ✅ the girl's book。單數名詞要加 's。
- ❌ the childrens' toys ✅ the children's toys。children 不以 -s 結尾，加 's。
- ❌ the leg of Tom ✅ Tom's leg。表示人的所屬，通常用 's 比 of 自然。
- ❌ The dog wagged it's tail. ✅ The dog wagged its tail. it's 是 it is 的縮寫，表示「它的」要用 its。`,

  "wh-questions": `**核心概念**
疑問詞（wh- word）用來問具體的資訊，而不是只問 Yes 或 No。依想問的內容選字：what（什麼）、where（哪裡）、who（誰）、when（何時）、why（為什麼）、how（如何）。

**句型**
- \`疑問詞 + 助動詞或 be 動詞 + 主詞 + ...?\`：Where do you live? / What is your name?
- 疑問詞放句首，後面的語序是疑問句語序，不是直述句語序。
- 疑問詞本身當主詞時，不需要助動詞，直接接動詞：\`Who lives here?\`

**例句**
- Where do you work?——你在哪裡工作？
- Why is she late today?——她今天為什麼遲到？
- Who broke the window?——誰打破了窗戶？

**容易犯的錯**
- ❌ Where you live? ✅ Where do you live? 一般動詞要加 do 才能造問句。
- ❌ What you are doing? ✅ What are you doing? 疑問詞後面接疑問句語序，be 動詞放主詞前。
- ❌ Who does live here? ✅ Who lives here? who 當主詞時不加 does，動詞照第三人稱單數變化。`,

  "have-got": `**核心概念**
have got 和 have 都可以表示「擁有」，例如擁有物品、家人、特徵或症狀。have got 在日常口語很常見，意思和表示擁有的 have 相同。

**句型**
- 肯定：\`I have got (I've got)\`、\`she has got (she's got)\`。
- 否定：\`I haven't got\`、\`she hasn't got\`；疑問：\`Have you got ...?\`、\`Has he got ...?\`，直接把 have / has 移到前面。
- 與 have 的差別：have 的否定和疑問要借助 do / does（\`I don't have\`、\`Do you have\`）；have got 則不用。

**例句**
- I've got two brothers.——我有兩個哥哥（弟弟）。
- She hasn't got a car.——她沒有車。
- Have you got a pen?——你有筆嗎？

**容易犯的錯**
- ❌ She have got a cold. ✅ She has got a cold. 主詞是 she，要用 has。
- ❌ Do you have got a pen? ✅ Have you got a pen? / Do you have a pen? 兩種形式不能混在一起。
- ❌ I haven't a dog. ✅ I haven't got a dog. / I don't have a dog. 否定要用 haven't got 或 don't have。`,

  "imperatives": `**核心概念**
命令句（imperative）用來下指示、提出請求、給建議或表示禁止。它以原形動詞開頭，通常不說主詞，因為默認就是對「你」說。

**句型**
- 肯定：\`原形動詞 + ...\`：Open the window.
- 否定：\`Don't + 原形動詞 + ...\`：Don't touch it.
- 加 please 讓語氣更客氣：\`Please sit down.\` 或 \`Sit down, please.\`
- 邀請對方一起做：\`Let's + 原形動詞\`：Let's go home.

**例句**
- Turn off your phone, please.——請把你的手機關掉。
- Don't forget your keys.——別忘了你的鑰匙。
- Let's have lunch together.——我們一起吃午餐吧。

**容易犯的錯**
- ❌ You open the door. ✅ Open the door. 命令句通常省略主詞。
- ❌ Not touch the stove. ✅ Don't touch the stove. 否定命令要用 Don't 開頭。
- ❌ Let's to go. ✅ Let's go. Let's 後面直接接原形動詞，不加 to。
- ❌ Don't late. ✅ Don't be late. be 動詞的命令句也要用原形 be，否定時是 Don't be。`,

  "can-cant": `**核心概念**
情態動詞（modal verb）是放在動詞前面、增加意義的助動詞。can 最常用來表達能力（會做某事），也用來請求或給予許可，以及說明可能。它在所有人稱都長一樣，不加 -s。

**句型**
- 肯定：\`主詞 + can + 原形動詞\`：She can swim.
- 否定：\`can't (cannot) + 原形動詞\`：I can't drive.
- 疑問：\`Can + 主詞 + 原形動詞 ...?\`，簡答 Yes, I can. / No, I can't.
- 許可與請求：\`Can I sit here?\`（我可以坐這裡嗎）、\`You can use my pen.\`（你可以用我的筆）。

**例句**
- My little sister can ride a bike.——我妹妹會騎腳踏車。
- Can I borrow your eraser?——我可以借你的橡皮擦嗎？
- He can't speak Japanese.——他不會說日文。

**容易犯的錯**
- ❌ She cans swim. ✅ She can swim. can 不隨人稱變化，不加 -s。
- ❌ I can to swim. ✅ I can swim. can 後面直接接原形動詞，不加 to。
- ❌ Does he can swim? ✅ Can he swim? 疑問句把 can 移到句首，不用 do / does。

**和相關主題的差別**
- 情態動詞的推論：can 在基礎談能力與許可；推論（猜測）用法如 must be、can't be 會在後面的主題學到。`,

  "future-will-going-to": `**核心概念**
英文有好幾種說未來的方式，基礎階段先學 will 和 be going to。will 常用於說話當下才做的決定、臨時的提議和單純的預測；be going to 用於事前已經打算好的計畫，或根據眼前跡象判斷即將發生的事。

**句型**
- \`will + 原形動詞\`：I'll help you.（當下決定）
- \`am / is / are going to + 原形動詞\`：We are going to visit Kyoto.（已有計畫）
- 否定：\`will not (won't)\`、\`is not going to\`；疑問：\`Will you ...?\`、\`Are you going to ...?\`
- 有跡象的預測用 be going to：\`Look at the clouds. It is going to rain.\`

**例句**
- It's cold in here. I'll close the window.——這裡好冷，我來把窗戶關上。
- I'm going to start a new job next month.——我下個月要開始一份新工作。
- Will it snow tomorrow?——明天會下雪嗎？

**容易犯的錯**
- ❌ She will goes tomorrow. ✅ She will go tomorrow. will 後面動詞用原形。
- ❌ I will to call you. ✅ I will call you. will 後面不加 to。
- ❌ He is going to visits us. ✅ He is going to visit us. going to 後面也是原形動詞。

**和相關主題的差別**
- 未來時間子句：在 when、after 這類子句中，未來的事要用現在式，不用 will，這會在後面的主題學到。`,

  "prepositions-time-place": `**核心概念**
in、on、at 是最常用的三個介系詞（preposition），可以用來表示時間，也可以表示地點。共通的概念是：in 指「在一個範圍裡面」，on 指「在某個表面或某一天」，at 指「在一個點上」。

**句型**
- 時間：\`in + 月份、年、季節、一天中的時段\`（in May, in 2024, in the morning）；\`on + 日期、星期\`（on Monday, on May 5）；\`at + 時刻\`（at 7:30, at noon, at night）。
- 地點：\`in + 範圍較大或有包圍感的地方\`（in Taipei, in the room）；\`on + 表面\`（on the table, on the wall）；\`at + 一個定點\`（at the bus stop, at school）。
- 固定搭配要整組記：\`at home\`、\`in bed\`、\`at work\`、\`on the phone\`。

**例句**
- My class starts at 9:00 on Tuesdays.——我的課在週二九點開始。
- There is a picture on the wall.——牆上有一幅畫。
- She was born in July.——她出生在七月。

**容易犯的錯**
- ❌ I get up in 6:30. ✅ I get up at 6:30. 具體時刻用 at。
- ❌ See you in Friday. ✅ See you on Friday. 星期要用 on。
- ❌ I stay in home on weekends. ✅ I stay at home on weekends. at home 是固定搭配。

**和相關主題的差別**
- 動詞加介系詞／形容詞加介系詞：這些是某個字習慣搭配的介系詞（如 depend on），要整組背。
- 介系詞的語意：深入說明介系詞更細的意思，這裡只學時間與地點的基本分別。`,

  "some-any-much-many": `**核心概念**
這幾個詞用來說「多少」，叫量詞（quantifier）。選哪一個，要看名詞是可數還是不可數，也要看句子是肯定、否定還是疑問。

**句型**
- \`some\` 用在肯定句；\`any\` 用在否定句和一般疑問句：I have some milk. / I don't have any milk. / Do you have any milk?
- \`many + 可數複數名詞\`：many books；\`much + 不可數名詞\`：much water。much 與 many 多用在否定句和疑問句。
- \`a lot of / lots of\` 兩者都可以接，肯定句常用：a lot of books, a lot of water。
- 提出邀請或請求時，疑問句也可用 some：\`Would you like some tea?\`

**例句**
- There are some oranges in the bag.——袋子裡有一些柳橙。
- We don't have much time.——我們沒有太多時間。
- How many students are there in your class?——你們班有多少學生？

**容易犯的錯**
- ❌ I don't have some money. ✅ I don't have any money. 否定句用 any。
- ❌ How much books do you have? ✅ How many books do you have? books 是可數，要用 many。
- ❌ He has many money. ✅ He has a lot of money. money 不可數，不能用 many。

**和相關主題的差別**
- 可數與不可數名詞：要選對量詞，先要分辨名詞是否可數，那是這個主題的前提。`,

  "countable-uncountable": `**核心概念**
可數名詞（countable noun）可以一個一個數，有單複數，如 book、apple。不可數名詞（uncountable noun）無法一個一個數，沒有複數，如 water、rice、money、information。

**句型**
- 可數：\`a book / two books\`；不可數：\`some water\`，不加 a，也不加 -s。
- 不可數名詞要數量時，借用單位詞：\`a glass of water\`、\`a piece of advice\`、\`a bowl of rice\`。
- 不可數名詞搭配單數動詞：\`The information is useful.\`

**例句**
- I need some bread and two eggs.——我需要一些麵包和兩顆蛋。
- She gave me a piece of advice.——她給了我一個建議。
- The water in this bottle is cold.——這瓶水是冷的。

**容易犯的錯**
- ❌ I need an advice. ✅ I need some advice. / a piece of advice. advice 不可數，不能直接加 a。
- ❌ The news are good. ✅ The news is good. news 是不可數，用單數動詞。
- ❌ two waters ✅ two glasses of water。要計量就用單位詞。

**和相關主題的差別**
- 量詞 some / any / much / many：先判斷名詞可不可數，才知道該用 much 還是 many。`,

  "comparatives-superlatives": `**核心概念**
比較級（comparative）用來比較兩者，最高級（superlative）用來在三者以上中選出最突出的。短形容詞用字尾變化，長形容詞則在前面加 more、most。

**句型**
- 短形容詞：\`tall → taller → the tallest\`；e 結尾只加 -r / -st：\`nice → nicer\`；子音加 y 改 -ier：\`easy → easier\`；短母音加單子音要重複字母：\`big → bigger\`。
- 長形容詞（兩音節以上多數）：\`more careful → the most careful\`。
- 不規則：\`good → better → the best\`、\`bad → worse → the worst\`。
- 比較級搭配 than：\`taller than\`；最高級前面加 the：\`the tallest in the class\`。

**例句**
- My bag is heavier than yours.——我的包包比你的重。
- This is the most interesting book I have read.——這是我讀過最有趣的書。
- Today is better than yesterday.——今天比昨天好。

**容易犯的錯**
- ❌ more taller ✅ taller。短形容詞用 -er，不能同時加 more。
- ❌ the most good ✅ the best。good 是不規則，最高級是 best。
- ❌ He is taller that me. ✅ He is taller than me. 比較級後面接 than。
- ❌ She is tallest girl. ✅ She is the tallest girl. 最高級前要加 the。`,

  "frequency-adverbs": `**核心概念**
頻率副詞（adverb of frequency）說明一件事「多常」發生。從高到低大致是：always（總是）、usually（通常）、often（常常）、sometimes（有時）、rarely（很少）、never（從不）。

**句型**
- 放在一般動詞前面：\`主詞 + 頻率副詞 + 一般動詞\`：I usually walk to work.
- 放在 be 動詞後面：\`主詞 + be 動詞 + 頻率副詞\`：She is always on time.
- 否定句與頻率副詞：never 本身已是否定，不再加 not。
- sometimes 也可以放句首或句尾；always、never 通常不這樣放。

**例句**
- He often reads before bed.——他睡前常看書。
- My sister is never late for school.——我妹妹上學從不遲到。
- Sometimes we eat out on Fridays.——我們有時週五會外出用餐。

**容易犯的錯**
- ❌ I go usually to school by bus. ✅ I usually go to school by bus. 一般動詞前才是頻率副詞的位置。
- ❌ She always is happy. ✅ She is always happy. 頻率副詞放在 be 動詞後面。
- ❌ I don't never eat meat. ✅ I never eat meat. never 已經是否定，不能再加 don't。`,

  "adjectives-adverbs": `**核心概念**
形容詞（adjective）說明名詞或人物的特徵；副詞（adverb）則說明動作怎麼進行，或修飾形容詞。很多副詞是在形容詞後加 -ly 形成的。

**句型**
- 形容詞放在名詞前面，或放在 be 動詞後面：\`a quiet room\`、\`The room is quiet.\`
- 副詞修飾動詞：\`She speaks softly.\`；一般由形容詞加 -ly：\`careful → carefully\`，y 結尾改 -ily：\`happy → happily\`。
- 不規則要特別記：\`good → well\`；\`fast\` 與 \`hard\` 的副詞形式與形容詞相同。

**例句**
- He is a careful driver.——他是個謹慎的駕駛。
- He drives carefully.——他開車很小心。
- She works hard and runs fast.——她工作努力，跑得很快。

**容易犯的錯**
- ❌ She sings beautiful. ✅ She sings beautifully. 修飾動詞要用副詞。
- ❌ He plays the piano good. ✅ He plays the piano well. good 是形容詞，副詞是 well。
- ❌ He works hardly. ✅ He works hard. hardly 的意思是「幾乎不」，不是 hard 的副詞形式。
- ❌ The food smells well. ✅ The food smells good. 連綴動詞（如 smell、look）後面接形容詞，不接副詞。`,

  "used-to-past-habit": `**核心概念**
used to 用來說「過去經常如此、但現在已經不是這樣」的習慣或狀態。它強調過去和現在的對比，所以句子本身就暗示了現在不同。

**句型**
- 肯定：\`主詞 + used to + 原形動詞\`：I used to play the piano.
- 否定：\`didn't use to + 原形動詞\`；疑問：\`Did + 主詞 + use to + 原形動詞 ...?\`
- 注意否定與疑問裡的 did 已經表示過去，所以 use 不加 -d。
- 也可用於過去的狀態，不只是動作：\`There used to be a cinema here.\`

**例句**
- We used to live in a small town.——我們以前住在小鎮上。
- She didn't use to like coffee.——她以前不喜歡咖啡。
- Did you use to walk to school?——你以前走路上學嗎？

**容易犯的錯**
- ❌ I used to played tennis. ✅ I used to play tennis. used to 後面接原形動詞。
- ❌ Did you used to smoke? ✅ Did you use to smoke? 有 did 之後，use 要回到原形。
- ❌ He use to be shy. ✅ He used to be shy. 肯定句要寫 used to。

**和相關主題的差別**
- used to / be used to / get used to：be used to 的意思是「習慣於」，後面接名詞或 -ing，和這裡的 used to + 原形動詞意思完全不同。`,

  "present-perfect-intro": `**核心概念**
現在完成式（present perfect）把過去發生的事和現在連起來：重點不在事情「何時發生」，而在它對現在的影響、經驗，或持續到現在的時間。形式是 have / has 加過去分詞（past participle）。

**句型**
- \`主詞 + have / has + 過去分詞\`：I have finished my homework.
- 經驗：常用 \`ever\`（曾經）、\`never\`（從未）：Have you ever been to Japan?
- 結果：過去的動作留下現在的結果：\`She has lost her keys.\`（現在找不到）
- 持續：\`for + 一段時間\`、\`since + 起點\`：I have lived here for five years. / since 2020.

**例句**
- I have never eaten snails.——我從沒吃過蝸牛。
- He has already left the office.——他已經離開辦公室了。
- They have been friends since childhood.——他們從小就是朋友。

**容易犯的錯**
- ❌ I have saw that film. ✅ I have seen that film. 完成式要用過去分詞 seen。
- ❌ I have lived here since three years. ✅ I have lived here for three years. 一段時間用 for，起點才用 since。
- ❌ I have met him yesterday. ✅ I met him yesterday. 有明確的過去時間，通常用過去式。

**和相關主題的差別**
- 現在完成式與過去式：有明確過去時間用過去式；強調與現在的關係用完成式。
- 現在完成進行式：強調動作持續進行，基礎階段先掌握本主題的 have + 過去分詞。`,

  "gerund-infinitive-intro": `**核心概念**
有些動詞後面接另一個動詞時，要把後面的動詞改成特定形式：動名詞（gerund，動詞-ing）或不定詞（infinitive，to + 原形動詞）。哪個動詞接哪一種，基礎階段要先記住常見的組合。

**句型**
- 後接動名詞：\`enjoy / finish / mind / stop + 動詞-ing\`：I enjoy reading.
- 後接不定詞：\`want / hope / decide / need + to + 原形動詞\`：I want to read.
- 兩種皆可：\`like / love / hate / start / begin + -ing 或 to do\`：She likes dancing. / She likes to dance.
- 否定的不定詞把 not 放在 to 前：\`decide not to go\`。

**例句**
- She finished writing the report.——她寫完了報告。
- We hope to see you again.——我們希望再見到你。
- It started raining. / It started to rain.——開始下雨了。（兩種皆可）

**容易犯的錯**
- ❌ I enjoy to swim. ✅ I enjoy swimming. enjoy 後面要接動名詞。
- ❌ He wants going home. ✅ He wants to go home. want 後面要接不定詞。
- ❌ She decided going abroad. ✅ She decided to go abroad. decide 後面接 to do。

**和相關主題的差別**
- 動名詞與不定詞的意思差異：像 stop doing 和 stop to do 意思不同，那是進階主題。
- 表目的的 to do：to do 也可單獨用來說明做某事的目的，與動詞後接不定詞的用法不同。`,

  "relative-clauses-basic": `**核心概念**
關係子句（relative clause）接在名詞後面，補充說明那個名詞是「怎樣的人」或「怎樣的東西」，用關係代名詞（relative pronoun）把兩句話合成一句。

**句型**
- 修飾人：\`名詞 + who + 動詞 ...\`：the girl who sings
- 修飾事物：\`名詞 + which + 動詞 ...\`：the book which is on the desk
- \`that\` 人和事物都可以用：the man that lives next door。
- 關係子句要緊接在被修飾的名詞後面，兩者之間不要隔太遠。

**例句**
- I know a woman who speaks five languages.——我認識一位會說五種語言的女士。
- This is the cake which my mother made.——這是我媽媽做的蛋糕。
- The boy that sits next to me is my cousin.——坐在我旁邊的男生是我表弟。

**容易犯的錯**
- ❌ The man which lives here is kind. ✅ The man who lives here is kind. 指人通常用 who。
- ❌ She is the girl who she won the prize. ✅ She is the girl who won the prize. who 已經代替了主詞，不能再重複 she。
- ❌ The book is interesting which I read. ✅ The book which I read is interesting. 關係子句要緊跟被修飾的名詞。

**和相關主題的差別**
- 限定與非限定關係子句：進階主題會談加逗號的補充說明，基礎階段先掌握不加逗號的用法。`,

  "basic-conjunctions": `**核心概念**
連接詞（conjunction）把詞、片語或句子連在一起，表達它們之間的關係。最基本的四個：and 表示並列，but 表示轉折，because 表示原因，so 表示結果。

**句型**
- \`A and B\`：並列相加。\`A but B\`：前後內容相反或出人意料。
- \`結果, because 原因\`：說明原因。\`原因, so 結果\`：說明結果。
- 連接兩個完整句子時，and、but、so 前面通常加逗號；because 連接的子句放在後面時，前面通常不加逗號。
- because 和 so 不要同時用在同一句。

**例句**
- I like tea, but my brother likes coffee.——我喜歡茶，但我哥哥喜歡咖啡。
- She was tired, so she went to bed early.——她很累，所以早早上床睡覺。
- We stayed home because it was raining.——因為下雨，我們待在家裡。

**容易犯的錯**
- ❌ Because it was cold, so I wore a coat. ✅ Because it was cold, I wore a coat. 英文的 because 和 so 不會一起用。
- ❌ I was hungry but I ate a lot. ✅ I was hungry, so I ate a lot. 吃很多是飢餓的結果，要用 so，不是轉折。
- ❌ He is rich, and he is not happy. ✅ He is rich, but he is not happy. 前後語氣相反，用 but。`,

  "passive-basic": `**核心概念**
一般句子（主動語態，active voice）的主詞是做動作的人；被動語態（passive voice）的主詞則是承受動作的人或事物。當我們更關心「被怎麼了」，或不知道、不需要說是誰做的，就用被動。

**句型**
- \`be 動詞 + 過去分詞\`：The room is cleaned every day.（現在）/ The bridge was built in 1990.（過去）
- 要說出動作者時，用 by：\`The song was written by my friend.\`
- 否定：\`The door was not locked.\`；疑問：\`Was the door locked?\`
- 主動轉被動：\`Tom broke the cup.\` → \`The cup was broken by Tom.\`

**例句**
- English is spoken in many countries.——很多國家都說英語。
- My bike was stolen last night.——我的腳踏車昨晚被偷了。
- This cake was made by my grandmother.——這個蛋糕是我奶奶做的。

**容易犯的錯**
- ❌ The window was break. ✅ The window was broken. 被動要用過去分詞，不是原形。
- ❌ The letter wrote by Anna. ✅ The letter was written by Anna. 被動句不能少了 be 動詞。
- ❌ My bag was stolen by someone. ✅ My bag was stolen. 不知道或不重要的動作者，不必寫出 by ...。

**和相關主題的差別**
- 被動語態進階：基礎只學最常見的 be + 過去分詞；進階還有各種時態、情態動詞的被動形式。`,

  "conditionals-basic": `**核心概念**
條件句（conditional）用 if 說明一個條件，以及條件成立時會有的結果。基礎階段學最常用的一種：說的是「可能發生」的事，if 子句用現在式，主要子句用 will 加原形動詞表示結果。

**句型**
- \`If + 主詞 + 現在式, 主詞 + will + 原形動詞\`：If it rains, we will stay home.
- if 子句雖然說的是未來，動詞仍用現在式，不用 will。
- if 子句放在前面時要加逗號；放在後面則不用：\`We will stay home if it rains.\`
- 結果也可以用祈使句或 can：\`If you are hungry, eat something.\`

**例句**
- If you study hard, you will pass the test.——如果你用功讀書，你會通過考試。
- If she calls, I will tell her the news.——如果她打來，我會告訴她這個消息。
- We will go to the park if the weather is nice.——如果天氣好，我們就去公園。

**容易犯的錯**
- ❌ If it will rain, we will stay home. ✅ If it rains, we will stay home. if 子句不用 will。
- ❌ If I see him, I tell him. ✅ If I see him, I will tell him. 結果用 will + 原形動詞。
- ❌ If you are late we will start. ✅ If you are late, we will start. if 子句在前，後面要加逗號。

**和相關主題的差別**
- 真實條件句、假設條件句：之後會學更多種條件句；基礎只處理「有可能發生」的 if + 現在式。`,

  "reflexive-pronouns": `**核心概念**
反身代名詞（reflexive pronoun）以 -self 或 -selves 結尾，用在動作回到做動作的人自己身上，也就是主詞和受詞是同一個人的時候。也可以用來強調「是本人親自」。

**句型**
- 形式：\`myself / yourself / himself / herself / itself / ourselves / yourselves / themselves\`。單數是 -self，複數是 -selves。
- 主詞與受詞相同：\`She hurt herself.\`
- 強調：\`I made the cake myself.\`
- 片語 \`by oneself\` 是「獨自、靠自己」：He lives by himself.

**例句**
- He looked at himself in the mirror.——他看著鏡子裡的自己。
- We enjoyed ourselves at the party.——我們在派對上玩得很開心。
- She cooked dinner by herself.——她自己一個人做了晚餐。

**容易犯的錯**
- ❌ He hurt him. ✅ He hurt himself. 動作回到主詞自己身上，要用反身代名詞。
- ❌ They enjoyed theirselves. ✅ They enjoyed themselves. 正確形式是 themselves。
- ❌ I will help me. ✅ I will help myself. 主詞與受詞同一個人，用 myself。
- ❌ They help themselves each other. ✅ They help each other. 「彼此」要用 each other，不是反身代名詞。`,

  "purpose-to-infinitive": `**核心概念**
說明「為了什麼目的而做某事」時，可以在動作後面加 to + 原形動詞。這裡的 to do 回答的是 Why（為什麼）的問題。

**句型**
- \`動作 + to + 原形動詞\`：I went out to buy milk.
- 否定目的用 \`in order not to\` 或另外換說法，不要直接寫 not to。
- 目的是名詞時，用 \`for + 名詞\`：I went out for a walk. 動詞用 to，名詞用 for。
- 問目的時：\`Why did you go out? — To buy milk.\` 可以只回答 to do。

**例句**
- She saved money to buy a camera.——她存錢是為了買相機。
- I called the shop to ask about the price.——我打電話給那家店詢問價格。
- He went to the library for a book.——他去圖書館找一本書。

**容易犯的錯**
- ❌ I went out for buy milk. ✅ I went out to buy milk. 目的是動作時用 to do，不用 for。
- ❌ I came here to a coffee. ✅ I came here for a coffee. 後面是名詞，要用 for。
- ❌ She studies for to pass the exam. ✅ She studies to pass the exam. for 和 to 不要連用。

**和相關主題的差別**
- 動名詞與不定詞入門：那裡談的是 want to do 這類「動詞後面接什麼」，這裡的 to do 則是整個動作的目的，不是動詞的受詞。`,
};

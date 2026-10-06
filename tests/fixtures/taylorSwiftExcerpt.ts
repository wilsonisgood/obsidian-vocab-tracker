// An excerpt of the real article that drove this fix (使用者回饋):
// ~/Documents/Obsidian Vault/eng/Taylor_Swift_NYU_Speech_Transcript.md
// (not modified — this is a copy of its opening lines). Structure: a
// title heading, an intro paragraph, a thematic break, a short three-line
// list (each item well under the split threshold — should stay one
// block), then a "### 1. 開場與感謝" heading immediately followed (no
// blank line) by three long `* [[timestamp](url)] …` list items
// (200–900 characters each — each should become its own anchorable
// unit), then a second heading to prove the split list doesn't bleed into
// whatever comes after it.

export const TAYLOR_SWIFT_EXCERPT = [
  "# Taylor Swift 2022 NYU Commencement Speech Transcript", // 0
  "", // 1
  "這部影片《泰勒絲在紐約大學的畢業演講 Taylor Swift addresses at 2022 NYU Graduational Commencement》的英文逐字稿整理如下，已依演講段落與主題分類，並附上可跳轉至 YouTube 影片對應時間點的超連結。", // 2
  "", // 3
  "---", // 4
  "", // 5
  "- in a stadium this size", // 6
  "- wearing a ==glittery== ==leotard==.", // 7
  "- all the trustees and members of the board", // 8
  "", // 9
  "### 1. 開場與感謝 (Introduction & ==Acknowledgments==)", // 10
  "* [[00:00:09](https://www.youtube.com/watch?v=UdR_mC7Ifk4&t=9s)] Hi, I'm Taylor. Last time I was in a stadium this size, I was dancing in heels and wearing a ==glittery== ==leotard==. This outfit is much more comfortable.", // 11
  "* [[00:00:24](https://www.youtube.com/watch?v=UdR_mC7Ifk4&t=24s)] I would like to say a huge thank you to NYU's Chairman of the Board of Trustees, Bill Berkley, and all the trustees and members of the board; NYU's President, Andrew Hamilton; Catherine Fleming, and the ==faculty== and alumni here today who have made this day possible.", // 12
  "* [[00:00:55](https://www.youtube.com/watch?v=UdR_mC7Ifk4&t=55s)] I feel so proud to share this day with my fellow ==honorees==, Susan Hockfield and Felix Matos Rodriguez, who humble me with the ways they improve our world with their work. As for me, I'm 90% sure the main reason I'm here is because I have a song called *22*. And let me just say, I am ==elated== to be here with you today as we celebrate and graduate New York University's Class of 2022.", // 13
  "", // 14
  "### 2. 感恩一路上支持我們的人 (Gratitude to Support Systems)", // 15
  "* [[00:01:49](https://www.youtube.com/watch?v=UdR_mC7Ifk4&t=109s)] Not a single one of us here today has done it alone. We are each a patchwork quilt of those who have loved us, those who have believed in our futures, those who showed us ==empathy== and kindness or told us the truth even when it wasn't easy to hear. Those who told us we could do it when there was absolutely no proof of that.", // 16
].join("\n");

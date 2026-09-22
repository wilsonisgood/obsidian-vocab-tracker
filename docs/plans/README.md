# Vocab Tracker 規劃書索引

> 撰寫日期：2026-09-22。四份規劃書各自獨立可讀，但彼此有依賴關係（見下表），建議依編號順序推進。

| # | 檔案 | 主題 | 依賴 |
|---|------|------|------|
| 1 | [01-mobile-ios-ipad.md](01-mobile-ios-ipad.md) | iPhone / iPad 共用；檢閱模式「一鍵儲存單字」 | — |
| 2 | [02-publish-and-mobile-testing.md](02-publish-and-mobile-testing.md) | 發佈到 Obsidian 社群市場；不經市場也能在自己的 iPhone / iPad 測試 | 1（行動端相容性要先做好） |
| 3 | [03-exam-level-tags.md](03-exam-level-tags.md) | 單字依考試（TOEIC / IELTS / TOEFL）與等級（柯林斯星級 / 全民英檢 / CEFR）貼標籤 | — |
| 4 | [04-paragraph-ai-assistant.md](04-paragraph-ai-assistant.md) | 整篇文章按段落切開，逐段觸發 AI 詢問文法 / 單字，並以段落為單位記住 | 3（AI 回覆的單字可帶標籤直接入庫） |

## 目前程式現況（四份文件共同前提）

- 單一檔案 `main.ts`（約 1,000 行），esbuild 打包成 `main.js`。
- 資料全部存在 `.obsidian/plugins/vocab-tracker/data.json`（`loadData` / `saveData`），`vocab-list.md` 只是一個放 `vocab-dashboard` code block 的殼。
- 檢閱模式（reading view）點任一英文單字 → `Menu` 選單 → 加入單字表；同時會在筆記原文把該字包成 `==word==`，並記錄來源筆記與行號。
- 已接 Free Dictionary API 抓音標 / 定義 / 同反義字，發音走 `speechSynthesis` 或字典的 mp3。
- `manifest.json` 已是 `isDesktopOnly: false`，程式碼沒有用到 Node / Electron API，理論上行動端可以直接跑。
- 所有樣式都是 `style.cssText` 內嵌，尚無 `styles.css`；尚無設定頁（`PluginSettingTab`）；專案尚未 `git init`。

## 建議的推進順序

1. **先做 1 的「基礎相容」段落 + 2 的「BRAT 私測」流程**：這樣每一步改動都能在 iPhone 上實際看到。
2. 做 3（標籤）：資料模型改動最好早做，後面 4 要用。
3. 做 4（段落 AI）：功能最大、也最依賴前面三者。
4. 最後回頭做 2 的「正式上架」段落。

import { defineConfig } from "vitest/config";

// (1009 #16) 獨立的 e2e 設定：npm run e2e 才會跑，不算進 npm run check（vitest.config.ts
// 的 include 是 "tests/**/*.test.ts"，這份檔案命名成 *.e2e.test.ts 刻意避開那個 glob
// —— 不過兩者都用 "tests/**/*.test.ts" 式的 glob 時 *.e2e.test.ts 仍然會被外層
// vitest.config.ts 撿到，這點已經寫進整合事項，要在 vitest.config.ts 加 exclude）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    // 開一個真的 Electron app、裝 plugin、等 CDP 連線都要花時間，給長一點的 timeout。
    testTimeout: 60_000,
    // (1009 #16 第二段) 原本 90s，這台機器常態處於高記憶體壓力（Chrome／VS Code 等
    // 一起開，實測 top 顯示 60G+／64G 已用、load avg 3–5），偶爾會讓 Obsidian 全新
    // profile 啟動＋側欄 DeferredView resolve 慢到超過 90s（不是 update 檢查，那個已經
    // 靠 obsidian.json 的 updateDisabled 關掉——這裡是另一個獨立的不穩定來源）。拉高
    // 到 150s 搭配 setup.ts openSidebarReady 預設 timeoutMs 拉到 60s（兩輪共 90s）。
    hookTimeout: 150_000,
    // 多個測試檔同時開多個 Obsidian instance 容易搶 remote-debugging-port／
    // 吃滿記憶體，一次只跑一個檔案。
    fileParallelism: false,
  },
});

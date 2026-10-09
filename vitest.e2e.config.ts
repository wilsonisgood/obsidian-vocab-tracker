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
    hookTimeout: 90_000, // beforeAll 要開 Obsidian + 等側欄就緒，系統忙的時候偶爾會慢
    // 多個測試檔同時開多個 Obsidian instance 容易搶 remote-debugging-port／
    // 吃滿記憶體，一次只跑一個檔案。
    fileParallelism: false,
  },
});

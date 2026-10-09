import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // e2e drives a real Obsidian; `npm run e2e` runs it (1009 #16).
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});

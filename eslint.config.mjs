import js from "@eslint/js";
import tseslint from "typescript-eslint";

// 分層規則（規劃書 06 §3.1）：
//   core      不得 import obsidian / services / ui / platform
//   services  只能 import core（透過 ports 存取外部）
//   platform  可以 import obsidian，實作 ports
//   ui        不直接碰資料，只呼叫 service（本規則不強制，較難用 import 規則表達）
const layerRestrictions = [
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "obsidian", message: "core/** 不得 import obsidian" }],
          patterns: [
            { group: ["**/services/**"], message: "core/** 不得 import services" },
            { group: ["**/ui/**"], message: "core/** 不得 import ui" },
            { group: ["**/platform/**"], message: "core/** 不得 import platform" },
          ],
        },
      ],
    },
  },
  {
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "obsidian", message: "services/** 不得直接 import obsidian，請透過 ports 介面" }],
          patterns: [
            { group: ["**/ui/**"], message: "services/** 不得 import ui" },
            { group: ["**/platform/**"], message: "services/** 不得 import platform，請透過 ports 介面" },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["main.js", "node_modules/**", "dist/**", "docs/**", ".claude/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // main.ts 是待拆解的舊程式碼（M0 §3.2 會逐步搬進 src/core|services|platform|ui），
    // 拆解前不回頭補 lint，避免「不動程式」的 PR 混入行為變更。
    files: ["main.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "preserve-caught-error": "off",
    },
  },
  ...layerRestrictions,
);

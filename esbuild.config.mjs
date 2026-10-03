import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  // main.ts -> main.js; src/styles/index.css (which @imports the rest of
  // src/styles/*.css) -> styles.css. Both land at the repo root, where
  // Obsidian expects them.
  entryPoints: [
    { in: "main.ts", out: "main" },
    { in: "src/styles/index.css", out: "styles" },
  ],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outdir: ".",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}

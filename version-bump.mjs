// 由 `npm version <新版號>` 自動呼叫（package.json 的 "version" script），
// 照 obsidian-sample-plugin 的做法：
//   1. 把 package.json 的新版號寫進 manifest.json；
//   2. minAppVersion 跟 versions.json 最後一筆不同時，加一筆
//      「插件版號 → 最低 Obsidian 版本」。
// versions.json 是給 Obsidian 用的：使用者的 Obsidian 太舊、裝不了最新版時，
// 照這張表找出還能裝的最新插件版本。只在 minAppVersion 改變時才需要新增。
// 之後 "version" script 會 `git add package.json manifest.json versions.json`。
//
// .npmrc 設了 git-tag-version=false：npm version 只改檔、不自動 commit / 打 tag，
// 打 tag 是發版時另外手動做的一步（見 docs/plans/05-brat-release-guide.md）。
import { readFileSync, writeFileSync } from "fs";
import process from "process";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  process.stderr.write("version-bump.mjs：找不到 npm_package_version，請用 `npm version <版號>` 執行。\n");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const latestMin = Object.values(versions).at(-1);
if (latestMin !== minAppVersion) {
  versions[targetVersion] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
  process.stdout.write(`versions.json：新增 ${targetVersion} → ${minAppVersion}\n`);
}

process.stdout.write(`manifest.json → ${targetVersion}（minAppVersion ${minAppVersion}）\n`);

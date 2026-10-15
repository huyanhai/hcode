#!/usr/bin/env node
/**
 * 把 @iconify-json/vscode-icons 裁剪成文件树用得到的子集，
 * 生成 src/components/file-manager/icons-data.ts。
 *
 * 图标名清单直接从 icons.ts 的映射表里正则提取，所以新增映射后
 * 只要重跑本脚本即可，不需要手工同步两个文件。
 *
 * 用法：
 *   node scripts/gen-file-icons.mjs
 *   node scripts/gen-file-icons.mjs --source /path/to/vscode-icons.json
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const mappingFile = resolve(appRoot, "src/components/file-manager/icons.ts");
const outFile = resolve(appRoot, "src/components/file-manager/icons-data.ts");

const PREFIX = "vscode-icons";

/** 数据源：优先命令行指定，其次按 pnpm / npm 两种常见位置找。 */
const sourceArgIndex = process.argv.indexOf("--source");
const candidates =
  sourceArgIndex > -1
    ? [process.argv[sourceArgIndex + 1]]
    : [
        resolve(appRoot, `node_modules/@iconify-json/${PREFIX}/icons.json`),
        resolve(appRoot, `../../node_modules/@iconify-json/${PREFIX}/icons.json`),
      ];
const sourcePath = candidates.find((p) => p && existsSync(p));

if (!sourcePath) {
  console.error(
    [
      `找不到图标数据源，尝试过：`,
      ...candidates.map((c) => `  - ${c}`),
      ``,
      `请先安装：pnpm --filter @hcode/client add -D @iconify-json/vscode-icons`,
      `或用 --source 指定 icons.json 路径。`,
    ].join("\n"),
  );
  process.exit(1);
}

const full = JSON.parse(readFileSync(sourcePath, "utf8"));
const mapping = readFileSync(mappingFile, "utf8");

/** icons.ts 里所有以字面量出现的图标名。 */
const wanted = new Set(mapping.match(new RegExp(`${PREFIX}:[a-z0-9-]+`, "g")) ?? []);
if (wanted.size === 0) {
  console.error(`没有从 ${mappingFile} 提取到任何图标名，检查映射表写法。`);
  process.exit(1);
}

/**
 * 目录展开态的图标是运行时拼 `-opened` 的（见 resolveDirIcon），
 * 映射表里不会出现字面量，这里补上。
 *
 * 注意 icons.json 的 key 不带 `vscode-icons:` 前缀，比对前必须先剥掉，
 * 否则永远查不到，展开态的图标会静默缺失（渲染成空白）。
 */
for (const name of [...wanted]) {
  const opened = `${name.slice(PREFIX.length + 1)}-opened`;
  if (full.icons[opened]) wanted.add(`${PREFIX}:${opened}`);
}

const icons = {};
const missing = [];

for (const name of [...wanted].sort()) {
  const short = name.slice(PREFIX.length + 1);
  // 别名要顺着 parent 找到真正的定义
  let def = full.icons[short];
  if (!def && full.aliases?.[short]?.parent) def = full.icons[full.aliases[short].parent];
  if (!def) {
    missing.push(name);
    continue;
  }
  icons[short] = def;
}

if (missing.length) {
  console.error(
    [
      `以下图标在 ${PREFIX} 中不存在，请修正 icons.ts 的映射：`,
      ...missing.map((m) => `  - ${m}`),
    ].join("\n"),
  );
  process.exit(1);
}

const subset = {
  prefix: full.prefix,
  width: full.width,
  height: full.height,
  icons,
};

const banner = `/* eslint-disable */
// ⚠️ 本文件由 scripts/gen-file-icons.mjs 自动生成，请勿手改。
// 数据来源：@iconify-json/${PREFIX}（${Object.keys(full.icons).length} 个图标）
// 本子集：${Object.keys(icons).length} 个图标，由 src/components/file-manager/icons.ts 的映射表裁剪得到。
// 改动映射表后请重跑：pnpm --filter @hcode/client gen:file-icons
import type { IconifyJSON } from "@iconify/vue";

`;

writeFileSync(
  outFile,
  `${banner}const data: IconifyJSON = ${JSON.stringify(subset, null, 0)};\n\nexport default data;\n`,
);

const sizeKb = (statSync(outFile).size / 1024).toFixed(0);
const fullKb = (statSync(sourcePath).size / 1024).toFixed(0);
console.log(
  `已生成 ${outFile}\n  子集 ${Object.keys(icons).length} 个图标 / ${sizeKb}KB（全量 ${Object.keys(full.icons).length} 个 / ${fullKb}KB）`,
);

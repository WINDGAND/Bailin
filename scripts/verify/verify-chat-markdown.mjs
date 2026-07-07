#!/usr/bin/env node
/**
 * 回归检查：ChatMarkdown（apps/desktop/src/renderer/shared/chat-markdown.tsx）
 * 的 parseBlocks 纯函数——重点覆盖这次新加的标题（"# "/"## "/"### "）解析，
 * 这是给"新版本提醒横幅"展示 GitHub Release 更新说明加的能力（之前只支持
 * 有序/无序列表和段落，标题符号会被当成普通文本原样露出来）。
 *
 * 渲染层没有 tsup/tsc 编译产物可以直接 require（不像主进程），这里用仓库
 * 已有的 esbuild（vite 的间接依赖）现场把这个 .tsx 文件编译成 CJS 再
 * require，跟 verify-distillation-stage-model.mjs 是同一套手法。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writeFileSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const esbuildPath = require.resolve("esbuild", {
  paths: [resolve(repoRoot, "apps/desktop/node_modules"), resolve(repoRoot, "node_modules")]
});
const esbuild = require(esbuildPath);

const srcPath = resolve(repoRoot, "apps/desktop/src/renderer/shared/chat-markdown.tsx");
const tmpPath = resolve(__dirname, ".tmp-chat-markdown.cjs");

// jsxFactory 随便指一个占位符——parseBlocks 是纯函数，不会真的渲染 JSX，
// 但整个文件要能编译过（parseInline/ChatMarkdown 里也有 JSX 语法）。
const result = esbuild.buildSync({
  entryPoints: [srcPath],
  bundle: false,
  format: "cjs",
  platform: "node",
  loader: { ".tsx": "tsx" },
  jsx: "automatic",
  jsxImportSource: "react",
  write: false,
  logLevel: "silent"
});
writeFileSync(tmpPath, result.outputFiles[0].text);

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}${detail ? " — " + detail : ""}`);
  }
}

try {
  const { parseBlocks } = require(tmpPath);

  const h1 = parseBlocks("# 一级标题");
  check("单个 # 识别为 1 级标题", h1.length === 1 && h1[0].kind === "h" && h1[0].level === 1, JSON.stringify(h1));

  const h2 = parseBlocks("## 更新内容");
  check(
    "两个 # 识别为 2 级标题，且去掉了前导符号",
    h2.length === 1 && h2[0].kind === "h" && h2[0].level === 2 && h2[0].text === "更新内容",
    JSON.stringify(h2)
  );

  const h3 = parseBlocks("### 三级标题");
  check("三个 # 识别为 3 级标题", h3.length === 1 && h3[0].kind === "h" && h3[0].level === 3, JSON.stringify(h3));

  const mixed = parseBlocks("## 更新内容\n- 修了个 bug\n- 加了个功能\n\n感谢使用。");
  check("标题 + 列表 + 段落混合内容能正确分块", mixed.length === 3, JSON.stringify(mixed));
  check("第一块是标题", mixed[0]?.kind === "h" && mixed[0].text === "更新内容");
  check(
    "第二块是无序列表，两条 item",
    mixed[1]?.kind === "ul" && mixed[1].items.length === 2 && mixed[1].items[0] === "修了个 bug"
  );
  check("第三块是段落", mixed[2]?.kind === "p" && mixed[2].lines.join("") === "感谢使用。");

  const notHeading = parseBlocks("#没有空格不算标题");
  check(
    "# 后面没有空格：不识别为标题，按普通段落处理（避免误伤 issue 号 #123 之类的文本）",
    notHeading.length === 1 && notHeading[0].kind === "p",
    JSON.stringify(notHeading)
  );

  const stillList = parseBlocks("- 第一条\n- 第二条");
  check(
    "不回归：普通无序列表解析依然正常",
    stillList.length === 1 && stillList[0].kind === "ul" && stillList[0].items.length === 2
  );

  const stillOl = parseBlocks("1. 第一条\n2. 第二条");
  check(
    "不回归：普通有序列表解析依然正常",
    stillOl.length === 1 && stillOl[0].kind === "ol" && stillOl[0].items.length === 2
  );
} finally {
  rmSync(tmpPath, { force: true });
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll chat-markdown cases passed.`);

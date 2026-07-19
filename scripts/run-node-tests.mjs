#!/usr/bin/env node
// 跨平台 node:test 启动器。
//
// 背景：`tsx --test "src/**/*.test.ts"` 依赖 shell 展开 glob，
// 在 Windows（cmd/PowerShell 不展开 **）下会把整个带星号的字符串当成
// 字面路径传给 Node，报 "Could not find ...\**\*.test.ts"。
// Node 20 的 --test 也不会对传入的字面参数做 glob 匹配（该特性是 v22+ 才默认开启），
// 所以这里改成先用 fs 递归收集 *.test.ts 文件，再把展开后的文件列表传给 tsx --test，
// 保证同一条命令在 macOS / Linux / Windows 上行为一致。
//
// 用法：node ../../scripts/run-node-tests.mjs <相对于 cwd 的根目录...>
// 例：node ../../scripts/run-node-tests.mjs src
//     node ../../scripts/run-node-tests.mjs src/main

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("[run-node-tests] 用法: node run-node-tests.mjs <root...>");
  process.exit(2);
}

function collectTestFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = roots.flatMap((root) => collectTestFiles(resolve(root)));

if (files.length === 0) {
  console.error(`[run-node-tests] 未找到任何 *.test.ts（root=${roots.join(", ")}）`);
  process.exit(1);
}

const result = spawnSync("npx", ["tsx", "--test", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (result.error) {
  console.error(`[run-node-tests] 启动 tsx 失败: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

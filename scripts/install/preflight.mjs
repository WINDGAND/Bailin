#!/usr/bin/env node
/**
 * pnpm install 前的环境预检：只警告、不替代真实报错。
 * 致命条件（Node 过旧）才以非零退出码中止安装。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

function parseSemver(v) {
  const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function cmpSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function main() {
  const lines = [];
  const node = parseSemver(process.versions.node);
  const min = parseSemver(pkg.engines?.node) ?? parseSemver("20.10.0");

  if (!node || !min || cmpSemver(node, min) < 0) {
    console.error(
      [
        "",
        "[bailin:preflight] Node.js 版本过旧，无法继续安装。",
        `  当前: v${process.versions.node}`,
        `  需要: ${pkg.engines?.node ?? ">=20.10.0"}（推荐 20 LTS 或 22 LTS）`,
        "  下载: https://nodejs.org/",
        ""
      ].join("\n")
    );
    process.exit(1);
  }

  if (node.major >= 24) {
    lines.push(
      `Node v${process.versions.node} 偏新：Windows 上 better-sqlite3 等原生模块可能没有预编译包，`,
      "更容易要求安装 Visual Studio C++ 工具链。推荐改用 Node 20 或 22 LTS。"
    );
  }

  if (process.platform === "win32") {
    lines.push(
      "Windows 源码安装若失败，常见原因是缺少 C++ 编译工具，或预编译包因网络/证书下载失败。",
      "推荐使用: pnpm run setup（失败时会附带中文说明）。",
      "只想使用桌宠可直接下载 Releases，无需编译。"
    );
  }

  if (lines.length === 0) return;

  console.log("");
  console.log("[bailin:preflight] 安装前提示");
  for (const line of lines) {
    console.log(`  · ${line}`);
  }
  console.log("");
}

main();

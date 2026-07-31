#!/usr/bin/env node
/**
 * 用户友好的源码安装入口：跳过无关的 Puppeteer 浏览器下载，
 * 在 pnpm install 失败时追加中文解读（原始日志仍完整保留）。
 *
 * 用法（仓库根目录）：pnpm run setup
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  diagnoseInstallError,
  formatInstallHints,
  INSTALL_HINTS_BANNER
} from "./diagnose-install-error.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function runPnpmInstall() {
  return new Promise((resolvePromise) => {
    const chunks = [];
    const child = spawn("pnpm", ["install"], {
      cwd: repoRoot,
      shell: process.platform === "win32",
      env: {
        ...process.env,
        PUPPETEER_SKIP_DOWNLOAD: process.env.PUPPETEER_SKIP_DOWNLOAD ?? "true"
      },
      stdio: ["inherit", "pipe", "pipe"]
    });

    const onData = (buf) => {
      chunks.push(buf);
      process.stdout.write(buf);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (buf) => {
      chunks.push(buf);
      process.stderr.write(buf);
    });

    child.on("error", (err) => {
      chunks.push(Buffer.from(String(err.stack || err)));
      resolvePromise({ code: 1, log: Buffer.concat(chunks).toString("utf8") });
    });
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, log: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

const { code, log } = await runPnpmInstall();
if (code !== 0) {
  if (!log.includes(INSTALL_HINTS_BANNER)) {
    const hints = diagnoseInstallError(log);
    process.stderr.write(formatInstallHints(hints));
  }
  process.exit(code);
}

console.log("\n[bailin:setup] 安装完成。下一步可运行: pnpm dev\n");
